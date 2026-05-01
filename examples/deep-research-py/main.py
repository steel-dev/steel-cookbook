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
import re
import sys
import time
from typing import Any
from urllib.parse import quote

import httpx
from anthropic import AsyncAnthropic
from bs4 import BeautifulSoup
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
anthropic = AsyncAnthropic(api_key=ANTHROPIC_API_KEY)

# Cheap, fast model for the per-page extraction step. Mirrors how Claude Code's
# WebFetch turns "fetch this URL and answer this question" into one pass over
# the page content with a small model.
EXTRACTOR_MODEL = "claude-haiku-4-5-20251001"

# Markers that flag a page as bot-blocked or JS-rendered, so read_url falls
# back from plain fetch() to a real Steel browser.
ANTI_BOT_MARKERS = (
    "just a moment",
    "verifying you are human",
    "checking your browser",
    "enable javascript and cookies",
    "access denied",
    "captcha",
    "pardon our interruption",
)


def looks_blocked(s: str) -> bool:
    lower = s.lower()[:2000]
    return any(m in lower for m in ANTI_BOT_MARKERS)

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


_FAST_FETCH_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/130.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml",
}


# Tier 1: plain HTTP fetch + BeautifulSoup extraction. Fast and cheap.
async def fast_fetch(url: str) -> dict[str, Any] | None:
    try:
        async with httpx.AsyncClient(
            follow_redirects=True, timeout=10.0, headers=_FAST_FETCH_HEADERS
        ) as client:
            res = await client.get(url)
        if res.status_code >= 400:
            return {"ok": False, "title": "", "text": ""}
        ct = res.headers.get("content-type", "")
        if "text/html" not in ct and "text/plain" not in ct:
            return {"ok": False, "title": "", "text": ""}
        soup = BeautifulSoup(res.text, "html.parser")
        for tag in soup(["script", "style", "noscript", "nav", "header", "footer", "iframe", "aside"]):
            tag.decompose()
        title_tag = soup.find("title") or soup.find("h1")
        title = title_tag.get_text(strip=True) if title_tag else ""
        # Prefer <article> or <main>; fall back to <body>.
        node = soup.find("article") or soup.find("main") or soup.body or soup
        text = node.get_text(separator="\n")
        text = re.sub(r"[ \t]+", " ", text)
        text = re.sub(r"\n{3,}", "\n\n", text).strip()
        return {"ok": True, "title": title, "text": text}
    except Exception:
        return None


# Tier 2: full Steel browser. Used when fast_fetch is blocked, JS-rendered,
# or returns suspiciously little content.
async def browser_fetch(researcher_id: str, url: str) -> dict[str, str]:
    s = await _ensure_session(researcher_id)
    page = s["page"]
    async with s["lock"]:
        await page.goto(url, wait_until="domcontentloaded", timeout=30_000)
        snap = await page.evaluate(
            """({maxChars}) => ({
                title: document.title,
                text: (document.body.innerText || '').slice(0, maxChars),
            })""",
            {"maxChars": 30_000},
        )
    return {"title": snap.get("title", ""), "text": snap.get("text", "")}


# Final pass: hand the extracted page content + the researcher's question to
# a small fast model and return its focused answer. This is the value of a
# "prompted fetch" — the researcher gets a tight extraction back, not a
# 30k-char raw scrape that bloats its context.
async def extract_with_haiku(
    *, url: str, title: str, text: str, prompt: str
) -> str:
    trimmed = text[:30_000]
    sys_prompt = (
        "You answer the user's question using ONLY the provided page content. "
        "Be concrete and concise (under 200 words). Quote short phrases when "
        "useful. If the page does not contain the answer, reply exactly with "
        "'NOT IN PAGE' and nothing else."
    )
    usr = (
        f"URL: {url}\nTITLE: {title}\n\n"
        f"QUESTION: {prompt}\n\n"
        f"PAGE CONTENT:\n{trimmed}"
    )
    msg = await anthropic.messages.create(
        model=EXTRACTOR_MODEL,
        max_tokens=600,
        system=sys_prompt,
        messages=[{"role": "user", "content": usr}],
    )
    return "\n".join(b.text for b in msg.content if b.type == "text").strip()


@tool(
    "read_url",
    "Fetch a URL and answer a focused extraction prompt about its content. "
    "Tries a plain HTTP fetch first; falls back to a real Steel browser if "
    "the page is blocked, JS-rendered, or returns little content. The "
    "`prompt` argument is the SPECIFIC question you want answered from this "
    "page (e.g. 'which solid-state EV cells shipped in production cars in "
    "2026?'). Returns a tight extraction, not the raw page. Pass your "
    "researcher_id.",
    {"researcher_id": str, "url": str, "prompt": str},
)
async def read_url(args: dict[str, Any]) -> dict[str, Any]:
    rid = args["researcher_id"]
    url = args["url"]
    prompt = args["prompt"]
    t0 = time.time()
    tier = "fetch"
    try:
        fast = await fast_fetch(url)
        if (
            not fast
            or not fast.get("ok")
            or len(fast.get("text", "")) < 500
            or looks_blocked(fast.get("text", ""))
            or looks_blocked(fast.get("title", ""))
        ):
            tier = "steel"
            snap = await browser_fetch(rid, url)
            title = snap["title"]
            text = snap["text"]
        else:
            title = fast["title"]
            text = fast["text"]
        extraction = await extract_with_haiku(
            url=url, title=title, text=text, prompt=prompt
        )
    except Exception as e:
        return {
            "content": [
                {"type": "text", "text": json.dumps({"error": str(e), "url": url})}
            ],
            "is_error": True,
        }
    print(
        f"    [{rid}] read_url({tier}) '{url[:60]}': "
        f"{len(extraction)} chars ({int((time.time() - t0) * 1000)}ms)"
    )
    return {
        "content": [
            {
                "type": "text",
                "text": json.dumps(
                    {"url": url, "title": title, "tier": tier, "extraction": extraction}
                ),
            }
        ]
    }


steel_server = create_sdk_mcp_server(
    name="steel",
    version="1.0.0",
    tools=[web_search, read_url],
)


RESEARCHER_PROMPT = """You are a focused web researcher with a tool budget for iteration.

Your task description includes a researcher_id (e.g. r1, r2). Pass that researcher_id to every tool call so you stay in your own private browser session.

You can iterate: search → read → reflect → search again. Budget: about 8 tool calls total. Use them deliberately.

Workflow:
1. Run an initial `web_search` with a tight, specific query.
2. For 2-3 promising results, call `read_url` with a SPECIFIC `prompt` describing exactly what fact you want to learn from that page (e.g. "which solid-state EV cells shipped in production cars in 2026 and in which models?"). `read_url` returns a focused extraction; if it returns "NOT IN PAGE", that source is not useful — try another.
3. After about 5-6 tool calls (typically once you have findings from 3+ pages), pause and emit a compact RECAP block before continuing:

   RECAP:
   - <claim> [1]
   - <claim> [2]
   - <claim> [1][3]

   The RECAP is your authoritative working knowledge from here on. Cite from the RECAP — do not re-cite older raw `read_url` extractions. If a clear gap remains, run ONE more `web_search` with a refined query (a missing angle, a counter-source, a different time scope), read 1-2 more pages, then update the RECAP with any new claims. This keeps your reasoning compact as the loop extends.
4. Stop when the RECAP covers at least 2-3 cited claims OR you've used most of your budget. Do not exceed about 8 tool calls.

Prefer primary sources, official docs, reputable news. Skip paywalls and login walls. If a domain blocks you twice, move on.

Final reply (exact shape, nothing else; FINDINGS should mirror your final RECAP):

SUB-QUESTION: <restated>

FINDINGS:
- <fact> [1]
- <fact> [2]
- <fact> [1][3]

SOURCES:
[1] <Title> - <URL>
[2] <Title> - <URL>

Cite every fact. Do not speculate beyond what the sources say. Cap at 5 sources. If the search yields no usable sources, return an empty FINDINGS block and note that in one line above SOURCES.
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
                    "Focused web researcher. Iterates search → read → reflect "
                    "on a private Steel browser session (with a fast HTTP "
                    "fallback) to answer one sub-question with cited "
                    "findings. Use one per sub-question."
                ),
                prompt=RESEARCHER_PROMPT,
                # Researchers see only Steel tools. Don't include Agent;
                # subagents can't dispatch their own subagents.
                tools=["mcp__steel__web_search", "mcp__steel__read_url"],
                mcpServers=["steel"],
                model="sonnet",
                # Headroom for ~8 tool calls (search + reads + a refinement
                # round) plus the final cited reply.
                maxTurns=14,
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
