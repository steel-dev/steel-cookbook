# Microsoft Agent Framework Starter (Python)

[Microsoft Agent Framework](https://learn.microsoft.com/en-us/agent-framework/overview/) is Microsoft's 1.0 agent runtime (Python + .NET), the successor to AutoGen and Semantic Kernel. Provider-agnostic chat clients, function tools as plain Python callables, and built-in MCP / A2A interop.

This starter wires a Steel browser into the framework's `@tool` decorator pattern and points the agent at GitHub Trending.

```python
from agent_framework import Agent, tool
from agent_framework.openai import OpenAIChatClient

agent = Agent(
    client=OpenAIChatClient(model="gpt-5-mini"),
    name="SteelBrowserAgent",
    instructions="You operate a Steel cloud browser via tools. ...",
    tools=build_tools(page),  # navigate, snapshot, extract
)

result = await agent.run(
    "Go to https://github.com/trending/python ..."
)
print(result.text)
```

`agent.run` runs the model loop until the agent stops calling tools. `result.text` aggregates every text content item across the run's messages; `result.messages` is the full transcript including `function_call` and `function_result` contents if you want to inspect what happened.

Tools are plain Python functions decorated with `@tool`. The framework infers the JSON schema from the type hints (`Annotated[str, Field(description=...)]`) — or you can pass a Pydantic model via `schema=`:

```python
@tool(
    name="navigate",
    description="Navigate the open session to a URL and wait for the page to load.",
    approval_mode="never_require",
)
async def navigate(
    url: Annotated[str, Field(description="Absolute URL to navigate to.")],
) -> dict:
    await page.goto(url, wait_until="domcontentloaded", timeout=45_000)
    return {"url": page.url, "title": await page.title()}
```

Tools are built inside `build_tools(page)` so each run closes over its own `Page` — no module globals, safe to run concurrently.

## Run it

```bash
cd examples/microsoft-agent-framework
cp .env.example .env          # set STEEL_API_KEY and OPENAI_API_KEY
uv run playwright install chromium
uv run main.py
```

Get keys from [app.steel.dev](https://app.steel.dev/settings/api-keys) and [platform.openai.com](https://platform.openai.com/api-keys). Each tool call prints its latency so you can see where time is going.

Your output varies. Structure looks like this:

```text
Steel + Microsoft Agent Framework Starter
============================================================
Session: https://app.steel.dev/sessions/ab12cd34...
    navigate: 1612ms
    snapshot: 487ms (3821 chars, 48 links)
    extract: 394ms (3 rows)

Agent finished.

1. owner/repo — https://github.com/owner/repo (1,240 stars)
   ...

Releasing Steel session...
Session released. Replay: https://app.steel.dev/sessions/ab12cd34...
```

A run takes ~20 to 40 seconds and 5 to 10 agent turns on GitHub Trending. Cost is a few cents of Steel session time plus OpenAI tokens. The `finally` block in `main` closes Playwright and calls `steel.sessions.release()` so Steel stops billing per-minute.

## Make it yours

- **Swap the model.** Change the `OpenAIChatClient(model=...)` argument. `'gpt-5'`, `'gpt-4o'`, and the chat-completion variants all work. For Anthropic or Azure OpenAI, swap the client: `from agent_framework.anthropic import AnthropicChatClient` or `from agent_framework.azure import AzureOpenAIChatClient`.
- **Swap the task.** Change `PROMPT` and the `INSTRUCTIONS` system text. Tools stay the same; the agent re-plans against the new shape.
- **Structured output.** Pass a Pydantic model via `response_format` in `default_options` (or the per-run `options`). The agent's final message will be validated against the schema.
- **Stream the answer.** Use `async for update in agent.run(prompt, stream=True):` to stream tokens as they arrive. Tool calls happen behind the scenes; `update.text` carries the partial answer.
- **Run agents in parallel.** Construct a session+page+agent per task and `asyncio.gather(*[agent.run(...) for agent in agents])`. Each closure captures its own `page`; nothing is shared by accident.
- **Approval gates.** Drop `approval_mode="never_require"` on a sensitive tool and the framework will pause for an approval response before invoking it — useful for destructive actions (form submits, purchases).
- **Multi-agent workflows.** The framework ships a `Workflow` / `GroupChat` API for graph-based multi-agent orchestration; one Steel-driven `Agent` becomes a node in a larger graph.

## Related

[Steel + Claude Agent SDK (Python)](../claude-agent-sdk-py) · [Steel + Pydantic AI](../pydantic-ai) · [Microsoft Agent Framework docs](https://learn.microsoft.com/en-us/agent-framework/overview/)
