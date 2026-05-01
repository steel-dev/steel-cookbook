# Deep research with Claude Agent SDK subagents

`@anthropic-ai/claude-agent-sdk` exposes typed `AgentDefinition` values that you pass through the `agents` field on `query()`. The lead agent invokes them through the built-in `Agent` tool. Multiple `Agent` calls fired in a single assistant turn run in parallel, and each subagent starts in fresh context.

This recipe wires that pattern to Steel. The lead "orchestrator" never opens a browser. It splits a research question into focused sub-questions, hands one to each `researcher` subagent, and synthesizes their cited findings into a Markdown report. Every researcher gets its own Steel session, so three browsers run side by side without stomping on each other's address bar.

```ts
const researcher: AgentDefinition = {
  description:
    "Focused web researcher. Drives a private Steel browser session to " +
    "answer one sub-question with cited findings. Use one per sub-question.",
  prompt: RESEARCHER_PROMPT,
  tools: ["mcp__steel__web_search", "mcp__steel__read_url"],
  mcpServers: ["steel"],
  model: "sonnet",
  maxTurns: 14,
};

for await (const message of query({
  prompt: PROMPT,
  options: {
    model: "claude-opus-4-7",
    systemPrompt: ORCHESTRATOR_PROMPT,
    mcpServers: { steel: steelServer },
    allowedTools: ["Agent"],
    agents: { researcher },
    tools: ["Agent"],
    settingSources: [],
    maxTurns: 20,
    permissionMode: "bypassPermissions",
  },
})) { ... }
```

`tools: ["Agent"]` is non-obvious. The empty-array form (`tools: []`) drops every built-in including `Agent`, which silently demotes the orchestrator to using the Steel tools directly instead of dispatching subagents. With `["Agent"]`, the orchestrator gets the dispatch primitive and nothing else. `mcpServers: ["steel"]` on the subagent reuses the parent's MCP server by name; the subagent's `tools` allowlist intentionally drops `Agent`, since subagents cannot dispatch their own subagents.

## One Steel session per researcher

Both `tool()` calls take a `researcher_id` argument (validated by Zod), which the orchestrator threads into every dispatched task. The first time a new id appears, the recipe creates a Steel session for it; later calls with the same id reuse it.

```ts
const webSearch = tool(
  "web_search",
  "Search the open web. Returns the first 10 results...",
  { researcher_id: z.string(), query: z.string() },
  async ({ researcher_id, query: q }) => { ... },
);
```

Because `query()` may stream parallel tool calls, two coordination layers keep things sane. A promise-chain mutex around `ensureResearcher` serializes session creation across researcher_ids, so two concurrent first-calls don't both spin up a browser. A second per-researcher chain wraps each tool body, so two tool calls on the same researcher serialize on the same Playwright `page`. The `finally` block walks the `researchers` map, closes every browser, and calls `steel.sessions.release()` on each one.

## Layered `read_url`: cheap fetch first, Steel when needed

Each read isn't a raw scrape — it's a focused extraction shaped like Claude Code's built-in `WebFetch`. `read_url(url, prompt)` takes the *specific* question the researcher wants answered ("which solid-state cells shipped in production cars in 2026?") and returns a tight answer, not a 30k-char dump. Two layers:

1. **`fetch()` + cheerio** for static HTML. Most primary sources resolve here in under a second.
2. **Steel browser fallback** when the plain fetch returns non-2xx, comes back with under 500 characters of body text, or matches a list of bot-block markers (`"just a moment"`, `"verifying you are human"`, ...). The same `ensureResearcher` path opens or reuses the researcher's existing Steel browser.

Either way, the extracted page text + the researcher's `prompt` go through one `claude-haiku-4-5` pass that returns the answer (or `NOT IN PAGE` if the URL turns out not to contain it). The researcher gets a compressed return that doesn't bloat its context — exactly the trick that makes Claude Code's `WebFetch` cheap.

```ts
const readUrl = tool(
  "read_url",
  "Fetch a URL and answer a focused extraction prompt about its content...",
  { researcher_id: z.string(), url: z.string(), prompt: z.string() },
  async ({ researcher_id, url, prompt }) => {
    const fast = await fastFetch(url);
    let tier: "fetch" | "steel" = "fetch";
    let title = "", text = "";
    if (!fast || !fast.ok || fast.text.length < 500 || looksBlocked(fast.text)) {
      tier = "steel";
      const snap = await browserFetch(researcher_id, url);
      title = snap.title; text = snap.text;
    } else {
      title = fast.title; text = fast.text;
    }
    const extraction = await extractWithHaiku({ url, title, text, prompt });
    return { content: [{ type: "text", text: JSON.stringify({ url, tier, extraction }) }] };
  },
);
```

`web_search` stays Steel-only — DuckDuckGo's HTML endpoint bot-challenges anonymous HTTP clients aggressively, and that's exactly where a real browser earns its keep.

## Iterative researcher with a midway RECAP

The researcher isn't one-shot. The `RESEARCHER_PROMPT` codifies a loop: search → read 2–3 pages → reflect on coverage → refine and search again, capped at ~8 tool calls (`maxTurns: 14`). This is what makes "deep research" deep — the iteration, not just the fan-out. Compare an SDK like [jina-ai/node-DeepResearch](https://github.com/jina-ai/node-DeepResearch), which runs the same search → read → reason loop until a token budget exhausts.

The prompt also asks the researcher to pause after ~5–6 tool calls and emit a compact `RECAP:` block — its current cited claims in 3-5 lines. From that point on, the researcher cites from the RECAP rather than from older raw extractions, and updates the RECAP as new pages come in. This is a prompt-only echo of the recency-biased context retention used by RL-trained deep-research models like [MiroThinker](https://github.com/MiroMindAI/MiroThinker): older tool outputs stay in context but the model's working state lives in a small, refreshed summary, so reasoning stays compact even as the loop extends.

## Run it

```bash
cd examples/deep-research-ts
cp .env.example .env          # set STEEL_API_KEY and ANTHROPIC_API_KEY
npm install
npx playwright install chromium
npm start
```

Keys from [app.steel.dev](https://app.steel.dev/settings/api-keys) and [console.anthropic.com](https://console.anthropic.com/).

Your output varies. Structure looks like this:

```text
Steel + Claude Agent SDK Deep Research
============================================================
Question: What is the current state of solid-state battery commercialization...
============================================================
-> dispatch researcher: Research which companies are actually shipping...
-> dispatch researcher: Research the technical state of solid-state battery...
-> dispatch researcher: Research what is blocking mass-market EV adoption...
    [r1] opened session 95b93573-...
    [r1] web_search 'solid-state battery EV production shipments 2026': 10 results (2989ms)
    [r2] opened session b44ccc8f-...
    [r2] web_search 'solid-state battery technology readiness 2026': 10 results (1748ms)
    [r1] read_url(fetch) 'https://www.intelligentliving.co/solid-state-battery-': 412 chars (1843ms)
    [r3] read_url(steel) 'https://www.idtechex.com/en/research-article/solid-st': 287 chars (4621ms)
    [r2] read_url(fetch) 'https://www.trendforce.com/news/2026/...': 380 chars (1156ms)
    [r1] web_search 'NIO ET9 semi-solid battery production 2026': 10 results (1972ms)
    ...

============================================================
FINAL REPORT
============================================================
# Solid-State Battery Commercialization for EVs in 2026

## Summary
As of early-to-mid 2026, the long-promised technology has *partially* arrived ... [r1:2]

## Which Companies Are Shipping Product
NIO is the only company with semi-solid cells in customer-driven vehicles ... [r1:1][r1:2]
...

## Sources
- [r1:1] Solid-State Battery Scoreboard 2025-2026 - https://www.intelligentliving.co/...
- [r2:1] Sulfide-Based Electrolytes (TrendForce) - https://www.trendforce.com/...
- [r3:2] Solid State Batteries: Hype to Adoption (IDTechEx) - https://...

[r1] released session. Replay: https://app.steel.dev/sessions/95b93573-...
[r2] released session. Replay: https://app.steel.dev/sessions/b44ccc8f-...
[r3] released session. Replay: https://app.steel.dev/sessions/349ffae8-...
```

A run takes ~4 to 6 minutes wall-clock with 3 Steel sessions in parallel. Cost is Steel session-minutes (mostly for `web_search` and bot-blocked reads) plus Anthropic tokens. Three model tiers in play: Opus for orchestrator synthesis, Sonnet for researcher reasoning, Haiku for the per-page extraction pass.

## Make it yours

- **Swap the question.** Edit `PROMPT`. The orchestrator decomposes whatever you hand it.
- **Tune fan-out.** Edit `ORCHESTRATOR_PROMPT` to ask for 2 sub-questions or 6. More researchers means more parallel Steel sessions and more tokens.
- **Tune iteration depth.** Bump or shrink the "about 8 tool calls" budget in `RESEARCHER_PROMPT` and the matching `maxTurns: 14`. More turns = more thorough but slower; fewer = closer to the original one-shot recipe.
- **Skip the Haiku pass.** Drop `extractWithHaiku` and have `read_url` return the raw extracted text. Cheaper per call, but the researcher's context fills up much faster.
- **Tighten the fallback.** Add domains you know are JS-heavy (Twitter, LinkedIn, ...) to a "always Steel" allowlist, or relax the 500-char threshold if you read a lot of short reference pages.
- **Cheaper researchers.** Drop the researcher's `model: "sonnet"` to `"haiku"` for faster, lighter passes. The orchestrator stays on Opus.
- **Different search engine.** `web_search` drives DuckDuckGo's no-JS HTML endpoint. Swap the URL and the Zod-typed return shape inside the tool body for Bing, a vertical search, or a domain-restricted Google query — or wire in a paid search API and skip Steel for search entirely.
- **Persist sources.** Add a tool that appends `{ researcher_id, url, extraction }` to a JSONL file before returning. The orchestrator stays unchanged; you get a citable archive of every page each researcher read.
- **Hand off auth.** For sub-questions behind a login, pair with [credentials](../credentials) or [auth-context](../auth-context) so each Steel session starts already signed in.

## Related

[Subagents in the SDK](https://platform.claude.com/docs/en/agent-sdk/subagents) · [Python version](../deep-research-py) · [Claude Agent SDK minimal wiring](../claude-agent-sdk-ts)
