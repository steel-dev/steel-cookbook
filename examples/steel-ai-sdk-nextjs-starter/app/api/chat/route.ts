import { anthropic } from "@ai-sdk/anthropic";
import {
  convertToModelMessages,
  stepCountIs,
  streamText,
  tool,
  type UIMessage,
} from "ai";
import { chromium, type Browser, type Page } from "playwright";
import Steel from "steel-sdk";
import { z } from "zod";

// Playwright needs the Node.js runtime (not Edge).
export const runtime = "nodejs";
export const maxDuration = 120;

const STEEL_API_KEY = process.env.STEEL_API_KEY!;

export async function POST(req: Request) {
  const { messages } = (await req.json()) as { messages: UIMessage[] };

  const steel = new Steel({ steelAPIKey: STEEL_API_KEY });

  // Per-request session state. Tools share this closure so every tool call
  // in the same conversation turn sees the same Steel page.
  let session: Awaited<ReturnType<typeof steel.sessions.create>> | null = null;
  let browser: Browser | null = null;
  let page: Page | null = null;

  const cleanup = async () => {
    if (browser) await browser.close().catch(() => {});
    if (session) await steel.sessions.release(session.id).catch(() => {});
  };

  const result = streamText({
    model: anthropic("claude-haiku-4-5"),
    system: [
      "You operate a Steel cloud browser via tools.",
      "Workflow: (1) call openSession, (2) navigate to the target URL,",
      "(3) call snapshot to see the page's text and links,",
      "(4) only call extract when you need structured rows beyond what snapshot gives,",
      "(5) reply to the user in plain English.",
      "Prefer snapshot's links list over guessing selectors. Do not invent data.",
    ].join(" "),
    messages: await convertToModelMessages(messages),
    stopWhen: stepCountIs(15),
    tools: {
      openSession: tool({
        description:
          "Open a Steel cloud browser session. Call this exactly once, before anything else.",
        inputSchema: z.object({}),
        execute: async () => {
          session = await steel.sessions.create({});
          browser = await chromium.connectOverCDP(
            `${session.websocketUrl}&apiKey=${STEEL_API_KEY}`
          );
          const ctx = browser.contexts()[0];
          page = ctx.pages()[0] ?? (await ctx.newPage());
          return {
            sessionId: session.id,
            liveViewUrl: session.sessionViewerUrl,
          };
        },
      }),

      navigate: tool({
        description: "Navigate the open session to a URL.",
        inputSchema: z.object({ url: z.string().url() }),
        execute: async ({ url }) => {
          if (!page) throw new Error("openSession must be called first.");
          await page.goto(url, {
            waitUntil: "domcontentloaded",
            timeout: 45_000,
          });
          return { url: page.url(), title: await page.title() };
        },
      }),

      snapshot: tool({
        description:
          "Return a readable snapshot of the current page: title, URL, visible text (capped), and a list of links with their text and href. Call this BEFORE extract so you never have to guess CSS selectors.",
        inputSchema: z.object({
          maxChars: z
            .number()
            .int()
            .positive()
            .max(10_000)
            .default(4_000),
          maxLinks: z.number().int().positive().max(200).default(50),
        }),
        execute: async ({ maxChars, maxLinks }) => {
          if (!page) throw new Error("openSession must be called first.");
          return (await page.evaluate(
            ({
              maxChars,
              maxLinks,
            }: {
              maxChars: number;
              maxLinks: number;
            }) => {
              const text = (document.body.innerText || "").slice(0, maxChars);
              const links = Array.from(document.querySelectorAll("a[href]"))
                .slice(0, maxLinks)
                .map((a) => {
                  const anchor = a as HTMLAnchorElement;
                  const t = (anchor.innerText || anchor.textContent || "")
                    .trim()
                    .slice(0, 120);
                  return { text: t, href: anchor.href };
                })
                .filter((l) => l.text && l.href);
              return {
                url: location.href,
                title: document.title,
                text,
                links,
              };
            },
            { maxChars, maxLinks }
          )) as {
            url: string;
            title: string;
            text: string;
            links: { text: string; href: string }[];
          };
        },
      }),

      extract: tool({
        description:
          "Extract structured data from the current page using CSS selectors.",
        inputSchema: z.object({
          rowSelector: z.string(),
          fields: z
            .array(
              z.object({
                name: z.string(),
                selector: z.string(),
                attr: z.string().optional(),
              })
            )
            .min(1)
            .max(10),
          limit: z.number().int().positive().max(20).default(10),
        }),
        execute: async ({ rowSelector, fields, limit }) => {
          if (!page) throw new Error("openSession must be called first.");
          // Batch the whole extraction inside one page.evaluate — serial
          // CDP calls (row.$, el.getAttribute, el.innerText) are the single
          // biggest source of latency on a cloud browser.
          const items = (await page.evaluate(
            ({
              rowSelector,
              fields,
              limit,
            }: {
              rowSelector: string;
              fields: { name: string; selector: string; attr?: string }[];
              limit: number;
            }) => {
              const rows = Array.from(
                document.querySelectorAll(rowSelector)
              ).slice(0, limit);
              return rows.map((row) => {
                const item: Record<string, string> = {};
                for (const f of fields) {
                  const el = f.selector
                    ? (row.querySelector(f.selector) as Element | null)
                    : row;
                  if (!el) {
                    item[f.name] = "";
                    continue;
                  }
                  if (f.attr) {
                    item[f.name] = (el.getAttribute(f.attr) ?? "").trim();
                  } else {
                    const text =
                      (el as HTMLElement).innerText ?? el.textContent ?? "";
                    item[f.name] = text.trim();
                  }
                }
                return item;
              });
            },
            { rowSelector, fields, limit }
          )) as Record<string, string>[];
          return { count: items.length, items };
        },
      }),

      // Demo of v6's needsApproval: destructive tools can require user
      // confirmation before executing. The client must wire up approval UI
      // (not shown here) for this to actually run end-to-end.
      submitForm: tool({
        description:
          "Submit a form on the current page. Requires user approval.",
        inputSchema: z.object({
          reason: z.string().describe("Why this submission is safe."),
        }),
        needsApproval: true,
        execute: async ({ reason }) => {
          // This body only runs if the user approves.
          return { submitted: false, note: `Demo only. Reason: ${reason}` };
        },
      }),
    },

    // Phase-gate: no one can use navigate/extract before the session is open,
    // and the agent can't open a second session.
    prepareStep: async ({ stepNumber, steps }) => {
      const sessionOpened = steps.some((s: any) =>
        s.toolCalls?.some((tc: any) => tc.toolName === "openSession")
      );
      if (stepNumber === 0 || !sessionOpened) {
        return { activeTools: ["openSession"] };
      }
      return {
        activeTools: ["navigate", "snapshot", "extract", "submitForm"],
      };
    },

    onStepFinish: async ({ toolCalls, usage }) => {
      const names = toolCalls?.map((t: any) => t.toolName).join(", ") || "";
      console.log(
        `  step: ${names || "(text)"} | ${usage?.totalTokens ?? 0} tokens`
      );
    },

    onFinish: async () => {
      await cleanup();
    },

    onAbort: async () => {
      await cleanup();
    },
  });

  return result.toUIMessageStreamResponse();
}
