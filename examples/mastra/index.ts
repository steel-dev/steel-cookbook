/*
 * Build an AI browser agent with Mastra and Steel.
 * https://github.com/steel-dev/steel-cookbook/tree/main/examples/mastra
 */

import * as dotenv from "dotenv";
import { Mastra } from "@mastra/core";
import { Agent } from "@mastra/core/agent";
import { createTool } from "@mastra/core/tools";
import { chromium, type Browser, type Page } from "playwright";
import Steel from "steel-sdk";
import type { Session } from "steel-sdk/resources/index";
import { z } from "zod";

dotenv.config();

const STEEL_API_KEY = process.env.STEEL_API_KEY || "your-steel-api-key-here";
const ANTHROPIC_API_KEY =
  process.env.ANTHROPIC_API_KEY || "your-anthropic-api-key-here";

const steel = new Steel({ steelAPIKey: STEEL_API_KEY });

// One Steel session is shared across tool calls via module-level closure.
let session: Session | null = null;
let browser: Browser | null = null;
let page: Page | null = null;

const openSession = createTool({
  id: "open-session",
  description:
    "Open a Steel cloud browser session. Call exactly once, before anything else.",
  inputSchema: z.object({}),
  outputSchema: z.object({
    sessionId: z.string(),
    liveViewUrl: z.string(),
  }),
  execute: async () => {
    const t0 = Date.now();
    session = await steel.sessions.create({});
    browser = await chromium.connectOverCDP(
      `${session.websocketUrl}&apiKey=${STEEL_API_KEY}`,
    );
    const ctx = browser.contexts()[0];
    page = ctx.pages()[0] ?? (await ctx.newPage());
    console.log(`    open-session: ${Date.now() - t0}ms`);
    return {
      sessionId: session.id,
      liveViewUrl: session.sessionViewerUrl,
    };
  },
});

const navigate = createTool({
  id: "navigate",
  description:
    "Navigate the open session to a URL and wait for the page to load.",
  inputSchema: z.object({ url: z.string().url() }),
  outputSchema: z.object({ url: z.string(), title: z.string() }),
  execute: async ({ url }) => {
    if (!page) throw new Error("open-session must be called first.");
    const t0 = Date.now();
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45_000 });
    console.log(`    navigate: ${Date.now() - t0}ms`);
    return { url: page.url(), title: await page.title() };
  },
});

const snapshot = createTool({
  id: "snapshot",
  description:
    "Return a readable snapshot of the current page: title, URL, visible text (capped), and a list of links. Call BEFORE extract so you never have to guess CSS selectors.",
  inputSchema: z.object({
    maxChars: z.number().int().positive().max(10_000).default(4_000),
    maxLinks: z.number().int().positive().max(200).default(50),
  }),
  outputSchema: z.object({
    url: z.string(),
    title: z.string(),
    text: z.string(),
    links: z.array(z.object({ text: z.string(), href: z.string() })),
  }),
  execute: async ({ maxChars, maxLinks }) => {
    if (!page) throw new Error("open-session must be called first.");
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

const extract = createTool({
  id: "extract",
  description:
    "Extract structured data from the current page using CSS selectors. Provide one row selector plus per-row field selectors. Prefer calling snapshot first.",
  inputSchema: z.object({
    rowSelector: z
      .string()
      .describe("CSS selector matching each item, e.g. 'article.Box-row'."),
    fields: z
      .array(
        z.object({
          name: z.string(),
          selector: z
            .string()
            .describe(
              "CSS selector relative to the row. Empty string reads the row element itself.",
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
  outputSchema: z.object({
    count: z.number(),
    items: z.array(z.record(z.string(), z.string())),
  }),
  execute: async ({ rowSelector, fields, limit }) => {
    if (!page) throw new Error("open-session must be called first.");
    const t0 = Date.now();
    // Run the whole extraction inside one page.evaluate. Serial CDP round-trips
    // against a cloud browser cost ~200-300ms each, so N rows by M fields in
    // sequence burns real seconds. Batch into one round trip.
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
        const rows = Array.from(document.querySelectorAll(rowSelector)).slice(
          0,
          limit,
        );
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
      { rowSelector, fields, limit },
    )) as Record<string, string>[];
    console.log(`    extract: ${Date.now() - t0}ms (${items.length} rows)`);
    return { count: items.length, items };
  },
});

// Anthropic's structured-output API rejects array constraints (minItems,
// maxItems) on the final-output schema, so we describe the bound in prose
// and rely on the prompt for the count. Tool input schemas, which go through
// the regular tool-call API, can still use .min/.max freely.
const FinalReport = z.object({
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
    .describe("Between 1 and 5 repos, ordered by relevance."),
});

// The agent. Tools are passed as a record (not an array): the keys are how
// the model references them.
export const researchAgent = new Agent({
  id: "research-agent",
  name: "Steel Research",
  instructions: [
    "You operate a Steel cloud browser via tools.",
    "Workflow: (1) open-session, (2) navigate to the target URL,",
    "(3) snapshot to see the page's text and links,",
    "(4) only call extract when you need structured rows beyond what snapshot gives you,",
    "(5) return the final report.",
    "Prefer snapshot's links list over guessing selectors. Do not invent data.",
  ].join(" "),
  // Mastra Model Router: 'provider/model' string. No @ai-sdk/anthropic install
  // needed; the router reads ANTHROPIC_API_KEY from env.
  model: "anthropic/claude-haiku-4-5",
  tools: { openSession, navigate, snapshot, extract },
});

// Top-level Mastra registry. With one agent it isn't strictly required for
// generate() to work, but it's the idiomatic shape and is what `mastra dev`
// reads to populate Studio.
export const mastra = new Mastra({
  agents: { researchAgent },
});

async function main() {
  console.log("Steel + Mastra Starter");
  console.log("=".repeat(60));

  if (STEEL_API_KEY === "your-steel-api-key-here") {
    console.warn(
      "Set STEEL_API_KEY in .env (https://app.steel.dev/settings/api-keys)",
    );
    throw new Error("Set STEEL_API_KEY");
  }
  if (ANTHROPIC_API_KEY === "your-anthropic-api-key-here") {
    console.warn(
      "Set ANTHROPIC_API_KEY in .env (https://console.anthropic.com/)",
    );
    throw new Error("Set ANTHROPIC_API_KEY");
  }

  try {
    const result = await researchAgent.generate(
      "Go to https://github.com/trending/python?since=daily and return the top 3 AI/ML-related repositories. For each, give name (owner/repo), GitHub URL, star count as shown, and the repo description.",
      {
        // Anthropic's native output_config API rejects array constraints and
        // can't combine cleanly with tool calls in the same request. Passing a
        // `model` to structuredOutput runs a second cheap pass after the agent
        // finishes, coercing the free-text answer into the typed schema. This
        // is Mastra's documented "maximum compatibility" path.
        structuredOutput: {
          schema: FinalReport,
          model: "anthropic/claude-haiku-4-5",
        },
        maxSteps: 15,
        onStepFinish: async (step: any) => {
          const calls = step?.toolCalls ?? [];
          const names = calls.length
            ? calls
                .map(
                  (t: any) => t.payload?.toolName ?? t.toolName ?? t.name ?? "?",
                )
                .join(", ")
            : "(text only)";
          const tokens = step?.usage?.totalTokens ?? 0;
          console.log(`  step: ${names} | ${tokens} tokens`);
        },
      },
    );

    console.log("\n\x1b[1;92mAgent finished.\x1b[0m\n");
    console.log("Structured output:");
    console.log(JSON.stringify(result.object, null, 2));
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
