/*
 * Deep-research agent with the Claude Agent SDK (TypeScript) and Steel.
 * https://github.com/steel-dev/steel-cookbook/tree/main/examples/deep-research-ts
 *
 * A lead "orchestrator" agent decomposes a research question, dispatches one
 * `researcher` subagent per sub-question in parallel, and synthesizes the
 * returned findings into a Markdown report with traceable citations. Each
 * researcher operates its own Steel cloud browser session.
 */

import Anthropic from "@anthropic-ai/sdk";
import {
  createSdkMcpServer,
  query,
  tool,
  type AgentDefinition,
} from "@anthropic-ai/claude-agent-sdk";
import * as cheerio from "cheerio";
import * as dotenv from "dotenv";
import { chromium, type Browser, type Page } from "playwright";
import Steel from "steel-sdk";
import { z } from "zod";

dotenv.config();

const STEEL_API_KEY = process.env.STEEL_API_KEY || "your-steel-api-key-here";
const ANTHROPIC_API_KEY =
  process.env.ANTHROPIC_API_KEY || "your-anthropic-api-key-here";

const steel = new Steel({ steelAPIKey: STEEL_API_KEY });
const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

// Cheap, fast model for the per-page extraction step. Mirrors how Claude Code's
// WebFetch turns "fetch this URL and answer this question" into one pass over
// the page content with a small model.
const EXTRACTOR_MODEL = "claude-haiku-4-5-20251001";

// Markers that flag a page as bot-blocked or JS-rendered, so read_url falls
// back from plain fetch() to a real Steel browser.
const ANTI_BOT_MARKERS = [
  "just a moment",
  "verifying you are human",
  "checking your browser",
  "enable javascript and cookies",
  "access denied",
  "captcha",
  "pardon our interruption",
];

function looksBlocked(s: string): boolean {
  const lower = s.toLowerCase().slice(0, 2000);
  return ANTI_BOT_MARKERS.some((m) => lower.includes(m));
}

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

// Tier 1: plain HTTP fetch + cheerio extraction. Fast and cheap.
async function fastFetch(url: string): Promise<{
  ok: boolean;
  title: string;
  text: string;
} | null> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 10_000);
    const res = await fetch(url, {
      signal: ctrl.signal,
      redirect: "follow",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) " +
          "AppleWebKit/537.36 (KHTML, like Gecko) " +
          "Chrome/130.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
      },
    });
    clearTimeout(timer);
    if (!res.ok) return { ok: false, title: "", text: "" };
    const ct = res.headers.get("content-type") || "";
    if (!ct.includes("text/html") && !ct.includes("text/plain")) {
      return { ok: false, title: "", text: "" };
    }
    const html = await res.text();
    const $ = cheerio.load(html);
    $("script, style, noscript, nav, header, footer, iframe, aside").remove();
    const title =
      $("title").first().text().trim() || $("h1").first().text().trim();
    // Prefer <article> or <main>; fall back to <body>.
    const main = $("article").text() || $("main").text() || $("body").text();
    const text = main.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
    return { ok: true, title, text };
  } catch {
    return null;
  }
}

// Tier 2: full Steel browser. Used when fastFetch is blocked, JS-rendered,
// or returns suspiciously little content.
async function browserFetch(
  researcherId: string,
  url: string,
): Promise<{ title: string; text: string }> {
  const r = await ensureResearcher(researcherId);
  return withResearcherLock(r, async () => {
    await r.page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
    return (await r.page.evaluate(
      ({ maxChars }: { maxChars: number }) => {
        const text = (document.body.innerText || "").slice(0, maxChars);
        return { title: document.title, text };
      },
      { maxChars: 30_000 },
    )) as { title: string; text: string };
  });
}

// Final pass: hand the extracted page content + the researcher's question to
// a small fast model and return its focused answer. This is the value of a
// "prompted fetch" — the researcher gets a tight extraction back, not a
// 30k-char raw scrape that bloats its context.
async function extractWithHaiku(args: {
  url: string;
  title: string;
  text: string;
  prompt: string;
}): Promise<string> {
  const trimmed = args.text.slice(0, 30_000);
  const sys =
    "You answer the user's question using ONLY the provided page content. " +
    "Be concrete and concise (under 200 words). Quote short phrases when " +
    "useful. If the page does not contain the answer, reply exactly with " +
    "'NOT IN PAGE' and nothing else.";
  const usr =
    `URL: ${args.url}\nTITLE: ${args.title}\n\n` +
    `QUESTION: ${args.prompt}\n\n` +
    `PAGE CONTENT:\n${trimmed}`;
  const msg = await anthropic.messages.create({
    model: EXTRACTOR_MODEL,
    max_tokens: 600,
    system: sys,
    messages: [{ role: "user", content: usr }],
  });
  return msg.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
}

const readUrl = tool(
  "read_url",
  "Fetch a URL and answer a focused extraction prompt about its content. " +
    "Tries a plain HTTP fetch first; falls back to a real Steel browser if " +
    "the page is blocked, JS-rendered, or returns little content. The " +
    "`prompt` argument is the SPECIFIC question you want answered from this " +
    "page (e.g. 'which solid-state EV cells shipped in production cars in " +
    "2026?'). Returns a tight extraction, not the raw page. Pass your " +
    "researcher_id.",
  {
    researcher_id: z.string(),
    url: z.string(),
    prompt: z.string(),
  },
  async ({ researcher_id, url, prompt }) => {
    const t0 = Date.now();
    let tier: "fetch" | "steel" = "fetch";
    let title = "";
    let text = "";
    try {
      const fast = await fastFetch(url);
      if (
        !fast ||
        !fast.ok ||
        fast.text.length < 500 ||
        looksBlocked(fast.text) ||
        looksBlocked(fast.title)
      ) {
        tier = "steel";
        const snap = await browserFetch(researcher_id, url);
        title = snap.title;
        text = snap.text;
      } else {
        title = fast.title;
        text = fast.text;
      }
      const extraction = await extractWithHaiku({ url, title, text, prompt });
      console.log(
        `    [${researcher_id}] read_url(${tier}) '${url.slice(0, 60)}': ${extraction.length} chars (${Date.now() - t0}ms)`,
      );
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ url, title, tier, extraction }),
          },
        ],
      };
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

const RESEARCHER_PROMPT = `You are a focused web researcher with a tool budget for iteration.

Your task description includes a researcher_id (e.g. r1, r2). Pass that researcher_id to every tool call so you stay in your own private browser session.

You can iterate: search → read → reflect → search again. Budget: about 8 tool calls total. Use them deliberately.

Workflow:
1. Run an initial \`web_search\` with a tight, specific query.
2. For 2-3 promising results, call \`read_url\` with a SPECIFIC \`prompt\` describing exactly what fact you want to learn from that page (e.g. "which solid-state EV cells shipped in production cars in 2026 and in which models?"). \`read_url\` returns a focused extraction; if it returns "NOT IN PAGE", that source is not useful — try another.
3. After about 5-6 tool calls (typically once you have findings from 3+ pages), pause and emit a compact RECAP block before continuing:

   RECAP:
   - <claim> [1]
   - <claim> [2]
   - <claim> [1][3]

   The RECAP is your authoritative working knowledge from here on. Cite from the RECAP — do not re-cite older raw \`read_url\` extractions. If a clear gap remains, run ONE more \`web_search\` with a refined query (a missing angle, a counter-source, a different time scope), read 1-2 more pages, then update the RECAP with any new claims. This keeps your reasoning compact as the loop extends.
4. Stop when the RECAP covers at least 2-3 cited claims OR you've used most of your budget. Do not exceed about 8 tool calls.

Prefer primary sources, official docs, reputable news. Skip paywalls and login walls. If a domain blocks you twice, move on.

Final reply (exact shape, nothing else; FINDINGS should mirror your final RECAP):

SUB-QUESTION: <restated>

FINDINGS:
- <fact> [1]
- <fact> [2]
- <fact> [1][3]

SOURCES:
[1] <Title> - <URL>
[2] <Title> - <URL>

Cite every fact. Do not speculate beyond what the sources say. Cap at 5 sources. If the search yields no usable sources, return an empty FINDINGS block and note that in one line above SOURCES.`;

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
    "Focused web researcher. Iterates search → read → reflect on a private " +
    "Steel browser session (with a fast HTTP fallback) to answer one " +
    "sub-question with cited findings. Use one per sub-question.",
  prompt: RESEARCHER_PROMPT,
  // Researchers see only Steel tools. Don't include Agent;
  // subagents can't dispatch their own subagents.
  tools: ["mcp__steel__web_search", "mcp__steel__read_url"],
  mcpServers: ["steel"],
  model: "sonnet",
  // Headroom for ~8 tool calls (search + reads + a refinement round) plus
  // the final cited reply.
  maxTurns: 14,
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
