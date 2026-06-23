# Profiles (Python)

A Steel profile is a named, long-lived browser identity. It carries everything a real Chrome user data directory accumulates: cookies, localStorage, IndexedDB, history, installed extensions, autofill, site permissions. Attach a session to a profile and the browser opens where the last one left off. Release the session and Steel snapshots the data directory back into the profile.

Two arguments on `client.sessions.create` wire this up. The first run mints a profile by asking for persistence and passing no id:

```python
session = client.sessions.create(persist_profile=True)
profile_id = session.profile_id
```

`persist_profile=True` tells Steel to write the browser data directory back when the session ends. With no `profile_id`, Steel creates a fresh one and returns it on the session object. Store that id. Every later run passes it back:

```python
session = client.sessions.create(persist_profile=True, profile_id=profile_id)
```

The new browser opens as that same identity. `client.profiles.list()`, `client.profiles.retrieve(id)`, and `client.profiles.delete(id)` round out the surface.

## How the demo works

`main.py` runs a straight two-session flow against [demowebshop.tricentis.com](https://demowebshop.tricentis.com), a public shopping cart demo that keeps cart state in cookies:

1. Session #1 launches with `persist_profile=True` and no profile id. `add_first_book_to_cart` opens `/books`, clicks the first add-to-cart button, and waits for `.cart-qty` to move off `(0)`. The session releases and Steel snapshots the profile.
2. Session #2 launches with the captured `profile_id`. `count_cart_rows` opens `/cart` and counts `.cart tbody tr`. A row count above zero means the cart survived a browser that no longer exists, carried forward by the profile.

This is a port of [`../profiles-ts`](../profiles-ts), reworked to run end to end without input. The TypeScript version opens an `inquirer` picker to choose an existing profile or mint a new one. This Python version drops the picker and always creates a fresh profile, then reuses it once, so the persistence round-trip happens in a single run.

## Run it

```bash
cd examples/profiles-py
cp .env.example .env          # set STEEL_API_KEY
uv run main.py
```

Grab a key at [app.steel.dev/settings/api-keys](https://app.steel.dev/settings/api-keys). `uv sync` runs automatically on first `uv run`, so there is no separate install step. The two viewer URLs print as the script runs. Open them in other tabs to watch each browser.

Your output varies. Structure looks like this:

```text
Steel Profiles Demo (Python)
============================================================
Session #1: https://app.steel.dev/sessions/ab12cd34...
Profile ID: prof_9f3c...
Added a book to the cart (cart shows Shopping cart (1))
Session #1 released, snapshotting profile...
Session #2: https://app.steel.dev/sessions/ef56gh78...
Profile ID: prof_9f3c...
Success: cart persisted across sessions with 1 item(s) via the profile
Releasing session...
Session released
Done!
```

Both sessions go through `client.sessions.release()`. Session #1 is released inline so its profile snapshot lands before Session #2 opens; Session #2 is released in the `finally` block. Skipping release keeps browsers running until the default timeout and delays the snapshot.

## What persists

Profiles capture the full Chromium user data directory, not just the cart cookie this demo touches:

- Cookies and localStorage for every origin you visited.
- Login sessions you kept alive (bank, SaaS dashboard, email).
- IndexedDB entries for apps that cache state client-side.
- Installed extensions and their configuration.
- Autofill, history, bookmarks, site permissions.

Treat a profile like an account. Anyone who can call `client.sessions.create(profile_id=...)` on your workspace can drive a browser logged in as you. Delete one with `client.profiles.delete(id)` when the identity is done.

## Make it yours

- **Swap the target site.** Replace the URLs in `add_first_book_to_cart` and `count_cart_rows`. The profile plumbing does not change.
- **Seed a profile by hand.** Create a session with `persist_profile=True`, open the live viewer, sign in yourself, then release. The profile keeps the login, and every scripted run after that reuses it.
- **One profile per identity.** Automating three accounts on the same site means three profiles. Sharing one across accounts lets a later session's snapshot overwrite an earlier one's state.
- **Read without writing back.** Pass `persist_profile=False` with an existing `profile_id` to load a profile without snapshotting changes on release. Useful for risky runs that might corrupt state.

## Related

Three recipes solve "start the browser already signed in." Pick by lifetime:

- [credentials-py](../credentials-py): Steel stores a username and password per origin and fills the login form each session. No browser state persists.
- [auth-context-py](../auth-context-py): a one-shot JSON snapshot of cookies and localStorage captured from one session and replayed into the next.
- Profiles (this recipe): a long-lived named identity that accumulates everything across runs.

Other ports of this recipe: [profiles-ts](../profiles-ts) (interactive picker), [profiles-go](../profiles-go), [profiles-rs](../profiles-rs). See the [Playwright docs](https://playwright.dev/python/) for the Python browser API.
