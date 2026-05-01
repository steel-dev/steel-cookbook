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
  maxTurns: 8,
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
    [r1] read_url 'https://www.intelligentliving.co/solid-state-battery-scoreboard': 8000 chars (1263ms)
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

A run takes ~4 to 6 minutes wall-clock with 3 Steel sessions in parallel. Cost is Steel session-minutes plus Anthropic tokens. Opus drives the orchestrator (synthesis quality); Sonnet drives the researchers (speed and cost).

## Make it yours

- **Swap the question.** Edit `PROMPT`. The orchestrator decomposes whatever you hand it.
- **Tune fan-out.** Edit `ORCHESTRATOR_PROMPT` to ask for 2 sub-questions or 6. More researchers means more parallel Steel sessions and more tokens.
- **Cheaper researchers.** Drop the researcher's `model: "sonnet"` to `"haiku"` for faster, lighter passes. The orchestrator stays on Opus.
- **Different search engine.** `web_search` drives DuckDuckGo's no-JS HTML endpoint. Swap the URL and the Zod-typed return shape inside the tool body for Bing, a vertical search, or a domain-restricted Google query.
- **Persist sources.** Add a third tool that appends `{ researcher_id, url, text }` to a JSONL file before returning. The orchestrator stays unchanged; you get a citable archive of every page each researcher read.
- **Hand off auth.** For sub-questions behind a login, pair with [credentials](../credentials) or [auth-context](../auth-context) so each Steel session starts already signed in.

## Related

[Subagents in the SDK](https://platform.claude.com/docs/en/agent-sdk/subagents) · [Python version](../deep-research-py) · [Claude Agent SDK minimal wiring](../claude-agent-sdk-ts)
