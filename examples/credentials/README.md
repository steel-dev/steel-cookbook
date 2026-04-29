# Credentials API

Steel's credentials vault stores usernames and passwords against an origin. When a session opts in, Steel watches for login forms on that origin and fills them for you. No login code in your automation, no plaintext passwords in env vars, no custom storage for cookies.

Two API calls wire it up. First, save the credential once:

```typescript
await client.credentials.create({
  origin: "https://demo.testfire.net",
  value: { username: "admin", password: "admin" },
});
```

Then opt the session in:

```typescript
session = await client.sessions.create({
  credentials: {},
});
```

That empty object is the opt-in. Without it, the vault exists but the session ignores it. With it, Steel matches the page's origin against stored credentials and types them in when a login form appears.

After that, drive the browser with Playwright as usual. The demo navigates to the Altoro Mutual test site, clicks `#AccountLink` to open the login form, and checks the heading to confirm the fill worked:

```typescript
await page.goto("https://demo.testfire.net", { waitUntil: "networkidle" });
await page.click("#AccountLink");
await setTimeout(2000);

const headingText = await page.textContent("h1");
if (headingText?.trim() === "Hello Admin User") {
  console.log("Success, you are logged in");
}
```

The `setTimeout(2000)` gives Steel room to fill and submit the form. In a real script you would swap that for `page.waitForURL` or a selector wait tied to a post-login element.

Credentials are per-origin. Create one per site you automate. Re-calling `credentials.create` for an origin that already has a credential throws `Credential already exists`, which the demo swallows so the script is idempotent.

## Run it

```bash
cd examples/credentials
cp .env.example .env          # set STEEL_API_KEY
npm install
npm start
```

Get a key at [app.steel.dev/settings/api-keys](https://app.steel.dev/settings/api-keys). The script prints a session viewer URL as it starts. Open it in another tab to watch the auto-fill happen.

Your output varies. Structure looks like this:

```text
Creating credential...
Creating Steel session...
Steel Session created!
View session at https://app.steel.dev/sessions/ab12cd34...

Connected to browser via Playwright
Success, you are logged in
Releasing session...
Session released
Done!
```

On a second run the credential already exists, so you see `Credential already exists, moving on.` before the session starts. The behavior is otherwise identical.

## Make it yours

- **Swap the target site.** Change the `origin` and `value` in `credentials.create`, then update `page.goto` and the login-trigger click in `index.ts`. Steel handles the form detection as long as the page exposes a standard username/password input pair.
- **Manage credentials out of band.** `client.credentials.list()`, `client.credentials.retrieve(id)`, and `client.credentials.delete(id)` let you rotate or audit stored creds without touching automation code. Create credentials from a setup script and keep `index.ts` focused on the workflow.
- **Combine with stealth.** Pass `useProxy`, `solveCaptcha`, or `sessionTimeout` alongside `credentials: {}` in `sessions.create()`. The vault works with every other session option.

## When to use this vs. auth-context

Both recipes persist login across runs. They solve it differently:

- **Credentials (this recipe)** stores username and password. Steel re-authenticates each session by filling the login form. Works for any site with a standard form; the login UI runs every time.
- **[auth-context](../auth-context)** captures cookies and localStorage from an already-authenticated session and replays them into the next one. Skips the login form entirely, but the context expires when the site's session does and needs to be recaptured.

Reach for credentials when you want a stable, long-lived setup tied to an account. Reach for auth-context when the site uses flows the vault cannot drive (SSO, MFA prompts, magic links) and you only need the resulting cookies.

## Related

[auth-context](../auth-context) (cookie and localStorage replay) · [Playwright docs](https://playwright.dev)
