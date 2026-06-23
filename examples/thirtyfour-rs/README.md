# thirtyfour Starter (Rust)

thirtyfour speaks the W3C WebDriver protocol over HTTP, not CDP. Every `goto`, `find`, and `text` call is an HTTP round-trip to a remote endpoint that implements the spec. Steel runs one at `http://connect.steelbrowser.com/selenium`, which is where `WebDriver::builder` points.

The catch is the same one the [selenium](../selenium) Python recipe hits: Steel identifies callers with a `steel-api-key` header and routes each command to the right browser with a `session-id` header. WebDriver capabilities cannot carry those, because they are HTTP transport headers, not part of the session-create payload. The Python recipe subclasses `RemoteConnection` to inject them. Rust has a cleaner seam.

thirtyfour sends every command through an `HttpClient` trait, and `reqwest::Client` already implements it. So you build a `reqwest::Client` with `default_headers`, hand it to the builder with `.client(...)`, and reqwest attaches both headers to every request it sends. No subclass, no custom trait impl:

```rust
let mut headers = HeaderMap::new();
headers.insert(HeaderName::from_static("steel-api-key"), HeaderValue::from_str(api_key)?);
headers.insert(HeaderName::from_static("session-id"), HeaderValue::from_str(session_id)?);

let http = reqwest::Client::builder().default_headers(headers).build()?;

let driver = WebDriver::builder("http://connect.steelbrowser.com/selenium", DesiredCapabilities::chrome())
    .client(http)
    .request_timeout(Duration::from_secs(120))
    .connect()
    .await?;
```

One requirement on the Steel side: create the session with `is_selenium: Some(true)`. Steel provisions a WebDriver-compatible node for those sessions. Without the flag you get a CDP browser that thirtyfour cannot drive.

```rust
let session = client.sessions().create(SessionCreateParams {
    is_selenium: Some(true),
    ..Default::default()
}).await?;
```

After the driver is wired, the rest is plain thirtyfour. `scrape_top_stories` navigates to Hacker News, uses `driver.query(...).wait(...).exists()` to block until the story rows render, then walks the `athing` elements with `find_all` to pull title, link, and points. The `query` builder is thirtyfour's polling primitive, the equivalent of Selenium's `WebDriverWait`: each command is an HTTP round-trip, so polling on a specific element beats a fixed sleep.

## The reqwest version has to match

The `.client(...)` seam works because `reqwest::Client` satisfies thirtyfour's `HttpClient` trait. That impl is tied to the exact reqwest version thirtyfour compiles against. thirtyfour `0.37` builds on `reqwest 0.13`, so this `Cargo.toml` pins `reqwest = "0.13"`. Pin a different major (the older `0.12`, say) and you get two distinct `reqwest::Client` types in the build: the one you construct no longer implements the trait `.client(...)` wants, and the compiler rejects it. The Steel SDK happens to use `reqwest 0.12` internally, but that is its own dependency tree and does not affect the client you pass here.

## Run it

```bash
cd examples/thirtyfour-rs
cp .env.example .env          # set STEEL_API_KEY
cargo run
```

Get a key at [app.steel.dev/settings/api-keys](https://app.steel.dev/settings/api-keys). The program prints a session viewer URL as it starts. Open it in another tab to watch the browser run live.

Your output varies. Structure looks like this:

```text
Steel + thirtyfour Rust Starter
============================================================
Creating Steel session...
Session created: ab12cd34-...
View it live at https://app.steel.dev/sessions/ab12cd34-...
Connected to browser via thirtyfour
Navigating to Hacker News...

Top 5 Hacker News Stories:

1. Claude 4.7 Opus released today
   Link: https://news.ycombinator.com/item?id=43218921
   Points: 892

2. Show HN: A browser extension for reading on slow connections
   Link: https://github.com/user/project
   Points: 401

...

Releasing session...
Session released
```

A run costs a few cents of session time. Steel bills per session-minute, so `main` releases the session whether the scrape succeeds or fails: the scrape result is held, `sessions().release(...)` runs, then the held result is returned. Skip the release and the browser idles until the default 5-minute timeout.

## Make it yours

- **Swap the target.** The scraping logic lives in `scrape_top_stories`. Replace the `goto` URL and the `By::ClassName("athing")` loop with your own selectors. Session setup and the header-carrying client stay put.
- **Extend the session.** Pass `timeout: Some(1_800_000)` (30 minutes, in milliseconds) alongside `is_selenium: Some(true)` in `sessions().create()` for longer runs. Keep `is_selenium`; it is the switch that provisions a WebDriver node.
- **Reuse the headers pattern.** `default_headers` on the `reqwest::Client` is how you attach any extra header to every WebDriver request, the same shape you would use for custom tracing or routing headers.
- **Tune the wait.** `query(...).wait(timeout, interval)` controls how long thirtyfour polls and how often. Drop it for elements that are present on first paint.

## Related

[Selenium version (Python)](../selenium) drives the same endpoint with the `RemoteConnection` subclass approach. [chromiumoxide-rs](../chromiumoxide-rs) connects to the same Steel browser over CDP instead of WebDriver. [thirtyfour docs](https://docs.rs/thirtyfour) cover the query builder and element API.
