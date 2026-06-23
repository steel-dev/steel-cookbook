# Credentials Vault

The automation in `main.go` never types a username or a password. It navigates to a site, clicks the login link, and reads the heading to confirm it is signed in. The login itself happens server-side: Steel keeps the credential in a vault, watches the page for a matching form, and fills it. Your chromedp code stays a plain navigation script.

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

## The two-second wait

After `chromedp.Click("#AccountLink", ...)` the script does `chromedp.Sleep(2 * time.Second)` before reading the `h1`. That window lets Steel detect the form, fill it, and let the page settle on the post-login view. A fixed sleep keeps the demo short. In production, prefer a deterministic wait such as `chromedp.WaitVisible` on an element that only exists once you are signed in.

Re-running `Credentials.Create` for an origin that already has a stored credential returns an error whose message contains `Credential already exists`. The script checks for that string and continues, so repeat runs are idempotent.

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
Navigating to the demo site...
Success, you are logged in
Releasing session...
```

On a second run the credential is already in the vault, so the first lines read `Credential already exists, moving on.` and the rest is identical.

## Make it yours

- **Target another site.** Change `origin` and the `Value` map, then point `chromedp.Navigate` and the `#AccountLink` click at the new login trigger. Steel handles detection for any standard username/password form.
- **Tune the fill.** Set `AutoSubmit`, `BlurFields`, or `ExactOrigin` on `SessionCreateParamsCredentials` to control submit behavior, value masking, and origin matching.
- **Manage creds out of band.** `Credentials.List`, `Credentials.Update`, and `Credentials.Delete` let a setup script rotate or audit stored values while `main.go` stays focused on the workflow.

## Related

[credentials-ts](../credentials-ts) (TypeScript) · [credentials-py](../credentials-py) (Python) · [credentials-rs](../credentials-rs) (Rust) · [auth-context-go](../auth-context-go) (cookie and localStorage replay) · [chromedp docs](https://github.com/chromedp/chromedp)
