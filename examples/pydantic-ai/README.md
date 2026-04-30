# Pydantic AI Starter (Python)

[Pydantic AI](https://ai.pydantic.dev/) is the Pydantic team's agent framework. It's provider-agnostic and reuses Pydantic models for tool arguments and final outputs.

This starter wires a Steel browser into Pydantic AI's dependency-injection pattern and points the agent at GitHub Trending.

```python
from pydantic_ai import Agent, RunContext

agent = Agent(
    "openai:gpt-5-mini",
    deps_type=BrowserDeps,
    output_type=FinalReport,
    tools=[navigate, snapshot, extract],
    instructions="You operate a Steel cloud browser via tools. ...",
)

result = await agent.run(
    "Go to https://github.com/trending/python ...",
    deps=BrowserDeps(page=page),
)
final: FinalReport = result.output
```

`agent.run` runs the model loop until the agent returns a `FinalReport` (or an exception unwinds it). `result.output` is typed because `output_type=FinalReport` ties the final turn to the schema. Validation failures are fed back to the model so it corrects itself.

`deps_type=BrowserDeps` takes a single dependencies object per run and passes it to every tool through `RunContext.deps`. Tools are plain async functions that take `RunContext[BrowserDeps]` first:

```python
@dataclass
class BrowserDeps:
    page: Page

async def navigate(ctx: RunContext[BrowserDeps], url: str) -> dict:
    """Navigate the open session to a URL and wait for the page to load."""
    await ctx.deps.page.goto(url, wait_until="domcontentloaded", timeout=45_000)
    return {"url": ctx.deps.page.url, "title": await ctx.deps.page.title()}
```

## Run it

```bash
cd examples/pydantic-ai
cp .env.example .env          # set STEEL_API_KEY and OPENAI_API_KEY
uv run playwright install chromium
uv run main.py
```

Get keys from [app.steel.dev](https://app.steel.dev/settings/api-keys) and [platform.openai.com](https://platform.openai.com/api-keys). Each tool call prints its latency so you can see where time is going.

Your output varies. Structure looks like this:

```text
Steel + Pydantic AI Starter
============================================================
Session: https://app.steel.dev/sessions/ab12cd34...
    navigate: 1612ms
    snapshot: 487ms (3821 chars, 48 links)
    extract: 394ms (3 rows)

Agent finished.

{
  "summary": "Three trending Python repos focused on agentic workflows...",
  "repos": [
    {
      "name": "owner/repo",
      "url": "https://github.com/owner/repo",
      "stars": "1,240",
      "description": "..."
    },
    ...
  ]
}

Releasing Steel session...
Session released. Replay: https://app.steel.dev/sessions/ab12cd34...
```

A run takes ~20 to 40 seconds and 5 to 10 agent turns on GitHub Trending. Cost is a few cents of Steel session time plus OpenAI tokens. The `finally` block in `main` closes Playwright and calls `steel.sessions.release()` so Steel stops billing per-minute.

## Make it yours

- **Swap the model.** Change the first arg to `agent`. `'anthropic:claude-sonnet-4-6'` and `'google-gla:gemini-2.5-flash'` work without code changes; tool-arg JSON schemas are provider-agnostic. Set the matching API key in `.env`.
- **Swap the task.** Change the prompt in `agent.run` and the `FinalReport` schema. Tools stay the same; the agent re-plans against the new shape.
- **Add a tool.** Write an async function that takes `RunContext[BrowserDeps]`, add it to `tools=[...]` (or use `@agent.tool` after the agent exists). A useful fourth tool is `click(selector: str)` that calls `page.click` and waits for navigation.
- **Stream the answer.** Use `async with agent.run_stream(prompt, deps=...)` to stream the final answer token-by-token while tool calls happen behind the scenes. Helpful for long summaries.
- **Run agents in parallel.** Construct a session+page per task and `asyncio.gather(agent.run(...))` over them. Each run sees its own `deps`; nothing is shared by accident.
- **Watch with Logfire.** Pydantic AI integrates with [Logfire](https://logfire.pydantic.dev/) for traces of every turn, tool call, and token count.

## Related

[Steel + OpenAI Agents SDK (Python)](../openai-agents-py) · [Pydantic AI documentation](https://ai.pydantic.dev/)
