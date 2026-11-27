// https://github.com/steel-dev/steel-cookbook/tree/main/examples/credential-profiles-ts
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { wrapCDPSession } from 'steel-sdk/cdp';
import type { Browser, BrowserContext, Page } from 'playwright';
import type { Session } from 'steel-sdk/resources/sessions';
import { connect, main, withSession, type Scope } from './common.ts';
import { connectBrowser } from './browser.ts';
import { credentialsFor, visitOrder, withUsers, type User, type UserId } from './users.ts';

const form = `<!doctype html><form method="post" action="/login"><h1>Sign in</h1>
  <label>Email <input id="user" name="username" autocomplete="username"></label>
  <label>Password <input id="pass" name="password" type="password" autocomplete="current-password"></label>
  <button>Sign in</button></form>`;
const timeout = { timeout: 15_000 };
const withFallback = process.argv.includes('--with-vault-fallback');
const accountCookie = 'example_account';

async function mockWebsite(context: BrowserContext, origin: string, users: ReadonlyMap<UserId, User>) {
  assert.match(origin, /^https:\/\/example-[a-f0-9-]+\.example\.test$/);
  const loginURL = `${origin}/login`;
  const accountURL = `${origin}/account`;
  const headers = { 'Content-Security-Policy': "default-src 'none'; form-action 'self'" };

  // Act as the website in Playwright: validate the fake login and issue a cookie.
  // Every unrecognized request is aborted, not passed through to the network.
  await context.route('**/*', async route => {
    const request = route.request();
    const url = request.url();
    const method = request.method();
    if (url === loginURL && method === 'POST') {
      const body = new URLSearchParams(request.postData() ?? '');
      const user = [...users.values()].find(u => u.value.username === body.get('username') && u.value.password === body.get('password'));
      if (!user) return route.fulfill({ status: 401, headers, body: 'Synthetic sign-in failed' });
      return route.fulfill({
        contentType: 'text/html',
        headers: { ...headers, 'set-cookie': `${accountCookie}=${user.id}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=600` },
        body: '<h1 id="signed-in">Synthetic sign-in accepted</h1>',
      });
    }
    if (url === loginURL && method === 'GET') {
      return route.fulfill({ contentType: 'text/html', headers, body: form });
    }
    if (url === accountURL && method === 'GET') {
      const cookies = ((await request.allHeaders()).cookie ?? '').split(/;\s*/);
      const user = [...users.values()].find(u => cookies.includes(`${accountCookie}=${u.id}`));
      if (!user) return route.fulfill({ status: 401, headers, body: 'No synthetic session cookie' });
      return route.fulfill({ contentType: 'text/html', headers, body: `<h1 id="account">${user.id}</h1>` });
    }
    return route.abort();
  });
}

async function expectSignedIn(page: Page, origin: string, expectedId: UserId) {
  await page.goto(`${origin}/account`, timeout);
  assert.equal(await page.locator('#account').textContent(timeout), expectedId);
}

async function submit(page: Page, origin: string, expectedId: UserId) {
  await page.getByRole('button', { name: 'Sign in' }).click(timeout);
  await page.locator('#signed-in').waitFor(timeout);
  // Navigate explicitly so Playwright intercepts each request independently.
  await expectSignedIn(page, origin, expectedId);
}

async function signInWithVault(page: Page, browser: Browser, origin: string, user: User) {
  const { steel } = wrapCDPSession(await browser.newBrowserCDPSession());
  await steel.setControls({ autofill: false, autoSubmit: false });
  await page.goto(`${origin}/login`, timeout);
  await page.bringToFront();
  const result = await steel.fill({ origin, submit: false });
  assert.equal(result.submitted, false);
  await submit(page, origin, user.id);
}

async function waitForProfile(scope: Scope, id: string) {
  const deadline = Date.now() + 60_000;
  do {
    const profile = await scope.client.profiles.get(id, { projectId: scope.projectId });
    if (profile.status === 'READY') return;
    if (profile.status !== 'UPLOADING') break;
    await delay(2_000);
  } while (Date.now() < deadline);
  throw new Error('Profile did not become ready');
}

await main(async () => {
  const scope = await connect();
  await withUsers(scope, async (origin, users) => {
    async function visit(session: Session, run: (page: Page, browser: Browser) => Promise<void>) {
      const browser = await connectBrowser(session, scope.key);
      try {
        const context = browser.contexts()[0];
        await mockWebsite(context, origin, users);
        const page = context.pages()[0] ?? await context.newPage();
        await run(page, browser);
      } finally {
        await browser.close();
      }
    }

    try {
      for (const user of users.values()) {
        // A profile saved with Steel credentials can restore cookies, but cannot
        // fill again. Bootstrap without the Vault when resumption needs fallback.
        const credentials = withFallback ? undefined : credentialsFor(user, origin);
        await withSession(scope, { persistProfile: true, credentials }, async session => {
          assert(session.profileId, 'Missing profile ID');
          user.profileId = session.profileId;
          await visit(session, async (page, browser) => {
            if (!withFallback) return signInWithVault(page, browser, origin, user);

            // Manual sign-in is only for the clean bootstrap, using fake values.
            await page.goto(`${origin}/login`, timeout);
            await page.locator('#user').fill(user.value.username, timeout);
            await page.locator('#pass').fill(user.value.password, timeout);
            await submit(page, origin, user.id);
          });
        });
        // Profile upload starts when the session is released.
        assert(user.profileId, 'Missing saved profile ID');
        await waitForProfile(scope, user.profileId);
      }

      for (const id of visitOrder) {
        const user = users.get(id);
        assert(user?.profileId, 'Missing user profile');
        const credentials = withFallback ? credentialsFor(user, origin) : undefined;
        // Use the saved profile without persisting changes made by this session.
        await withSession(scope, { profileId: user.profileId, credentials }, session =>
          visit(session, async (page, browser) => {
            await expectSignedIn(page, origin, id);
            console.log(`Resumed ${id}'s synthetic account from their own profile.`);
            if (withFallback) {
              // Simulate a site logout and use only this user's Vault to sign in again.
              await page.context().clearCookies({ name: accountCookie });
              await signInWithVault(page, browser, origin, user);
              console.log(`Signed ${id} back in using their Vault.`);
            }
          }));
      }
    } finally {
      if (scope.sessionReleased) {
        // Attempt cleanup for every profile even if deleting one fails.
        const profileIds = [...users.values()].flatMap(user => user.profileId ? [user.profileId] : []);
        const results = await Promise.allSettled(profileIds.map(async profileId => {
          try {
            await scope.client.profiles.delete(profileId, { projectId: scope.projectId });
          } catch (error) {
            console.error(`Check cleanup for profile ${profileId}.`);
            throw error;
          }
        }));
        assert(results.every(result => result.status === 'fulfilled'), 'Profile cleanup incomplete');
      }
    }
  });
});
