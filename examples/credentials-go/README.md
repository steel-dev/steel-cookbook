# Credentials Vault

The automation in `main.go` never types a username or a password. It opens the site's login page and confirms that Steel auto-filled the form from the vault. The login itself happens server-side: Steel keeps the credential in a vault, watches the page for a matching form, and fills it. Your chromedp code stays a plain navigation script.

Wiring it up is two API calls. Store the credential against an origin:

```go
client.Credentials.Create(ctx, steel.CredentialCreateParams{
	Origin: steel.F("https://demo.testfire.net"),
	Value:  steel.F(map[string]string{"username": "admin", "password": "admin"}),
})
```

Then opt the session into the vault with an empty config struct:

```go
client.Sessions.Create(ctx, steel.SessionCreateParams{
	Credentials: steel.F(steel.SessionCreateParamsCredentials{}),
})
```

`SessionCreateParamsCredentials{}` is the opt-in. Leave it off and the vault is ignored for that session. The zero value uses the defaults; its fields (`AutoSubmit`, `BlurFields`, `ExactOrigin`) tune whether Steel presses submit for you, masks the typed values, and matches the origin exactly.

## Confirming the fill

After navigating to `/login.jsp`, the script polls the username field (`#uid`) until Steel injects the vaulted value, then reports success. With the default `AutoSubmit`, Steel also presses submit, so the filled field is only briefly visible — polling catches it as soon as it lands. The demo site currently serves an expired certificate, so the run first sends `Security.setIgnoreCertificateErrors`; drop that for a site with a valid certificate.

Re-running `Credentials.Create` for an origin that already has a stored credential returns an error whose message contains `already exists`. The script checks for that string and continues, so repeat runs are idempotent.

## Run it

```bash
cd examples/credentials-go
cp .env.example .env          # set STEEL_API_KEY
go mod tidy
go run .
```

Get a key at [app.steel.dev/settings/api-keys](https://app.steel.dev/settings/api-keys). The session viewer URL prints as the run starts. Open it in another tab to watch the auto-fill land.

Output looks like this:

```text
Storing credential...
Credential stored.
Creating Steel session with credentials enabled...
Session created. Watch it live at https://app.steel.dev/sessions/ab12cd34...
Opening the login page; Steel auto-fills it from the vault...
Success: Steel auto-filled the login form with "admin" from the vault, no credentials in this code.
Releasing session...
```

On a second run the credential is already in the vault, so the first lines read `Credential already exists, moving on.` and the rest is identical.

## Make it yours

- **Target another site.** Change `origin` and the `Value` map, then point the navigation and the polled field selector at the new login form. Steel handles detection for any standard username/password form.
- **Tune the fill.** Set `AutoSubmit`, `BlurFields`, or `ExactOrigin` on `SessionCreateParamsCredentials` to control submit behavior, value masking, and origin matching.
- **Manage creds out of band.** `Credentials.List`, `Credentials.Update`, and `Credentials.Delete` let a setup script rotate or audit stored values while `main.go` stays focused on the workflow.

## Related

[credentials-ts](../credentials-ts) (TypeScript) · [credentials-py](../credentials-py) (Python) · [credentials-rs](../credentials-rs) (Rust) · [auth-context-go](../auth-context-go) (cookie and localStorage replay) · [chromedp docs](https://github.com/chromedp/chromedp)
