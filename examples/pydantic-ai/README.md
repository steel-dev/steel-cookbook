# Pydantic AI Starter (Python)

[Pydantic AI](https://ai.pydantic.dev/) is the Pydantic team's agent framework. The model identifier is a string (`'openai:gpt-5-mini'`, `'anthropic:claude-sonnet-4-6'`, `'google-gla:gemini-2.5-flash'`), tools are plain async functions, and `output_type=` validates the final answer with the same Pydantic you'd already use to validate API responses. No new schema layer to learn.

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

## Deps over globals

The interesting bit is `deps_type=BrowserDeps`. Pydantic AI takes a single dependencies object per run and passes it to every tool through `RunContext.deps`. That replaces the module-level globals you'd otherwise reach for when several tools share a runtime resource:

```python
@dataclass
class BrowserDeps:
    page: Page

async def navigate(ctx: RunContext[BrowserDeps], url: str) -> dict:
    """Navigate the open session to a URL and wait for the page to load."""
    await ctx.deps.page.goto(url, wait_until="domcontentloaded", timeout=45_000)
    return {"url": ctx.deps.page.url, "title": await ctx.deps.page.title()}
```

Tools are plain async functions that take `RunContext[BrowserDeps]` first. The example registers them via `tools=[...]` on the Agent, but `@agent.tool` works the same way once the agent exists. Setup and teardown live in `main`, not in tools. Open the Steel session, connect Playwright, grab a `page`, then hand it to `agent.run(deps=BrowserDeps(page=page))`. When the run finishes (or raises), you close the browser and call `steel.sessions.release()` in a `finally`. Two consequences worth knowing:

1. Concurrent runs work without changes. Each `agent.run` call gets its own `deps`, so you can fan out N agents over N Steel sessions and they don't trample each other.
2. Tools stay testable. Pass a fake `BrowserDeps` with a stub page and call the tool function directly.

## The three tools

`navigate` is a thin wrapper around `page.goto`. `snapshot` returns the page's title, URL, visible text (capped at 4k chars), and the first 50 links. The docstring instructs the agent to call it before `extract`:

```python
"""Return a readable snapshot of the current page: title, URL, visible
text (capped), and a list of links. Call BEFORE extract so the agent
never has to guess CSS selectors."""
```

This matters. With only `navigate` plus `extract`, the model invents selectors like `.trending-repo` that don't exist on real pages, calls `extract`, gets zero rows, retries. `snapshot` hands it the real DOM signals (visible text, href list) so it picks a selector that actually matches.

`extract` runs one `page.evaluate` to pull N rows with M fields each. The inline comment explains why:

```python
# Serial CDP round-trips to Steel's cloud browser are ~200-300ms each,
# so N*M round-trips burns seconds. One evaluate call is <500ms total.
```

Each field is a `FieldSpec` Pydantic model (`name`, `selector`, optional `attr`). Pydantic AI reads the type hint, generates the JSON schema, and validates the model's arguments before calling your function. Non-conforming arguments never reach Python.

## The typed output

```python
class Repo(BaseModel):
    name: str
    url: str
    stars: Optional[str] = None
    description: Optional[str] = None

class FinalReport(BaseModel):
    summary: str
    repos: list[Repo] = Field(min_length=1, max_length=5)
```

`output_type=FinalReport` pins the last turn to the schema and validates with Pydantic. On a `ValidationError`, Pydantic AI feeds the error back to the model and retries (up to a configurable cap). `result.output` in `main` is a `FinalReport`, not a string you have to parse, and your IDE knows it.

The same `FinalReport` model is the one you'd validate an HTTP payload with. Pydantic AI doesn't introduce a parallel schema system; if you're already using Pydantic for I/O boundaries, your agent outputs share the type stack.

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
- **Watch with Logfire.** Pydantic AI integrates with [Logfire](https://logfire.pydantic.dev/) for traces of every turn, tool call, and token count. Drop in a few lines of setup and every `agent.run` is observable.

## Related

[Steel + OpenAI Agents SDK (Python)](../openai-agents-py) for a sibling typed-agent recipe with handoffs and tracing. [Pydantic AI documentation](https://ai.pydantic.dev/) for tools, output validators, retries, and Logfire integration.
