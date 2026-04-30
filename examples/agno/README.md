# Agno Starter (Python)

Agno's primitive is `Agent(model=..., tools=[...])`. Tools are typed Python methods grouped into a `Toolkit` subclass; docstrings and type hints become the JSON schema the model sees.

This recipe wraps a Steel browser in a `SteelTools` toolkit, hands it to an Agent, and lets the model drive the session by picking which method to call and filling in arguments on its own.

```python
tools = SteelTools(api_key=STEEL_API_KEY)
agent = Agent(
    name="Web Scraper",
    model=OpenAIChat(id="gpt-5-nano", api_key=OPENAI_API_KEY),
    tools=[tools],
    instructions=[
        "Extract content clearly and format nicely",
        "Always close sessions when done",
    ],
    markdown=True,
)

response = agent.run(TASK)
```

`SteelTools` subclasses `agno.tools.Toolkit` and registers four bound methods (`navigate_to`, `screenshot`, `get_page_content`, `close_session`). `_ensure_session` and `_initialize_browser` defer the Steel session and Playwright connection until the first tool call, so a task that doesn't need a browser never creates one.

## Run it

```bash
cd examples/agno
cp .env.example .env          # set STEEL_API_KEY and OPENAI_API_KEY
uv run main.py
```

Get keys from [app.steel.dev](https://app.steel.dev/settings/api-keys) and [platform.openai.com](https://platform.openai.com/api-keys). The default task scrapes [quotes.toscrape.com](https://quotes.toscrape.com) across two pages.

Your output varies. Structure looks like this:

```text
Steel + Agno Starter
============================================================

Results:

**Page 1:**
1. "The world as we have created it is a process of our thinking..." - Albert Einstein
2. "It is our choices, Harry, that show what we truly are..." - J.K. Rowling
3. "There are only two ways to live your life..." - Albert Einstein

**Page 2:**
4. "This life is what you make it..." - Marilyn Monroe
5. "It takes courage to grow up and become who you really are." - E.E. Cummings

Done!
```

The `finally` block in `main()` calls `tools.close_session()`, which releases the session even when the agent crashes mid-run.

## Make it yours

- **Change the task.** Set `TASK` in `.env` or edit the default in `main.py`.
- **Add tools.** Append any method to the `tools` list in `SteelTools.__init__`: `click_selector(selector)`, `fill_form(field, value)`, `wait_for_text(text)`. Typed signature plus docstring, Agno handles the rest.
- **Turn on stealth.** Pass flags to `self.client.sessions.create()` inside `_ensure_session`: `use_proxy=True`, `solve_captcha=True`, `session_timeout=600000`.
- **Swap the model.** `OpenAIChat(id="gpt-5-nano", ...)` is cheap and fast. Agno also ships `agno.models.anthropic.Claude` and others; the toolkit stays the same.

## Related

[Agno docs](https://docs.agno.com) · [Agno on GitHub](https://github.com/agno-agi/agno)
