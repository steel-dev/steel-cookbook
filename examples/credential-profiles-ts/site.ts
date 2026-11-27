// https://github.com/steel-dev/steel-cookbook/tree/main/examples/credential-profiles-ts
import type { BrowserContext, Page } from 'playwright';
import type { User } from './users.ts';

const cookieName = 'example_account';
const loginPage = `<!doctype html>
<form method="post" action="/login">
  <h1>Sign in</h1>
  <label>Email <input id="user" name="username" autocomplete="username"></label>
  <label>Password <input id="pass" name="password" type="password" autocomplete="current-password"></label>
  <button>Sign in</button>
</form>`;

// A tiny website that exists only inside the browser session. Playwright answers
// every request itself: it checks the login, sets a cookie, and shows an account
// page to whoever holds that cookie. Nothing is sent to a real website.
export async function mockWebsite(context: BrowserContext, origin: string, users: User[]) {
  const headers = { 'Content-Security-Policy': "default-src 'none'; form-action 'self'" };

  await context.route('**/*', async route => {
    const request = route.request();
    const url = request.url();
    const method = request.method();

    if (url === `${origin}/login` && method === 'GET') {
      return route.fulfill({ contentType: 'text/html', headers, body: loginPage });
    }

    if (url === `${origin}/login` && method === 'POST') {
      const form = new URLSearchParams(request.postData() ?? '');
      const user = users.find(u =>
        u.value.username === form.get('username') && u.value.password === form.get('password'));
      if (!user) return route.fulfill({ status: 401, headers, body: 'Wrong username or password' });
      return route.fulfill({
        contentType: 'text/html',
        headers: { ...headers, 'set-cookie': `${cookieName}=${user.id}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=600` },
        body: '<h1 id="signed-in">Signed in</h1>',
      });
    }

    if (url === `${origin}/account` && method === 'GET') {
      const cookies = ((await request.allHeaders()).cookie ?? '').split(/;\s*/);
      const user = users.find(u => cookies.includes(`${cookieName}=${u.id}`));
      if (!user) return route.fulfill({ status: 401, headers, body: 'Not signed in' });
      return route.fulfill({ contentType: 'text/html', headers, body: `<h1 id="account">${user.id}</h1>` });
    }

    return route.abort();
  });
}

// Opens the account page and returns whose account it is. Fails if nobody is signed in.
export async function accountOwner(page: Page, origin: string) {
  await page.goto(`${origin}/account`);
  return page.locator('#account').textContent({ timeout: 15_000 });
}

export async function clickSignIn(page: Page) {
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.locator('#signed-in').waitFor({ timeout: 15_000 });
}

// What a site does when its own session expires: the cookie is gone.
export async function signOut(page: Page) {
  await page.context().clearCookies({ name: cookieName });
}
