# Google ADK Starter (Python)

[Google ADK](https://google.github.io/adk-docs/) is Google's Agent Development Kit. An `LlmAgent` holds the model, instruction, and tools; a `Runner` drives the turn loop against a session service that stores conversation state. This starter binds a Steel cloud browser to three function tools, hands them to a Gemini agent, and points it at Hacker News.

The pieces ADK asks you to assemble:

```python
from google.adk.agents import LlmAgent
from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService

agent = LlmAgent(
    name="hn_scraper",
    model="gemini-2.5-flash",
    tools=[navigate, snapshot, extract],
    output_schema=TopStories,
    instruction="You operate a Steel cloud browser via tools. ...",
)

session_service = InMemorySessionService()
adk_session = await session_service.create_session(app_name=APP_NAME, user_id=USER_ID)
runner = Runner(agent=agent, app_name=APP_NAME, session_service=session_service)
```

Note the two session concepts that share a word. There is the Steel session (a remote browser, billed per minute) and the ADK session (a conversation record, held in memory here). They are unrelated objects; `main` creates one of each.

`run_agent` sends a turn and reads the result. `runner.run_async` returns an async generator of events: tool calls, tool results, model deltas, and finally one event where `event.is_final_response()` is true. You iterate, keep the text from that final event, and ignore the rest:

```python
message = types.Content(role="user", parts=[types.Part(text=prompt)])
async for event in runner.run_async(
    user_id=USER_ID, session_id=session_id, new_message=message
):
    if event.is_final_response() and event.content and event.content.parts:
        final = event.content.parts[0].text or ""
```

## Tools

ADK builds each tool's JSON schema from the Python function itself: parameter names and type hints become the arguments, and the docstring (summary plus `Args:` lines) becomes the descriptions the model reads. So the tools are plain `async def` functions with typed parameters and a Google-style docstring, no decorator:

```python
async def navigate(url: str) -> dict:
    """Navigate the open browser session to a URL and wait for it to load.

    Args:
        url: The absolute URL to open.

    Returns:
        A dict with the resolved url and page title.
    """
    await _PAGE.goto(url, wait_until="domcontentloaded", timeout=45_000)
    return {"url": _PAGE.url, "title": await _PAGE.title()}
```

A function tool in ADK takes no framework context argument, so the live Playwright `Page` is bound to a module-level `_PAGE` and the tools close over it. `main` sets `_PAGE` once the CDP connection is up, before the runner starts. The three tools:

- `navigate(url)` loads a page and reports the resolved URL and title.
- `snapshot(max_chars, max_links)` returns capped visible text plus a list of links, so the agent reads the page before guessing selectors.
- `extract(row_selector, fields, limit)` runs one `page.evaluate` that maps a CSS row selector and field specs to structured rows. One round trip, not one per cell. CDP calls to Steel's cloud browser run ~200 to 300ms each, so a per-cell loop would burn seconds.

Each tool prints its own latency (`navigate: 412ms`) so you can see where a turn spends its time.

## Typed output

`output_schema=TopStories` ties the final reply to a Pydantic model. ADK keeps the tools available during the thinking loop and constrains only the last message, so the agent still browses freely and then answers in shape. The final event text is JSON that already validates against `TopStories`; `main` parses and re-dumps it with indentation:

```python
class Story(BaseModel):
    rank: int
    title: str
    url: str = Field(description="Destination URL the story links to.")
    points: int

class TopStories(BaseModel):
    stories: list[Story] = Field(min_length=1, max_length=5)
```

## Run it

```bash
cd examples/google-adk-py
cp .env.example .env          # set STEEL_API_KEY and GOOGLE_API_KEY
uv run main.py
```

Get a Steel key from [app.steel.dev](https://app.steel.dev/settings/api-keys) and a Gemini key from [aistudio.google.com](https://aistudio.google.com/apikey). `GOOGLE_GENAI_USE_VERTEXAI=FALSE` keeps ADK on the AI Studio key path instead of trying to authenticate against a GCP project; `main` defaults it for you if it is unset.

Your output varies. Structure looks like this:

```text
Steel + Google ADK Starter
============================================================
Session: https://app.steel.dev/sessions/ab12cd34...
    navigate: 1612ms
    snapshot: 487ms (3821 chars, 48 links)
    extract: 394ms (5 rows)

Agent finished.

{
  "stories": [
    {
      "rank": 1,
      "title": "Show HN: ...",
      "url": "https://example.com/...",
      "points": 412
    },
    ...
  ]
}

Releasing Steel session...
Session released. Replay: https://app.steel.dev/sessions/ab12cd34...
```

A run takes ~20 to 40 seconds and a handful of agent turns on Hacker News. Cost is a few cents of Steel session time plus Gemini tokens. The `finally` block in `main` closes Playwright and calls `steel.sessions.release()` so Steel stops billing per minute.

## Make it yours

- **Swap the model.** Change `MODEL`. Any Gemini that ADK reaches through the same API key works without code changes, since the tool schemas are generated from the functions. Heavier reasoning models trade latency for fewer wrong turns.
- **Swap the task.** Edit the prompt passed to `run_agent` and the `TopStories` / `Story` models. The tools stay the same; the agent re-plans against the new shape.
- **Add a tool.** Write another `async def` with type hints and a docstring, then append it to `tools=[...]`. A useful fourth is `click(selector: str)` that calls `page.click` and waits for navigation.
- **Carry state across turns.** The `InMemorySessionService` keeps history under one `session_id`, so calling `run_agent` again with the same id continues the conversation. Swap in a `DatabaseSessionService` to persist it.
- **Run more agents.** Build a Steel session and `_PAGE` per task and run them on separate ADK sessions. Since `_PAGE` is module-level here, give each concurrent run its own page object rather than sharing one.

## Related

[Steel + Genkit (Go)](../genkit) · [Steel + Pydantic AI (Python)](../pydantic-ai) · [Google ADK Python documentation](https://google.github.io/adk-docs/)
