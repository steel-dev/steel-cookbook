# Claude Agent SDK (Python)

The Claude Agent SDK is the agent loop that powers Claude Code, packaged as a library. Tools are async functions decorated with `@tool`, bundled into an in-process MCP server with `create_sdk_mcp_server`, and registered through the `mcp_servers` option.

This recipe wires four browser tools (`open_session`, `navigate`, `snapshot`, `extract`) into one Steel session and points the agent at GitHub Trending.

```python
@tool(
    "navigate",
    "Navigate the open session to a URL and wait for the page to load.",
    {"url": str},
)
async def navigate(args: dict[str, Any]) -> dict[str, Any]:
    await _page.goto(args["url"], wait_until="domcontentloaded", timeout=45_000)
    return {
        "content": [
            {"type": "text", "text": json.dumps({"url": _page.url, "title": await _page.title()})}
        ]
    }

steel_server = create_sdk_mcp_server(
    name="steel",
    version="1.0.0",
    tools=[open_session, navigate, snapshot, extract],
)

options = ClaudeAgentOptions(
    model="claude-sonnet-4-6",
    system_prompt=SYSTEM_PROMPT,
    mcp_servers={"steel": steel_server},
    allowed_tools=["mcp__steel__*"],
    tools=[],
    setting_sources=[],
    max_turns=20,
    permission_mode="bypassPermissions",
)
```

`tools=[]` drops the SDK's built-ins (`Read`, `Write`, `Edit`, `Bash`, `Grep`, `WebFetch`). `setting_sources=[]` skips loading `.claude/` from your working directory or home, so the recipe runs identically everywhere.

`query()` returns an async iterator over typed messages:

```python
async for message in query(prompt=PROMPT, options=options):
    if isinstance(message, AssistantMessage):
        for block in message.content:
            if isinstance(block, ToolUseBlock):
                name = block.name.removeprefix("mcp__steel__")
                print(f"  -> {name}({json.dumps(block.input)[:120]})")
    elif isinstance(message, ResultMessage):
        if message.subtype == "success":
            final_text = message.result or ""
```

## Run it

```bash
cd examples/claude-agent-sdk-py
cp .env.example .env          # set STEEL_API_KEY and ANTHROPIC_API_KEY
uv run playwright install chromium
uv run main.py
```

Get keys from [app.steel.dev](https://app.steel.dev/settings/api-keys) and [console.anthropic.com](https://console.anthropic.com/).

Your output varies. Structure looks like this:

```text
Steel + Claude Agent SDK (Python) Starter
============================================================
Sure, let me open a browser session and pull that page.
  -> open_session({})
    open_session: 1840ms
  -> navigate({"url": "https://github.com/trending/python?since=daily"})
    navigate: 2484ms
  -> snapshot({})
    snapshot: 487ms (4000 chars, 49 links)
I have everything I need. Here are the top 3 ...

--- Final answer ---
Top 3 AI/ML-related Python repos on today's trending list:
1. owner/repo - <description> (X stars)
...

Releasing Steel session...
Session released. Replay: https://app.steel.dev/sessions/ab12cd34...
```

A run takes ~30 to 50 seconds and 3 to 6 turns. Cost is Steel session-minutes plus Anthropic tokens. The `finally` block closes Playwright and calls `steel.sessions.release()`.

## Make it yours

- **Swap the task.** Change `PROMPT` and, if useful, `SYSTEM_PROMPT`. The four tools are task-agnostic.
- **Use Opus 4.7 for harder pages.** Set `model="claude-opus-4-7"` in `ClaudeAgentOptions`.
- **Add a tool.** Decorate a new async function with `@tool`, append it to the `tools` list passed to `create_sdk_mcp_server`. A `click(selector)` tool that calls `page.click` is a useful fifth one.
- **Hook the lifecycle.** Pass `hooks={"PostToolUse": [...]}` on `ClaudeAgentOptions` to log every tool call, validate arguments, or veto destructive actions. Hook events: `PreToolUse`, `PostToolUse`, `Stop`, `SessionStart`.
- **Resume sessions.** Capture `SystemMessage.data["session_id"]` from the first run, pass `resume=session_id` on the next `ClaudeAgentOptions` to continue with full context.
- **Hand off auth.** Pair with [credentials](../credentials) or [auth-context](../auth-context) so the Steel session starts already logged in.

## Related

[Anthropic Agent SDK docs](https://platform.claude.com/docs/en/agent-sdk/overview) · [TypeScript version](../claude-agent-sdk-ts) · [Claude Computer Use (Python)](../claude-computer-use-py)
