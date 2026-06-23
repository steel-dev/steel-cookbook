# chromiumoxide + Steel (Rust)

chromiumoxide speaks the Chrome DevTools Protocol over a websocket, which is exactly what a Steel session exposes. `Browser::connect` takes the session's websocket URL and hands back a connected browser plus a `Handler`. From there you get plain async chromiumoxide: `new_page`, `content`, `get_title`, `find_elements`, `evaluate`, `screenshot`. No local Chrome, no `chromedriver`, no display.

The connection is one line, but it returns a tuple, and the second half is the part that trips everyone up:

```rust
let (browser, mut handler) = Browser::connect(cdp_url).await?;

let handle = tokio::spawn(async move { while let Some(_) = handler.next().await {} });
```

chromiumoxide splits the API surface (`browser`, `page`) from the connection's event loop (`handler`). The `browser` handle only queues CDP commands. Nothing is sent, and no response ever comes back, until something polls `handler` to completion. If you skip the spawn, `browser.new_page(...)` does not error: it hangs forever, because the future that would resolve it is never driven. This is the single most common chromiumoxide mistake. Spawn the drain loop right after `connect`, keep the `JoinHandle`, and abort it on the way out. `run` does exactly that.

One build-time gotcha that follows from the same design. chromiumoxide is runtime-agnostic and defaults to the `async-std` runtime, so a tokio program must opt in explicitly. The dependency in `Cargo.toml` is:

```toml
chromiumoxide = { version = "0.7", default-features = false, features = ["tokio-runtime"] }
```

Leave `default-features` on and the spawned handler silently runs on the wrong reactor, which surfaces as the same hang. Turn them off and name `tokio-runtime`.

Everything after the spawn is ordinary scraping. `run` opens Hacker News, waits for navigation, reads the title and full HTML, then pulls the top five stories with one `page.evaluate` call. The browser returns JSON, and chromiumoxide's `into_value` deserializes it straight into a `Vec<Story>`, so the extraction stays typed rather than a pile of per-element awaits:

```rust
let stories: Vec<Story> = page.evaluate(EXTRACT_STORIES).await?.into_value()?;
```

The screenshot uses `page.screenshot`, which returns the PNG as `Vec<u8>` directly from CDP. This example writes those bytes to `screenshot.png`, but the same bytes go just as easily into an upload, a vision model prompt, or a diff against a baseline.

## Run it

```bash
cd examples/chromiumoxide
cp .env.example .env          # set STEEL_API_KEY
cargo run
```

Grab a key at [app.steel.dev/settings/api-keys](https://app.steel.dev/settings/api-keys). The first build pulls chromiumoxide and tokio and takes a minute or two; later runs are quick. As the program starts it prints a session viewer URL. Open it in a second tab to watch the remote browser load the page live.

Your output varies. Structure looks like this:

```text
Creating Steel session...
Session live at https://app.steel.dev/sessions/ab12cd34
Connected over CDP, opening page...
Title: Hacker News
HTML length: 38214 bytes

Top 5 Hacker News stories:

1. Writing a Chrome DevTools Protocol client in Rust
   https://example.com/cdp-rust
   312 points

2. Show HN: I built a headless browser farm on a Raspberry Pi
   https://github.com/user/project
   188 points

...

Saved screenshot.png (245118 bytes)
Releasing session...
Session released
```

A run costs a few cents of browser time. Steel bills per session-minute, so the `client.sessions().release()` call after `run` returns is not optional: `main` captures the result, releases the session, and only then propagates any error, so a failed scrape still tears the session down instead of leaving it to idle until the default 5-minute timeout.

## Make it yours

- **Swap the target.** Replace the URL in `new_page` and the `EXTRACT_STORIES` expression with your own selectors. The JS runs in the page and returns any JSON-serializable shape; widen the `Story` struct to match. Session setup and teardown stay the same.
- **Prefer typed element queries.** If you would rather not write JS, `page.find_elements("tr.athing")` returns chromiumoxide `Element` handles with `inner_text` and `attribute("href")`. It is more Rust, more awaits, and easier to debug one node at a time.
- **Harden for anti-bot.** `SessionCreateParams` carries the same knobs as the other SDKs. Set `block_ads`, `solve_captcha`, `use_proxy`, or a custom `dimensions` on the struct you pass to `sessions().create()` for sites that fingerprint or challenge headless traffic.
- **Keep the page bytes in memory.** Drop the `std::fs::write` and feed the `Vec<u8>` from `page.screenshot` straight to whatever consumes it.

## Related

- [scrape-rs](../scrape-rs) reaches the same page without a browser library, through Steel's `scrape` and `screenshot` endpoints. Start there if you only need content or an image and never touch the DOM.
- [thirtyfour-rs](../thirtyfour-rs) drives Steel over WebDriver instead of CDP, the Rust counterpart to the Selenium recipe.
- [playwright-py](../playwright-py) is the same connect-over-CDP shape in Python, useful for comparing the handler model against Playwright's.
- [chromiumoxide docs](https://docs.rs/chromiumoxide) cover the `Page`, `Element`, and `ScreenshotParams` APIs in full.
