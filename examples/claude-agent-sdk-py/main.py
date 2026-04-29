"""
Build a browser agent with the Claude Agent SDK and Steel.
https://github.com/steel-dev/steel-cookbook/tree/main/examples/claude-agent-sdk-py
"""

import asyncio
import json
import os
import sys
import time
from typing import Any, Optional

from claude_agent_sdk import (
    AssistantMessage,
    ClaudeAgentOptions,
    ResultMessage,
    TextBlock,
    ToolUseBlock,
    create_sdk_mcp_server,
    query,
    tool,
)
from dotenv import load_dotenv
from playwright.async_api import Browser, Page, async_playwright
from steel import Steel

load_dotenv()

STEEL_API_KEY = os.getenv("STEEL_API_KEY") or "your-steel-api-key-here"
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY") or "your-anthropic-api-key-here"

steel = Steel(steel_api_key=STEEL_API_KEY)

# Shared browser state held across tool calls within one run. The Agent SDK
# runs the loop in this same process, so module globals are enough; for
# concurrent runs, swap to a per-task context object.
_session = None
_browser: Optional[Browser] = None
_page: Optional[Page] = None
_playwright = None


@tool(
    "open_session",
    "Open a Steel cloud browser session. Call exactly once, before anything else.",
    {},
)
async def open_session(args: dict[str, Any]) -> dict[str, Any]:
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
        "content": [
            {
                "type": "text",
                "text": json.dumps(
                    {
                        "session_id": _session.id,
                        "live_view_url": _session.session_viewer_url,
                    }
                ),
            }
        ]
    }


@tool(
    "navigate",
    "Navigate the open session to a URL and wait for the page to load.",
    {"url": str},
)
async def navigate(args: dict[str, Any]) -> dict[str, Any]:
    if _page is None:
        return {
            "content": [{"type": "text", "text": "open_session must be called first."}],
            "is_error": True,
        }
    t0 = time.time()
    await _page.goto(args["url"], wait_until="domcontentloaded", timeout=45_000)
    print(f"    navigate: {int((time.time() - t0) * 1000)}ms")
    return {
        "content": [
            {
                "type": "text",
                "text": json.dumps({"url": _page.url, "title": await _page.title()}),
            }
        ]
    }


@tool(
    "snapshot",
    "Return a readable snapshot of the current page: title, URL, the first 4000 "
    "characters of visible text, and the first 50 links. Call BEFORE extract so "
    "you never have to guess CSS selectors.",
    {},
)
async def snapshot(args: dict[str, Any]) -> dict[str, Any]:
    if _page is None:
        return {
            "content": [{"type": "text", "text": "open_session must be called first."}],
            "is_error": True,
        }
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
        {"maxChars": 4_000, "maxLinks": 50},
    )
    print(
        f"    snapshot: {int((time.time() - t0) * 1000)}ms "
        f"({len(snap['text'])} chars, {len(snap['links'])} links)"
    )
    return {"content": [{"type": "text", "text": json.dumps(snap)}]}


@tool(
    "extract",
    "Extract structured rows from the current page using CSS selectors. Pass "
    "'row_selector' and a 'fields' array, where each field is "
    "{name, selector, attr?}. 'limit' is optional (default 10, max 50). Returns "
    "{count, items[]}. Prefer calling snapshot first to confirm page structure.",
    {
        "type": "object",
        "properties": {
            "row_selector": {"type": "string"},
            "fields": {
                "type": "array",
                "minItems": 1,
                "maxItems": 10,
                "items": {
                    "type": "object",
                    "properties": {
                        "name": {"type": "string"},
                        "selector": {
                            "type": "string",
                            "description": "CSS selector relative to the row. Empty string reads the row itself.",
                        },
                        "attr": {
                            "type": "string",
                            "description": "Optional attribute to read instead of innerText (e.g. 'href').",
                        },
                    },
                    "required": ["name", "selector"],
                },
            },
            "limit": {"type": "integer", "minimum": 1, "maximum": 50},
        },
        "required": ["row_selector", "fields"],
    },
)
async def extract(args: dict[str, Any]) -> dict[str, Any]:
    if _page is None:
        return {
            "content": [{"type": "text", "text": "open_session must be called first."}],
            "is_error": True,
        }
    t0 = time.time()
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
        {
            "rowSelector": args["row_selector"],
            "fields": args["fields"],
            "limit": args.get("limit", 10),
        },
    )
    print(f"    extract: {int((time.time() - t0) * 1000)}ms ({len(items)} rows)")
    return {
        "content": [
            {"type": "text", "text": json.dumps({"count": len(items), "items": items})}
        ]
    }


steel_server = create_sdk_mcp_server(
    name="steel",
    version="1.0.0",
    tools=[open_session, navigate, snapshot, extract],
)


SYSTEM_PROMPT = (
    "You operate a Steel cloud browser through MCP tools. "
    "Workflow: (1) open_session, (2) navigate to the target URL, "
    "(3) snapshot to read the page's text and links, "
    "(4) only call extract when you need structured rows. "
    "Prefer snapshot's link list over guessing selectors. Do not invent data."
)

PROMPT = (
    "Go to https://github.com/trending/python?since=daily and return the top 3 "
    "AI/ML-related repositories. For each, give name (owner/repo), GitHub URL, "
    "star count as shown, and the description."
)


async def main() -> None:
    print("Steel + Claude Agent SDK (Python) Starter")
    print("=" * 60)

    if STEEL_API_KEY == "your-steel-api-key-here":
        print("Set STEEL_API_KEY in .env (https://app.steel.dev/settings/api-keys)")
        sys.exit(1)
    if ANTHROPIC_API_KEY == "your-anthropic-api-key-here":
        print("Set ANTHROPIC_API_KEY in .env (https://console.anthropic.com/)")
        sys.exit(1)

    options = ClaudeAgentOptions(
        model="claude-sonnet-4-6",
        system_prompt=SYSTEM_PROMPT,
        mcp_servers={"steel": steel_server},
        allowed_tools=["mcp__steel__*"],
        # Drop Bash, Read, Edit, and friends. The agent should only see Steel.
        tools=[],
        # Don't load the developer's local .claude/ config.
        setting_sources=[],
        max_turns=20,
        permission_mode="bypassPermissions",
    )

    final_text = ""
    try:
        async for message in query(prompt=PROMPT, options=options):
            if isinstance(message, AssistantMessage):
                for block in message.content:
                    if isinstance(block, ToolUseBlock):
                        # Strip the mcp__steel__ prefix when printing.
                        name = block.name.removeprefix("mcp__steel__")
                        args_preview = json.dumps(block.input)[:120]
                        print(f"  -> {name}({args_preview})")
                    elif isinstance(block, TextBlock):
                        text = block.text.strip()
                        if text:
                            print(text[:400])
            elif isinstance(message, ResultMessage):
                if message.subtype == "success":
                    final_text = message.result or ""
                else:
                    print(f"Run ended: {message.subtype}")
        if final_text:
            print("\n--- Final answer ---")
            print(final_text)
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
