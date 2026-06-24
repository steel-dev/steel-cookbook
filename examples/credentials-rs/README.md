Steel's credentials vault stores a username and password against an origin. Opt a session in, and Steel watches for the login form on that origin and types the stored values for you. The automation never sees the password, holds no cookies, and contains no login code, just navigation and a check that the fill landed.

This recipe wires it up with two SDK calls, then connects [chromiumoxide](https://github.com/mattsse/chromiumoxide) over CDP to drive the resulting page.

## How it fits together

`main` stores the credential once with `client.credentials().create(...)`. Credentials are per-origin, so a re-run hits "Credential already exists"; the recipe matches that text on the returned `steel::Error` and continues, which keeps the script idempotent:

```rust
match create {
    Ok(_) => println!("Credential stored"),
    Err(err) if err.to_string().contains("already exists") => {
        println!("Credential already exists, moving on");
    }
    Err(err) => return Err(err.into()),
}
```

The opt-in is a default `SessionCreateParamsCredentials` on session create. Present, it tells Steel to match the page origin against the vault and fill the form when one appears; absent, the vault is ignored:

```rust
client.sessions().create(SessionCreateParams {
    credentials: Some(Box::new(SessionCreateParamsCredentials::default())),
    ..Default::default()
}).await?
```

From there it is ordinary chromiumoxide: open the Altoro Mutual login page and poll the username field (`#uid`) until Steel injects the vaulted value, which is the proof the fill landed. With the default `auto_submit` Steel also submits the form, so the filled field is only briefly visible — polling catches it as soon as it appears. The test site currently serves an expired certificate, so the page first sends `SetIgnoreCertificateErrorsParams`; drop that for a site with a valid certificate.

## Run it

```bash
cd examples/credentials-rs
cp .env.example .env          # set STEEL_API_KEY
cargo run
```

Get a key at [app.steel.dev/settings/api-keys](https://app.steel.dev/settings/api-keys). The run prints a session viewer URL up front. Open it in another tab to watch Steel auto-fill the form live.

Output looks like this:

```text
Storing credential for https://demo.testfire.net...
Credential stored
Creating Steel session with credentials enabled...
Session live at https://app.steel.dev/sessions/ab12cd34...
Opening the login page; Steel auto-fills it from the vault...
Success: Steel auto-filled the login form with "admin" from the vault, no credentials in this code.
Releasing session...
Session released
```

On a second run the first lines read `Credential already exists, moving on`; the rest is identical.

## Make it yours

- **Swap the target site.** Change `ORIGIN` and the `value` map in `credentials().create`, then point the navigation and the polled field selector at your site. Steel handles detection as long as the page exposes a standard username/password input pair.
- **Tune the fill.** `SessionCreateParamsCredentials` carries `auto_submit`, `blur_fields`, and `exact_origin`. Set them on the struct instead of taking the default to control whether Steel presses submit, blurs filled fields, or matches the origin exactly.
- **Manage credentials out of band.** `credentials().list`, `update`, and `delete` let a setup script rotate or audit stored creds while `main.rs` stays focused on the workflow.

## Related

- [credentials-ts](../credentials-ts), [credentials-py](../credentials-py), [credentials-go](../credentials-go): the same recipe in TypeScript, Python, and Go.
- [auth-context-rs](../auth-context-rs): replay captured cookies and localStorage instead of refilling a login form.
- [chromiumoxide](https://github.com/mattsse/chromiumoxide): the async Rust CDP client used here.
