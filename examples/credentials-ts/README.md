# Credentials API

Steel's credentials vault stores usernames and passwords against an origin. When a session opts in, Steel watches for sign-in forms on that origin, fills them, and submits them. Your automation has no login code, and it never handles the password while it runs.

Two API calls wire it up. First, save the credential once:

```typescript
await client.credentials.create({
  origin: "https://practice.expandtesting.com",
  value: { username: "practice", password: "SuperSecretPassword!" },
});
```

The demo signs in to [practice.expandtesting.com](https://practice.expandtesting.com/login), a public practice site that shows this login on its sign-in page.

Then opt the session in:

```typescript
session = await client.sessions.create({
  credentials: {},
});
```

That empty object is the opt-in. Without it, the vault exists but the session ignores it. With it, Steel matches the page's origin against stored credentials, fills the username and password when a sign-in form appears, and submits the form.

After that, drive the browser with Playwright as usual. The demo opens the sign-in page and waits for the page that only a signed-in user sees:

```typescript
await page.goto(`${ORIGIN}/login`);
await page.waitForURL(`${ORIGIN}/secure`, { timeout: 20_000 });

const message = await page.locator("#flash b").innerText();
console.log(`Steel signed in. The site says: ${message}`);
```

Wait for a sign that the login worked, like this URL, not for the filled fields. Steel submits the form as soon as it fills it, so the page usually moves on before your code can read the fields. A filled field also does not prove that the site accepted the login.

Credentials are per origin, so create one for each site you automate. Calling `credentials.create` for an origin that already has a credential throws a `Steel.ConflictError` (HTTP 409). The demo catches it, so you can run the script again.

## Run it

```bash
cd examples/credentials-ts
cp .env.example .env          # set STEEL_API_KEY
npm install
npm start
```

Get a key at [app.steel.dev/settings/api-keys](https://app.steel.dev/settings/api-keys). The script prints a session viewer URL as it starts. Open it in another tab to watch Steel fill the form.

Your output varies. A first run printed:

```text
Steel + Credentials Starter
============================================================

Storing credential...
Credential stored.
Creating Steel session...
Steel Session created!
View session at https://app.steel.dev/sessions/a7d3f15e-d3a8-4610-8fd9-4122f6d7920e
Connected to browser via Playwright
Steel signed in. The site says: You logged into a secure area!
Releasing session...
Session released
Done!
```

On a second run the credential already exists, so you see `Credential already exists, moving on.` instead of `Credential stored.` The rest is the same. A run takes about 10 seconds.

## Make it yours

- **Swap the target site.** Change `ORIGIN` and the `value` in `credentials.create`, then wait for a page or an element that only a signed-in user of your site sees. Steel fills a `<form>` that has a username and a password field, and it skips a form that submits to another origin.
- **Manage credentials out of band.** `client.credentials.list()`, `client.credentials.update(...)`, and `client.credentials.delete({ origin })` let you rotate or audit stored credentials without touching automation code. To change a stored password, call `update`. Running this script again keeps the old value.
- **Tune the fill.** Pass options in `credentials`. `autoSubmit: false` fills the form without submitting it, `blurFields` controls whether Steel hides the filled values from vision models, and `origins` limits which stored credentials the session may fill.
- **Combine with other options.** Pass `useProxy`, `solveCaptcha`, or `timeout` alongside `credentials: {}` in `sessions.create()`. The vault works with every other session option.

## When to use this vs. auth-context

Both recipes persist login across runs. They solve it differently:

- **Credentials (this recipe)** stores username and password. Steel re-authenticates each session by filling the login form. Works for any site with a standard form; the login UI runs every time.
- **[auth-context](../auth-context-ts)** captures cookies and localStorage from an already-authenticated session and replays them into the next one. Skips the login form entirely, but the context expires when the site's session does and needs to be recaptured.

Reach for credentials when you want a stable, long-lived setup tied to an account. Reach for auth-context when the site uses flows the vault cannot drive, such as SSO, magic links, or codes sent by email or SMS, and you only need the resulting cookies.

## Related

[auth-context](../auth-context-ts) (cookie and localStorage replay) · [Steel credentials docs](https://steel.dev/docs/features/credentials) · [Playwright docs](https://playwright.dev)
