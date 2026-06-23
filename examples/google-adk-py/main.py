"""
Run a Google ADK browser agent against a Steel session.
https://github.com/steel-dev/steel-cookbook/tree/main/examples/google-adk-py
"""

import asyncio
import json
import os
import sys
import time
from typing import Optional

from dotenv import load_dotenv
from google.adk.agents import LlmAgent
from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService
from google.genai import types
from playwright.async_api import Browser, Page, async_playwright
from pydantic import BaseModel, Field
from steel import Steel

load_dotenv()

STEEL_API_KEY = os.getenv("STEEL_API_KEY") or "your-steel-api-key-here"
GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY") or "your-google-api-key-here"

MODEL = "gemini-2.5-flash"
APP_NAME = "steel-google-adk"
USER_ID = "cookbook"

# ADK reads GOOGLE_API_KEY for the AI Studio path; pin it off Vertex so the
# agent never tries to authenticate against a GCP project.
os.environ.setdefault("GOOGLE_GENAI_USE_VERTEXAI", "FALSE")

# ADK tools receive no per-run context, so the live page is bound at module
# scope and the tool functions close over it.
_PAGE: Optional[Page] = None


class Story(BaseModel):
    rank: int
    title: str
    url: str = Field(description="Destination URL the story links to.")
    points: int


class TopStories(BaseModel):
    stories: list[Story] = Field(min_length=1, max_length=5)


async def navigate(url: str) -> dict:
    """Navigate the open browser session to a URL and wait for it to load.

    Args:
        url: The absolute URL to open.

    Returns:
        A dict with the resolved url and page title.
    """
    t0 = time.time()
    try:
        await _PAGE.goto(url, wait_until="domcontentloaded", timeout=45_000)
    except Exception as e:
        return {"error": str(e)}
    print(f"    navigate: {int((time.time() - t0) * 1000)}ms")
    return {"url": _PAGE.url, "title": await _PAGE.title()}


async def snapshot(max_chars: int = 4_000, max_links: int = 50) -> dict:
    """Return a readable snapshot of the current page so the agent never has to
    guess CSS selectors. Call this before extract.

    Args:
        max_chars: Cap on visible text returned.
        max_links: Cap on links returned.

    Returns:
        A dict with the page url, title, capped visible text, and links.
    """
    t0 = time.time()
    snap = await _PAGE.evaluate(
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


async def extract(row_selector: str, fields: list[dict], limit: int = 10) -> dict:
    """Extract structured rows from the current page using CSS selectors.

    Args:
        row_selector: CSS selector matching each row to extract.
        fields: One spec per column. Each is a dict with keys "name", a
            "selector" relative to the row (empty string reads the row itself),
            and optional "attr" to read an attribute instead of innerText.
        limit: Maximum number of rows to return.

    Returns:
        A dict with the row count and the extracted items.
    """
    t0 = time.time()
    # Run the whole extraction in one page.evaluate. Serial CDP round-trips to
    # Steel's cloud browser are ~200-300ms each, so N*M trips burn seconds.
    try:
        items = await _PAGE.evaluate(
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
    except Exception as e:
        # A model-supplied selector can be invalid; hand the error back so the
        # agent corrects it instead of crashing the run.
        return {"error": str(e)}
    print(f"    extract: {int((time.time() - t0) * 1000)}ms ({len(items)} rows)")
    return {"count": len(items), "items": items}


def build_agent() -> LlmAgent:
    return LlmAgent(
        name="hn_scraper",
        model=MODEL,
        tools=[navigate, snapshot, extract],
        # output_schema enforces TopStories on the final reply; ADK keeps the
        # tools available during the thought loop and only constrains the answer.
        output_schema=TopStories,
        instruction=(
            "You operate a Steel cloud browser via tools. "
            "Workflow: (1) navigate to the target URL, "
            "(2) snapshot to read the page text and links, "
            "(3) extract structured rows when you need precise fields, "
            "(4) return the answer matching the required schema. "
            "Prefer the snapshot links over guessing selectors. Do not invent data."
        ),
    )


async def run_agent(runner: Runner, session_id: str, prompt: str) -> str:
    message = types.Content(role="user", parts=[types.Part(text=prompt)])
    final = ""
    async for event in runner.run_async(
        user_id=USER_ID, session_id=session_id, new_message=message
    ):
        if event.is_final_response() and event.content and event.content.parts:
            final = event.content.parts[0].text or ""
    return final


async def main() -> None:
    print("Steel + Google ADK Starter")
    print("=" * 60)

    if STEEL_API_KEY == "your-steel-api-key-here":
        print("Set STEEL_API_KEY in .env (https://app.steel.dev/settings/api-keys)")
        sys.exit(1)
    if GOOGLE_API_KEY == "your-google-api-key-here":
        print("Set GOOGLE_API_KEY in .env (https://aistudio.google.com/apikey)")
        sys.exit(1)

    global _PAGE

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
        _PAGE = ctx.pages[0] if ctx.pages else await ctx.new_page()

        session_service = InMemorySessionService()
        adk_session = await session_service.create_session(
            app_name=APP_NAME, user_id=USER_ID
        )
        runner = Runner(
            agent=build_agent(),
            app_name=APP_NAME,
            session_service=session_service,
        )

        output = await run_agent(
            runner,
            adk_session.id,
            "Go to https://news.ycombinator.com and return the top 5 stories "
            "with rank, title, destination URL, and points.",
        )

        print("\n\033[1;92mAgent finished.\033[0m\n")
        # output is JSON text constrained to TopStories; reformat for readability.
        print(json.dumps(json.loads(output), indent=2))
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
