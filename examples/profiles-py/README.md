# Profiles (Python)

A Steel profile saves a session's whole browser in Steel: its cookies, storage, extensions, settings, and user agent. Start a session from a profile and the browser opens where the last one left off. Release a session that has `persist_profile=True` and Steel saves the browser back into the profile.

Two arguments on `client.sessions.create` wire this up. The first run mints a profile by asking for persistence and passing no id:

```python
session = client.sessions.create(persist_profile=True)
profile_id = session.profile_id
```

`persist_profile=True` tells Steel to save the browser into the profile when you release the session. With no `profile_id`, Steel creates a fresh one and returns it on the session object. Store that id. Every later run passes it back:

```python
session = client.sessions.create(persist_profile=True, profile_id=profile_id)
```

The new browser opens as that same identity. Steel saves the profile only after you release the session. Until the save is done, the profile's status is `UPLOADING` and a session cannot start from it. Then the status is `READY`. `client.profiles.list()` and `client.profiles.get(id)` read profiles and their status. The API has no call to delete a profile. Steel deletes a profile that no session has used for 30 days.

## How the demo works

`main.py` runs a straight two-session flow against [demowebshop.tricentis.com](https://demowebshop.tricentis.com), a public demo shop that finds a visitor's cart again by a cookie:

1. Session #1 launches with `persist_profile=True` and no profile id. `add_first_book_to_cart` opens `/books`, clicks the first add-to-cart button, and waits for `.cart-qty` to move off `(0)`. The session releases, and `wait_for_profile` polls `client.profiles.get` until the profile is `READY`.
2. Session #2 launches with the captured `profile_id`. `count_cart_rows` opens `/cart` and counts `.cart tbody tr`. A row count above zero means the cart survived a browser that no longer exists, carried forward by the profile.

This is a port of [`../profiles-ts`](../profiles-ts), reworked to run end to end without input. The TypeScript version opens an `inquirer` picker to choose an existing profile or mint a new one. This Python version drops the picker and always creates a fresh profile, then reuses it once, so the persistence round-trip happens in a single run.

## Run it

```bash
cd examples/profiles-py
cp .env.example .env          # set STEEL_API_KEY
uv run main.py
```

Grab a key at [app.steel.dev/settings/api-keys](https://app.steel.dev/settings/api-keys). `uv sync` runs automatically on first `uv run`, so there is no separate install step. The two viewer URLs print as the script runs. Open them in other tabs to watch each browser.

Your output varies. One run printed:

```text
Steel Profiles Demo (Python)
============================================================
Session #1: https://app.steel.dev/sessions/0b82951d-5a1e-496c-8b39-9b733f8930fd
Profile ID: 859b57c1-9910-49fb-a38f-0a88000dc435
Added a book to the cart (cart shows (1))
Session #1 released, waiting for the profile to be saved...
Profile is READY
Session #2: https://app.steel.dev/sessions/81fa00dc-e954-4a47-9aa9-a66d06d7d117
Profile ID: 859b57c1-9910-49fb-a38f-0a88000dc435
Success: cart persisted across sessions with 1 item(s) via the profile
Releasing session...
Session released
Done!
```

The run takes about 20 seconds. Both sessions go through `client.sessions.release()`. Session #1 is released inline so that Steel saves the profile before Session #2 opens; Session #2 is released in the `finally` block. Skipping release keeps browsers running until the default timeout and delays the save.

## What persists

A profile saves the whole browser, not just the cart cookie this demo touches:

- Cookies and storage for every site you visited, so logins you kept stay signed in.
- Extensions and browser settings.
- The session's user agent, and its `dimensions`, `use_proxy`, `extension_ids`, and `credentials` options.

Treat a profile like an account. Anyone who can call `client.sessions.create(profile_id=...)` in your project can drive a browser signed in as you. To remove a login now, start a session from the profile with `persist_profile=True`, sign out of the site, and release the session.

## Make it yours

- **Swap the target site.** Replace the URLs in `add_first_book_to_cart` and `count_cart_rows`. The profile plumbing does not change.
- **Seed a profile by hand.** Create a session with `persist_profile=True`, open the live viewer, sign in yourself, then release the session. The profile keeps the login, and every scripted run after that reuses it.
- **One profile per identity.** Automating three accounts on the same site means three profiles. Sharing one across accounts lets a later session's snapshot overwrite an earlier one's state.
- **Read without writing back.** Pass `persist_profile=False` with an existing `profile_id` to load a profile without saving changes on release. Useful for risky runs that might corrupt state.

## Related

Three recipes solve "start the browser already signed in." Pick by lifetime:

- [credentials-py](../credentials-py): Steel stores a username and password per origin and fills the login form each session. No browser state persists.
- [auth-context-py](../auth-context-py): a one-shot JSON snapshot of cookies and localStorage captured from one session and replayed into the next.
- Profiles (this recipe): a long-lived named identity that keeps the whole browser across runs.

Other ports of this recipe: [profiles-ts](../profiles-ts) (interactive picker), [profiles-go](../profiles-go), [profiles-rs](../profiles-rs). See the [Steel profiles docs](https://steel.dev/docs/features/profiles) for what a profile saves, and the [Playwright docs](https://playwright.dev/python/) for the Python browser API.
