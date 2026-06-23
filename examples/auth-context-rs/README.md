# Auth Context

A Steel auth context is the cookies and storage that make a browser "logged in." This recipe reads that snapshot off one session and hands it to the next, so the second browser starts already signed in. There is no login form on the second run.

One detail matters in Rust that the dynamic SDKs hide: the snapshot you read back is not the same type you write on create. `client.sessions().context(&id)` returns a `SessionContext` (its cookies are `Vec<SessionContextCookie>`), but `SessionCreateParams::session_context` wants a `SessionCreateParamsSessionContext` (cookies are `Vec<SessionCreateParamsSessionContextCookie>`). The two cookie structs carry the same fields under different struct names, so `to_write_context` in `main.rs` maps one into the other field by field. The compiler will not let you skip this.

## What the demo does

`main.rs` drives [practice.expandtesting.com](https://practice.expandtesting.com/login), a public login test site, over CDP with chromiumoxide:

1. Create session #1, connect, and run `login`: type `practice` / `SuperSecretPassword!` into the form and submit. `verify_auth` then loads `/secure` and checks that `#username` reads `Hi, practice!`.
2. Read the snapshot with `client.sessions().context(&session.id)`, then release session #1.
3. Map the read snapshot into a `SessionCreateParamsSessionContext`, create session #2 with `session_context` set, connect, and call `verify_auth` again without logging in.

Each chromiumoxide connection spawns a handler task (`tokio::spawn`) to pump CDP events and `handle.abort()`s it before the session is released. The cookie map copies `name` and `value` (the required fields) plus the optional `domain`, `path`, `expires`, `http_only`, `secure`, `same_site`, `priority`, `source_scheme`, `url`, and `session` directly, since those types are shared between the read and write cookie structs; only `partition_key` is dropped. The `local_storage` and `session_storage` maps move across unchanged.

## Run it

```bash
cd examples/auth-context-rs
cp .env.example .env          # set STEEL_API_KEY
cargo run
```

Get a key at [app.steel.dev/settings/api-keys](https://app.steel.dev/settings/api-keys). The run prints both session viewer URLs. Open them to watch each browser.

```text
Creating Steel session #1...
Session #1 live at https://app.steel.dev/sessions/ab12cd34...
Logging in...
Initial authentication confirmed
Session #1 released

Creating Steel session #2 from the captured context...
Session #2 live at https://app.steel.dev/sessions/ef56gh78...
Session #2 released

Authentication successfully transferred without logging in
```

A run takes ~20 seconds. Both sessions go through `client.sessions().release(...)` before the program exits; skip it and the browsers idle until the 5-minute default timeout.

## Make it yours

- **Swap the target.** Change `LOGIN_URL`, `SECURE_URL`, and the selectors in `login` and `verify_auth`. The capture and replay around them stay the same for any site.
- **Persist the snapshot.** `SessionContext` derives `Serialize`, so you can write it to disk or a vault after capture and load it on the next run. Treat the file like a password: it holds live session tokens.
- **Re-auth on failure.** If `verify_auth` on the restored session returns false, fall back to a fresh `login` and capture a new snapshot. Cookies expire, so a snapshot from last week may already be dead.

## Related

[auth-context-ts](../auth-context-ts) · [auth-context-py](../auth-context-py) · [auth-context-go](../auth-context-go) · [credentials-rs](../credentials-rs) · [chromiumoxide](https://github.com/mattsse/chromiumoxide)
