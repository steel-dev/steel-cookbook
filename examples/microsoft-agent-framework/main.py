"""
Build a browser agent with Microsoft Agent Framework and Steel.
https://github.com/steel-dev/steel-cookbook/tree/main/examples/microsoft-agent-framework
"""

import asyncio
import os
import sys
import time
from typing import Annotated, Any, Optional

from agent_framework import Agent, tool
from agent_framework.openai import OpenAIChatClient
from dotenv import load_dotenv
from playwright.async_api import Browser, Page, async_playwright
from pydantic import BaseModel, Field
from steel import Steel

load_dotenv()

STEEL_API_KEY = os.getenv("STEEL_API_KEY") or "your-steel-api-key-here"
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY") or "your-openai-api-key-here"


class FieldSpec(BaseModel):
    name: str
    selector: Annotated[
        str,
        Field(description="CSS selector relative to the row. Empty string reads the row itself."),
    ]
    attr: Annotated[
        Optional[str],
        Field(description="Optional attribute to read instead of innerText (e.g. 'href')."),
    ] = None


class ExtractInput(BaseModel):
    row_selector: Annotated[str, Field(description="CSS selector matching each row.")]
    fields: Annotated[
        list[FieldSpec],
        Field(min_length=1, max_length=10, description="Fields to read from each row."),
    ]
    limit: Annotated[
        int, Field(ge=1, le=50, description="Maximum number of rows to return.")
    ] = 10


def build_tools(page: Page) -> list[Any]:
    """Define tools as closures over the live Playwright page. Each run gets its
    own page, so tools never share state across runs."""

    @tool(
        name="navigate",
        description="Navigate the open session to a URL and wait for the page to load.",
        approval_mode="never_require",
    )
    async def navigate(
        url: Annotated[str, Field(description="Absolute URL to navigate to.")],
    ) -> dict:
        t0 = time.time()
        await page.goto(url, wait_until="domcontentloaded", timeout=45_000)
        print(f"    navigate: {int((time.time() - t0) * 1000)}ms")
        return {"url": page.url, "title": await page.title()}

    @tool(
        name="snapshot",
        description=(
            "Return a readable snapshot of the current page: title, URL, the first "
            "4000 characters of visible text, and the first 50 links. Call BEFORE "
            "extract so you never have to guess CSS selectors."
        ),
        approval_mode="never_require",
    )
    async def snapshot() -> dict:
        t0 = time.time()
        snap = await page.evaluate(
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
            {"maxChars": 4_000, "maxLinks": 50},
        )
        print(
            f"    snapshot: {int((time.time() - t0) * 1000)}ms "
            f"({len(snap['text'])} chars, {len(snap['links'])} links)"
        )
        return snap

    @tool(
        name="extract",
        description=(
            "Extract structured rows from the current page using CSS selectors. "
            "Prefer calling snapshot first to confirm the page structure."
        ),
        schema=ExtractInput,
        approval_mode="never_require",
    )
    async def extract(row_selector: str, fields: list[dict], limit: int = 10) -> dict:
        t0 = time.time()
        items = await page.evaluate(
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
            {"rowSelector": row_selector, "fields": fields, "limit": limit},
        )
        print(f"    extract: {int((time.time() - t0) * 1000)}ms ({len(items)} rows)")
        return {"count": len(items), "items": items}

    return [navigate, snapshot, extract]


INSTRUCTIONS = (
    "You operate a Steel cloud browser via tools. "
    "Workflow: (1) navigate to the target URL, "
    "(2) snapshot to see the page's text and links, "
    "(3) only call extract when you need structured rows beyond snapshot, "
    "(4) return a concise final answer. "
    "Prefer snapshot's links list over guessing selectors. Do not invent data."
)

PROMPT = (
    "Go to https://github.com/trending/python?since=daily and return the top 3 "
    "AI/ML-related repositories. For each, give name (owner/repo), GitHub URL, "
    "star count as shown, and the repo description."
)


async def main() -> None:
    print("Steel + Microsoft Agent Framework Starter")
    print("=" * 60)

    if STEEL_API_KEY == "your-steel-api-key-here":
        print("Set STEEL_API_KEY in .env (https://app.steel.dev/settings/api-keys)")
        sys.exit(1)
    if OPENAI_API_KEY == "your-openai-api-key-here":
        print("Set OPENAI_API_KEY in .env (https://platform.openai.com/)")
        sys.exit(1)

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

        agent = Agent(
            client=OpenAIChatClient(model="gpt-5-mini"),
            name="SteelBrowserAgent",
            instructions=INSTRUCTIONS,
            tools=build_tools(page),
        )

        result = await agent.run(PROMPT)

        print("\n\033[1;92mAgent finished.\033[0m\n")
        print(result.text)
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
