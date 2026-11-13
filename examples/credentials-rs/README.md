Steel's credentials vault stores a username and password against an origin. Opt a session in, and Steel watches for the sign-in form on that origin, fills in the stored values, and submits the form. The automation never handles the password, holds no cookies, and contains no login code, just navigation and a check that the login worked.

This recipe wires it up with two SDK calls, then connects [chromiumoxide](https://github.com/mattsse/chromiumoxide) over CDP to drive the resulting page. It signs in to [practice.expandtesting.com](https://practice.expandtesting.com/login), a public practice site that shows its login on the sign-in page.

## How it fits together

`main` stores the credential once with `client.credentials().create(...)`. Credentials are per origin, so a re-run gets HTTP 409 Conflict. The recipe checks the status on the returned `steel_rs::Error` and continues, which keeps the script idempotent:

```rust
match create {
    Ok(_) => println!("Credential stored"),
    Err(err) if err.status() == Some(409) => {
        println!("Credential already exists, moving on");
    }
    Err(err) => return Err(err.into()),
}
```

The opt-in is a default `SessionCreateParamsCredentials` on session create. Present, it tells Steel to match the page origin against the vault and fill the form when one appears; absent, the vault is ignored:

```rust
client.sessions().create(SessionCreateParams {
    credentials: Some(SessionCreateParamsCredentials::default()),
    ..Default::default()
}).await?
```

From there it is ordinary chromiumoxide: open the `/login` page and poll `location.pathname` until it reads `/secure`, the page the site shows after a successful login. Then read the site's message from `#flash b`. Polling the filled fields does not work: with the default `auto_submit`, Steel submits the form as soon as it fills it, so the page usually moves on before a poll can read the fields.

## Run it

```bash
cd examples/credentials-rs
cp .env.example .env          # set STEEL_API_KEY
cargo run
```

Get a key at [app.steel.dev/settings/api-keys](https://app.steel.dev/settings/api-keys). The run prints a session viewer URL up front. Open it in another tab to watch Steel fill the form live.

Your output varies. A first run printed:

```text
Storing credential for https://practice.expandtesting.com...
Credential stored
Creating Steel session with credentials enabled...
Session live at https://app.steel.dev/sessions/64eebef6-6784-4fe8-bce3-0f7643a1c9a8
Opening the login page; Steel fills and submits it from the vault...
Steel signed in. The site says: You logged into a secure area!
Releasing session...
Session released
```

On a second run the second line reads `Credential already exists, moving on`; the rest is the same.

## Make it yours

- **Swap the target site.** Change `ORIGIN` and the `value` map in `credentials().create`, then wait for a path or an element that only a signed-in user of your site sees. Steel fills a `<form>` that has a username and a password field, and it skips a form that submits to another origin.
- **Tune the fill.** `SessionCreateParamsCredentials` carries `auto_submit`, `blur_fields`, and `origins`. Set `auto_submit: Some(false)` to fill the form without submitting it, `blur_fields` to control whether Steel hides the filled values from vision models, or `origins` to limit which stored credentials the session may fill.
- **Manage credentials out of band.** `credentials().list`, `update`, and `delete` let a setup script rotate or audit stored creds while `main.rs` stays focused on the workflow.

## Related

- [credentials-ts](../credentials-ts), [credentials-py](../credentials-py), [credentials-go](../credentials-go): the same recipe in TypeScript, Python, and Go.
- [auth-context-rs](../auth-context-rs): replay captured cookies and localStorage instead of refilling a login form.
- [Steel credentials docs](https://steel.dev/docs/features/credentials): what the vault fills and how sessions opt in.
- [chromiumoxide](https://github.com/mattsse/chromiumoxide): the async Rust CDP client used here.
