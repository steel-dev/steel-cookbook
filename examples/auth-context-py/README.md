# Auth Context (Python)

Logging in is the expensive part of browser automation: forms, redirects, sometimes a captcha. Steel lets you do it once, freeze the result, and pour it into a brand new browser. `main.py` runs that whole loop with Playwright's sync API: log in on session #1, snapshot the auth state, throw session #1 away, then prove a fresh session #2 is already signed in without ever touching the login form.

The two calls that matter are a read and a write:

```python
session_context = client.sessions.context(session.id)
session = client.sessions.create(session_context=session_context)
```

## The round-trip is a no-op in Python

`client.sessions.context()` returns a Pydantic `SessionContext` model: `cookies`, `local_storage`, `session_storage`, `indexed_db`. The keyword `session_context` on `create()` wants a typed dict shaped the same way. You might expect to unpack and remap fields between them, but the SDK transforms the response model on the way in, so the object you capture goes straight back without a single field touched. Capture into a variable, hand the variable to `create()`, done. (The Go and Rust ports do have to copy fields between distinct read and write types. Python does not.)

That model is plain data. `session_context.model_dump(by_alias=True)` gives you JSON you can write to disk, push to a secret store, or move between machines. Treat it like a password: it holds live session tokens, and anyone holding the blob is the logged-in user until those tokens expire.

## Browser lifecycle

The script starts one `sync_playwright()` driver and reuses it across both sessions, calling `browser.close()` after each so the CDP socket from the released session does not linger. The driver itself is stopped in `finally` alongside the session release, so a failure mid-run still tears everything down. Each session is reached through `browser.contexts[0].pages[0]`, the page Steel opens for you, rather than `new_page()`.

## Run it

```bash
cd examples/auth-context-py
cp .env.example .env          # set STEEL_API_KEY
uv run main.py
```

Grab a key at [app.steel.dev/settings/api-keys](https://app.steel.dev/settings/api-keys). `uv sync` runs automatically on first `uv run`, so there is no separate install step. Prefer pip? `pip install -e .` then `python main.py`. Playwright needs its browser binaries once: `playwright install chromium`.

The script prints two session viewer URLs. Open them in other tabs to watch each browser live.

Your output varies. Structure looks like this:

```text
Steel + Reuse Auth Context Example
============================================================

Creating initial Steel session...
Steel Session #1 created!
View session at https://app.steel.dev/sessions/ab12cd34...
Initial authentication successful
Session #1 released

Creating second Steel session with the captured context...
Steel Session #2 created!
View session at https://app.steel.dev/sessions/ef56gh78...
Authentication successfully transferred!
Session #2 released
```

A run takes about 20 seconds and costs a few cents of session time. Both sessions go through `client.sessions.release()`; session #2 is released in the `finally` block. Skip the release and the browser idles until the default timeout.

## Make it yours

- **Swap the target site.** Change the URLs and selectors in `login` and `verify_auth`. The capture and restore between them stay identical no matter the site.
- **Persist the snapshot.** `json.dump(session_context.model_dump(by_alias=True), f)` after capture, load it next run, and pass the dict straight into `session_context=`. The keyword accepts the dict form too.
- **Re-auth on failure.** If `verify_auth` on the restored session returns `False`, fall back to a fresh `login` and capture a new context. Cookies expire, so a snapshot from last week may already be dead.

## Related

[TypeScript version](../auth-context-ts) covers the same flow as a reusable primitive. [Go version](../auth-context-go) and [Rust version](../auth-context-rs) map fields between the read and write context types. If you want Steel to store credentials and run the login itself, see [credentials](../credentials-py). For the Playwright sync API, see the [Playwright docs](https://playwright.dev/python/).
