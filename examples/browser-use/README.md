# Browser Use Starter (Python)

Browser Use is an agent framework: you give it an LLM, a browser, and a natural-language `task`, and it runs a perception-plan-act loop until the task is done. It doesn't need selectors or scripted steps. The model reads the page, decides the next action, and executes it against the browser you give it. The browser in this recipe is a Steel session, so the agent runs on managed cloud Chrome with stealth, proxies, and a live viewer instead of local Chromium.

```python
session = client.sessions.create()
cdp_url = f"{session.websocket_url}&apiKey={STEEL_API_KEY}"

model = ChatOpenAI(model="gpt-5", api_key=OPENAI_API_KEY)
agent = Agent(
    task=TASK,
    llm=model,
    browser_session=BrowserSession(cdp_url=cdp_url),
)

result = await agent.run()
```

`BrowserSession(cdp_url=...)` is the entire integration. Browser Use attaches to whatever Chrome is speaking the Chrome DevTools Protocol at that URL. No launcher, no `playwright.chromium.launch()`, no local browser binary.

## Run it

```bash
cd examples/browser-use
cp .env.example .env          # set STEEL_API_KEY and OPENAI_API_KEY
uv run main.py
```

Keys from [app.steel.dev](https://app.steel.dev/settings/api-keys) and [platform.openai.com](https://platform.openai.com/api-keys). A session viewer URL prints as the script starts. Open it in another tab to watch the agent click through the task in real time.

Your output varies. Structure looks like this:

```text
Starting Steel browser session...
Steel Session created!
View session at https://app.steel.dev/sessions/ab12cd34…

Executing task: Go to Wikipedia and search for machine learning
============================================================
 INFO     [Agent] Step 1: navigate to https://www.wikipedia.org
 INFO     [Agent] Step 2: input "machine learning" into search box
 INFO     [Agent] Step 3: click search button
 INFO     [Agent] Step 4: done
============================================================
TASK EXECUTION COMPLETED
Duration: 38.2 seconds

Releasing Steel session...
Session completed. View replay at https://app.steel.dev/sessions/ab12cd34…
```

A run costs a few cents of Steel session time plus OpenAI tokens for each step the agent takes (screenshots go to the model on every iteration, so token usage scales with task length). The `finally` block that calls `client.sessions.release()` isn't optional. Steel bills per session-minute and skipping release keeps the browser running until the default 5-minute timeout.

## Make it yours

- **Change the task.** Set `TASK` in `.env` or edit the default in `main.py`. Any sentence works: "log in to example.com and download the latest invoice PDF", "compare prices for the top 3 vacuum cleaners on Amazon", "fill out the contact form at acme.com with these fields". Long tasks are fine; the agent breaks them into steps on its own.
- **Turn on stealth.** Add `use_proxy=True`, `solve_captcha=True`, or `session_timeout=1800000` to the `sessions.create()` call for sites with anti-bot. Tasks that navigate logged-in areas usually need longer timeouts than the 5-minute default.
- **Swap the model.** `ChatOpenAI(model="gpt-5", ...)` is the default; Browser Use also ships `ChatAnthropic`, `ChatGoogle`, and others. Change the import and the `model` arg passed to `Agent`.
- **Persist login.** Reuse cookies and local storage across runs via [credentials](../credentials) so the agent doesn't have to sign in every time.

## Related

[Browser Use docs](https://docs.browser-use.com)
