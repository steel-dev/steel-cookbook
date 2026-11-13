# Credentials API (Python)

Look at `main.py` and notice what is missing: there is no `page.fill("#username", ...)`, no password typed into a selector, no submit click. The automation opens the sign-in page and reads the result. Steel handles the form in between. The credential lives in Steel's vault, the session opts into it, and when a matching sign-in form renders, Steel fills the username and password and submits the form.

Setup is two calls. Store the credential against an origin once:

```python
client.credentials.create(
    origin="https://practice.expandtesting.com",
    value={"username": "practice", "password": "SuperSecretPassword!"},
)
```

The demo signs in to [practice.expandtesting.com](https://practice.expandtesting.com/login), a public practice site that shows this login on its sign-in page.

Then opt the session in by passing an empty `credentials` dict:

```python
session = client.sessions.create(
    credentials={},
)
```

The empty dict is the switch. Leave it off and the vault still holds the credential, but the session ignores it. Pass it and Steel matches each page's origin against what is stored and fills the form when one appears.

## Wait for the signed-in page

After `page.goto(f"{ORIGIN}/login")`, the script calls `page.wait_for_url(f"{ORIGIN}/secure", timeout=20_000)`. Steel detects the form, fills the fields, and submits, and the site then redirects to `/secure`, a page that only a signed-in user sees. The script reads the site's message there to confirm the login.

Wait for a sign like this, not for the filled fields. Steel submits the form as soon as it fills it, so the page usually moves on before your code can read the fields. A filled field also does not prove that the site accepted the login.

Credentials are scoped per origin, so create one per site. Calling `credentials.create` again for an origin that already has one raises `steel.ConflictError` (HTTP 409). The script catches it and keeps going, which is why a second run behaves the same as the first.

## Run it

```bash
cd examples/credentials-py
cp .env.example .env          # set STEEL_API_KEY
uv run main.py
```

Grab a key at [app.steel.dev/settings/api-keys](https://app.steel.dev/settings/api-keys). `uv sync` runs automatically on first `uv run`, so there is no separate install step. The script prints a session viewer URL on startup. Open it in another tab to watch Steel fill the form live. If you prefer pip, `pip install -e .` then `python main.py` works too.

Your output varies. A first run printed:

```text
Steel + Credentials Starter
============================================================

Storing credential...
Credential stored.
Creating Steel session...
Steel Session created!
View session at https://app.steel.dev/sessions/b4ce3d10-59fa-4925-a221-046b52e37c55
Connected to browser via Playwright
Steel signed in. The site says: You logged into a secure area!
Releasing session...
Session released
Done!
```

On a second run the credential already exists, so you see `Credential already exists, moving on.` instead of `Credential stored.` Everything else is the same.

## Make it yours

- **Swap the target site.** Change `ORIGIN` and `value` in `credentials.create`, then wait for a page or an element that only a signed-in user of your site sees. Steel fills a `<form>` that has a username and a password field, and it skips a form that submits to another origin.
- **Manage credentials separately.** `client.credentials.list()`, `client.credentials.update(...)`, and `client.credentials.delete(origin=...)` let you rotate or audit stored logins without touching the automation. To change a stored password, call `update`. Running this script again keeps the old value.
- **Tune the fill.** Pass keys in `credentials`. `"auto_submit": False` fills the form without submitting it, `"blur_fields"` controls whether Steel hides the filled values from vision models, and `"origins"` limits which stored credentials the session may fill.
- **Stack it with other session options.** `use_proxy`, `solve_captcha`, and `api_timeout` slot in next to `credentials={}` in `sessions.create()`. The vault coexists with every other knob.

## When to use this vs. auth-context

Both persist a login across runs, by different means. Credentials stores a username and password, and Steel re-authenticates by filling the login form on every session. It works for any site with a standard form, but the login UI runs each time. [auth-context-py](../auth-context-py) instead captures cookies and localStorage from an already-authenticated session and replays them, skipping the form entirely, though that context expires when the site's session does. Reach for credentials when you want a stable, long-lived setup tied to an account. Reach for auth-context when the site uses flows the vault cannot drive, such as SSO, magic links, or codes sent by email or SMS, and you only need the resulting cookies.

## Related

[credentials-ts](../credentials-ts) (TypeScript port of this recipe) · [credentials-go](../credentials-go) · [credentials-rs](../credentials-rs) · [auth-context-py](../auth-context-py) (cookie and localStorage replay) · [Steel credentials docs](https://steel.dev/docs/features/credentials) · [Playwright docs](https://playwright.dev/python/)
