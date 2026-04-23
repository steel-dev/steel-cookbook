# Playwright Starter (TypeScript)

Run Playwright scripts on a cloud browser instead of local Chromium — no infra to manage. The starter scrapes the top 5 Hacker News stories in under 10 seconds to prove it works.

## The idea

Playwright exposes `chromium.connectOverCDP()`, which attaches to any Chrome speaking the Chrome DevTools Protocol. Steel sessions expose one over a websocket. Connect them and your local code drives a remote browser with stealth, proxies, and a live viewer — without any Chrome on your machine.

```typescript
session = await client.sessions.create();

const browser = await chromium.connectOverCDP(
  `${session.websocketUrl}&apiKey=${STEEL_API_KEY}`,
);

const page = browser.contexts()[0].pages()[0];
```

Three lines. Steel returns a context with a page already open, so skip `newContext()` / `newPage()`. Everything after — selectors, `page.evaluate`, `waitForSelector`, tracing — is plain Playwright.

## Run it

```bash
cd examples/playwright-ts
cp .env.example .env          # set STEEL_API_KEY
npm install
npm start
```

Get a key at [app.steel.dev/settings/api-keys](https://app.steel.dev/settings/api-keys). The script prints a session viewer URL as it starts — open it in another tab to watch the browser run live.

You'll see something like:

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

A run costs a few cents of browser time. Steel bills per session-minute, so the `finally` block that calls `client.sessions.release()` isn't optional — forgetting it keeps the browser running until the default 5-minute timeout.

## Make it yours

- **Swap the target.** Replace the Hacker News URL and the `page.evaluate` body in `index.ts` (lines 72–96). Session setup, auth, and cleanup stay the same.
- **Turn on stealth.** Uncomment `useProxy`, `solveCaptcha`, or `sessionTimeout` in `sessions.create()` (lines 40–48) for sites with anti-bot.
- **Persist login.** Reuse cookies and local storage across runs via [credentials](../credentials).

## Related

[Playwright × Steel integration](https://docs.steel.dev/integrations/playwright) · [Python version](../playwright-py)
