# Credentials API (TypeScript)

A Steel credential is a username and password stored against a website's origin. When a session opts in, Steel watches each page for a sign-in form on that origin, fills it, and submits it. Your script holds no login code, and the API never returns the stored password.

Two calls wire it up. First, store the credential:

```typescript
await client.credentials.create({ origin, value, namespace, projectId });
```

`origin` is the sign-in page's scheme and host (`https://steel.dev` here), and `value` is `{ username, password }`. The `namespace` is a label that keeps one set of logins apart from another. `index.ts` makes a new one on every run so it never collides with a credential you already have. Leave it out and Steel uses `default`.

Then opt the session in, with the same namespace:

```typescript
await withSession({ namespace, credentials: {} }, async session => {
  const browser = await chromium.connectOverCDP(session.websocketUrl);
  // ...
  await page.goto(`${origin}/practice/login`);
  await page.waitForURL(`${origin}/practice/secure`, { timeout: 30_000 });
});
```

The empty `credentials` object is the opt-in. Without it, the session ignores every stored credential. The script only opens Steel's practice sign-in page and waits for the page behind the login. Nothing in between types a username or clicks a button.

`withSession` in `common.ts` creates the session, prints its viewer URL, and releases it when your code finishes, even if it throws.

## Run it

```bash
cd examples/credentials-ts
cp .env.example .env          # set STEEL_API_KEY
npm install
npm start
```

Get a key at [app.steel.dev/settings/api-keys](https://app.steel.dev/settings/api-keys). `STEEL_PROJECT_ID` is only for organization-scoped keys. Leave it empty otherwise.

Open the session viewer URL in another tab to watch the form fill. Your output varies. Structure looks like this:

```text
Storing the credential...
Session viewer: https://app.steel.dev/sessions/ab12cd34...
Signed in. Now at https://steel.dev/practice/secure
Session released.
Credential deleted.
```

The run costs a few cents of browser time. If `waitForURL` times out, the form stayed empty. The usual causes are a session namespace that differs from the credential's, or an origin that does not match the page exactly. A subdomain is a different origin.

## Two more scripts

`npm run crud` walks the rest of the API in `credentials.ts`: create, update, list, delete. One detail is easy to miss. `additionalOrigins` lets a credential fill on a second origin, such as a separate `login.` host, and the list you send replaces the stored one.

`npm run fill` shows how to decide for yourself when a form is filled. `fill-form.ts` turns automatic fill off, asks Steel which sign-in forms it sees, and fills one of them on request:

```typescript
const { frames } = await steel.detect({ origin, checkCredentials: true });
const frame = frames.find(f => f.origin === origin && f.groups.length > 0);

const result = await steel.fill({
  origin,
  frameId: frame.frameId,
  documentId: frame.documentId,
  groupId: frame.groups[0].groupId,
  submit: false,
});
```

`steel` comes from `wrapCDPSession` in the SDK, which adds typed Steel commands to a Playwright CDP session. This script and `crud` use a made-up login on a made-up `.example.test` origin. `openLoginForm` in `browser.ts` has Playwright serve the sign-in page from inside the session, so that login never reaches a real website.

## Make it yours

- **Swap the site.** Change `origin` and `value` in `index.ts`, then the two URLs. Steel finds the form as long as the page has a standard username and password field.
- **Store once, use many times.** `index.ts` deletes its credential so the recipe leaves nothing behind. In an app, create the credential in a setup script and keep only the session code in your automation.
- **Keep the click.** Pass `credentials: { autoSubmit: false }` when you want Steel to fill the form and your own code to submit it.
- **Limit where it fills.** `credentials: { origins: [...] }` stops a free-roaming agent from filling logins on any other site.

## When to use this vs. auth-context

Both recipes get a session past a login. They do it differently:

- **Credentials (this recipe)** stores a username and password. Steel signs in again in each session by filling the form. It works for any site with a standard form, and the login page runs every time.
- **[auth-context](../auth-context-ts)** captures cookies and local storage from a session that is already signed in and replays them into the next one. It skips the form, but stops working when the site's own session expires.

Use credentials for a stable, long-lived setup tied to an account. Use auth-context when the site signs in with something a form fill cannot drive (SSO, passkeys, magic links) and you only need the resulting cookies.

## Related

[Vaults](../credential-vaults-ts) (group credentials and bind them to a session) · [One Vault per user](../credential-multi-user-ts) · [Profiles with credentials](../credential-profiles-ts) · [Python version](../credentials-py) · [Playwright docs](https://playwright.dev)
