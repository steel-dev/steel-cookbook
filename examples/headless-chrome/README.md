# headless_chrome + Steel (Rust)

headless_chrome is the Rust equivalent of Puppeteer: a high-level, synchronous wrapper over the Chrome DevTools Protocol. `Browser::connect` takes a websocket URL and returns a connected browser, which is all a Steel session is. There is no event loop to drive and no async runtime in the browser code itself: `new_tab`, `navigate_to`, `find_elements`, and `capture_screenshot` block until they return, the way the Node original does.

```rust
let browser = Browser::connect(cdp_url)?;
let tab = browser.new_tab()?;
tab.navigate_to("https://quotes.toscrape.com")?;
tab.wait_until_navigated()?;

let quotes = tab.find_elements(".quote")?;
```

Scraping is element handles rather than evaluated JavaScript. `find_elements` returns a `Vec<Element>`, and each `Element` queries its own subtree, so `quote.find_element(".text")?.get_inner_text()?` reads the text inside one card without touching the rest of the page. The loop in `scrape` pulls the quote, author, and tags from the first five `.quote` blocks that way.

## Sync library, async SDK

The one seam worth understanding is that the two halves of this program disagree about async. The Steel SDK (`steel-rs`) is async: `sessions().create(...).await` and `sessions().release(...).await` need a runtime, so `main` is `#[tokio::main]`. headless_chrome is the opposite, a blocking API built on threads. Calling its blocking methods directly inside the async `main` would stall a runtime worker for the whole scrape.

The bridge is `spawn_blocking`, which hands the synchronous work to a thread pool meant for exactly this:

```rust
let result = tokio::task::spawn_blocking(move || scrape(&websocket_url, &key)).await?;
```

That is also why `scrape` returns `Box<dyn Error + Send + Sync>` rather than the bare `Box<dyn Error>` you would reach for first: `spawn_blocking` moves the closure to another thread, so its return type has to be `Send`. The session is created before the blocking call and released after it, so the browser work sits between two `await` points and the async SDK never blocks.

One detail in `scrape` is shared with the [chromiumoxide](../chromiumoxide) recipe: the connect URL is normalized to carry a path. Steel's websocket URL is `wss://host?token`, and the websocket layer underneath headless_chrome expects `wss://host/?token`, so the `match` on `://` and `?` inserts the slash before `Browser::connect` dials it.

## Run it

```bash
cd examples/headless-chrome
cp .env.example .env          # set STEEL_API_KEY
cargo run
```

Grab a key at [app.steel.dev/settings/api-keys](https://app.steel.dev/settings/api-keys). The first build pulls headless_chrome and tokio and takes a minute or two; later runs are quick. The program prints a session viewer URL as it starts. Open it in a second tab to watch the remote browser load the page, and it writes `quotes.png` to the working directory on the way out.

Your output varies with the site. Structure looks like this:

```text
Creating Steel session...
Session live at https://app.steel.dev/sessions/ab12cd34
Connected over CDP, opening page...

Found 10 quotes on the page:

1. The world as we have created it is a process of our thinking.
   - Albert Einstein
   tags: change, deep-thoughts, thinking, world

2. It is our choices, Harry, that show what we truly are.
   - J.K. Rowling
   tags: abilities, choices

Saved screenshot to quotes.png (98231 bytes)
Releasing session...
Session released
```

A run costs a few cents of browser time. Steel bills per session-minute, so the `sessions().release()` call after the blocking work is not optional: `main` captures the scrape result, releases the session, and only then propagates any error, so a failed scrape still tears the session down instead of leaving it to idle until the default 5-minute timeout.

## Make it yours

- **Swap the target.** Change the URL in `navigate_to` and the selectors in the loop. `quotes.toscrape.com` paginates with a `.next > a` link, so you can follow it and scrape every page; the connect and cleanup code stays the same.
- **Wait on a specific element.** `tab.wait_for_element(selector)` blocks until a node appears, which is sturdier than `wait_until_navigated` for pages that fill in content with JavaScript after first paint.
- **Capture a single element.** Beyond the full-page `tab.capture_screenshot`, an `Element` has its own `capture_screenshot` that crops to that node, useful for grabbing one card or chart instead of the whole viewport.
- **Harden for anti-bot.** `SessionCreateParams` carries `block_ads`, `solve_captcha`, `use_proxy`, and `dimensions`. Set them on the struct passed to `sessions().create()` for sites that fingerprint or challenge headless traffic.

## Related

- [chromiumoxide](../chromiumoxide) drives the same kind of Steel session the other way: async, tokio-native, with an explicit handler loop you spawn yourself. Comparing the two `main` files is the fastest way to decide whether you want the sync or async model in Rust.
- [scrape-rs](../scrape-rs) skips the browser entirely and reaches the page through Steel's `scrape` and `screenshot` endpoints. Start there if you only need content or an image and never touch the DOM.
- [playwright-py](../playwright-py) and [playwright-go](../playwright-go) connect over CDP the same way from other languages.
- The [headless_chrome docs](https://docs.rs/headless_chrome) cover the full `Tab` and `Element` API.
