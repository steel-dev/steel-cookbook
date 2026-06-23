/*
 * Build an AI browser agent with Google ADK (TypeScript) and Steel.
 * https://github.com/steel-dev/steel-cookbook/tree/main/examples/google-adk-ts
 */

import * as dotenv from "dotenv";
import {
  FunctionTool,
  Gemini,
  InMemoryRunner,
  LlmAgent,
  LogLevel,
  isFinalResponse,
  setLogLevel,
  stringifyContent,
} from "@google/adk";
import { chromium, type Browser, type Page } from "playwright";
import Steel from "steel-sdk";
import type { Session } from "steel-sdk/resources/index";
import { z } from "zod";

dotenv.config();
setLogLevel(LogLevel.WARN);

const STEEL_API_KEY = process.env.STEEL_API_KEY || "your-steel-api-key-here";
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY || "your-google-api-key-here";

const MODEL = "gemini-2.5-flash";

const steel = new Steel({ steelAPIKey: STEEL_API_KEY });

// The session opens once in main() before the runner loop; the tools below
// close over this page so each tool call drives the same cloud browser.
let page: Page | null = null;

const navigate = new FunctionTool({
  name: "navigate",
  description:
    "Navigate the browser to a URL and wait for the page to load. Returns the final URL and page title.",
  parameters: z.object({ url: z.string() }),
  execute: async ({ url }) => {
    if (!page) throw new Error("Browser session is not open.");
    const t0 = Date.now();
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45_000 });
    } catch (e) {
      return { error: String(e) };
    }
    console.log(`    navigate: ${Date.now() - t0}ms`);
    return { url: page.url(), title: await page.title() };
  },
});

const snapshot = new FunctionTool({
  name: "snapshot",
  description:
    "Return a readable snapshot of the current page: title, URL, visible text (capped), and a list of links. Call BEFORE extract so you never have to guess CSS selectors.",
  // Gemini's function-declaration schema rejects numeric constraints
  // (exclusiveMinimum/maximum) and `default`, so bounds live in the
  // descriptions and defaults are applied in code.
  parameters: z.object({
    maxChars: z
      .number()
      .optional()
      .describe("Cap on visible text length. Default 4000."),
    maxLinks: z
      .number()
      .optional()
      .describe("Cap on number of links. Default 50."),
  }),
  execute: async ({ maxChars, maxLinks }) => {
    if (!page) throw new Error("Browser session is not open.");
    const t0 = Date.now();
    const mc = maxChars ?? 4_000;
    const ml = maxLinks ?? 50;
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
        return { url: location.href, title: document.title, text, links };
      },
      { maxChars: mc, maxLinks: ml },
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

const extract = new FunctionTool({
  name: "extract",
  description:
    "Extract structured data from the current page using CSS selectors. Provide one row selector plus per-row field selectors. Prefer calling snapshot first.",
  parameters: z.object({
    rowSelector: z
      .string()
      .describe("CSS selector matching each item, e.g. 'tr.athing'."),
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
      .describe("One spec per column to extract from each row."),
    limit: z.number().optional().describe("Max rows to return. Default 10."),
  }),
  execute: async ({ rowSelector, fields, limit }) => {
    if (!page) throw new Error("Browser session is not open.");
    const t0 = Date.now();
    const lim = limit ?? 10;
    // Run the whole extraction inside one page.evaluate. Serial CDP round-trips
    // against a cloud browser cost ~200-300ms each, so N rows by M fields in
    // sequence burns real seconds. Batch into one round trip.
    let items: Record<string, string>[];
    try {
      items = (await page.evaluate(
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
        { rowSelector, fields, limit: lim },
      )) as Record<string, string>[];
    } catch (e) {
      // A model-supplied selector can be invalid; hand the error back so the
      // agent corrects it instead of crashing the run.
      return { error: String(e) };
    }
    console.log(`    extract: ${Date.now() - t0}ms (${items.length} rows)`);
    return { count: items.length, items };
  },
});

// Gemini is constructed explicitly so we can read the key from GOOGLE_API_KEY.
// ADK's default model resolver only looks for GOOGLE_GENAI_API_KEY / GEMINI_API_KEY.
const agent = new LlmAgent({
  name: "steel_research",
  model: new Gemini({ model: MODEL, apiKey: GOOGLE_API_KEY }),
  description: "Operates a Steel cloud browser to scrape structured data.",
  instruction: [
    "You operate a Steel cloud browser via tools.",
    "Workflow: (1) navigate to the target URL,",
    "(2) snapshot to read the page's text and links,",
    "(3) build the answer from the snapshot's links; only call extract for a field the snapshot does not give you.",
    "Prefer the snapshot links over guessing CSS selectors.",
    "If a field such as points is not visible, use 0; never drop a story for a missing field.",
    "Return ONLY a JSON object of the shape",
    '{ "stories": [{ "rank": number, "title": string, "url": string, "points": number }] }',
    "with the top 5 stories, no markdown fence, and no prose.",
    "Do not invent data, and never return an empty stories array.",
  ].join(" "),
  tools: [navigate, snapshot, extract],
});

const TASK =
  "Go to https://news.ycombinator.com and return the top 5 stories with rank, title, destination URL, and points.";

// gemini-2.5-flash occasionally ends a turn with MALFORMED_FUNCTION_CALL or an
// empty answer. Each attempt runs a fresh ADK session, so a transient bad turn
// is retried instead of sinking the run.
async function runTask(
  runner: InMemoryRunner,
  userId: string,
): Promise<string> {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const adkSession = await runner.sessionService.createSession({
      appName: runner.appName,
      userId,
    });
    let finalText = "";
    let transient = "";
    for await (const event of runner.runAsync({
      userId,
      sessionId: adkSession.id,
      newMessage: { role: "user", parts: [{ text: TASK }] },
    })) {
      if (event.errorCode) {
        transient = String(event.errorCode);
        break;
      }
      const calls = (event.content?.parts ?? [])
        .map((p) => p.functionCall?.name)
        .filter((n): n is string => Boolean(n));
      if (calls.length) console.log(`  step: ${calls.join(", ")}`);
      if (isFinalResponse(event)) finalText = stringifyContent(event).trim();
    }
    if (!transient && finalText) return finalText;
    console.log(`  retry ${attempt}/3 (${transient || "empty answer"})`);
  }
  throw new Error("Agent did not return an answer after 3 attempts.");
}

async function main() {
  console.log("Steel + Google ADK Starter");
  console.log("=".repeat(60));

  if (STEEL_API_KEY === "your-steel-api-key-here") {
    console.warn(
      "Set STEEL_API_KEY in .env (https://app.steel.dev/settings/api-keys)",
    );
    throw new Error("Set STEEL_API_KEY");
  }
  if (GOOGLE_API_KEY === "your-google-api-key-here") {
    console.warn(
      "Set GOOGLE_API_KEY in .env (https://aistudio.google.com/apikey)",
    );
    throw new Error("Set GOOGLE_API_KEY");
  }

  let session: Session | null = null;
  let browser: Browser | null = null;

  try {
    const t0 = Date.now();
    session = await steel.sessions.create({});
    console.log(`    open-session: ${Date.now() - t0}ms`);
    console.log(`Live View: ${session.sessionViewerUrl}`);

    browser = await chromium.connectOverCDP(
      `${session.websocketUrl}&apiKey=${STEEL_API_KEY}`,
    );
    const ctx = browser.contexts()[0];
    page = ctx.pages()[0] ?? (await ctx.newPage());

    const runner = new InMemoryRunner({ agent });
    const finalText = await runTask(runner, "steel-user");

    console.log("\n\x1b[1;92mAgent finished.\x1b[0m\n");
    console.log("Top stories:");
    // The model sometimes wraps JSON in a ```json fence; strip it before parsing.
    const json = finalText.replace(/^```(?:json)?\s*|\s*```$/g, "");
    try {
      console.log(JSON.stringify(JSON.parse(json), null, 2));
    } catch {
      console.log(finalText);
    }
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
