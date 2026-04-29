"""
Build a typed browser agent with Pydantic AI and Steel.
https://github.com/steel-dev/steel-cookbook/tree/main/examples/pydantic-ai
"""

import asyncio
import os
import sys
import time
from dataclasses import dataclass
from typing import Optional

from dotenv import load_dotenv
from playwright.async_api import Browser, Page, async_playwright
from pydantic import BaseModel, Field
from pydantic_ai import Agent, RunContext
from steel import Steel

load_dotenv()

STEEL_API_KEY = os.getenv("STEEL_API_KEY") or "your-steel-api-key-here"
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY") or "your-openai-api-key-here"


@dataclass
class BrowserDeps:
    """Runtime resources passed to every tool via RunContext.deps."""

    page: Page


class FieldSpec(BaseModel):
    name: str
    selector: str = Field(
        description="CSS selector relative to the row. Empty string reads the row itself."
    )
    attr: Optional[str] = Field(
        default=None,
        description="Optional attribute to read instead of innerText (e.g. 'href').",
    )


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


async def navigate(ctx: RunContext[BrowserDeps], url: str) -> dict:
    """Navigate the open session to a URL and wait for the page to load."""
    t0 = time.time()
    await ctx.deps.page.goto(url, wait_until="domcontentloaded", timeout=45_000)
    print(f"    navigate: {int((time.time() - t0) * 1000)}ms")
    return {"url": ctx.deps.page.url, "title": await ctx.deps.page.title()}


async def snapshot(
    ctx: RunContext[BrowserDeps], max_chars: int = 4_000, max_links: int = 50
) -> dict:
    """Return a readable snapshot of the current page: title, URL, visible
    text (capped), and a list of links. Call BEFORE extract so the agent
    never has to guess CSS selectors.
    """
    t0 = time.time()
    snap = await ctx.deps.page.evaluate(
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


async def extract(
    ctx: RunContext[BrowserDeps],
    row_selector: str,
    fields: list[FieldSpec],
    limit: int = 10,
) -> dict:
    """Extract structured rows from the current page using CSS selectors.
    Prefer calling snapshot() first to confirm the page structure.
    """
    t0 = time.time()
    # Run the full extraction inside one page.evaluate. Serial CDP round-trips
    # to Steel's cloud browser are ~200-300ms each, so N*M round-trips burns
    # seconds. One evaluate call is <500ms total.
    fields_json = [
        {"name": f.name, "selector": f.selector, "attr": f.attr} for f in fields
    ]
    items = await ctx.deps.page.evaluate(
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


def build_agent() -> Agent[BrowserDeps, FinalReport]:
    return Agent(
        "openai:gpt-5-mini",
        deps_type=BrowserDeps,
        output_type=FinalReport,
        tools=[navigate, snapshot, extract],
        instructions=(
            "You operate a Steel cloud browser via tools. "
            "Workflow: (1) navigate to the target URL, "
            "(2) snapshot to see the page's text and links, "
            "(3) only call extract when you need structured rows beyond snapshot, "
            "(4) return the final FinalReport. "
            "Prefer snapshot's links list over guessing selectors. Do not invent data."
        ),
    )


async def main() -> None:
    print("Steel + Pydantic AI Starter")
    print("=" * 60)

    if STEEL_API_KEY == "your-steel-api-key-here":
        print("Set STEEL_API_KEY in .env (https://app.steel.dev/settings/api-keys)")
        sys.exit(1)
    if OPENAI_API_KEY == "your-openai-api-key-here":
        print("Set OPENAI_API_KEY in .env (https://platform.openai.com/)")
        sys.exit(1)

    agent = build_agent()
    steel = Steel(steel_api_key=STEEL_API_KEY)
    session = steel.sessions.create()
    print(f"Session: {session.session_viewer_url}")

    playwright = await async_playwright().start()
    browser: Optional[Browser] = None
    try:
        browser = await playwright.chromium.connect_over_cdp(
            f"{session.websocket_url}&apiKey={STEEL_API_KEY}"
        )
        ctx = browser.contexts[0]
        page = ctx.pages[0] if ctx.pages else await ctx.new_page()

        result = await agent.run(
            "Go to https://github.com/trending/python?since=daily and return the "
            "top 3 AI/ML-related repositories. For each, give name (owner/repo), "
            "GitHub URL, star count as shown, and the repo description.",
            deps=BrowserDeps(page=page),
        )

        print("\n\033[1;92mAgent finished.\033[0m\n")
        final: FinalReport = result.output
        print(final.model_dump_json(indent=2))
    finally:
        if browser is not None:
            try:
                await browser.close()
            except Exception:
                pass
        try:
            await playwright.stop()
        except Exception:
            pass
        print("\nReleasing Steel session...")
        try:
            steel.sessions.release(session.id)
            print(f"Session released. Replay: {session.session_viewer_url}")
        except Exception as e:
            print(f"Error releasing session: {e}")


if __name__ == "__main__":
    asyncio.run(main())
