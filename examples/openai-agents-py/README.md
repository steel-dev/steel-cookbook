# OpenAI Agents SDK Starter (Python)

The [OpenAI Agents SDK](https://openai.github.io/openai-agents-python/) runs the tool-call loop so you don't have to. You declare an `Agent` with tools, a model, and (optionally) a Pydantic `output_type`. You call `Runner.run(agent, input=...)` once. The SDK handles every model turn, every tool dispatch, and every schema check until the agent returns a typed final answer.

This starter wraps a Steel browser as four tools and points the agent at GitHub Trending.

```python
from agents import Agent, Runner, function_tool

agent = Agent(
    name="SteelResearch",
    instructions="You operate a Steel cloud browser via tools. ...",
    model="gpt-5-mini",
    tools=[open_session, navigate, snapshot, extract],
    output_type=FinalReport,
)

result = await Runner.run(agent, input="...", max_turns=15)
final: FinalReport = result.final_output
```

Each tool is a plain async function wrapped with `@function_tool`. The SDK reads the signature and docstring to build the JSON schema the model sees. `output_type=FinalReport` forces the last turn to produce a Pydantic-validated object, so `result.final_output` is typed.

## Run it

```bash
cd examples/openai-agents-py
cp .env.example .env          # set STEEL_API_KEY and OPENAI_API_KEY
uv run playwright install chromium
uv run main.py
```

Get keys from [app.steel.dev](https://app.steel.dev/settings/api-keys) and [platform.openai.com](https://platform.openai.com/api-keys). Each tool call prints its latency so you can see where time is going.

Your output varies. Structure looks like this:

```text
Steel + OpenAI Agents SDK (Python) Starter
============================================================
    open_session: 2843ms
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

A run takes ~20 to 40 seconds and 5 to 10 agent turns on GitHub Trending. Cost is a few cents of Steel session time plus OpenAI tokens. The `finally` block in `main` closes Playwright and calls `steel.sessions.release()`.

The Agents SDK ships [tracing](https://openai.github.io/openai-agents-python/tracing/) on by default. Each `Runner.run` produces a trace viewable at [platform.openai.com/traces](https://platform.openai.com/traces).

## Make it yours

- **Swap the task.** Change the `input=` string in `main()` and the `FinalReport` schema. Tools stay the same; the agent re-plans.
- **Add a tool.** Write an async function, decorate with `@function_tool`, add it to `tools=[...]`. A useful fifth tool is `click(selector: str)` that calls `page.click` and waits for navigation.
- **Hand off to a specialist.** The SDK supports [handoffs](https://openai.github.io/openai-agents-python/handoffs/): define a second `Agent` (say, a `Summarizer` with no tools) and list it in `handoffs=[...]` on the research agent.
- **Add a guardrail.** Attach an [input or output guardrail](https://openai.github.io/openai-agents-python/guardrails/) to reject off-topic requests or validate the `FinalReport` before it returns.
- **Swap the model.** `model="gpt-5"` for harder reasoning, `"gpt-5-mini"` (default) for speed and cost.
- **Raise `max_turns`.** 15 is plenty for single-page extraction. Multi-page flows want 25 to 40.
- **Use `context`.** Replace module globals with a dataclass passed to `Runner.run(agent, input=..., context=my_ctx)`. Each tool reads it via `RunContextWrapper`. Needed for concurrent runs.

## Related

[TypeScript version](../openai-agents-ts) · [OpenAI Computer Use (Python)](../openai-computer-use-py) · [OpenAI Agents SDK docs](https://openai.github.io/openai-agents-python/)
