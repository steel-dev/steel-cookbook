# Puppeteer Starter (TypeScript)

Puppeteer ships a `connect()` call that attaches to any Chrome exposing a DevTools websocket. Steel sessions expose one. Point Puppeteer at it and the rest of the script is plain Puppeteer: `page.goto`, `page.evaluate`, `page.waitForSelector`, the whole surface area. Stealth, proxies, and the live session viewer come from Steel without extra wiring.

```typescript
session = await client.sessions.create();

browser = await puppeteer.connect({
  browserWSEndpoint: `${session.websocketUrl}&apiKey=${STEEL_API_KEY}`,
});

const page = await browser.newPage();
```

Two notes on the shape here. First, the package is `puppeteer-core`, not `puppeteer`. There's no Chromium to download because the browser lives on Steel. Second, `browser.newPage()` opens a fresh tab in the Steel session; the session viewer starts blank until you navigate.

## Run it

```bash
cd examples/puppeteer-ts
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

Connected to browser via Puppeteer
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

- **Swap the target.** Replace the `page.goto` URL and the `page.evaluate` body in `main()`. Session setup, connect, and cleanup stay the same.
- **Turn on stealth.** Uncomment `useProxy`, `solveCaptcha`, or `sessionTimeout` in the `sessions.create()` call for sites with anti-bot.
- **Persist login.** Reuse cookies and local storage across runs via [credentials](../credentials).

## Related

[Puppeteer docs](https://pptr.dev)
