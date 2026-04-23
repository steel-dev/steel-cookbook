/*
 * Build an AI browser agent with Vercel AI SDK v6 (ToolLoopAgent) and Steel.
 * https://github.com/steel-dev/steel-cookbook/tree/main/examples/steel-ai-sdk-starter
 */

import * as dotenv from "dotenv";
import Steel from "steel-sdk";
import { anthropic } from "@ai-sdk/anthropic";
import { ToolLoopAgent, tool, stepCountIs, hasToolCall } from "ai";
import { chromium, type Browser, type Page } from "playwright";
import { z } from "zod";
import { Session } from "steel-sdk/resources/index";

dotenv.config();

const STEEL_API_KEY = process.env.STEEL_API_KEY || "your-steel-api-key-here";
const ANTHROPIC_API_KEY =
  process.env.ANTHROPIC_API_KEY || "your-anthropic-api-key-here";

const steel = new Steel({ steelAPIKey: STEEL_API_KEY });

// A single session is shared across tool calls via closure.
let session: Session | null = null;
let browser: Browser | null = null;
let page: Page | null = null;

const openSession = tool({
  description:
    "Open a Steel cloud browser session. Call this exactly once, before anything else.",
  inputSchema: z.object({}),
  execute: async () => {
    const t0 = Date.now();
    session = await steel.sessions.create({});
    const tSession = Date.now() - t0;
    browser = await chromium.connectOverCDP(
      `${session.websocketUrl}&apiKey=${STEEL_API_KEY}`,
    );
    const tCdp = Date.now() - t0 - tSession;
    const ctx = browser.contexts()[0];
    page = ctx.pages()[0] ?? (await ctx.newPage());
    console.log(
      `    openSession: session=${tSession}ms cdp=${tCdp}ms`,
    );
    return {
      sessionId: session.id,
      liveViewUrl: session.sessionViewerUrl,
    };
  },
});

const navigate = tool({
  description:
    "Navigate the open session to a URL and wait for the page to load.",
  inputSchema: z.object({ url: z.string().url() }),
  execute: async ({ url }) => {
    if (!page) throw new Error("openSession must be called first.");
    const t0 = Date.now();
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45_000 });
    console.log(`    navigate: ${Date.now() - t0}ms`);
    return { url: page.url(), title: await page.title() };
  },
});

const snapshot = tool({
  description:
    "Return a readable snapshot of the current page: title, URL, visible text (capped), and a list of links with their text and href. Call this BEFORE extract so you never have to guess CSS selectors.",
  inputSchema: z.object({
    maxChars: z.number().int().positive().max(10_000).default(4_000),
    maxLinks: z.number().int().positive().max(200).default(50),
  }),
  execute: async ({ maxChars, maxLinks }) => {
    if (!page) throw new Error("openSession must be called first.");
    const t0 = Date.now();
    const snap = (await page.evaluate(
      ({ maxChars, maxLinks }: { maxChars: number; maxLinks: number }) => {
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
      { maxChars, maxLinks },
    )) as {
      url: string;
      title: string;
      text: string;
      links: { text: string; href: string }[];
    };
    console.log(
      `    snapshot: ${Date.now() - t0}ms (${snap.text.length} chars, ${snap.links.length} links)`,
    );
    return snap;
  },
});

const extract = tool({
  description:
    "Extract structured data from the current page using CSS selectors. Provide one row selector plus a list of per-row field selectors.",
  inputSchema: z.object({
    rowSelector: z
      .string()
      .describe("CSS selector matching each item. e.g. 'article.Box-row'"),
    fields: z
      .array(
        z.object({
          name: z.string(),
          selector: z
            .string()
            .describe(
              "CSS selector relative to the row. Use an empty string to read the row element itself.",
            ),
          attr: z
            .string()
            .optional()
            .describe(
              "Optional attribute to read instead of innerText, e.g. 'href'.",
            ),
        }),
      )
      .min(1)
      .max(10),
    limit: z.number().int().positive().max(20).default(10),
  }),
  execute: async ({ rowSelector, fields, limit }) => {
    if (!page) throw new Error("openSession must be called first.");
    const t0 = Date.now();
    // Run the whole extraction inside one page.evaluate so we pay the CDP
    // latency once, not N*M times. Serial CDP calls are the single biggest
    // source of slowness on a cloud browser.
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
          document.querySelectorAll(rowSelector),
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
              const text = (el as HTMLElement).innerText ?? el.textContent ?? "";
              item[f.name] = text.trim();
            }
          }
          return item;
        });
      },
      { rowSelector, fields, limit },
    )) as Record<string, string>[];
    console.log(`    extract: ${Date.now() - t0}ms (${items.length} rows)`);
    return { count: items.length, items };
  },
});

// A "final tool" pattern: the agent calls `reportFindings` last with the
// Zod-typed result. The tool has no `execute`, so v6 stops the loop as soon
// as it's called. The structured output is the tool call's `input`.
// (We can't use `output: Output.object(...)` alongside tools on Anthropic —
// the provider forces JSON-only mode and disables tool calls.)
const reportFindings = tool({
  description:
    "Call this LAST with your final findings. Calling this ends the research.",
  inputSchema: z.object({
    summary: z
      .string()
      .describe("One-paragraph summary of what these repos have in common."),
    repos: z
      .array(
        z.object({
          name: z.string(),
          url: z.string(),
          stars: z.string().optional(),
          description: z.string().optional(),
        }),
      )
      .min(1)
      .max(5),
  }),
  // intentionally no execute: lacking execute makes v6 stop the loop
});

const researchAgent = new ToolLoopAgent({
  model: anthropic("claude-haiku-4-5"),
  instructions: [
    "You operate a Steel cloud browser via tools.",
    "Workflow: (1) call openSession, (2) navigate to the target URL,",
    "(3) call snapshot to see the page's text and links,",
    "(4) only call extract when you need structured rows beyond what snapshot gives you,",
    "(5) call reportFindings once with your final result.",
    "Do not invent data. Prefer snapshot's links list over guessing selectors.",
  ].join(" "),
  stopWhen: [stepCountIs(15), hasToolCall("reportFindings")],
  tools: { openSession, navigate, snapshot, extract, reportFindings },
  onStepFinish: async ({ stepNumber, toolCalls, usage }) => {
    const names =
      toolCalls?.map((t: any) => t.toolName).join(", ") || "(text only)";
    const tokens = usage?.totalTokens ?? 0;
    console.log(`  step ${stepNumber}: ${names} | ${tokens} tokens`);
  },
});

async function main() {
  console.log("🚀 Steel + AI SDK v6 (ToolLoopAgent) Starter");
  console.log("=".repeat(60));

  if (STEEL_API_KEY === "your-steel-api-key-here") {
    console.warn(
      "⚠️  WARNING: Please replace 'your-steel-api-key-here' with your actual Steel API key",
    );
    console.warn(
      "   Get your API key at: https://app.steel.dev/settings/api-keys",
    );
    throw new Error("Set STEEL_API_KEY");
  }
  if (ANTHROPIC_API_KEY === "your-anthropic-api-key-here") {
    console.warn(
      "⚠️  WARNING: Please replace 'your-anthropic-api-key-here' with your actual Anthropic API key",
    );
    console.warn("   Get your API key at: https://console.anthropic.com/");
    throw new Error("Set ANTHROPIC_API_KEY");
  }

  try {
    const result = await researchAgent.generate({
      prompt:
        "Go to https://github.com/trending/python?since=daily and return the top 3 AI/ML-related repositories. For each, give its full name (owner/repo), GitHub URL, star count as shown on the page, and the repo description.",
    });

    console.log("\n\x1b[1;92mAgent finished.\x1b[0m");

    // The final findings are the input to the reportFindings tool call.
    const steps = (result as any).steps ?? [];
    const reportCall = steps
      .flatMap((s: any) => s.toolCalls ?? [])
      .find((tc: any) => tc.toolName === "reportFindings");
    const structured = reportCall?.input ?? { text: result.text };

    console.log("\nStructured output:");
    console.log(JSON.stringify(structured, null, 2));
  } catch (error) {
    console.error("Error during automation:", error);
    throw error;
  } finally {
    if (browser) {
      try {
        await browser.close();
      } catch {}
    }
    if (session) {
      console.log("\nReleasing Steel session...");
      try {
        await steel.sessions.release(session.id);
        console.log(`Session released. Replay: ${session.sessionViewerUrl}`);
      } catch (e) {
        console.error("Error releasing session:", e);
      }
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Task execution failed:", error);
    process.exit(1);
  });
