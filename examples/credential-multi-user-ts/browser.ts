// https://github.com/steel-dev/steel-cookbook/tree/main/examples/credential-multi-user-ts
import { chromium } from 'playwright';
import { wrapCDPSession } from 'steel-sdk/cdp';
import type { Session } from 'steel-sdk/resources/sessions';

const loginPage = `<!doctype html>
<form method="post" action="/not-sent">
  <h1>Sign in</h1>
  <label>Email <input id="user" name="username" autocomplete="username"></label>
  <label>Password <input id="pass" name="password" type="password" autocomplete="current-password"></label>
  <button>Sign in</button>
</form>`;

// Opens a sign-in form that exists only inside this browser session. Playwright
// answers the page request itself, so no login is ever sent to a real website.
export async function openLoginForm(session: Session, origin: string) {
  // websocketUrl already holds a token for this session, so it needs no API key.
  const browser = await chromium.connectOverCDP(session.websocketUrl);
  const context = browser.contexts()[0];
  const page = context.pages()[0] ?? await context.newPage();

  // wrapCDPSession adds Steel's typed credential commands (detect, fill, setControls).
  const { steel } = wrapCDPSession(await browser.newBrowserCDPSession());
  // Turn off automatic fill, so the form stays empty until the script calls fill.
  await steel.setControls({ autofill: false, autoSubmit: false });

  await context.route('**/*', route => {
    const request = route.request();
    if (request.method() !== 'GET' || request.url() !== `${origin}/login`) return route.abort();
    return route.fulfill({
      contentType: 'text/html',
      // The policy stops the form from being submitted anywhere.
      headers: { 'Content-Security-Policy': "default-src 'none'; form-action 'none'" },
      body: loginPage,
    });
  });

  await page.goto(`${origin}/login`);
  await page.bringToFront();
  return { browser, page, steel };
}
