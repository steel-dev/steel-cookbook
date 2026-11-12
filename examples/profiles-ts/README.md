# Profiles

A Steel profile saves a session's whole browser in Steel: its cookies, storage, extensions, settings, and user agent. A later session that starts from the profile is the same browser, so it picks up where the last one stopped.

Two options on `sessions.create` wire it up. On the first run, mint a fresh profile:

```typescript
session = await client.sessions.create({
  persistProfile: true,
  profileId,
});

profileId = session.profileId;
```

`persistProfile: true` tells Steel to save the browser into the profile when you release the session. On a first run `profileId` is `undefined`, which means "create a new one." After the session is created, `session.profileId` holds the identifier. Store it. Every later run passes it back:

```typescript
session = await client.sessions.create({
  persistProfile: true,
  profileId,
});
```

The new browser opens as that identity. Steel saves the profile only after you release the session. Until the save is done, the profile's status is `UPLOADING` and a session cannot start from it. Then the status is `READY`. `client.profiles.list()` and `client.profiles.get(id)` read profiles and their status. The API has no call to delete a profile. Steel deletes a profile that no session has used for 30 days.

## How the demo works

`index.ts` uses [demowebshop.tricentis.com](https://demowebshop.tricentis.com), a public demo shop that finds a visitor's cart again by a cookie. The flow lives in `main()` and the helpers in `utils.ts`:

1. `selectOrCreateProfile` calls `client.profiles.list()`. If your project has profiles, `inquirer` lists all of them and asks you to pick one or create a new one. It returns `undefined` to signal "mint a fresh one."
2. On a fresh run, Session #1 launches with `persistProfile: true` and no `profileId`. `addItemsToCart` visits three category pages (books, digital downloads, notebooks) and clicks the first add-to-cart button on each. Session #1 releases, and `waitForProfile` polls `client.profiles.get` until the profile is `READY`.
3. Session #2 launches with the same `profileId`. `checkItemsInCart` opens `/cart` and reads the rows. Same identity, different browser, same cart.

Select the saved profile on a later run and the menu skips step 2. One session starts, finds the cart intact, and exits. That is the test: state survives across distinct sessions because the profile carries it.

## Run it

```bash
cd examples/profiles-ts
cp .env.example .env          # set STEEL_API_KEY
npm install
npm start
```

Get a key at [app.steel.dev/settings/api-keys](https://app.steel.dev/settings/api-keys). Session viewer URLs print as the script runs. Open them in other tabs to watch each browser.

Your output varies. A first run that created a new profile printed:

```text
Steel Profiles Demo
============================================================
✔ Select a profile to use: Create a new profile
Steel Session #1 created!
View session at https://app.steel.dev/sessions/8d9c6974-045e-4807-be35-91e74e377693
Profile ID: fe7acbfe-ec21-4c36-92cc-6a241bdc78b5
Opened the demo shop
Added item from Book category
Added item from Digital Download category
Added item from Notebook category

3 items in cart
Items added:
  1. Computing and Internet
  2. 3rd Album
  3. 14.1-inch Laptop
Items successfully added to cart

Session #1 released
Waiting for the profile to be saved...
Profile is READY
Steel Session #2 created!
View session at https://app.steel.dev/sessions/89627a78-354c-49ee-b9c4-043d9c5fe29b
Profile ID: fe7acbfe-ec21-4c36-92cc-6a241bdc78b5
Found 3 items in cart

Items in cart:
  1. Computing and Internet
  2. 3rd Album
  3. 14.1-inch Laptop
Found your shopping cart!
Releasing session...
Session released
```

That run took about 90 seconds. Both sessions go through `client.sessions.release()`. Skipping it keeps browsers running until the 5-minute default timeout and delays the profile save.

## What persists

A profile saves the whole browser, not just cookies:

- Cookies and storage for every site you visited, so logins you kept stay signed in.
- Extensions and browser settings.
- The session's user agent, and its `dimensions`, `useProxy`, `extensionIds`, and `credentials` options.

Treat the profile like an account. Anyone who can call `sessions.create({ profileId })` in your project can drive a browser signed in as you. To remove a login now, start a session from the profile with `persistProfile: true`, sign out of the site, and release the session.

## Make it yours

- **Swap the target site.** Replace the URLs in `login`, `addItemsToCart`, and `checkItemsInCart`. The profile plumbing does not change.
- **Seed a profile interactively.** Create a session with `persistProfile: true`, open the live viewer, sign in by hand, and release the session. The profile keeps the login. Every scripted run after that reuses it.
- **One profile per identity.** If you automate three accounts on the same site, create three profiles. Sharing a profile across accounts means one session's writes overwrite another's state on release.
- **Read without writing back.** Pass `persistProfile: false` with an existing `profileId` to load the profile without saving changes on release. Useful for risky runs that might corrupt state.

## Related

Three recipes handle "start the browser already signed in." Pick by lifetime:

- [credentials](../credentials-ts): Steel stores a username and password per origin and fills the login form each session. No browser state persists. Good when the form is standard and you want a stable, long-lived setup.
- [auth-context](../auth-context-ts): one-shot JSON snapshot of cookies and localStorage you capture from one session and replay into the next. Good when you sign in once (SSO, MFA, magic link) and want to move the resulting state forward.
- Profiles (this recipe): long-lived named identity that keeps the whole browser (cookies, storage, extensions, settings) across runs. Good when the browser itself is the unit of persistence.

[Steel profiles docs](https://steel.dev/docs/features/profiles) · [Playwright docs](https://playwright.dev)
