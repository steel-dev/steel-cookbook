# Deep research with Claude Agent SDK subagents

The Claude Agent SDK exposes named subagents through the `agents` parameter on `ClaudeAgentOptions`. The lead agent invokes them through the built-in `Agent` tool; each subagent runs in fresh context and only its final message returns to the parent. Multiple Agent calls fired in a single turn run in parallel.

This recipe wires that pattern to Steel. The lead "orchestrator" never touches a browser. It splits the research question into sub-questions, dispatches one `researcher` subagent per sub-question, and synthesizes their findings into a Markdown report with citations the reader can trace back to a specific researcher and source. Each researcher gets its own Steel session, so three browsers run side by side without trampling each other's address bar.

```python
options = ClaudeAgentOptions(
    model="claude-opus-4-7",
    system_prompt=ORCHESTRATOR_PROMPT,
    mcp_servers={"steel": steel_server},
    allowed_tools=["Agent"],   # the orchestrator only dispatches
    agents={
        "researcher": AgentDefinition(
            description=(
                "Focused web researcher. Drives a private Steel browser "
                "session to answer one sub-question with cited findings."
            ),
            prompt=RESEARCHER_PROMPT,
            tools=["mcp__steel__web_search", "mcp__steel__read_url"],
            mcpServers=["steel"],
            model="sonnet",
            maxTurns=14,
        ),
    },
    tools=["Agent"],   # dispatch primitive only; no Read/Bash/Edit
    setting_sources=[],
    max_turns=20,
    permission_mode="bypassPermissions",
)
```

`tools=["Agent"]` is the gotcha worth memorizing. The empty-list form (`tools=[]`) drops every built-in, including `Agent`, which silently demotes the orchestrator to calling Steel tools directly instead of dispatching subagents. With `["Agent"]`, the orchestrator gets the dispatch primitive and nothing else.

`mcpServers=["steel"]` on the subagent reuses the parent's MCP server by name, so the same in-process tools wire into the subagent's context. The researcher's `tools` allowlist drops `Agent`, since subagents cannot dispatch their own subagents.

## One Steel session per researcher

`web_search` and `read_url` both take a `researcher_id`. The orchestrator hands each subagent a unique id (`r1`, `r2`, ...) inside the dispatch prompt and instructs it to pass that id to every tool call. The MCP server lazy-allocates a fresh Steel session the first time a new id appears.

```python
async def _ensure_session(researcher_id: str) -> dict[str, Any]:
    async with _session_lock:
        if researcher_id in _sessions:
            return _sessions[researcher_id]
        sess = steel.sessions.create()
        browser = await _playwright.chromium.connect_over_cdp(
            f"{sess.websocket_url}&apiKey={STEEL_API_KEY}"
        )
        ctx = browser.contexts[0]
        page = ctx.pages[0] if ctx.pages else await ctx.new_page()
        _sessions[researcher_id] = {"session": sess, "browser": browser, "page": page}
        return _sessions[researcher_id]
```

Three Steel browsers run concurrently inside one Python process. The `finally` block at the bottom of `main` walks `_sessions`, closes every browser, and calls `steel.sessions.release()` on each one, so a crash mid-research still tears the cloud sessions down.

## Layered `read_url`: cheap fetch first, Steel when needed

Each read isn't a raw scrape — it's a focused extraction shaped like Claude Code's built-in `WebFetch`. `read_url(url, prompt)` takes the *specific* question the researcher wants answered ("which solid-state cells shipped in production cars in 2026?") and returns a tight answer, not a 30k-char dump. Two layers:

1. **`httpx.AsyncClient` + BeautifulSoup** for static HTML. Most primary sources resolve here in under a second.
2. **Steel browser fallback** when the plain fetch returns non-2xx, comes back with under 500 characters of body text, or matches a list of bot-block markers (`"just a moment"`, `"verifying you are human"`, ...). The same `_ensure_session` path opens or reuses the researcher's existing Steel browser.

Either way, the extracted page text + the researcher's `prompt` go through one `claude-haiku-4-5` pass that returns the answer (or `NOT IN PAGE` if the URL turns out not to contain it). The researcher gets a compressed return that doesn't bloat its context — exactly the trick that makes Claude Code's `WebFetch` cheap.

```python
@tool("read_url", "...", {"researcher_id": str, "url": str, "prompt": str})
async def read_url(args):
    fast = await fast_fetch(url)
    if not fast or not fast["ok"] or len(fast["text"]) < 500 or looks_blocked(fast["text"]):
        tier = "steel"
        snap = await browser_fetch(rid, url)        # Tier 2
    else:
        tier = "fetch"
        snap = fast                                  # Tier 1
    extraction = await extract_with_haiku(           # Haiku pass
        url=url, title=snap["title"], text=snap["text"], prompt=prompt,
    )
    return {"content": [{"type": "text",
                         "text": json.dumps({"url": url, "tier": tier, "extraction": extraction})}]}
```

`web_search` stays Steel-only — DuckDuckGo's HTML endpoint bot-challenges anonymous HTTP clients aggressively, and that's exactly where a real browser earns its keep.

## Iterative researcher with a midway RECAP

The researcher isn't one-shot. The `RESEARCHER_PROMPT` codifies a loop: search → read 2–3 pages → reflect on coverage → refine and search again, capped at ~8 tool calls (`maxTurns=14`). This is what makes "deep research" deep — the iteration, not just the fan-out. Compare an SDK like [jina-ai/node-DeepResearch](https://github.com/jina-ai/node-DeepResearch), which runs the same search → read → reason loop until a token budget exhausts.

The prompt also asks the researcher to pause after ~5–6 tool calls and emit a compact `RECAP:` block — its current cited claims in 3-5 lines. From that point on, the researcher cites from the RECAP rather than from older raw extractions, and updates the RECAP as new pages come in. This is a prompt-only echo of the recency-biased context retention used by RL-trained deep-research models like [MiroThinker](https://github.com/MiroMindAI/MiroThinker): older tool outputs stay in context but the model's working state lives in a small, refreshed summary, so reasoning stays compact even as the loop extends.

## Run it

```bash
cd examples/deep-research-py
cp .env.example .env          # set STEEL_API_KEY and ANTHROPIC_API_KEY
uv run playwright install chromium
uv run main.py
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
    [r2] web_search 'solid-state battery sulfide oxide electrolyte 2026': 10 results (1748ms)
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
QuantumScape is shipping QSE-5 B-samples to OEMs ... [r1:2]
...

## Sources
- [r1:1] Solid-State Battery Scoreboard 2025-2026 - https://www.intelligentliving.co/...
- [r1:2] $10 Billion, 7 Companies, 0 All-Solid Cells - https://liveinthefuture.org/...
- [r2:1] Sulfide-Based Electrolytes (TrendForce) - https://www.trendforce.com/...
- [r3:2] Solid State Batteries in 2026: Hype to Adoption (IDTechEx) - https://...

[r1] released session. Replay: https://app.steel.dev/sessions/95b93573-...
[r2] released session. Replay: https://app.steel.dev/sessions/b44ccc8f-...
[r3] released session. Replay: https://app.steel.dev/sessions/349ffae8-...
```

A run takes ~4 to 6 minutes wall-clock with 3 Steel sessions running in parallel. Cost is Steel session-minutes (mostly for `web_search` and bot-blocked reads) plus Anthropic tokens. Three model tiers in play: Opus for orchestrator synthesis, Sonnet for researcher reasoning, Haiku for the per-page extraction pass.

## Make it yours

- **Swap the question.** Edit `PROMPT`. The orchestrator decomposes whatever you hand it.
- **Tune fan-out.** Edit `ORCHESTRATOR_PROMPT` to ask for 2 sub-questions or 6. More researchers means more parallel sessions and more tokens.
- **Tune iteration depth.** Bump or shrink the "about 8 tool calls" budget in `RESEARCHER_PROMPT` and the matching `maxTurns=14`. More turns = more thorough but slower; fewer = closer to the original one-shot recipe.
- **Skip the Haiku pass.** Drop `extract_with_haiku` and have `read_url` return the raw extracted text. Cheaper per call, but the researcher's context fills up much faster.
- **Tighten the fallback.** Add domains you know are JS-heavy (e.g. Twitter, LinkedIn) to a "always Steel" allowlist, or relax the 500-char threshold if you read a lot of short reference pages.
- **Cheaper researchers.** Drop the researcher's `model="sonnet"` to `model="haiku"` for faster, lighter passes. The orchestrator stays on Opus.
- **Different search engine.** `web_search` drives DuckDuckGo's no-JS HTML endpoint. Swap the URL and selectors in the tool body for Bing, a vertical search, or a domain-restricted Google query — or wire in a paid search API and skip Steel for search entirely.
- **Persist sources.** Add a tool that appends `{researcher_id, url, extraction}` to a JSONL file before returning. The orchestrator stays unchanged; you get a citable archive of every page each researcher read.
- **Hand off auth.** For sub-questions behind a login, pair with [credentials](../credentials) or [auth-context](../auth-context) so each Steel session starts already signed in.

## Related

[Subagents in the SDK](https://platform.claude.com/docs/en/agent-sdk/subagents) · [TypeScript version](../deep-research-ts) · [Claude Agent SDK minimal wiring](../claude-agent-sdk-py)
