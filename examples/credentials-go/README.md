# Credentials Vault

The automation in `main.go` never types a username or a password. It opens the site's sign-in page and waits for the page that only a signed-in user sees. The login itself happens in Steel: Steel keeps the credential in a vault, watches the page for a matching form, fills it, and submits it. Your chromedp code stays a plain navigation script.

Wiring it up is two API calls. Store the credential against an origin:

```go
client.Credentials.New(ctx, steel.CredentialNewParams{
	Origin: steel.F("https://practice.expandtesting.com"),
	Value:  steel.F(map[string]string{"username": "practice", "password": "SuperSecretPassword!"}),
})
```

The demo signs in to [practice.expandtesting.com](https://practice.expandtesting.com/login), a public practice site that shows this login on its sign-in page.

Then opt the session into the vault with an empty config struct:

```go
client.Sessions.New(ctx, steel.SessionNewParams{
	Credentials: steel.F(steel.SessionNewParamsCredentials{}),
})
```

`SessionNewParamsCredentials{}` is the opt-in. Leave it off and the vault is ignored for that session. The zero value uses the defaults: Steel submits the form after it fills it (`AutoSubmit`), and it hides the filled values from vision models (`BlurFields`).

## Confirming the sign-in

After navigating to `/login`, the script polls `location.pathname` until it reads `/secure`, the page the site shows after a successful login, and then reads the site's message there. Polling the filled fields does not work: Steel submits the form as soon as it fills it, so the page usually moves on before a poll can read the fields. A filled field also does not prove that the site accepted the login.

Before storing, the script calls `Credentials.List` filtered by the same `Origin` and skips `Credentials.New` when the vault already holds a credential for it. Repeat runs are idempotent, and they do not depend on the error the API returns for a duplicate.

## Run it

```bash
cd examples/credentials-go
cp .env.example .env          # set STEEL_API_KEY
go mod tidy
go run .
```

Get a key at [app.steel.dev/settings/api-keys](https://app.steel.dev/settings/api-keys). The session viewer URL prints as the run starts. Open it in another tab to watch Steel fill the form.

Your output varies. A first run printed:

```text
Storing credential...
Credential stored.
Creating Steel session with credentials enabled...
Session created. Watch it live at https://app.steel.dev/sessions/ae9d8fcb-c39e-4d58-a154-1aa86bce3af6
Opening the login page; Steel fills and submits it from the vault...
Steel signed in. The site says: You logged into a secure area!
Releasing session...
```

On a second run the credential is already in the vault, so the second line reads `Credential already exists, moving on.` and the rest is the same.

## Make it yours

- **Target another site.** Change `origin` and the `Value` map, then wait for a path or an element that only a signed-in user of your site sees. Steel fills a `<form>` that has a username and a password field, and it skips a form that submits to another origin.
- **Tune the fill.** Set `AutoSubmit: steel.F(false)` on `SessionNewParamsCredentials` to fill the form without submitting it, `BlurFields` to control whether Steel hides the filled values, or `Origins` to limit which stored credentials the session may fill.
- **Manage creds out of band.** `Credentials.List`, `Credentials.Update`, and `Credentials.Delete` let a setup script audit, rotate, or remove stored values while `main.go` stays focused on the workflow. Rotation has to happen there: `main.go` only stores a credential when its origin has none, so editing the `Value` map alone does not change what the vault holds.

## Related

[credentials-ts](../credentials-ts) (TypeScript) · [credentials-py](../credentials-py) (Python) · [credentials-rs](../credentials-rs) (Rust) · [auth-context-go](../auth-context-go) (cookie and localStorage replay) · [Steel credentials docs](https://steel.dev/docs/features/credentials) · [chromedp docs](https://github.com/chromedp/chromedp)
