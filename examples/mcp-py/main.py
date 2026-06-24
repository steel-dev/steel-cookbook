"""
An MCP server that exposes a Steel cloud browser as explicit session-handle tools.
https://github.com/steel-dev/steel-cookbook/tree/main/examples/mcp-py
"""

import os
import sys

from dotenv import load_dotenv
from mcp.server.fastmcp import FastMCP, Image
from playwright.async_api import Browser, Page, Playwright, async_playwright
from steel import Steel

load_dotenv()

STEEL_API_KEY = os.getenv("STEEL_API_KEY")
if not STEEL_API_KEY:
    sys.exit("Set STEEL_API_KEY (https://app.steel.dev/settings/api-keys)")

steel = Steel(steel_api_key=STEEL_API_KEY)
mcp = FastMCP("steel")

# The Steel session id is the handle the model threads back on every call, so the
# server keeps no hidden "current browser": each tool names the session it drives.
# Two clients hold two ids and never read each other's pages.
_playwright: Playwright | None = None
_sessions: dict[str, dict] = {}


def _page(session_id: str) -> Page:
    entry = _sessions.get(session_id)
    if entry is None:
        raise ValueError(f"unknown session_id {session_id!r}; call create_session first")
    return entry["page"]


@mcp.tool()
async def create_session() -> dict:
    """Start a Steel cloud browser and return a session_id handle plus a live-view URL.

    Pass the returned session_id to every other tool.
    """
    global _playwright
    if _playwright is None:
        _playwright = await async_playwright().start()

    session = steel.sessions.create()
    browser: Browser = await _playwright.chromium.connect_over_cdp(
        f"{session.websocket_url}&apiKey={STEEL_API_KEY}"
    )
    ctx = browser.contexts[0]
    page = ctx.pages[0] if ctx.pages else await ctx.new_page()
    _sessions[session.id] = {"browser": browser, "page": page}
    return {"session_id": session.id, "live_view_url": session.session_viewer_url}


@mcp.tool()
async def navigate(session_id: str, url: str) -> dict:
    """Open a URL in the session's browser tab and wait for it to load.

    Args:
        session_id: Handle returned by create_session.
        url: Absolute URL to open, e.g. https://news.ycombinator.com.
    """
    page = _page(session_id)
    await page.goto(url, wait_until="domcontentloaded", timeout=45_000)
    return {"url": page.url, "title": await page.title()}


@mcp.tool()
async def extract(session_id: str, selector: str = "body", max_chars: int = 8000) -> str:
    """Read text from the current page.

    Args:
        session_id: Handle returned by create_session.
        selector: CSS selector to read. Defaults to the whole page body.
        max_chars: Cap on characters returned.
    """
    page = _page(session_id)
    return await page.evaluate(
        """({ selector, maxChars }) => {
            const els = Array.from(document.querySelectorAll(selector));
            const t = els.map((e) => e.innerText || e.textContent || "").join("\\n\\n").trim();
            return t.slice(0, maxChars);
        }""",
        {"selector": selector, "maxChars": max_chars},
    )


@mcp.tool()
async def screenshot(session_id: str) -> Image:
    """Capture a PNG screenshot of the current page in the session.

    Args:
        session_id: Handle returned by create_session.
    """
    page = _page(session_id)
    return Image(data=await page.screenshot(), format="png")


@mcp.tool()
async def release_session(session_id: str) -> dict:
    """Close the browser and release the Steel session so it stops billing.

    Args:
        session_id: Handle returned by create_session.
    """
    entry = _sessions.pop(session_id, None)
    if entry is None:
        raise ValueError(f"unknown session_id {session_id!r}")
    try:
        await entry["browser"].close()
    except Exception:
        pass
    steel.sessions.release(session_id)
    return {"released": session_id}


def _release_all() -> None:
    # Steel bills per session-minute, so whatever is still open when the client
    # disconnects gets released here. release is a plain HTTP call, so it works
    # even after the event loop that owned the browsers is gone.
    for sid in list(_sessions):
        try:
            steel.sessions.release(sid)
        except Exception:
            pass
        _sessions.pop(sid, None)


if __name__ == "__main__":
    # Stdio carries the JSON-RPC stream on stdout, so the server prints nothing
    # there itself; FastMCP owns it. run() blocks until the client disconnects.
    try:
        mcp.run()
    finally:
        _release_all()
