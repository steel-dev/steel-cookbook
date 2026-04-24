# Agno Starter (Python)

Agno's primitive is `Agent(model=..., tools=[...])`. Tools are typed Python methods grouped into a `Toolkit` subclass; docstrings and type hints become the JSON schema the model sees. No manual function-calling boilerplate, no separate tool-registration step.

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

`agent.run` starts a loop: read the task, pick a tool, call it, read the result, decide the next step. Steel is invisible to the model. It sees four Python methods (`navigate_to`, `screenshot`, `get_page_content`, `close_session`) and calls them as it works.

## The toolkit contract

`SteelTools` subclasses `agno.tools.Toolkit`. The constructor appends bound methods to a `tools` list and passes it to `super().__init__`:

```python
tools: List[Any] = []
tools.append(self.navigate_to)
tools.append(self.screenshot)
tools.append(self.get_page_content)
tools.append(self.close_session)

super().__init__(name="steel_tools", tools=tools, **kwargs)
```

Each method looks like a plain Python function. Agno reads the signature and docstring to build the schema:

```python
def navigate_to(self, url: str, connect_url: Optional[str] = None) -> str:
    """Navigates to a URL.

    Args:
        url (str): The URL to navigate to
        connect_url (str, optional): The connection URL from an existing session

    Returns:
        JSON string with navigation status
    """
```

That is the whole contract. The model sees `navigate_to(url, connect_url=None)` with the docstring as description, and calls it with arguments it picks itself.

## Lazy sessions

`_ensure_session` and `_initialize_browser` defer the Steel session and Playwright connection until the first tool call. If the task turns out to be answerable without a browser, no session is ever created and nothing is billed.

```python
def _ensure_session(self):
    if not self._session:
        self._session = self.client.sessions.create()
        self._connect_url = f"{self._session.websocket_url}&apiKey={self.api_key}"
```

When `_initialize_browser` fires, it calls `sync_playwright().start()`, connects over CDP with `chromium.connect_over_cdp(self._connect_url)`, reuses the existing context and page Steel already opened, and caches everything on `self`. Every subsequent tool call picks up the same browser handle.

## Run it

```bash
cd examples/agno
cp .env.example .env          # set STEEL_API_KEY and OPENAI_API_KEY
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python main.py
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

A run is a handful of tool calls (two `navigate_to`, two `get_page_content`, one `close_session`) plus whatever reasoning tokens `gpt-5-nano` spends in between. Expect ~30 seconds and a few cents of Steel session time.

## Cleanup matters

Steel bills per session-minute. The `finally` block in `main()` calls `tools.close_session()`, which releases the session even when the agent crashes mid-run:

```python
try:
    response = agent.run(TASK)
    ...
finally:
    tools.close_session()
```

`close_session` tears down Playwright and the browser handle via `_cleanup`, then calls `self.client.sessions.release(self._session.id)` so Steel can shut down the remote Chrome. Skipping either keeps the session live until Steel's 5-minute idle timeout fires.

## Make it yours

- **Change the task.** Set `TASK` in `.env` or edit the default in `main.py`. Something like "Go to example.com, log in with these credentials, extract the invoice table." The agent sequences tool calls on its own.
- **Add tools.** Append any method to the `tools` list in `SteelTools.__init__`: `click_selector(selector)`, `fill_form(field, value)`, `wait_for_text(text)`. Typed signature plus docstring, Agno handles the rest.
- **Turn on stealth.** Pass flags to `self.client.sessions.create()` inside `_ensure_session`: `use_proxy=True`, `solve_captcha=True`, `session_timeout=600000`.
- **Swap the model.** `OpenAIChat(id="gpt-5-nano", ...)` is cheap and fast. Agno also ships `agno.models.anthropic.Claude` and others; the toolkit stays the same.

## Related

[Agno docs](https://docs.agno.com) · [Steel sessions API](https://app.steel.dev)
