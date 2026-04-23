"""
Build an AI browser agent with the OpenAI Agents SDK (Python) and Steel.
https://github.com/steel-dev/steel-cookbook/tree/main/examples/steel-openai-agents-python-starter
"""

import asyncio
import os
import sys
import time
from typing import Optional

from agents import Agent, Runner, function_tool
from dotenv import load_dotenv
from playwright.async_api import Browser, Page, async_playwright
from pydantic import BaseModel, Field
from steel import Steel

load_dotenv()

STEEL_API_KEY = os.getenv("STEEL_API_KEY") or "your-steel-api-key-here"
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY") or "your-openai-api-key-here"

steel = Steel(steel_api_key=STEEL_API_KEY)

# Shared browser state. Tools hold the same Steel session across turns via
# module-level globals. For concurrent runs, swap this for the Agents SDK's
# `context` parameter.
_session = None  # steel.resources.Session
_browser: Optional[Browser] = None
_page: Optional[Page] = None
_playwright = None


@function_tool
async def open_session() -> dict:
    """Open a Steel cloud browser session. Call exactly once, before anything else."""
    global _session, _browser, _page, _playwright
    t0 = time.time()
    _session = steel.sessions.create()
    _playwright = await async_playwright().start()
    _browser = await _playwright.chromium.connect_over_cdp(
        f"{_session.websocket_url}&apiKey={STEEL_API_KEY}"
    )
    ctx = _browser.contexts[0]
    _page = ctx.pages[0] if ctx.pages else await ctx.new_page()
    print(f"    open_session: {int((time.time() - t0) * 1000)}ms")
    return {
        "session_id": _session.id,
        "live_view_url": _session.session_viewer_url,
    }


@function_tool
async def navigate(url: str) -> dict:
    """Navigate the open session to a URL and wait for the page to load."""
    if _page is None:
        raise RuntimeError("open_session must be called first.")
    t0 = time.time()
    await _page.goto(url, wait_until="domcontentloaded", timeout=45_000)
    print(f"    navigate: {int((time.time() - t0) * 1000)}ms")
    return {"url": _page.url, "title": await _page.title()}


@function_tool
async def snapshot(max_chars: int = 4_000, max_links: int = 50) -> dict:
    """Return a readable snapshot of the current page: title, URL, visible
    text (capped), and a list of links. Call BEFORE extract so the agent
    never has to guess CSS selectors.
    """
    if _page is None:
        raise RuntimeError("open_session must be called first.")
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


class FieldSpec(BaseModel):
    name: str
    selector: str = Field(
        description="CSS selector relative to the row. Empty string reads the row itself."
    )
    attr: Optional[str] = Field(
        default=None,
        description="Optional attribute to read instead of innerText (e.g. 'href').",
    )


@function_tool
async def extract(
    row_selector: str, fields: list[FieldSpec], limit: int = 10
) -> dict:
    """Extract structured rows from the current page using CSS selectors.
    Prefer calling snapshot() first to confirm the page structure.
    """
    if _page is None:
        raise RuntimeError("open_session must be called first.")
    t0 = time.time()
    # Run the full extraction inside one page.evaluate. Serial CDP round-trips
    # to Steel's cloud browser are ~200-300ms each, so N*M round-trips burns
    # seconds. One evaluate call is <500ms total.
    fields_json = [
        {"name": f.name, "selector": f.selector, "attr": f.attr} for f in fields
    ]
    items = await _page.evaluate(
        """({rowSelector, fields, limit}) => {
            const rows = Array.from(
                document.querySelectorAll(rowSelector)
            ).slice(0, limit);
            return rows.map((row) => {
                const item = {};
                for (const f of fields) {
                    const el = f.selector ? row.querySelector(f.selector) : row;
                    if (!el) { item[f.name] = ''; continue; }
                    if (f.attr) {
                        item[f.name] = (el.getAttribute(f.attr) || '').trim();
                    } else {
                        const text = el.innerText || el.textContent || '';
                        item[f.name] = text.trim();
                    }
                }
                return item;
            });
        }""",
        {"rowSelector": row_selector, "fields": fields_json, "limit": limit},
    )
    print(f"    extract: {int((time.time() - t0) * 1000)}ms ({len(items)} rows)")
    return {"count": len(items), "items": items}


class Repo(BaseModel):
    name: str
    url: str
    stars: Optional[str] = None
    description: Optional[str] = None


class FinalReport(BaseModel):
    summary: str = Field(
        description="One-paragraph summary of what these repos have in common."
    )
    repos: list[Repo] = Field(min_length=1, max_length=5)


agent = Agent(
    name="SteelResearch",
    instructions=(
        "You operate a Steel cloud browser via tools. "
        "Workflow: (1) open_session, (2) navigate to the target URL, "
        "(3) snapshot to see the page's text and links, "
        "(4) only call extract when you need structured rows beyond snapshot, "
        "(5) return the final FinalReport. "
        "Prefer snapshot's links list over guessing selectors. Do not invent data."
    ),
    model="gpt-5-mini",
    tools=[open_session, navigate, snapshot, extract],
    output_type=FinalReport,
)


async def main() -> None:
    print("🚀 Steel + OpenAI Agents SDK (Python) Starter")
    print("=" * 60)

    if STEEL_API_KEY == "your-steel-api-key-here":
        print("⚠️  Set STEEL_API_KEY in .env (https://app.steel.dev/settings/api-keys)")
        sys.exit(1)
    if OPENAI_API_KEY == "your-openai-api-key-here":
        print("⚠️  Set OPENAI_API_KEY in .env (https://platform.openai.com/)")
        sys.exit(1)

    try:
        result = await Runner.run(
            agent,
            input=(
                "Go to https://github.com/trending/python?since=daily and return the "
                "top 3 AI/ML-related repositories. For each, give name (owner/repo), "
                "GitHub URL, star count as shown, and the repo description."
            ),
            max_turns=15,
        )

        print("\n\033[1;92mAgent finished.\033[0m\n")
        final: FinalReport = result.final_output
        print(final.model_dump_json(indent=2))
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


if __name__ == "__main__":
    asyncio.run(main())
