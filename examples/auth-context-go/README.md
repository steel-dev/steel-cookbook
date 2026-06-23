# Auth Context (Go + chromedp)

A Steel session can hand you a snapshot of its browser state: cookies, localStorage, sessionStorage, indexedDB. Steel exposes that as one read call and one create option, so you log in once, pull the snapshot, and start a second browser that is already signed in.

```go
// Capture the live cookies + storage off session #1
captured, _ := client.Sessions.Context(ctx, first.ID)

// Restore them into a brand new session #2
second, _ := client.Sessions.Create(ctx, steel.SessionCreateParams{
    SessionContext: restoreContext(captured),
})
```

`main.go` drives both browsers with [chromedp](https://github.com/chromedp/chromedp) over CDP. It connects with `chromedp.NewRemoteAllocator(ctx, cdpURL, chromedp.NoModifyURL)` so the websocket URL Steel returns is used verbatim, then runs the login form on [practice.expandtesting.com](https://practice.expandtesting.com/login) and reads the `#username` welcome text to confirm auth.

## The read type is not the write type

This is the one sharp edge in the Go SDK. `Sessions.Context` returns a `*steel.SessionContext` with plain Go values: `Cookies []steel.SessionContextCookie`, `LocalStorage map[string]map[string]string`, and so on. The create side wants a `steel.SessionCreateParamsSessionContext`, where every field is wrapped in `param.Field[...]` and built with `steel.F(...)`. So you cannot pass the captured value straight back in: you read concrete values and you write wrapped ones.

`restoreContext` does that bridge. It rebuilds each cookie into a `steel.SessionCreateParamsSessionContextCookie`, wrapping `Name`, `Value`, `Domain`, `Path`, `Expires`, `HTTPOnly`, and `Secure` with `steel.F`. The `SameSite` enum is the same named type on both sides (`CreateSessionRequestSessionContextCookiesItemSameSite`), so it just gets wrapped, not converted. `LocalStorage` and `SessionStorage` are the same map type on each side and pass through `steel.F` unchanged. If you only need cookies for your target site, you can skip storage entirely.

## Run it

```bash
cd examples/auth-context-go
cp .env.example .env          # set STEEL_API_KEY
go mod tidy
go run .
```

Get a key at [app.steel.dev/settings/api-keys](https://app.steel.dev/settings/api-keys). The run prints two viewer URLs. Open them to watch each browser; the second one lands on the secure page without ever touching the login form.

```text
Creating Steel session #1...
Session #1 live at https://app.steel.dev/sessions/ab12cd34...
Authenticated on session #1
Session #1 released

Creating Steel session #2 from the captured context...
Session #2 live at https://app.steel.dev/sessions/ef56gh78...
Authenticated on session #2

Authentication successfully transferred.
Releasing session #2...
```

Session #1 is released as soon as its context is captured. Session #2 is released by a `defer` on the way out, so a verify failure still cleans up. A full run is about 20 seconds.

## Make it yours

- **Swap the target.** Change the URLs and selectors in `login` and `verifyAuth`. The capture/restore path in `restoreContext` does not care what site you used.
- **Persist the snapshot.** `*steel.SessionContext` marshals to JSON. Write it after capture, load it next run, feed it through `restoreContext`, and skip the login entirely. Treat the file like a password: it carries live session tokens.
- **Re-auth on failure.** Cookies expire. If `verifyAuth` on session #2 returns an error, fall back to a fresh `login` and capture a new snapshot.

## Related

[auth-context-ts](../auth-context-ts) · [auth-context-py](../auth-context-py) · [auth-context-rs](../auth-context-rs) · [credentials-go](../credentials-go) · [chromedp docs](https://github.com/chromedp/chromedp)
