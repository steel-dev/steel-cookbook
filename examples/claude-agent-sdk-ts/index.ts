/*
 * Build a browser agent with the Claude Agent SDK (TypeScript) and Steel.
 * https://github.com/steel-dev/steel-cookbook/tree/main/examples/claude-agent-sdk-ts
 */

import {
  createSdkMcpServer,
  query,
  tool,
} from "@anthropic-ai/claude-agent-sdk";
import * as dotenv from "dotenv";
import { chromium, type Browser, type Page } from "playwright";
import Steel from "steel-sdk";
import { z } from "zod";

dotenv.config();

const STEEL_API_KEY = process.env.STEEL_API_KEY || "your-steel-api-key-here";
const ANTHROPIC_API_KEY =
  process.env.ANTHROPIC_API_KEY || "your-anthropic-api-key-here";

const steel = new Steel({ steelAPIKey: STEEL_API_KEY });

// Shared browser state held across tool calls within one run. The Agent SDK
// runs the loop in this same process, so module scope is enough; for
// concurrent runs, swap to a per-task context object.
let session: Awaited<ReturnType<typeof steel.sessions.create>> | null = null;
let browser: Browser | null = null;
let page: Page | null = null;

const openSession = tool(
  "open_session",
  "Open a Steel cloud browser session. Call exactly once, before anything else.",
  {},
  async () => {
    const t0 = Date.now();
    session = await steel.sessions.create({});
    browser = await chromium.connectOverCDP(
      `${session.websocketUrl}&apiKey=${STEEL_API_KEY}`,
    );
    const ctx = browser.contexts()[0];
    page = ctx.pages()[0] ?? (await ctx.newPage());
    console.log(`    open_session: ${Date.now() - t0}ms`);
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            sessionId: session.id,
            liveViewUrl: session.sessionViewerUrl,
          }),
        },
      ],
    };
  },
);

const navigate = tool(
  "navigate",
  "Navigate the open session to a URL and wait for it to load.",
  { url: z.string().describe("Absolute URL to navigate to") },
  async ({ url }) => {
    if (!page) {
      return {
        content: [{ type: "text", text: "open_session must be called first." }],
        isError: true,
      };
    }
    const t0 = Date.now();
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45_000 });
    console.log(`    navigate: ${Date.now() - t0}ms`);
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ url: page.url(), title: await page.title() }),
        },
      ],
    };
  },
);

const snapshot = tool(
  "snapshot",
  "Return a readable snapshot of the current page: title, URL, the first 4000 characters of visible text, and the first 50 links. Call BEFORE extract so you never have to guess CSS selectors.",
  {},
  async () => {
    if (!page) {
      return {
        content: [{ type: "text", text: "open_session must be called first." }],
        isError: true,
      };
    }
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
        return { url: location.href, title: document.title, text, links };
      },
      { maxChars: 4_000, maxLinks: 50 },
    )) as {
      url: string;
      title: string;
      text: string;
      links: { text: string; href: string }[];
    };
    console.log(
      `    snapshot: ${Date.now() - t0}ms (${snap.text.length} chars, ${snap.links.length} links)`,
    );
    return { content: [{ type: "text", text: JSON.stringify(snap) }] };
  },
);

const extract = tool(
  "extract",
  "Extract structured rows from the current page using CSS selectors. Returns {count, items[]}. Prefer calling snapshot first to confirm page structure.",
  {
    rowSelector: z.string().describe("CSS selector that matches each row"),
    fields: z
      .array(
        z.object({
          name: z.string(),
          selector: z
            .string()
            .describe(
              "CSS selector relative to the row. Empty string reads the row itself.",
            ),
          attr: z
            .string()
            .optional()
            .describe(
              "Optional attribute to read instead of innerText (e.g. 'href').",
            ),
        }),
      )
      .min(1)
      .max(10),
    limit: z.number().int().min(1).max(50).default(10),
  },
  async ({ rowSelector, fields, limit }) => {
    if (!page) {
      return {
        content: [{ type: "text", text: "open_session must be called first." }],
        isError: true,
      };
    }
    const t0 = Date.now();
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
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ count: items.length, items }),
        },
      ],
    };
  },
);

const steelServer = createSdkMcpServer({
  name: "steel",
  version: "1.0.0",
  tools: [openSession, navigate, snapshot, extract],
});

const SYSTEM_PROMPT = [
  "You operate a Steel cloud browser through MCP tools.",
  "Workflow: (1) open_session, (2) navigate to the target URL,",
  "(3) snapshot to read the page's text and links,",
  "(4) only call extract when you need structured rows.",
  "Prefer snapshot's link list over guessing selectors. Do not invent data.",
].join(" ");

const PROMPT =
  "Go to https://github.com/trending/python?since=daily and return the top 3 " +
  "AI/ML-related repositories. For each, give name (owner/repo), GitHub URL, " +
  "star count as shown, and the description.";

async function main() {
  console.log("Steel + Claude Agent SDK (TypeScript) Starter");
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

  let finalText = "";
  try {
    for await (const message of query({
      prompt: PROMPT,
      options: {
        model: "claude-sonnet-4-6",
        systemPrompt: SYSTEM_PROMPT,
        mcpServers: { steel: steelServer },
        allowedTools: ["mcp__steel__*"],
        // Drop Bash, Read, Edit, and friends. The agent should only see Steel.
        tools: [],
        // Don't load the developer's local .claude/ config.
        settingSources: [],
        maxTurns: 20,
        permissionMode: "bypassPermissions",
      },
    })) {
      if (message.type === "assistant") {
        for (const block of message.message.content) {
          if (block.type === "tool_use") {
            const name = block.name.replace(/^mcp__steel__/, "");
            const argsPreview = JSON.stringify(block.input).slice(0, 120);
            console.log(`  -> ${name}(${argsPreview})`);
          } else if (block.type === "text" && block.text.trim()) {
            console.log(block.text.trim().slice(0, 400));
          }
        }
      } else if (message.type === "result") {
        if (message.subtype === "success") {
          finalText = message.result ?? "";
        } else {
          console.log(`Run ended: ${message.subtype}`);
        }
      }
    }
    if (finalText) {
      console.log("\n--- Final answer ---");
      console.log(finalText);
    }
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
