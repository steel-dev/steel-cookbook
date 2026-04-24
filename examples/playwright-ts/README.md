# Playwright Starter (TypeScript)

Playwright exposes `chromium.connectOverCDP()`, which attaches to any Chrome speaking the Chrome DevTools Protocol. Steel sessions expose one over a websocket. Connect them and your local code drives a remote browser with stealth, proxies, and a live viewer. No Chrome on your machine required.

```typescript
session = await client.sessions.create();

const browser = await chromium.connectOverCDP(
  `${session.websocketUrl}&apiKey=${STEEL_API_KEY}`,
);

const page = browser.contexts()[0].pages()[0];
```

A few lines. Steel returns a context with a page already open, so skip `newContext()` / `newPage()`. Everything after is plain Playwright: selectors, `page.evaluate`, `waitForSelector`, tracing.

## Run it

```bash
cd examples/playwright-ts
cp .env.example .env          # set STEEL_API_KEY
npm install
npm start
```

Get a key at [app.steel.dev/settings/api-keys](https://app.steel.dev/settings/api-keys). The script prints a session viewer URL as it starts. Open it in another tab to watch the browser run live.

Your output varies. Structure looks like this:

```text
Creating Steel session...
Steel Session created!
View session at https://app.steel.dev/sessions/ab12cd34…

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

A run costs a few cents of browser time. Steel bills per session-minute, so the `finally` block that calls `client.sessions.release()` isn't optional. Forgetting it keeps the browser running until the default 5-minute timeout.

## Make it yours

- **Swap the target.** Replace the `page.goto` URL and the `page.evaluate` body in `index.ts`. Session setup, auth, and cleanup stay the same.
- **Turn on stealth.** Uncomment `useProxy`, `solveCaptcha`, or `sessionTimeout` in the `sessions.create()` call for sites with anti-bot.
- **Persist login.** Reuse cookies and local storage across runs via [credentials](../credentials).

## Related

[Python version](../playwright-py) · [Playwright docs](https://playwright.dev)
