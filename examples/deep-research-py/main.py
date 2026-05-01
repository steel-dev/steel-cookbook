"""
Deep-research agent with the Claude Agent SDK (Python) and Steel.
https://github.com/steel-dev/steel-cookbook/tree/main/examples/deep-research-py

A lead "orchestrator" agent decomposes a research question, dispatches one
`researcher` subagent per sub-question in parallel, and synthesizes the
returned findings into a Markdown report with traceable citations. Each
researcher operates its own Steel cloud browser session.
"""

import asyncio
import json
import os
import sys
import time
from typing import Any
from urllib.parse import quote

from claude_agent_sdk import (
    AgentDefinition,
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
from playwright.async_api import async_playwright
from steel import Steel

load_dotenv()

STEEL_API_KEY = os.getenv("STEEL_API_KEY") or "your-steel-api-key-here"
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY") or "your-anthropic-api-key-here"

steel = Steel(steel_api_key=STEEL_API_KEY)

# One Steel session per researcher_id. The orchestrator hands each subagent
# a unique id (r1, r2, ...) and instructs it to pass that id to every tool
# call, so parallel researchers each browse in isolation.
_sessions: dict[str, dict[str, Any]] = {}
_playwright = None
_session_lock = asyncio.Lock()


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
        page.set_default_timeout(30_000)
        _sessions[researcher_id] = {
            "session": sess,
            "browser": browser,
            "page": page,
            "lock": asyncio.Lock(),  # serialize tool calls within one researcher
        }
        print(f"    [{researcher_id}] opened session {sess.id}")
        return _sessions[researcher_id]


@tool(
    "web_search",
    "Search the open web. Returns the first 10 results with title, URL, and "
    "snippet. Pass your researcher_id so the search runs in your private "
    "browser session.",
    {"researcher_id": str, "query": str},
)
async def web_search(args: dict[str, Any]) -> dict[str, Any]:
    rid = args["researcher_id"]
    q = args["query"]
    s = await _ensure_session(rid)
    page = s["page"]
    t0 = time.time()
    async with s["lock"]:
        try:
            await asyncio.wait_for(_run_search(page, q), timeout=60)
        except Exception as e:
            return {
                "content": [
                    {
                        "type": "text",
                        "text": json.dumps({"error": str(e), "query": q}),
                    }
                ],
                "is_error": True,
            }
        results = await page.evaluate(
            """() => Array.from(document.querySelectorAll('.result')).slice(0, 10).map(r => ({
                title: (r.querySelector('.result__title')?.innerText || '').trim(),
                url: r.querySelector('.result__a')?.href || '',
                snippet: (r.querySelector('.result__snippet')?.innerText || '').trim(),
            })).filter(r => r.url)"""
        )
    print(
        f"    [{rid}] web_search '{q[:50]}': "
        f"{len(results)} results ({int((time.time() - t0) * 1000)}ms)"
    )
    return {
        "content": [
            {"type": "text", "text": json.dumps({"query": q, "results": results})}
        ]
    }


async def _run_search(page, q: str) -> None:
    await page.goto(
        f"https://duckduckgo.com/html/?q={quote(q)}",
        wait_until="domcontentloaded",
        timeout=30_000,
    )


@tool(
    "read_url",
    "Open a URL in your private browser session and return the page title, "
    "visible text (first 8000 chars), and outbound links. Pass your "
    "researcher_id.",
    {"researcher_id": str, "url": str},
)
async def read_url(args: dict[str, Any]) -> dict[str, Any]:
    rid = args["researcher_id"]
    s = await _ensure_session(rid)
    page = s["page"]
    t0 = time.time()
    async with s["lock"]:
        try:
            snap = await asyncio.wait_for(_run_read(page, args["url"]), timeout=60)
        except Exception as e:
            return {
                "content": [
                    {
                        "type": "text",
                        "text": json.dumps({"error": str(e), "url": args["url"]}),
                    }
                ],
                "is_error": True,
            }
    print(
        f"    [{rid}] read_url '{args['url'][:60]}': "
        f"{len(snap['text'])} chars ({int((time.time() - t0) * 1000)}ms)"
    )
    return {"content": [{"type": "text", "text": json.dumps(snap)}]}


async def _run_read(page, url: str) -> dict[str, Any]:
    await page.goto(url, wait_until="domcontentloaded", timeout=30_000)
    return await page.evaluate(
        """({maxChars, maxLinks}) => {
            const text = (document.body.innerText || '').slice(0, maxChars);
            const links = Array.from(document.querySelectorAll('a[href]'))
                .slice(0, maxLinks)
                .map(a => ({ text: (a.innerText || '').trim().slice(0, 80), href: a.href }))
                .filter(l => l.text && l.href && l.href.startsWith('http'));
            return { url: location.href, title: document.title, text, links };
        }""",
        {"maxChars": 8_000, "maxLinks": 30},
    )


steel_server = create_sdk_mcp_server(
    name="steel",
    version="1.0.0",
    tools=[web_search, read_url],
)


RESEARCHER_PROMPT = """You are a focused web researcher.

Your task description includes a researcher_id (e.g. r1, r2). Pass that researcher_id to every tool call so you stay in your own private browser session.

Strict workflow (do not deviate):
1. Make EXACTLY ONE `web_search` call on a tight, specific query.
2. Make AT MOST 3 `read_url` calls on the most promising results. Prefer primary sources, official docs, reputable news. Skip paywalls and login walls.
3. Reply with this exact shape, nothing else:

SUB-QUESTION: <restated>

FINDINGS:
- <fact> [1]
- <fact> [2]
- <fact> [1][3]

SOURCES:
[1] <Title> - <URL>
[2] <Title> - <URL>

Cite every fact. Do not speculate beyond what the sources say. Cap at 4 sources. Do not run extra searches; if the first search yields no usable sources, return an empty FINDINGS block and note that in one line above SOURCES.
"""


ORCHESTRATOR_PROMPT = """You are a deep-research orchestrator. You do not browse the web yourself. You decompose, delegate, and synthesize.

Steps:
1. Decompose the user's question into 3 distinct sub-questions covering different angles (current state, key players, blockers, outlook, ...). Pick the 3 that fit best.
2. Dispatch one `researcher` subagent per sub-question IN PARALLEL: emit all Agent tool calls in a single assistant turn. For each, pass:
   - A unique researcher_id: r1, r2, r3, ...
   - The specific sub-question
   - The literal instruction "Pass researcher_id=<id> to every tool call."
3. Wait for all researchers to return their findings.
4. Synthesize into a final Markdown report. Use this shape:

# <Research question>

## Summary
<2 to 3 paragraph executive summary tying the sub-questions together.>

## <Sub-question 1>
<Synthesized answer with inline citations like [r1:1], [r2:3]. The format is [researcher_id:source_index] referencing that researcher's findings list.>

## <Sub-question 2>
...

## Sources
- [r1:1] <Title> - <URL>
- [r1:2] <Title> - <URL>
- [r2:1] <Title> - <URL>

Rules:
- Cite every claim with [rN:K]. The reader uses these to trace facts back to the researcher that found them.
- Do not introduce facts the researchers did not return.
- One report. No preamble, no follow-up questions.
"""


PROMPT = (
    "What is the current state of solid-state battery commercialization for "
    "electric vehicles in 2026? Cover which companies are shipping product, "
    "where the underlying technology stands, and what is blocking mass-market "
    "EV adoption."
)


async def main() -> None:
    print("Steel + Claude Agent SDK Deep Research")
    print("=" * 60)
    print(f"Question: {PROMPT}")
    print("=" * 60)

    if STEEL_API_KEY == "your-steel-api-key-here":
        print("Set STEEL_API_KEY in .env (https://app.steel.dev/settings/api-keys)")
        sys.exit(1)
    if ANTHROPIC_API_KEY == "your-anthropic-api-key-here":
        print("Set ANTHROPIC_API_KEY in .env (https://console.anthropic.com/)")
        sys.exit(1)

    global _playwright
    _playwright = await async_playwright().start()

    options = ClaudeAgentOptions(
        model="claude-opus-4-7",
        system_prompt=ORCHESTRATOR_PROMPT,
        mcp_servers={"steel": steel_server},
        # The orchestrator only dispatches subagents. The Agent tool is the
        # SDK's invocation primitive for subagents.
        allowed_tools=["Agent"],
        agents={
            "researcher": AgentDefinition(
                description=(
                    "Focused web researcher. Drives a private Steel browser "
                    "session to answer one sub-question with cited findings. "
                    "Use one per sub-question."
                ),
                prompt=RESEARCHER_PROMPT,
                # Researchers see only Steel tools. Don't include Agent;
                # subagents can't dispatch their own subagents.
                tools=["mcp__steel__web_search", "mcp__steel__read_url"],
                mcpServers=["steel"],
                model="sonnet",
                maxTurns=8,
            ),
        },
        # Enable only the Agent built-in (for subagent dispatch). Empty list
        # disables every built-in including Agent, which silently demotes the
        # orchestrator to using Steel tools directly.
        tools=["Agent"],
        setting_sources=[],
        max_turns=20,
        permission_mode="bypassPermissions",
    )

    final_text = ""
    try:
        async for message in query(prompt=PROMPT, options=options):
            if isinstance(message, AssistantMessage):
                in_subagent = bool(message.parent_tool_use_id)
                indent = "      " if in_subagent else "  "
                for block in message.content:
                    if isinstance(block, ToolUseBlock):
                        if block.name in ("Task", "Agent"):
                            sub_q = (block.input.get("prompt") or "")[:120]
                            stype = block.input.get("subagent_type", "?")
                            print(f"-> dispatch {stype}: {sub_q}...")
                        else:
                            name = block.name.removeprefix("mcp__steel__")
                            args_preview = json.dumps(block.input)[:140]
                            print(f"{indent}-> {name}({args_preview})")
                    elif isinstance(block, TextBlock):
                        text = block.text.strip()
                        if text and not in_subagent:
                            print(text[:400])
            elif isinstance(message, ResultMessage):
                if message.subtype == "success":
                    final_text = message.result or ""
                else:
                    print(f"Run ended: {message.subtype}")
        if final_text:
            print("\n" + "=" * 60)
            print("FINAL REPORT")
            print("=" * 60)
            print(final_text)
    finally:
        for rid, s in _sessions.items():
            try:
                await s["browser"].close()
            except Exception:
                pass
            try:
                steel.sessions.release(s["session"].id)
                print(
                    f"\n[{rid}] released session. "
                    f"Replay: {s['session'].session_viewer_url}"
                )
            except Exception as e:
                print(f"[{rid}] error releasing session: {e}")
        if _playwright is not None:
            try:
                await _playwright.stop()
            except Exception:
                pass


if __name__ == "__main__":
    asyncio.run(main())
