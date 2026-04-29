# Claude Agent SDK (Python)

The Claude Agent SDK is the agent loop that powers Claude Code, packaged as a library. You hand `query()` a prompt and a set of options; it streams typed messages back. Tools are async functions decorated with `@tool`, bundled into an in-process MCP server with `create_sdk_mcp_server`, and registered through the `mcp_servers` option. No subprocess, no separate MCP host.

This recipe wires four browser tools (`open_session`, `navigate`, `snapshot`, `extract`) into one Steel session and points the agent at GitHub Trending. The agent picks tools, the SDK runs them, and the final `ResultMessage` carries the model's natural-language answer.

## Tools as an in-process MCP server

Each tool is a thin wrapper around Playwright. `@tool` takes a name, a description, and an input schema:

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
```

The `{"url": str}` shape is sugar: the SDK converts it into a JSON Schema with one required `url` parameter. For tools whose inputs need lists or nested objects (like `extract`), pass full JSON Schema instead. The Python SDK accepts both formats from the same decorator.

Returns must follow the MCP `CallToolResult` shape: `{"content": [...]}` with one or more text/image/resource blocks. JSON-encoding the tool output keeps every result self-describing for the model on the next turn.

Once defined, every tool goes into a single MCP server:

```python
steel_server = create_sdk_mcp_server(
    name="steel",
    version="1.0.0",
    tools=[open_session, navigate, snapshot, extract],
)
```

"In-process" is literal: no stdio bridge, no spawn, no separate MCP server binary. The server lives inside your Python process and dispatches calls in microseconds.

## Wiring the tools into query

`ClaudeAgentOptions` glues everything together:

```python
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

Three options matter for keeping the agent on-task and the recipe reproducible:

- `mcp_servers={"steel": steel_server}`. The dict key becomes the server segment in fully qualified tool names. Each tool surfaces to Claude as `mcp__steel__open_session`, `mcp__steel__navigate`, and so on. The wildcard `mcp__steel__*` in `allowed_tools` pre-approves all four without per-call prompts.
- `tools=[]`. Drops the SDK's built-ins. By default the agent inherits `Read`, `Write`, `Edit`, `Bash`, `Grep`, `WebFetch`, and friends. None of those make sense for a focused browser agent, and `Bash` would let it shell out on your machine. The empty list removes them from Claude's context entirely.
- `setting_sources=[]`. The SDK normally loads `.claude/` from your working directory and `~/.claude/`. The empty list disables that, so the recipe runs identically in CI, in a colleague's checkout, and on your laptop.

`permission_mode="bypassPermissions"` is safe here because the only callable tools are the four you wrote. With `tools=[]`, there is nothing else to bypass.

## Reading the message stream

`query()` returns an async iterator over typed messages. Narrow with `isinstance`:

```python
async for message in query(prompt=PROMPT, options=options):
    if isinstance(message, AssistantMessage):
        for block in message.content:
            if isinstance(block, ToolUseBlock):
                name = block.name.removeprefix("mcp__steel__")
                print(f"  -> {name}({json.dumps(block.input)[:120]})")
            elif isinstance(block, TextBlock):
                ...
    elif isinstance(message, ResultMessage):
        if message.subtype == "success":
            final_text = message.result or ""
```

`AssistantMessage` carries the model's content blocks: `TextBlock` for prose, `ToolUseBlock` for the tool name and arguments. `ResultMessage` arrives once at the end and holds the final answer along with token usage and cost in its other fields.

There is no `Runner.run` returning a Pydantic object the way OpenAI's Agents SDK does with `output_type`. If you want structured output, ask for it in the prompt (model returns JSON) and parse `message.result` yourself, or run a second short `query()` to reformat the answer.

## Run it

```bash
cd examples/claude-agent-sdk-py
cp .env.example .env          # set STEEL_API_KEY and ANTHROPIC_API_KEY
uv run playwright install chromium
uv run main.py
```

Get keys from [app.steel.dev](https://app.steel.dev/settings/api-keys) and [console.anthropic.com](https://console.anthropic.com/). The Python SDK ships with the Claude Code CLI bundled, so a single `uv sync` (run by `uv run`) is enough.

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

A run takes ~30 to 50 seconds and 3 to 6 turns. Cost is Steel session-minutes plus Anthropic tokens for `claude-sonnet-4-6`; the snapshot's text dominates the prompt size on each turn.

The `finally` block closes Playwright and calls `steel.sessions.release()`. Skipping it leaves the browser running until the default timeout while you keep paying.

## Make it yours

- **Swap the task.** Change `PROMPT` and, if useful, `SYSTEM_PROMPT`. The four tools are task-agnostic; any page that yields visible text plus repeating rows fits the same shape.
- **Use Opus 4.7 for harder pages.** Set `model="claude-opus-4-7"` in `ClaudeAgentOptions`. Sonnet 4.6 is the cost/speed default.
- **Add a tool.** Decorate a new async function with `@tool`, append it to the `tools` list passed to `create_sdk_mcp_server`. A `click(selector)` tool that calls `page.click` is a useful fifth one for forms and pagination.
- **Hook the lifecycle.** Pass `hooks={"PostToolUse": [...]}` on `ClaudeAgentOptions` to log every tool call, validate arguments, or veto destructive actions. The hook events match Claude Code's: `PreToolUse`, `PostToolUse`, `Stop`, `SessionStart`.
- **Resume sessions.** Capture `SystemMessage.data["session_id"]` from the first run, pass `resume=session_id` on the next `ClaudeAgentOptions` to continue with full context. Agent memory is its own thing; the Steel browser session is a separate object with a separate ID.
- **Hand off auth.** Pair with [credentials](../credentials) or [auth-context](../auth-context) so the Steel session starts already logged in.

## Related

[Anthropic Agent SDK docs](https://platform.claude.com/docs/en/agent-sdk/overview) · [TypeScript version](../claude-agent-sdk-ts) · [Claude Computer Use (Python)](../claude-computer-use-py) for the raw screenshot loop
