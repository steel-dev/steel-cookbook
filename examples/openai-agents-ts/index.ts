/*
 * Build an AI browser agent with the OpenAI Agents SDK (TypeScript) and Steel.
 * https://github.com/steel-dev/steel-cookbook/tree/main/examples/steel-openai-agents-node-starter
 */

import * as dotenv from "dotenv";
import { Agent, run, tool } from "@openai/agents";
import { chromium, type Browser, type Page } from "playwright";
import Steel from "steel-sdk";
import { z } from "zod";

dotenv.config();

const STEEL_API_KEY = process.env.STEEL_API_KEY || "your-steel-api-key-here";
const OPENAI_API_KEY =
  process.env.OPENAI_API_KEY || "your-openai-api-key-here";

const steel = new Steel({ steelAPIKey: STEEL_API_KEY });

// Shared browser state across tool calls within one run.
let session: Awaited<ReturnType<typeof steel.sessions.create>> | null = null;
let browser: Browser | null = null;
let page: Page | null = null;

const openSession = tool({
  name: "open_session",
  description:
    "Open a Steel cloud browser session. Call exactly once, before anything else.",
  parameters: z.object({}),
  execute: async () => {
    const t0 = Date.now();
    session = await steel.sessions.create({});
    browser = await chromium.connectOverCDP(
      `${session.websocketUrl}&apiKey=${STEEL_API_KEY}`,
    );
    const ctx = browser.contexts()[0];
    page = ctx.pages()[0] ?? (await ctx.newPage());
    console.log(`    open_session: ${Date.now() - t0}ms`);
    return {
      sessionId: session.id,
      liveViewUrl: session.sessionViewerUrl,
    };
  },
});

const navigate = tool({
  name: "navigate",
  description: "Navigate the open session to a URL and wait for it to load.",
  // OpenAI strict JSON Schema doesn't accept "uri" format, so skip .url()
  // and let the model send a URL string.
  parameters: z.object({ url: z.string() }),
  execute: async ({ url }) => {
    if (!page) throw new Error("open_session must be called first.");
    const t0 = Date.now();
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45_000 });
    console.log(`    navigate: ${Date.now() - t0}ms`);
    return { url: page.url(), title: await page.title() };
  },
});

const snapshot = tool({
  name: "snapshot",
  description:
    "Return a readable snapshot of the current page: title, URL, visible text (capped), and a list of links. Call BEFORE extract so you never have to guess CSS selectors.",
  parameters: z.object({
    maxChars: z.number().int().positive().max(10_000).default(4_000),
    maxLinks: z.number().int().positive().max(200).default(50),
  }),
  execute: async ({ maxChars, maxLinks }) => {
    if (!page) throw new Error("open_session must be called first.");
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
  name: "extract",
  description:
    "Extract structured rows from the current page using CSS selectors. Prefer calling snapshot() first.",
  parameters: z.object({
    rowSelector: z.string(),
    fields: z
      .array(
        z.object({
          name: z.string(),
          selector: z.string(),
          // OpenAI strict mode requires all fields required; use .nullable()
          // instead of .optional() to allow "not set" values.
          attr: z.string().nullable(),
        }),
      )
      .min(1)
      .max(10),
    limit: z.number().int().positive().max(20).default(10),
  }),
  execute: async ({ rowSelector, fields, limit }) => {
    if (!page) throw new Error("open_session must be called first.");
    const t0 = Date.now();
    // Batch the extraction inside one page.evaluate — serial CDP calls on a
    // cloud browser are ~200-300ms each, so N*M round-trips burns seconds.
    const items = (await page.evaluate(
      ({
        rowSelector,
        fields,
        limit,
      }: {
        rowSelector: string;
        fields: { name: string; selector: string; attr: string | null }[];
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
              // f.attr is nullable; the execute body only reads when truthy.
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

const FinalReport = z.object({
  summary: z
    .string()
    .describe("One-paragraph summary of what these repos have in common."),
  repos: z
    .array(
      z.object({
        name: z.string(),
        url: z.string(),
        // OpenAI strict mode: all fields required; use .nullable() for "optional".
        stars: z.string().nullable(),
        description: z.string().nullable(),
      }),
    )
    .min(1)
    .max(5),
});

const agent = new Agent({
  name: "SteelResearch",
  instructions: [
    "You operate a Steel cloud browser via tools.",
    "Workflow: (1) open_session, (2) navigate to the target URL,",
    "(3) snapshot to see the page's text and links,",
    "(4) only call extract when you need structured rows beyond snapshot,",
    "(5) return the final FinalReport.",
    "Prefer snapshot's links list over guessing selectors. Do not invent data.",
  ].join(" "),
  model: "gpt-5-mini",
  tools: [openSession, navigate, snapshot, extract],
  outputType: FinalReport,
});

async function main() {
  console.log("🚀 Steel + OpenAI Agents SDK (TypeScript) Starter");
  console.log("=".repeat(60));

  if (STEEL_API_KEY === "your-steel-api-key-here") {
    console.warn(
      "⚠️  Set STEEL_API_KEY in .env (https://app.steel.dev/settings/api-keys)",
    );
    throw new Error("Set STEEL_API_KEY");
  }
  if (OPENAI_API_KEY === "your-openai-api-key-here") {
    console.warn(
      "⚠️  Set OPENAI_API_KEY in .env (https://platform.openai.com/)",
    );
    throw new Error("Set OPENAI_API_KEY");
  }

  try {
    const result = await run(
      agent,
      "Go to https://github.com/trending/python?since=daily and return the top 3 AI/ML-related repositories. For each, give name (owner/repo), GitHub URL, star count as shown, and the repo description.",
      { maxTurns: 15 },
    );

    console.log("\n\x1b[1;92mAgent finished.\x1b[0m\n");
    console.log(JSON.stringify(result.finalOutput, null, 2));
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
        console.log(
          `Session released. Replay: ${session.sessionViewerUrl}`,
        );
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
