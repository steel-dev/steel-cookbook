# Browser Use Starter (Python)

Browser Use is an agent framework: you give it an LLM, a browser, and a natural-language `task`, and it runs a perception-plan-act loop until the task is done. It does not need selectors or scripted steps. The model reads the page, decides the next action, and executes it against the browser you give it. The browser in this recipe is a Steel session, so the agent runs on managed cloud Chrome with stealth, proxies, and a live viewer instead of local Chromium.

```python
session = client.sessions.create()
cdp_url = session.websocket_url

model = ChatOpenAI(model="gpt-6.1-sol", api_key=OPENAI_API_KEY)
agent = Agent(
    task=TASK,
    llm=model,
    browser=Browser(cdp_url=cdp_url),
)

result = await agent.run()
```

`Browser(cdp_url=...)` is the entire integration. Browser Use attaches to whatever Chrome is speaking the Chrome DevTools Protocol at that URL. No launcher, no `playwright.chromium.launch()`, no local browser binary.

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
INFO     [browser_use.agent.service] Task: Go to Wikipedia and search for machine learning (workspace …)
INFO     [browser_use.agent.loop] step 1: goto_url("https://www.wikipedia.org")
INFO     [browser_use.agent.loop] step 2: # Find the search input and type "machine learning"
INFO     [browser_use.agent.service] completed in 4 steps, 31s

============================================================
TASK EXECUTION COMPLETED
============================================================
Duration: 36.5 seconds
Task: Go to Wikipedia and search for machine learning
Result:
I searched Wikipedia for "machine learning" and opened the Machine learning article.
============================================================
Releasing Steel session...
Session completed. View replay at https://app.steel.dev/sessions/ab12cd34…
Done!
```

A run costs a few cents of Steel session time plus OpenAI tokens for each step the agent takes (screenshots go to the model on every iteration, so token usage scales with task length). The `finally` block that calls `client.sessions.release()` is not optional. Steel bills per session-minute and skipping release keeps the browser running until the default 5-minute timeout.

## Make it yours

- **Change the task.** Set `TASK` in `.env` or edit the default in `main.py`. Any sentence works: "sign in to example.com and download the latest invoice PDF", "compare prices for the top 3 vacuum cleaners on Amazon", "fill out the contact form at acme.com with these fields". Long tasks are fine; the agent breaks them into steps on its own.
- **Turn on stealth.** Add `use_proxy=True`, `solve_captcha=True`, or `api_timeout=900000` to the `sessions.create()` call for sites with anti-bot. Tasks that navigate logged-in areas usually need longer timeouts than the 5-minute default.
- **Swap the model.** `ChatOpenAI(model="gpt-6.1-sol", ...)` is the default; Browser Use also ships `ChatAnthropic`, `ChatGoogle`, and others. Change the import and the `model` arg passed to `Agent`.
- **Persist login.** Reuse cookies and local storage across runs via [credentials](../credentials-ts) so the agent does not have to sign in every time.

## Related

[Browser Use docs](https://docs.browser-use.com)
