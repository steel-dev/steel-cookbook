"""
Combine You.com Search/Contents APIs with Steel cloud browsers.
https://github.com/steel-dev/steel-cookbook/tree/main/examples/you-com-search
"""

import asyncio
import os
import sys
import time
from typing import Optional

import httpx
from dotenv import load_dotenv
from langchain.agents import AgentExecutor, create_tool_calling_agent
from langchain_anthropic import ChatAnthropic
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain_core.tools import tool
from playwright.async_api import Browser, Page, async_playwright
from steel import Steel

load_dotenv()

STEEL_API_KEY = os.getenv("STEEL_API_KEY") or "your-steel-api-key-here"
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY") or "your-anthropic-api-key-here"
YOUCOM_API_KEY = os.getenv("YOUCOM_API_KEY") or "your-youcom-api-key-here"

YOU_BASE = "https://ydc-index.io/v1"

steel = Steel(steel_api_key=STEEL_API_KEY)

# The Steel session is opened lazily on the first browser tool call. If the
# agent answers using only You.com tools, we never spin one up and never bill
# session time. For concurrent runs, swap these globals for state-scoped
# storage.
_session = None  # steel.resources.Session
_browser: Optional[Browser] = None
_page: Optional[Page] = None
_playwright = None


async def _ensure_session() -> Page:
    global _session, _browser, _page, _playwright
    if _page is not None:
        return _page
    t0 = time.time()
    _session = steel.sessions.create()
    _playwright = await async_playwright().start()
    _browser = await _playwright.chromium.connect_over_cdp(
        f"{_session.websocket_url}&apiKey={STEEL_API_KEY}"
    )
    ctx = _browser.contexts[0]
    _page = ctx.pages[0] if ctx.pages else await ctx.new_page()
    print(
        f"    open_session: {int((time.time() - t0) * 1000)}ms "
        f"(live view: {_session.session_viewer_url})"
    )
    return _page


@tool
async def youcom_search(
    query: str, count: int = 5, freshness: Optional[str] = None
) -> dict:
    """Search the web with You.com. Returns up to `count` web results, each
    with title, url, and a short description.

    Call this FIRST to discover candidate URLs. Use the `freshness` param
    ('day', 'week', 'month', 'year') for time-bounded queries.
    """
    t0 = time.time()
    params: dict = {"query": query, "count": count}
    if freshness:
        params["freshness"] = freshness
    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.get(
            f"{YOU_BASE}/search",
            params=params,
            headers={"X-API-Key": YOUCOM_API_KEY},
        )
    r.raise_for_status()
    data = r.json()
    web = (data.get("results") or {}).get("web") or []
    items = []
    for w in web[:count]:
        snippets = w.get("snippets") or []
        desc = snippets[0] if snippets else (w.get("description") or "")
        items.append(
            {
                "title": w.get("title", ""),
                "url": w.get("url", ""),
                "description": desc,
            }
        )
    print(
        f"    youcom_search: {int((time.time() - t0) * 1000)}ms "
        f"({len(items)} results)"
    )
    return {"query": query, "results": items}


@tool
async def youcom_contents(urls: list[str]) -> dict:
    """Fetch clean Markdown for up to ~10 URLs in one call. Cheap, no browser,
    no JS rendering.

    Call this AFTER youcom_search to read static pages. If a page needs JS
    (login walls, dynamic data, interaction), escalate to navigate + snapshot.
    """
    t0 = time.time()
    async with httpx.AsyncClient(timeout=60) as client:
        r = await client.post(
            f"{YOU_BASE}/contents",
            json={"urls": urls, "formats": ["markdown"]},
            headers={
                "X-API-Key": YOUCOM_API_KEY,
                "Content-Type": "application/json",
            },
        )
    r.raise_for_status()
    pages = r.json()
    items = []
    for p in pages:
        md = p.get("markdown") or ""
        items.append(
            {
                "url": p.get("url"),
                "title": p.get("title", ""),
                "markdown": md[:6_000],
                "truncated": len(md) > 6_000,
            }
        )
    print(
        f"    youcom_contents: {int((time.time() - t0) * 1000)}ms "
        f"({len(items)} pages)"
    )
    return {"pages": items}


@tool
async def navigate(url: str) -> dict:
    """Open the URL in a real Steel cloud browser. Opens the session on first
    call. Use only when youcom_contents isn't enough (JS rendering, login,
    interaction).
    """
    page = await _ensure_session()
    t0 = time.time()
    await page.goto(url, wait_until="domcontentloaded", timeout=45_000)
    print(f"    navigate: {int((time.time() - t0) * 1000)}ms")
    return {"url": page.url, "title": await page.title()}


@tool
async def snapshot(max_chars: int = 4_000, max_links: int = 30) -> dict:
    """Read the live page: visible text (capped) and a list of links. Call
    after navigate. Sees JS-rendered content the Contents API cannot.
    """
    if _page is None:
        raise RuntimeError("Call navigate first.")
    t0 = time.time()
    snap = await _page.evaluate(
        """({maxChars, maxLinks}) => {
            const text = (document.body.innerText || '').slice(0, maxChars);
            const links = Array.from(document.querySelectorAll('a[href]'))
                .slice(0, maxLinks)
                .map((a) => {
                    const t = (a.innerText || a.textContent || '').trim().slice(0, 120);
                    return { text: t, href: a.href };
                })
                .filter((l) => l.text && l.href);
            return { url: location.href, title: document.title, text, links };
        }""",
        {"maxChars": max_chars, "maxLinks": max_links},
    )
    print(
        f"    snapshot: {int((time.time() - t0) * 1000)}ms "
        f"({len(snap['text'])} chars, {len(snap['links'])} links)"
    )
    return snap


@tool
async def click_text(text: str) -> dict:
    """Click the first visible element whose text contains the given string.
    Use to operate buttons, tabs, or filters whose effect You.com cannot see.
    """
    if _page is None:
        raise RuntimeError("Call navigate first.")
    t0 = time.time()
    locator = _page.get_by_text(text, exact=False).first
    await locator.click(timeout=10_000)
    try:
        await _page.wait_for_load_state("domcontentloaded", timeout=10_000)
    except Exception:
        pass
    print(f"    click_text({text!r}): {int((time.time() - t0) * 1000)}ms")
    return {"clicked": text, "url": _page.url}


tools = [youcom_search, youcom_contents, navigate, snapshot, click_text]
model = ChatAnthropic(model="claude-haiku-4-5", api_key=ANTHROPIC_API_KEY)

SYSTEM = (
    "You answer research-style questions by combining You.com APIs with a "
    "Steel cloud browser. Prefer the cheap path first: youcom_search to find "
    "candidate URLs, then youcom_contents to read them. Only call navigate, "
    "snapshot, or click_text when the page is JS-rendered, login-walled, or "
    "you need to interact (filters, toggles, form fields). End with a concise "
    "answer that cites the URLs you used. Do not invent data."
)

prompt = ChatPromptTemplate.from_messages(
    [
        ("system", SYSTEM),
        ("human", "{input}"),
        MessagesPlaceholder("agent_scratchpad"),
    ]
)

agent = create_tool_calling_agent(model, tools, prompt)
executor = AgentExecutor(agent=agent, tools=tools, max_iterations=10, verbose=False)


async def main() -> None:
    print("Steel + You.com Search-Act Starter")
    print("=" * 60)

    if STEEL_API_KEY == "your-steel-api-key-here":
        print("Set STEEL_API_KEY in .env (https://app.steel.dev/settings/api-keys)")
        sys.exit(1)
    if ANTHROPIC_API_KEY == "your-anthropic-api-key-here":
        print("Set ANTHROPIC_API_KEY in .env (https://console.anthropic.com/)")
        sys.exit(1)
    if YOUCOM_API_KEY == "your-youcom-api-key-here":
        print("Set YOUCOM_API_KEY in .env (https://you.com/platform)")
        sys.exit(1)

    question = (
        "Find a recent (past month) article or blog post about the 'browser-use' "
        "open-source agent framework. Read the article, then open its URL in a "
        "real browser to verify the visible headline matches what you read. "
        "Return: article title, source URL, publication date if you can find one, "
        "and a one-sentence summary."
    )

    try:
        result = await executor.ainvoke({"input": question})
        print("\n\033[1;92mAgent finished.\033[0m\n")
        print(result.get("output", ""))
    finally:
        if _browser is not None:
            try:
                await _browser.close()
            except Exception:
                pass
        if _playwright is not None:
            try:
                await _playwright.stop()
            except Exception:
                pass
        if _session is not None:
            print("\nReleasing Steel session...")
            try:
                steel.sessions.release(_session.id)
                print(f"Session released. Replay: {_session.session_viewer_url}")
            except Exception as e:
                print(f"Error releasing session: {e}")
        else:
            print("\nNo Steel session was opened (cheap path only).")


if __name__ == "__main__":
    asyncio.run(main())
