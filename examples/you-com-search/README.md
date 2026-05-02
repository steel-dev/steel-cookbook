# You.com Search + Steel Browser (Python)

A search-then-act agent: [You.com](https://you.com/) handles discovery and static extraction, Steel handles real browser actions. The agent gets five tools across two cost tiers and is told to prefer the cheap tier. The Steel session is opened lazily on the first `navigate` call, so a question that resolves on search alone never spins up a browser.

```python
tools = [youcom_search, youcom_contents, navigate, snapshot, click_text]

SYSTEM = (
    "You answer research-style questions by combining You.com APIs with a "
    "Steel cloud browser. Prefer the cheap path first: youcom_search to find "
    "candidate URLs, then youcom_contents to read them. Only call navigate, "
    "snapshot, or click_text when the page is JS-rendered, login-walled, or "
    "you need to interact (filters, toggles, form fields). ..."
)
```

You.com Search returns LLM-shaped JSON for any web query (`$5/1k calls`). You.com Contents fetches up to ten URLs of clean Markdown in one round trip (`$1/1k pages`). Both run in milliseconds against a CDN. Steel's cloud browser is the slow, expensive option you reach for when the page needs a real Chromium: a click, a form submit, a JS-rendered table, an auth wall the Contents API can't see through. Routing the agent through this hierarchy keeps token spend, latency, and session billing low on the questions that don't need a browser.

## The two tiers

`youcom_search` and `youcom_contents` are plain `httpx` calls to `ydc-index.io/v1`. No SDK, no session lifecycle. Each tool prints its latency so you can see the cost gap.

```python
@tool
async def youcom_contents(urls: list[str]) -> dict:
    """Fetch clean Markdown for up to ~10 URLs in one call. Cheap, no browser,
    no JS rendering.

    Call this AFTER youcom_search to read static pages. If a page needs JS
    (login walls, dynamic data, interaction), escalate to navigate + snapshot.
    """
    async with httpx.AsyncClient(timeout=60) as client:
        r = await client.post(
            f"{YOU_BASE}/contents",
            json={"urls": urls, "formats": ["markdown"]},
            headers={"X-API-Key": YOUCOM_API_KEY, ...},
        )
    ...
```

The browser tools (`navigate`, `snapshot`, `click_text`) all funnel through `_ensure_session`, which creates the Steel session on demand and reuses it across calls. If the agent never escalates, `_session` stays `None` and the `finally` block prints "No Steel session was opened (cheap path only)."

```python
async def _ensure_session() -> Page:
    global _session, _browser, _page, _playwright
    if _page is not None:
        return _page
    _session = steel.sessions.create()
    _playwright = await async_playwright().start()
    _browser = await _playwright.chromium.connect_over_cdp(
        f"{_session.websocket_url}&apiKey={STEEL_API_KEY}"
    )
    ...
    return _page
```

## What the agent escalates for

`youcom_contents` returns the markdown a server would serve to a curl request. That covers most blog posts, docs sites, GitHub READMEs, news articles, and SEO-friendly product pages. It misses anything client-rendered: dashboards, SPAs without server fallbacks, paywalled content, in-page filters and toggles, anything behind a login.

`snapshot` reads `document.body.innerText` from the live DOM after the page settles, so it sees JS-rendered text the Contents API cannot. `click_text` is a thin wrapper over Playwright's `get_by_text(...).first.click(...)` for buttons, tabs, and filters whose effect You.com cannot replay. The agent decides when the gap matters: the docstrings make the routing explicit, the system prompt reinforces it.

The result is a graceful fall-through. Cheap question (a fact you can cite from a static page): one search, one contents, done in a few seconds for a fraction of a cent. Expensive question (something behind a click): the agent escalates exactly as far as it needs to and releases the session at the end.

## The agent loop

`create_tool_calling_agent` builds a tool-calling prompt from the schemas LangChain extracts from each `@tool`'s signature and docstring. `AgentExecutor` runs the loop: model picks tools, executes them, feeds results back, stops when the model emits a text-only response.

```python
agent = create_tool_calling_agent(model, tools, prompt)
executor = AgentExecutor(agent=agent, tools=tools, max_iterations=10, verbose=False)

result = await executor.ainvoke({"input": question})
```

`max_iterations=10` is a safety net for runaway loops. `verbose=False` keeps the output clean; the per-tool latency lines from each tool give enough trace to follow the flow. For a richer trace, flip `verbose=True` or set `LANGSMITH_API_KEY` and `LANGSMITH_TRACING=true` in `.env`.

## Run it

```bash
cd examples/you-com-search
cp .env.example .env          # set STEEL_API_KEY, ANTHROPIC_API_KEY, YOUCOM_API_KEY
uv sync
uv run playwright install chromium
uv run main.py
```

Get keys at [app.steel.dev/settings/api-keys](https://app.steel.dev/settings/api-keys), [console.anthropic.com](https://console.anthropic.com/), and [you.com/platform](https://you.com/platform). New You.com accounts get $100 in credits with no card.

Your output varies. The shape is illustrative, not literal:

```text
Steel + You.com Search-Act Starter
============================================================
    youcom_search: <ms> (<n> results)
    youcom_contents: <ms> (<n> pages)
    open_session: <ms> (live view: https://app.steel.dev/sessions/...)
    navigate: <ms>
    snapshot: <ms> (<chars> chars, <n> links)

Agent finished.

<the agent's free-text answer, citing the URLs it used>

Releasing Steel session...
Session released. Replay: https://app.steel.dev/sessions/...
```

If the agent answers from search and contents alone, the `open_session`, `navigate`, and `snapshot` lines (and the release line) won't appear; the run ends with `No Steel session was opened (cheap path only).` instead. You.com bills per call (search and contents are cheap); Steel bills per session minute, which is why the lazy-open matters.

## Make it yours

- **Swap the cheap tool.** Replace `youcom_search` with the Research API (`https://api.you.com/v1/research`) when you want a multi-step reasoned answer instead of raw results. The agent gets fewer URLs but better-synthesized inputs.
- **Add more browser actions.** `click_text` is the minimum interactive primitive. Add `fill(selector, text)`, `press(key)`, `wait_for_selector`, or `scroll` when the agent needs to operate forms or trigger lazy-loaded content.
- **Tighten the routing.** The `verbose=False` agent re-derives the routing each turn. For repeatable production flows, replace the agent with an explicit two-step pipeline: always run `youcom_search`, always run `youcom_contents` on the top hit, only call browser tools if a heuristic flag (response too short, contains "Please enable JavaScript", etc.) trips.
- **Trace with LangSmith.** Set `LANGSMITH_API_KEY` and `LANGSMITH_TRACING=true` in `.env`. No code changes; every tool call shows up at [smith.langchain.com](https://smith.langchain.com).
- **Swap the model.** `ChatOpenAI(model="gpt-5-mini")` works without touching the tools. The system prompt is generic.
- **Self-host.** Both Steel (open-source browser infra) and the cookbook are deployable; the You.com APIs are remote. For a fully self-hostable variant, replace `youcom_contents` with a local extractor (Trafilatura, Readability) and a search frontend like SearXNG, and keep Steel for the browser tier.

## Related

[CrewAI](../crewai) for a multi-agent research-and-report flow that uses Steel's `scrape` API instead of search. [LangGraph](../langgraph) for an explicit state-machine version of the same browser loop. [You.com API docs](https://you.com/docs).
