# Profiles

A Steel profile saves a session's whole browser in Steel: its cookies, storage, extensions, settings, and user agent. Start a session from a profile and the browser opens where the last one left off. Release a session that has `PersistProfile` set, and Steel saves the browser back into the profile.

Two fields on `Sessions.New` wire it up, both through the `steel.F(...)` field wrapper. To mint a fresh profile, pass `PersistProfile: steel.F(true)` and leave `ProfileID` unset. The created `*steel.Session` exposes `.ProfileID`. Store it. Every later run passes it back as `ProfileID: steel.F(profileID)` alongside `PersistProfile`, and the browser opens as that identity.

Steel saves the profile only after you release the session. Until the save is done, the profile's status is `UPLOADING` and a session cannot start from it. Then the status is `READY`. `Profiles.List` and `Profiles.Get` read profiles and their status. The API has no call to delete a profile. Steel deletes a profile that no session has used for 30 days.

## Non-interactive by design

The TypeScript sibling opens an `inquirer` menu so you can pick an existing profile or create a new one. This Go port drops the picker and runs the full round-trip end to end in one invocation: `seedCart` mints a profile and adds an item, `waitForProfile` polls `Profiles.Get` until the profile is `READY`, then `verifyCart` opens a second session from the same `ProfileID` and counts the cart rows. Nothing to click. To reuse a profile from a previous run, read the printed `Profile ID` and feed it into `Sessions.New` yourself.

chromedp talks CDP directly: `chromedp.Evaluate` runs the cart logic in the page (`document.querySelector(".product-box-add-to-cart-button")` with an `input[value='Add to cart']` fallback, then `.cart-qty` for the header count and `.cart tbody tr` for the row count). `waitForCartQty` polls the header count until it moves off `(0)`, so session #1 is not released before the shop records the item. `chromedp.NewRemoteAllocator` with `chromedp.NoModifyURL` attaches to the Steel browser over the WebSocket URL, the same idiom as the [chromedp](../chromedp) recipe.

## Run it

```bash
cd examples/profiles-go
cp .env.example .env          # set STEEL_API_KEY
go mod tidy
go run .
```

Get a key at [app.steel.dev/settings/api-keys](https://app.steel.dev/settings/api-keys). Both session viewer URLs print as the program runs; open them in other tabs to watch each browser.

Your output varies. One run printed:

```text
Steel Profiles Demo
============================================================

Session #1 created with a fresh profile.
View live at https://app.steel.dev/sessions/7d74d6d9-002b-4e0a-8dcb-4ae8f31ec0bc
Profile ID: f639a9db-da8f-4876-bbcd-99ca37d43233
Adding the first book to the cart...
Added item. Header cart count now reads "(1)".
Releasing session #1...

Waiting for the profile to be saved...
Profile is READY

Session #2 created from profile f639a9db-da8f-4876-bbcd-99ca37d43233.
View live at https://app.steel.dev/sessions/12cb8510-0f00-4d56-a2f2-d1f63ac1bb24
Opening the cart in the new browser...
Releasing session #2...

------------------------------------------------------------
Profile ID: f639a9db-da8f-4876-bbcd-99ca37d43233
Session #1 viewer: https://app.steel.dev/sessions/7d74d6d9-002b-4e0a-8dcb-4ae8f31ec0bc
Session #2 viewer: https://app.steel.dev/sessions/12cb8510-0f00-4d56-a2f2-d1f63ac1bb24
Found 1 item(s) in the cart. Profile persistence works.
```

The run takes about 25 seconds. Both sessions release through the `release` helper deferred right after each `Sessions.New`. Skipping release keeps browsers running until the default timeout and delays the profile save.

## Make it yours

- **Swap the target site.** Replace `booksURL`, `cartURL`, and the three `Evaluate` snippets. The profile plumbing does not change.
- **Add more items.** Loop the click snippet over several category pages before releasing session #1, and the whole cart rides the profile forward.
- **Seed a profile by hand.** Create one session with `PersistProfile: steel.F(true)`, open its live viewer, sign in manually, release. The login lives in the profile, and every scripted run after that reuses it via `ProfileID`.
- **Read without writing back.** Pass `PersistProfile: steel.F(false)` with an existing `ProfileID` to load the profile without saving changes on release. Useful for risky runs that might corrupt state.

## Related

Three recipes handle "start the browser already signed in." Pick by lifetime:

- [auth-context](../auth-context-go): one-shot JSON snapshot of cookies and localStorage you capture from one session and replay into the next. Good when you sign in once (SSO, MFA, magic link) and want to move that state forward.
- Profiles (this recipe): long-lived named identity that keeps the whole browser (cookies, storage, extensions, settings) across runs. Good when the browser itself is the unit of persistence.
- Sibling ports: [profiles-ts](../profiles-ts), [profiles-py](../profiles-py), [profiles-rs](../profiles-rs).

[Steel profiles docs](https://steel.dev/docs/features/profiles) · [chromedp docs](https://pkg.go.dev/github.com/chromedp/chromedp)
