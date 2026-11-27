// https://github.com/steel-dev/steel-cookbook/tree/main/examples/credentials-ts
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { wrapCDPSession } from 'steel-sdk/cdp';
import type { Session } from 'steel-sdk/resources/sessions';

const cdpHosts = new Set(['api.steel.dev', 'api.steel-edge.net', 'connect.steel.dev', 'connect.steel-edge.net', 'steel-api.fly.dev']);

export async function connectBrowser(session: Session, key: string) {
  const url = new URL(session.websocketUrl);
  // Validate the destination before attaching the API key to the CDP URL.
  assert(url.protocol === 'wss:' && cdpHosts.has(url.hostname) && !url.port && !url.username && !url.password,
    'Unexpected Steel CDP destination');
  url.searchParams.set('apiKey', key);
  url.searchParams.set('sessionId', session.id);
  return chromium.connectOverCDP(url.toString(), { timeout: 20_000 });
}

export async function syntheticForm(session: Session, key: string, origin: string, { autofill = false } = {}) {
  assert.match(origin, /^https:\/\/example-[a-f0-9-]+\.example\.test$/);
  const browser = await connectBrowser(session, key);
  try {
    const context = browser.contexts()[0];
    const page = context.pages()[0] ?? await context.newPage();
    const cdp = wrapCDPSession(await browser.newBrowserCDPSession());
    // Choose automatic or explicit fill before showing the form. Neither mode submits.
    await cdp.steel.setControls({ autofill, autoSubmit: false });
    // Serve the fixture in Playwright and abort every other page request.
    await context.route('**/*', route => {
      const req = route.request();
      if (req.method() !== 'GET' || req.url() !== `${origin}/login`) return route.abort();
      return route.fulfill({
        contentType: 'text/html', headers: { 'Content-Security-Policy': "default-src 'none'; form-action 'none'" },
        body: `<!doctype html><form method="post" action="/not-sent"><h1>Sign in</h1>
          <label>Email <input id="user" name="username" autocomplete="username"></label>
          <label>Password <input id="pass" name="password" type="password" autocomplete="current-password"></label>
          <button>Sign in</button></form>`,
      });
    });
    await page.goto(`${origin}/login`, { timeout: 12_000 });
    await page.bringToFront();
    return { browser, page, cdp };
  } catch (error) {
    await browser.close().catch(() => {});
    throw error;
  }
}
