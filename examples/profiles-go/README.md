# Profiles

A Steel profile is a named, long-lived browser identity. It carries everything a real Chrome user profile accumulates: cookies, localStorage, IndexedDB, history, installed extensions, autofill, site permissions. Attach a session to a profile and the browser opens where the last one left off; on release, Steel writes the user data directory back to the profile.

Two fields on `Sessions.Create` wire it up, both through the `steel.F(...)` field wrapper. To mint a fresh profile, pass `PersistProfile: steel.F(true)` and leave `ProfileID` unset. The created `*steel.Session` exposes `.ProfileID`. Store it. Every later run passes it back as `ProfileID: steel.F(profileID)` alongside `PersistProfile`, and the browser opens as that identity.

## Non-interactive by design

The TypeScript sibling opens an `inquirer` menu so you can pick an existing profile or create a new one. This Go port drops the picker and runs the full round-trip end to end in one invocation: `seedCart` mints a profile and adds an item, the program sleeps about three seconds so the snapshot settles, then `verifyCart` opens a second session from the same `ProfileID` and counts the cart rows. Nothing to click. To reuse a profile from a previous run, read the printed `Profile ID` and feed it into `Sessions.Create` yourself.

chromedp talks CDP directly: `chromedp.Evaluate` runs the cart logic in the page (`document.querySelector(".product-box-add-to-cart-button")` with an `input[value='Add to cart']` fallback, then `.cart-qty` for the header count and `.cart tbody tr` for the row count). `chromedp.NewRemoteAllocator` with `chromedp.NoModifyURL` attaches to the Steel browser over the websocket URL, the same idiom as the [chromedp](../chromedp) recipe.

## Run it

```bash
cd examples/profiles-go
cp .env.example .env          # set STEEL_API_KEY
go mod tidy
go run .
```

Get a key at [app.steel.dev/settings/api-keys](https://app.steel.dev/settings/api-keys). Both session viewer URLs print as the program runs; open them in other tabs to watch each browser.

```text
Steel Profiles Demo
============================================================

Session #1 created with a fresh profile.
View live at https://app.steel.dev/sessions/ab12cd34...
Profile ID: prof_9f3c...
Adding the first book to the cart...
Added item. Header cart count now reads "(1)".
Releasing session #1...

Waiting for the profile snapshot to settle...

Session #2 created from profile prof_9f3c...
View live at https://app.steel.dev/sessions/ef56gh78...
Opening the cart in the new browser...
Releasing session #2...

------------------------------------------------------------
Profile ID: prof_9f3c...
Session #1 viewer: https://app.steel.dev/sessions/ab12cd34...
Session #2 viewer: https://app.steel.dev/sessions/ef56gh78...
Found 1 item(s) in the cart. Profile persistence works.
```

Both sessions release through the `release` helper deferred right after each `Sessions.Create`. Skipping release keeps browsers running until the default timeout and delays the profile snapshot.

## Make it yours

- **Swap the target site.** Replace `booksURL`, `cartURL`, and the three `Evaluate` snippets. The profile plumbing does not change.
- **Add more items.** Loop the click snippet over several category pages before releasing session #1, and the whole cart rides the profile forward.
- **Seed a profile by hand.** Create one session with `PersistProfile: steel.F(true)`, open its live viewer, sign in manually, release. The login lives in the profile, and every scripted run after that reuses it via `ProfileID`.
- **Read without writing back.** Pass `PersistProfile: steel.F(false)` with an existing `ProfileID` to load the profile without snapshotting changes on release. Useful for risky runs that might corrupt state.

## Related

Three recipes handle "start the browser already signed in." Pick by lifetime:

- [auth-context](../auth-context-go): one-shot JSON snapshot of cookies and localStorage you capture from one session and replay into the next. Good when you log in once (SSO, MFA, magic link) and want to move that state forward.
- Profiles (this recipe): long-lived named identity that accumulates everything (history, extensions, preferences, logins) across runs. Good when the browser itself is the unit of persistence.
- Sibling ports: [profiles-ts](../profiles-ts), [profiles-py](../profiles-py), [profiles-rs](../profiles-rs).

[chromedp docs](https://pkg.go.dev/github.com/chromedp/chromedp)
