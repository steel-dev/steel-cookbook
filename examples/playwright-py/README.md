# Playwright Starter (Python)

Playwright's Python API ships a CDP attach point, `chromium.connect_over_cdp()`. Point it at the websocket URL a Steel session hands back and your `Page`, `Locator`, and `expect` calls drive a remote browser instead of a local one. No `playwright install`, no headful display, no Chrome on your machine.

The whole connection is three lines inside a `with sync_playwright()` block:

```python
session = client.sessions.create()

playwright = sync_playwright().start()
browser = playwright.chromium.connect_over_cdp(
    f"{session.websocket_url}&apiKey={STEEL_API_KEY}"
)

page = browser.contexts[0].new_page()
```

Two Python-specific details worth calling out. First, this starter uses the **sync API**. Easier to read top-to-bottom and fine for one script at a time; swap in `async_playwright` if you need to fan out concurrent pages. Second, Steel returns a session with a context already attached, so you reuse `browser.contexts[0]` rather than calling `new_context()`. Everything downstream is plain Playwright: `page.locator`, `page.goto(url, wait_until="networkidle")`, XPath selectors.

## Run it

```bash
cd examples/playwright-py
cp .env.example .env          # set STEEL_API_KEY
uv run main.py
```

Grab a key at [app.steel.dev/settings/api-keys](https://app.steel.dev/settings/api-keys). As the script boots it prints a session viewer URL. Open it in a second tab to watch the browser click through Hacker News in real time.

Your output varies. Structure looks like this:

```text
Creating Steel session...
Steel Session created successfully!
You can view the session live at https://app.steel.dev/sessions/ab12cd34…

Connected to browser via Playwright
Navigating to Hacker News...

Top 5 Hacker News Stories:

1. Claude 4.7 Opus released today
   Link: https://news.ycombinator.com/item?id=43218921
   Points: 892

2. Show HN: A browser extension for reading on slow connections
   Link: https://github.com/user/project
   Points: 401

…

Releasing session...
Session released
Done!
```

One run costs a few cents of session time. Steel bills per session-minute, which is why `main()` wraps the script in `try / finally` and calls `client.sessions.release(session.id)` on exit. If you skip that, the session sits idle until the default 5-minute timeout burns through.

## Make it yours

- **Swap the target.** The scraping logic lives between the `Your Automations Go Here!` banner comments in `main.py`. Replace `page.goto` and the `story_rows` loop with your own selectors. Session setup, auth, and teardown stay the same.
- **Harden for anti-bot.** Uncomment `use_proxy`, `solve_captcha`, or `session_timeout` inside `client.sessions.create()` for sites that fingerprint or challenge headless traffic.
- **Go async.** If you need parallel pages, switch `from playwright.sync_api import sync_playwright` to `playwright.async_api` and rewrite `main()` as `async def`. The Steel connection call is identical, just awaited.
- **Persist login.** Carry cookies and local storage between runs with [credentials](../credentials).

## Related

[TypeScript version](../playwright-ts) · [Playwright docs](https://playwright.dev/python)
