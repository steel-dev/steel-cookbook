/*
 * Deep-research agent with the Claude Agent SDK (TypeScript) and Steel.
 * https://github.com/steel-dev/steel-cookbook/tree/main/examples/deep-research-ts
 *
 * A lead "orchestrator" agent decomposes a research question, dispatches one
 * `researcher` subagent per sub-question in parallel, and synthesizes the
 * returned findings into a Markdown report with traceable citations. Each
 * researcher operates its own Steel cloud browser session.
 */

import {
  createSdkMcpServer,
  query,
  tool,
  type AgentDefinition,
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

// One Steel session per researcher_id. The orchestrator hands each subagent
// a unique id (r1, r2, ...) and instructs it to pass that id to every tool
// call, so parallel researchers each browse in isolation.
type Researcher = {
  session: Awaited<ReturnType<typeof steel.sessions.create>>;
  browser: Browser;
  page: Page;
  // Serialize tool calls within one researcher so parallel calls on the
  // same Playwright page can't trample each other.
  chain: Promise<void>;
};

const researchers = new Map<string, Researcher>();
let sessionCreateChain: Promise<void> = Promise.resolve();

async function ensureResearcher(researcherId: string): Promise<Researcher> {
  // Serialize first-time creation across researcher_ids so two concurrent
  // first calls don't both try to spin up a session.
  const previous = sessionCreateChain;
  let release: () => void;
  sessionCreateChain = new Promise((r) => {
    release = r;
  });
  await previous;
  try {
    const cached = researchers.get(researcherId);
    if (cached) return cached;
    const session = await steel.sessions.create({});
    const browser = await chromium.connectOverCDP(
      `${session.websocketUrl}&apiKey=${STEEL_API_KEY}`,
    );
    const ctx = browser.contexts()[0];
    const page = ctx.pages()[0] ?? (await ctx.newPage());
    page.setDefaultTimeout(30_000);
    const r: Researcher = { session, browser, page, chain: Promise.resolve() };
    researchers.set(researcherId, r);
    console.log(`    [${researcherId}] opened session ${session.id}`);
    return r;
  } finally {
    release!();
  }
}

async function withResearcherLock<T>(
  r: Researcher,
  fn: () => Promise<T>,
): Promise<T> {
  const previous = r.chain;
  let release: () => void;
  r.chain = new Promise((resolve) => {
    release = resolve;
  });
  await previous;
  try {
    return await fn();
  } finally {
    release!();
  }
}

const webSearch = tool(
  "web_search",
  "Search the open web. Returns the first 10 results with title, URL, and snippet. Pass your researcher_id so the search runs in your private browser session.",
  {
    researcher_id: z.string(),
    query: z.string(),
  },
  async ({ researcher_id, query: q }) => {
    const r = await ensureResearcher(researcher_id);
    const t0 = Date.now();
    try {
      const results = await withResearcherLock(r, async () => {
        await r.page.goto(
          `https://duckduckgo.com/html/?q=${encodeURIComponent(q)}`,
          { waitUntil: "domcontentloaded", timeout: 30_000 },
        );
        return (await r.page.evaluate(() =>
          Array.from(document.querySelectorAll(".result"))
            .slice(0, 10)
            .map((row) => {
              const titleEl = row.querySelector(
                ".result__title",
              ) as HTMLElement | null;
              const linkEl = row.querySelector(
                ".result__a",
              ) as HTMLAnchorElement | null;
              const snippetEl = row.querySelector(
                ".result__snippet",
              ) as HTMLElement | null;
              return {
                title: (titleEl?.innerText || "").trim(),
                url: linkEl?.href || "",
                snippet: (snippetEl?.innerText || "").trim(),
              };
            })
            .filter((r) => r.url),
        )) as { title: string; url: string; snippet: string }[];
      });
      console.log(
        `    [${researcher_id}] web_search '${q.slice(0, 50)}': ${results.length} results (${Date.now() - t0}ms)`,
      );
      return {
        content: [
          { type: "text", text: JSON.stringify({ query: q, results }) },
        ],
      };
    } catch (e) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ error: String(e), query: q }),
          },
        ],
        isError: true,
      };
    }
  },
);

const readUrl = tool(
  "read_url",
  "Open a URL in your private browser session and return the page title, visible text (first 8000 chars), and outbound links. Pass your researcher_id.",
  {
    researcher_id: z.string(),
    url: z.string(),
  },
  async ({ researcher_id, url }) => {
    const r = await ensureResearcher(researcher_id);
    const t0 = Date.now();
    try {
      const snap = await withResearcherLock(r, async () => {
        await r.page.goto(url, {
          waitUntil: "domcontentloaded",
          timeout: 30_000,
        });
        return (await r.page.evaluate(
          ({ maxChars, maxLinks }: { maxChars: number; maxLinks: number }) => {
            const text = (document.body.innerText || "").slice(0, maxChars);
            const links = Array.from(document.querySelectorAll("a[href]"))
              .slice(0, maxLinks)
              .map((a) => {
                const anchor = a as HTMLAnchorElement;
                return {
                  text: (anchor.innerText || "").trim().slice(0, 80),
                  href: anchor.href,
                };
              })
              .filter(
                (l) =>
                  l.text && l.href && l.href.startsWith("http"),
              );
            return {
              url: location.href,
              title: document.title,
              text,
              links,
            };
          },
          { maxChars: 8_000, maxLinks: 30 },
        )) as {
          url: string;
          title: string;
          text: string;
          links: { text: string; href: string }[];
        };
      });
      console.log(
        `    [${researcher_id}] read_url '${url.slice(0, 60)}': ${snap.text.length} chars (${Date.now() - t0}ms)`,
      );
      return { content: [{ type: "text", text: JSON.stringify(snap) }] };
    } catch (e) {
      return {
        content: [
          { type: "text", text: JSON.stringify({ error: String(e), url }) },
        ],
        isError: true,
      };
    }
  },
);

const steelServer = createSdkMcpServer({
  name: "steel",
  version: "1.0.0",
  tools: [webSearch, readUrl],
});

const RESEARCHER_PROMPT = `You are a focused web researcher.

Your task description includes a researcher_id (e.g. r1, r2). Pass that researcher_id to every tool call so you stay in your own private browser session.

Strict workflow (do not deviate):
1. Make EXACTLY ONE \`web_search\` call on a tight, specific query.
2. Make AT MOST 3 \`read_url\` calls on the most promising results. Prefer primary sources, official docs, reputable news. Skip paywalls and login walls.
3. Reply with this exact shape, nothing else:

SUB-QUESTION: <restated>

FINDINGS:
- <fact> [1]
- <fact> [2]
- <fact> [1][3]

SOURCES:
[1] <Title> - <URL>
[2] <Title> - <URL>

Cite every fact. Do not speculate beyond what the sources say. Cap at 4 sources. Do not run extra searches; if the first search yields no usable sources, return an empty FINDINGS block and note that in one line above SOURCES.`;

const ORCHESTRATOR_PROMPT = `You are a deep-research orchestrator. You do not browse the web yourself. You decompose, delegate, and synthesize.

Steps:
1. Decompose the user's question into 3 distinct sub-questions covering different angles (current state, key players, blockers, outlook, ...). Pick the 3 that fit best.
2. Dispatch one \`researcher\` subagent per sub-question IN PARALLEL: emit all Agent tool calls in a single assistant turn. For each, pass:
   - A unique researcher_id: r1, r2, r3, ...
   - The specific sub-question
   - The literal instruction "Pass researcher_id=<id> to every tool call."
3. Wait for all researchers to return their findings.
4. Synthesize into a final Markdown report. Use this shape:

# <Research question>

## Summary
<2 to 3 paragraph executive summary tying the sub-questions together.>

## <Sub-question 1>
<Synthesized answer with inline citations like [r1:1], [r2:3]. The format is [researcher_id:source_index] referencing that researcher's findings list.>

## <Sub-question 2>
...

## Sources
- [r1:1] <Title> - <URL>
- [r1:2] <Title> - <URL>
- [r2:1] <Title> - <URL>

Rules:
- Cite every claim with [rN:K]. The reader uses these to trace facts back to the researcher that found them.
- Do not introduce facts the researchers did not return.
- One report. No preamble, no follow-up questions.`;

const PROMPT =
  "What is the current state of solid-state battery commercialization for " +
  "electric vehicles in 2026? Cover which companies are shipping product, " +
  "where the underlying technology stands, and what is blocking mass-market " +
  "EV adoption.";

const researcher: AgentDefinition = {
  description:
    "Focused web researcher. Drives a private Steel browser session to " +
    "answer one sub-question with cited findings. Use one per sub-question.",
  prompt: RESEARCHER_PROMPT,
  // Researchers see only Steel tools. Don't include Agent;
  // subagents can't dispatch their own subagents.
  tools: ["mcp__steel__web_search", "mcp__steel__read_url"],
  mcpServers: ["steel"],
  model: "sonnet",
  maxTurns: 8,
};

async function main() {
  console.log("Steel + Claude Agent SDK Deep Research");
  console.log("=".repeat(60));
  console.log(`Question: ${PROMPT}`);
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
        model: "claude-opus-4-7",
        systemPrompt: ORCHESTRATOR_PROMPT,
        mcpServers: { steel: steelServer },
        // The orchestrator only dispatches subagents.
        allowedTools: ["Agent"],
        agents: { researcher },
        // Enable only the Agent built-in. tools: [] disables every built-in
        // including Agent, which silently demotes the orchestrator to using
        // Steel tools directly.
        tools: ["Agent"],
        settingSources: [],
        maxTurns: 20,
        permissionMode: "bypassPermissions",
      },
    })) {
      if (message.type === "assistant") {
        const inSubagent = Boolean(
          (message as { parent_tool_use_id?: string | null })
            .parent_tool_use_id,
        );
        const indent = inSubagent ? "      " : "  ";
        for (const block of message.message.content) {
          if (block.type === "tool_use") {
            if (block.name === "Agent" || block.name === "Task") {
              const input = block.input as {
                prompt?: string;
                subagent_type?: string;
              };
              const subQ = (input.prompt ?? "").slice(0, 120);
              const stype = input.subagent_type ?? "?";
              console.log(`-> dispatch ${stype}: ${subQ}...`);
            } else {
              const name = block.name.replace(/^mcp__steel__/, "");
              const argsPreview = JSON.stringify(block.input).slice(0, 140);
              console.log(`${indent}-> ${name}(${argsPreview})`);
            }
          } else if (block.type === "text") {
            const text = block.text.trim();
            if (text && !inSubagent) console.log(text.slice(0, 400));
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
      console.log("\n" + "=".repeat(60));
      console.log("FINAL REPORT");
      console.log("=".repeat(60));
      console.log(finalText);
    }
  } finally {
    for (const [rid, r] of researchers) {
      try {
        await r.browser.close();
      } catch {}
      try {
        await steel.sessions.release(r.session.id);
        console.log(
          `\n[${rid}] released session. Replay: ${r.session.sessionViewerUrl}`,
        );
      } catch (e) {
        console.error(`[${rid}] error releasing session:`, e);
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
