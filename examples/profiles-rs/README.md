# Profiles

A Steel profile saves a session's whole browser in Steel: its cookies, storage, extensions, settings, and user agent. A session that starts from the profile gets that browser back. Two fields on `SessionCreateParams` drive it. `persist_profile: Some(true)` tells Steel to save the browser into the profile when you release the session. `profile_id` selects which identity to load: leave it `None` to mint a fresh one, or pass a captured id to resume.

The whole demo turns on one value moving between two `create` calls:

```rust
let session = client
    .sessions()
    .create(SessionCreateParams {
        persist_profile: Some(true),
        ..Default::default()
    })
    .await?;

let profile_id = session.profile_id.clone().ok_or("no profile_id")?;
```

`SessionCreateParams` derives `Default`, so struct-update syntax sets only the two profile fields and leaves the rest at their server defaults. The first session returns a `profile_id`; the second passes it back with `profile_id: Some(profile_id.clone())` and the same `persist_profile: Some(true)`. Same identity, a brand new browser.

## What the demo does

This recipe is non-interactive. The TypeScript sibling prompts you to pick a profile with `inquirer`; here both sessions run end to end with no input, so a single `cargo run` proves the round trip. It drives [demowebshop.tricentis.com](https://demowebshop.tricentis.com), a public demo shop that finds a visitor's cart again by a cookie, over CDP with chromiumoxide:

1. Create session #1 with `persist_profile: Some(true)`, capture `session.profile_id`, connect, open `/books`, and click the first add-to-cart button (`.product-box-add-to-cart-button`, falling back to `input[value="Add to cart"]`). Then poll the header's `.cart-qty` until it moves off `(0)`, so the session is not released before the shop records the item.
2. Release session #1 so Steel saves the profile. `wait_for_profile` polls `client.profiles().get(...)` until the status is `READY`. Until then the status is `UPLOADING`, and a session cannot start from the profile.
3. Create session #2 with the same `persist_profile: Some(true)` and the captured `profile_id`, connect, open `/cart`, and count `.cart tbody tr` rows with a one-line `page.evaluate`. More than zero rows means the cart crossed the session boundary.

Each chromiumoxide connection spawns a handler task (`tokio::spawn`) to pump CDP events; `handle.abort()` stops it before the session is released.

## Run it

```bash
cd examples/profiles-rs
cp .env.example .env          # set STEEL_API_KEY
cargo run
```

Get a key at [app.steel.dev/settings/api-keys](https://app.steel.dev/settings/api-keys). Both session viewer URLs print as the run proceeds. Open them in other tabs to watch each browser.

Your output varies. One run printed:

```text
Creating Steel session #1 with a fresh persisted profile...
Profile ID: 3fc7f072-ba8c-47cb-bc3d-e2d7de883c55
Session #1 live at https://app.steel.dev/sessions/c4e01c9c-54c1-459a-98d1-9f7901e1ef50
Added the first book to the cart
Session #1 released
Waiting for the profile to be saved...
Profile is READY

Creating Steel session #2 from profile 3fc7f072-ba8c-47cb-bc3d-e2d7de883c55...
Session #2 live at https://app.steel.dev/sessions/c6e49091-269a-4c80-8a71-c147d51d319a
Found 1 item(s) in the cart
Session #2 released

Profile persistence confirmed: the cart survived across sessions
```

A full round trip takes about 25 seconds. Both sessions go through `client.sessions().release(...)` before the program exits; skip it and the browsers idle until the 5-minute default timeout, which also delays the profile save.

## Make it yours

- **Swap the target.** Change `BOOKS_URL`, `CART_URL`, and the selectors. The two-`create` profile plumbing stays the same for any site whose state lives in the browser.
- **Resume an existing profile.** Skip session #1 and start at session #2 with a `profile_id` you saved earlier. Seed it once by hand: create a session with `persist_profile: Some(true)`, sign in through the live viewer, release, and reuse the id forever.
- **Read without writing back.** Pass `persist_profile: Some(false)` with an existing `profile_id` to load the identity without saving changes on release. Good for risky runs that might corrupt state.
- **Manage the identity.** `client.profiles().list(...)` and `get(...)` read profiles and their status. The API has no call to delete a profile; Steel deletes one that no session has used for 30 days. Treat a profile like an account: anyone who can call `create` with its id drives a browser signed in as you.

## Related

[profiles-ts](../profiles-ts) · [profiles-py](../profiles-py) · [profiles-go](../profiles-go) · [auth-context-rs](../auth-context-rs) · [Steel profiles docs](https://steel.dev/docs/features/profiles) · [chromiumoxide](https://github.com/mattsse/chromiumoxide)
