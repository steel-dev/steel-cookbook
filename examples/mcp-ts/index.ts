/*
 * An MCP server that exposes a Steel cloud browser as explicit session-handle tools.
 * https://github.com/steel-dev/steel-cookbook/tree/main/examples/mcp-ts
 */

import * as dotenv from "dotenv";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { chromium, type Browser, type Page } from "playwright";
import Steel from "steel-sdk";
import { z } from "zod";

dotenv.config();

const STEEL_API_KEY = process.env.STEEL_API_KEY;
if (!STEEL_API_KEY) {
  console.error("Set STEEL_API_KEY (https://app.steel.dev/settings/api-keys)");
  process.exit(1);
}

const steel = new Steel({ steelAPIKey: STEEL_API_KEY });

// The Steel session id is the handle the model threads back on every call, so the
// server keeps no hidden "current page": each tool names the session it drives.
// Two clients hold two ids and never read each other's pages.
type Entry = { browser: Browser; page: Page };
const sessions = new Map<string, Entry>();

function getPage(sessionId: string): Page {
  const entry = sessions.get(sessionId);
  if (!entry) {
    throw new Error(`unknown session_id ${JSON.stringify(sessionId)}; call create_session first`);
  }
  return entry.page;
}

const server = new McpServer({ name: "steel", version: "0.1.0" });

server.registerTool(
  "create_session",
  {
    description:
      "Start a Steel cloud browser and return a session_id handle plus a live-view URL. Pass the handle to every other tool.",
    inputSchema: {},
  },
  async () => {
    const session = await steel.sessions.create({});
    const browser = await chromium.connectOverCDP(
      `${session.websocketUrl}&apiKey=${STEEL_API_KEY}`,
    );
    const ctx = browser.contexts()[0];
    const page = ctx.pages()[0] ?? (await ctx.newPage());
    sessions.set(session.id, { browser, page });
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            session_id: session.id,
            live_view_url: session.sessionViewerUrl,
          }),
        },
      ],
    };
  },
);

server.registerTool(
  "navigate",
  {
    description:
      "Open a URL in the session's browser tab and wait for it to load. Returns the resolved title and URL.",
    inputSchema: {
      session_id: z.string().describe("Handle returned by create_session."),
      url: z.string().describe("Absolute URL to open, e.g. https://news.ycombinator.com."),
    },
  },
  async ({ session_id, url }) => {
    const page = getPage(session_id);
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45_000 });
    return {
      content: [
        { type: "text", text: JSON.stringify({ url: page.url(), title: await page.title() }) },
      ],
    };
  },
);

server.registerTool(
  "extract",
  {
    description:
      "Read text from the current page. Give a CSS selector to target part of it, or omit it to read the whole body.",
    inputSchema: {
      session_id: z.string().describe("Handle returned by create_session."),
      selector: z.string().optional().describe("CSS selector to read. Omit to read the whole page body."),
      max_chars: z.number().optional().describe("Cap on characters returned. Defaults to 8000."),
    },
  },
  async ({ session_id, selector, max_chars }) => {
    const page = getPage(session_id);
    const text = await page.evaluate(
      ({ selector, maxChars }: { selector: string; maxChars: number }) => {
        const els = Array.from(document.querySelectorAll(selector));
        const t = els
          .map((e) => (e as HTMLElement).innerText || e.textContent || "")
          .join("\n\n")
          .trim();
        return t.slice(0, maxChars);
      },
      { selector: selector ?? "body", maxChars: max_chars ?? 8000 },
    );
    return { content: [{ type: "text", text }] };
  },
);

server.registerTool(
  "screenshot",
  {
    description: "Capture a PNG screenshot of the current page in the session.",
    inputSchema: {
      session_id: z.string().describe("Handle returned by create_session."),
    },
  },
  async ({ session_id }) => {
    const page = getPage(session_id);
    const buf = await page.screenshot();
    // MCP carries images as their own content block, so the client renders the
    // PNG instead of a wall of base64 in the transcript.
    return { content: [{ type: "image", data: buf.toString("base64"), mimeType: "image/png" }] };
  },
);

server.registerTool(
  "release_session",
  {
    description:
      "Close the browser and release the Steel session. Call this when the task is done so the session stops billing.",
    inputSchema: {
      session_id: z.string().describe("Handle returned by create_session."),
    },
  },
  async ({ session_id }) => {
    const entry = sessions.get(session_id);
    if (!entry) throw new Error(`unknown session_id ${JSON.stringify(session_id)}`);
    sessions.delete(session_id);
    try {
      await entry.browser.close();
    } catch {}
    await steel.sessions.release(session_id);
    return { content: [{ type: "text", text: JSON.stringify({ released: session_id }) }] };
  },
);

// Steel bills per session-minute, so release whatever is still open when the
// client tears the server down.
async function releaseAll(): Promise<void> {
  for (const sid of [...sessions.keys()]) {
    try {
      await steel.sessions.release(sid);
    } catch {}
    sessions.delete(sid);
  }
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, async () => {
    await releaseAll();
    process.exit(0);
  });
}

async function main(): Promise<void> {
  // Stdio carries the JSON-RPC stream on stdout, so the server logs only to
  // stderr. The transport owns stdout once connected.
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
