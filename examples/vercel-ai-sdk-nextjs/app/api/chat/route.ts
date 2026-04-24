// https://github.com/steel-dev/steel-cookbook/tree/main/examples/vercel-ai-sdk-nextjs

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

  // Per-request session registry. Each openSession call adds an entry; every
  // subsequent tool call routes by sessionId, so multiple browsers can run
  // concurrently within a single turn.
  type SessionEntry = {
    session: Awaited<ReturnType<typeof steel.sessions.create>>;
    browser: Browser;
    page: Page;
  };
  const sessions = new Map<string, SessionEntry>();

  const getSession = (sessionId: string): SessionEntry => {
    const s = sessions.get(sessionId);
    if (!s)
      throw new Error(
        `Unknown sessionId: ${sessionId}. Call openSession first.`
      );
    return s;
  };

  const cleanup = async () => {
    await Promise.all(
      Array.from(sessions.values()).map(async ({ browser, session }) => {
        await browser.close().catch(() => {});
        await steel.sessions.release(session.id).catch(() => {});
      })
    );
  };

  const result = streamText({
    model: anthropic("claude-haiku-4-5"),
    system: [
      "You operate Steel cloud browsers via tools.",
      "Per-session workflow: (1) openSession (returns a sessionId),",
      "(2) navigate({ sessionId, url }), (3) snapshot({ sessionId }),",
      "(4) only call extract when you need structured rows beyond snapshot,",
      "(5) reply to the user in plain English.",
      "For comparison or fan-out tasks (e.g. 'compare X across A/B/C',",
      "'check N sites'), open multiple sessions in parallel by emitting",
      "multiple openSession calls in the same step, then drive each session",
      "concurrently with parallel navigate/snapshot calls keyed by its",
      "sessionId. Cap at 4 parallel sessions.",
      "Prefer snapshot's links list over guessing selectors. Do not invent data.",
    ].join(" "),
    messages: await convertToModelMessages(messages),
    stopWhen: stepCountIs(15),
    tools: {
      openSession: tool({
        description:
          "Open a Steel cloud browser session and return its sessionId. For comparison or fan-out tasks, emit multiple openSession calls in the same step so sessions run in parallel (cap 4). Every subsequent tool call must carry the sessionId of the session it operates on.",
        inputSchema: z.object({}),
        execute: async () => {
          const session = await steel.sessions.create({});
          const browser = await chromium.connectOverCDP(
            `${session.websocketUrl}&apiKey=${STEEL_API_KEY}`
          );
          const ctx = browser.contexts()[0];
          const page = ctx.pages()[0] ?? (await ctx.newPage());
          sessions.set(session.id, { session, browser, page });
          return {
            sessionId: session.id,
            liveViewUrl: session.sessionViewerUrl,
            debugUrl: session.debugUrl,
          };
        },
      }),

      navigate: tool({
        description: "Navigate a session's browser to a URL.",
        inputSchema: z.object({
          sessionId: z.string(),
          url: z.string().url(),
        }),
        execute: async ({ sessionId, url }) => {
          const { page } = getSession(sessionId);
          await page.goto(url, {
            waitUntil: "domcontentloaded",
            timeout: 45_000,
          });
          return { sessionId, url: page.url(), title: await page.title() };
        },
      }),

      snapshot: tool({
        description:
          "Return a readable snapshot of a session's current page: title, URL, visible text (capped), and a list of links with their text and href. Call this BEFORE extract so you never have to guess CSS selectors.",
        inputSchema: z.object({
          sessionId: z.string(),
          maxChars: z
            .number()
            .int()
            .positive()
            .max(10_000)
            .default(4_000),
          maxLinks: z.number().int().positive().max(200).default(50),
        }),
        execute: async ({ sessionId, maxChars, maxLinks }) => {
          const { page } = getSession(sessionId);
          const result = (await page.evaluate(
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
          return { sessionId, ...result };
        },
      }),

      extract: tool({
        description:
          "Extract structured data from a session's current page using CSS selectors.",
        inputSchema: z.object({
          sessionId: z.string(),
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
        execute: async ({ sessionId, rowSelector, fields, limit }) => {
          const { page } = getSession(sessionId);
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
          return { sessionId, count: items.length, items };
        },
      }),

      // Demo of v6's needsApproval: destructive tools can require user
      // confirmation before executing. The client must wire up approval UI
      // (not shown here) for this to actually run end-to-end.
      submitForm: tool({
        description:
          "Submit a form on a session's current page. Requires user approval.",
        inputSchema: z.object({
          sessionId: z.string(),
          reason: z.string().describe("Why this submission is safe."),
        }),
        needsApproval: true,
        execute: async ({ sessionId, reason }) => {
          // This body only runs if the user approves.
          return {
            sessionId,
            submitted: false,
            note: `Demo only. Reason: ${reason}`,
          };
        },
      }),
    },

    // Phase-gate: step 0 can only openSession (navigate/extract need an id).
    // Once any session exists, keep openSession active so the agent can add
    // more sessions in parallel alongside the other tools.
    prepareStep: async ({ stepNumber, steps }) => {
      const sessionOpened = steps.some((s: any) =>
        s.toolCalls?.some((tc: any) => tc.toolName === "openSession")
      );
      if (stepNumber === 0 || !sessionOpened) {
        return { activeTools: ["openSession"] };
      }
      return {
        activeTools: [
          "openSession",
          "navigate",
          "snapshot",
          "extract",
          "submitForm",
        ],
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
