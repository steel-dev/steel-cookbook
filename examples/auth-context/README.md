# Auth Context

An auth context is a snapshot of a browser's cookies and local storage at a point in time. Steel exposes one endpoint to read it and one session option to restore it:

```typescript
// Capture: pull the current cookies + localStorage off a live session
const sessionContext = await client.sessions.context(session.id);

// Restore: hand the snapshot to a new session on create
const next = await client.sessions.create({ sessionContext });
```

The snapshot is plain JSON you can store, ship between machines, or diff. Restoring it into a fresh session means the new browser starts already signed in. No login flow, no password prompt, no captcha. Other recipes link here as the primitive for "start already authenticated."

## How the demo works

`index.ts` runs the full round-trip against [practice.expandtesting.com](https://practice.expandtesting.com/login), a public login test site:

1. Create session #1, connect Playwright over CDP, run the `login` helper to submit the form, run `verifyAuth` to confirm the welcome text.
2. Call `client.sessions.context(session.id)` to pull the snapshot, then release session #1.
3. Create session #2 with `sessionContext` set to that snapshot. Connect Playwright, run `verifyAuth` again without logging in. The welcome text is already there.

The second session is a brand new browser on Steel's fleet. It has the auth state because the snapshot restored it, not because anything is shared between sessions on the backend.

## Run it

```bash
cd examples/auth-context
cp .env.example .env          # set STEEL_API_KEY
npm install
npm start
```

Get a key at [app.steel.dev/settings/api-keys](https://app.steel.dev/settings/api-keys). The script prints two session viewer URLs as it runs. Open them in other tabs to watch each browser.

Your output varies. Structure looks like this:

```text
Creating initial Steel session...
Steel Session #1 created!
View session at https://app.steel.dev/sessions/ab12cd34…

Initial authentication successful
Session #1 released

Steel Session #2 created!
View session at https://app.steel.dev/sessions/ef56gh78…

Authentication successfully transferred!
Session #2 released
```

A run takes ~20 seconds and costs a few cents of Steel session time. Both sessions go through `client.sessions.release()` in the `finally` block. Skipping it keeps browsers running until the 5-minute default timeout.

## What's inside the snapshot

The shape returned from `sessions.context()` is an object keyed by origin, with cookies and storage entries for each. Treat it as opaque JSON for transport, and treat it as sensitive: it holds session tokens. Anyone with the blob can impersonate the logged-in user until those tokens expire.

Cookies expire. A snapshot captured today may not work next week, and rarely works next month. If you're persisting contexts to disk or a vault, refresh them on a schedule or re-authenticate on failure.

## When to reach for this

Auth context fits one-shot flows where you already have a way to log in and just want to move the resulting state forward:

- Log in once interactively, capture the context, run headless jobs against it.
- Run an agent that signs in, snapshot at the end, hand the snapshot to the next agent in the pipeline.
- Keep a single "warm" context in memory and spawn short-lived workers from it.

If you want Steel to store credentials and handle the login itself, see [credentials](../credentials). If you need a long-lived named identity that accumulates state across runs (history, extensions, preferences), that's a different primitive.

## Make it yours

- **Swap the target site.** Replace the URLs and selectors in `login` and `verifyAuth`. Everything between the `sessions.context()` capture and the `sessions.create({ sessionContext })` restore stays identical regardless of site.
- **Persist the snapshot.** Write `sessionContext` to a file or secret store after capture. Load it on the next run and pass it straight into `sessions.create()`. Treat the file like a password.
- **Re-auth on failure.** Wrap `verifyAuth` on the restored session in a check: if it returns false, fall back to a fresh login and capture a new snapshot.

## Related

[credentials](../credentials) · [Playwright docs](https://playwright.dev)
