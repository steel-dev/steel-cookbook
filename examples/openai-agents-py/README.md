# Steel + OpenAI Agents SDK (Python) Starter

Use Steel with the [OpenAI Agents SDK](https://openai.github.io/openai-agents-python/) for typed, tool-using browser agents.

Four `@function_tool` wrappers expose Steel's cloud browser to the agent (`open_session`, `navigate`, `snapshot`, `extract`). The final answer is validated against a Pydantic model via `output_type=FinalReport`. `max_turns=15` caps the loop. Demo task: find the top 3 AI/ML repos on GitHub trending.

## Setup

```bash
git clone https://github.com/steel-dev/steel-cookbook
cd steel-cookbook/examples/steel-openai-agents-python-starter
pip install -r requirements.txt
playwright install chromium
```

Create `.env`:

```bash
STEEL_API_KEY=your_steel_api_key_here
OPENAI_API_KEY=your_openai_api_key_here
```

Get keys: [Steel](https://app.steel.dev/settings/api-keys) | [OpenAI](https://platform.openai.com/)

## Usage

```bash
python main.py
```

You'll see per-tool timing in the console, then the final Pydantic-validated JSON.

## How it works

```python
from agents import Agent, Runner, function_tool
from pydantic import BaseModel

class FinalReport(BaseModel):
    summary: str
    repos: list[Repo]

agent = Agent(
    name="SteelResearch",
    instructions="...",
    model="gpt-5",
    tools=[open_session, navigate, snapshot, extract],
    output_type=FinalReport,
)

result = await Runner.run(agent, input="...", max_turns=15)
final: FinalReport = result.final_output
```

Each tool is a plain async function decorated with `@function_tool`. The SDK reads the signature + docstring to build the JSON schema. Pydantic models (like `FieldSpec`) are used where an argument needs structure.

Unlike some providers that force JSON-only mode when you ask for structured output, OpenAI supports **`output_type` + tools together** — the agent uses tools freely and still produces a validated final answer.

## Loop control

- `max_turns=15` — hard cap on turn count
- `output_type=PydanticModel` — forces typed final answer
- Raise inside a tool → caught by the runner; the agent can correct and continue

## Swap the model

```python
agent = Agent(..., model="gpt-5-mini")  # faster, cheaper
# or the full gpt-5 for stronger reasoning:
agent = Agent(..., model="gpt-5")
```

## Next steps

- **OpenAI Agents SDK docs**: https://openai.github.io/openai-agents-python/
- **Sessions API**: https://docs.steel.dev/overview/sessions-api/overview
- **Session lifecycle**: https://docs.steel.dev/overview/sessions-api/session-lifecycle
