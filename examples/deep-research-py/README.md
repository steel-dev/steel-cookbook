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
            maxTurns=8,
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
    [r1] web_search 'solid-state battery EV production shipments 2025 2': 10 results (2989ms)
    [r2] opened session b44ccc8f-...
    [r2] web_search 'solid-state battery EV 2025 2026 sulfide oxide ele': 10 results (1748ms)
    [r1] read_url 'https://www.intelligentliving.co/solid-state-battery-scorebo': 8000 chars (1263ms)
    ...
    [r3] read_url 'https://www.idtechex.com/en/research-article/solid-state-bat': 8000 chars (14414ms)

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

A run takes ~4 to 6 minutes wall-clock with 3 Steel sessions running in parallel. Cost is Steel session-minutes plus Anthropic tokens (Opus drives the orchestrator for synthesis quality, Sonnet drives the researchers for speed).

## Make it yours

- **Swap the question.** Edit `PROMPT`. The orchestrator decomposes whatever you hand it.
- **Tune fan-out.** Edit `ORCHESTRATOR_PROMPT` to ask for 2 sub-questions or 6. More researchers means more parallel sessions and more tokens.
- **Cheaper researchers.** Drop the researcher's `model="sonnet"` to `model="haiku"` for faster, lighter passes. The orchestrator stays on Opus.
- **Different search engine.** `web_search` drives DuckDuckGo's no-JS HTML endpoint. Swap the URL and selectors in the tool body for Bing, a vertical search, or a domain-restricted Google query.
- **Persist sources.** Add a third tool that appends `{researcher_id, url, text}` to a JSONL file before returning. The orchestrator stays unchanged; you get a citable archive of every page each researcher read.
- **Hand off auth.** For sub-questions behind a login, pair with [credentials](../credentials) or [auth-context](../auth-context) so each Steel session starts already signed in.

## Related

[Subagents in the SDK](https://platform.claude.com/docs/en/agent-sdk/subagents) · [TypeScript version](../deep-research-ts) · [Claude Agent SDK minimal wiring](../claude-agent-sdk-py)
