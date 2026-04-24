A Steel profile is a named, long-lived browser identity. It holds everything a real Chrome user profile accumulates over time: cookies, localStorage, IndexedDB, history, installed extensions, autofill, site permissions. Every session you attach to the profile starts where the last one left off, and writes the user data directory back on release.

Two options on `sessions.create` wire it up. On the first run, mint a fresh profile:

```typescript
session = await client.sessions.create({
  persistProfile: true,
  profileId: undefined,
});

const profileId = session.profileId;
```

`persistProfile: true` tells Steel to snapshot the browser data directory when the session ends. `profileId: undefined` means "create a new one." After the session is created, `session.profileId` holds the identifier. Store it. Every later run passes it back:

```typescript
session = await client.sessions.create({
  persistProfile: true,
  profileId,
});
```

The new browser opens as that identity. `client.profiles.list()`, `client.profiles.retrieve(id)`, and `client.profiles.delete(id)` round out the surface.

## How the demo works

`index.ts` uses [demowebshop.tricentis.com](https://demowebshop.tricentis.com), a public shopping cart demo that stores cart state in cookies. The flow lives in `main()` and three helpers in `utils.ts`:

1. `selectOrCreateProfile` calls `client.profiles.list()`, then `inquirer` prompts you to pick an existing profile or create a new one. Returns `undefined` to signal "mint a fresh one."
2. On a fresh run, Session #1 launches with `persistProfile: true` and no `profileId`. `addItemsToCart` visits three category pages (books, digital downloads, notebooks) and clicks the first add-to-cart button on each. Session #1 releases; Steel writes the profile snapshot.
3. Session #2 launches with the same `profileId`. `checkItemsInCart` opens `/cart` and reads the rows. Same identity, different browser, same cart.

Select the saved profile on a later run and the menu skips step 2 entirely. One session spins up, finds the cart intact, and exits. That is the test: state survives across distinct sessions because the profile carries it.

## Run it

```bash
cd examples/profiles
cp .env.example .env          # set STEEL_API_KEY
npm install
npm start
```

Get a key at [app.steel.dev/settings/api-keys](https://app.steel.dev/settings/api-keys). Session viewer URLs print as the script runs. Open them in other tabs to watch each browser.

Your first-run output varies. Structure looks like this:

```text
Steel Profiles Demo
============================================================
? Select a profile to use: Create a new profile
Steel Session #1 created!
View session at https://app.steel.dev/sessions/ab12cd34...
Profile ID: prof_9f3c...

Successfully logged in
Added item from Book category
Added item from Digital Download category
Added item from Notebook category

3 items in cart
Items added:
  1. Computing and Internet
  2. Music 2
  3. Fiction

Session #1 released

Steel Session #2 created!
View session at https://app.steel.dev/sessions/ef56gh78...
Found 3 items in cart
Found your shopping cart!
Session released
```

Full round-trip takes ~60 seconds. A second run against the saved profile takes ~30 seconds because step 2 is skipped.

Sessions go through `client.sessions.release()` in the `finally` block. Skipping it keeps browsers running until the 5-minute default timeout and delays the profile snapshot.

## What persists

Profiles capture the full Chromium user data directory, not just cookies:

- Cookies and localStorage for every origin you visited.
- Login sessions you kept alive (bank, SaaS dashboard, email).
- IndexedDB entries for apps that cache state client-side.
- Installed extensions and their configuration.
- Autofill, history, bookmarks, site permissions.

Treat the profile like an account. Anyone who can call `sessions.create({ profileId })` on your workspace can drive a browser logged in as you. Rotate or delete with `client.profiles.delete(id)` when the identity is done.

## Make it yours

- **Swap the target site.** Replace the URLs in `login`, `addItemsToCart`, and `checkItemsInCart`. The profile plumbing does not change.
- **Seed a profile interactively.** Create a session with `persistProfile: true`, open the live viewer, sign in by hand, close the session. The profile keeps the login. Every scripted run after that reuses it.
- **One profile per identity.** If you automate three accounts on the same site, create three profiles. Sharing a profile across accounts means one session's writes overwrite another's state on release.
- **Read without writing back.** Pass `persistProfile: false` with an existing `profileId` to load the profile without snapshotting changes on release. Useful for risky runs that might corrupt state.

## Related

Three recipes handle "start the browser already signed in." Pick by lifetime:

- [credentials](../credentials): Steel stores a username and password per origin and fills the login form each session. No browser state persists. Good when the form is standard and you want a stable, long-lived setup.
- [auth-context](../auth-context): one-shot JSON snapshot of cookies and localStorage you capture from one session and replay into the next. Good when you log in once (SSO, MFA, magic link) and want to move the resulting state forward.
- Profiles (this recipe): long-lived named identity that accumulates everything (history, extensions, preferences, logins) across runs. Good when the browser itself is the unit of persistence.

[Playwright docs](https://playwright.dev)
