# Credentials API (Python)

Look at `main.py` and notice what is missing: there is no `page.fill("#username", ...)`, no password typed into a selector, no submit click. The automation navigates to the login page and reads the result. Steel handles the form in between. The credential lives in Steel's vault, the session opts into it, and when a matching login form renders, Steel types the username and password for you. Your script never sees the password after it is stored.

Setup is two calls. Store the credential against an origin once:

```python
client.credentials.create(
    origin="https://demo.testfire.net",
    value={"username": "admin", "password": "admin"},
)
```

Then opt the session in by passing an empty `credentials` dict:

```python
session = client.sessions.create(
    credentials={},
)
```

The empty dict is the switch. Leave it off and the vault still holds the credential, but the session ignores it. Pass it and Steel matches each page's origin against what is stored and fills the form when one appears.

## The two-second wait

After clicking `#AccountLink` the script calls `time.sleep(2)`. That is deliberate slack: the click opens the login form, Steel detects it, fills the fields, and submits. The sleep gives that round trip room before the script reads the `h1` to confirm `"Hello Admin User"`. It is the blunt version. In a real workflow swap it for `page.wait_for_url(...)` or `page.wait_for_selector(...)` keyed to something that only exists once you are logged in, so you wait exactly as long as you need to.

Credentials are scoped per origin, so create one per site. Calling `credentials.create` again for an origin that already has one raises a `steel.APIError` whose message contains `Credential already exists`. The script catches that case and keeps going, which is why a second run behaves the same as the first.

## Run it

```bash
cd examples/credentials-py
cp .env.example .env          # set STEEL_API_KEY
uv run main.py
```

Grab a key at [app.steel.dev/settings/api-keys](https://app.steel.dev/settings/api-keys). `uv sync` runs automatically on first `uv run`, so there is no separate install step. The script prints a session viewer URL on startup. Open it in another tab to watch the auto-fill happen live. If you prefer pip, `pip install -e .` then `python main.py` works too.

Your output varies. Structure looks like this:

```text
Steel + Credentials Starter
============================================================

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

On a second run the credential already exists, so you see `Credential already exists, moving on.` after the `Creating credential...` line. Everything else is identical.

## Make it yours

- **Swap the target site.** Change `origin` and `value` in `credentials.create`, then update the `page.goto` URL and the login-trigger click in `main.py`. Steel detects the form as long as the page uses a standard username and password input pair.
- **Manage credentials separately.** `client.credentials.list()`, `client.credentials.update(...)`, and `client.credentials.delete(...)` let you rotate or audit stored logins without touching the automation. Seed credentials from a one-off setup script and keep `main.py` about the workflow.
- **Stack it with other session options.** `use_proxy`, `solve_captcha`, and `session_timeout` slot in next to `credentials={}` in `sessions.create()`. The vault coexists with every other knob.

## When to use this vs. auth-context

Both persist a login across runs, by different means. Credentials stores a username and password, and Steel re-authenticates by filling the login form on every session. It works for any site with a standard form, but the login UI runs each time. [auth-context-py](../auth-context-py) instead captures cookies and localStorage from an already-authenticated session and replays them, skipping the form entirely, though that context expires when the site's session does. Reach for credentials when you want a stable, long-lived setup tied to an account; reach for auth-context when the site uses flows the vault cannot drive (SSO, MFA, magic links) and you only need the resulting cookies.

## Related

[credentials-ts](../credentials-ts) (TypeScript port of this recipe) · [credentials-go](../credentials-go) · [credentials-rs](../credentials-rs) · [auth-context-py](../auth-context-py) (cookie and localStorage replay) · [Playwright docs](https://playwright.dev/python/)
