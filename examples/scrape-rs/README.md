# Scrape, screenshot, and PDF (Rust)

Steel's REST API turns a URL into structured content without a browser on your side. The `steel-rs` crate wraps three of those endpoints as plain async methods: `client.scrape()` returns parsed content plus typed metadata, `client.screenshot()` and `client.pdf()` render the page and hand back a hosted file URL. There is no session to create, connect to, or release. Each call is one stateless request that runs a browser on Steel's side and returns when the page is done.

That makes this the shortest path into Steel from Rust, and it leans on the SDK's typed structs rather than raw JSON. `scrape()` deserializes into a `ScrapeResponse`, so the fields are real Rust types you can pattern-match on:

```rust
let scraped = client
    .scrape(ClientScrapeParams {
        url: TARGET_URL.to_string(),
        format: Some(vec![ScrapeRequestFormatItem::Markdown]),
        // remaining options set to None; see main.rs
    })
    .await?;

let meta = &scraped.metadata;       // ScrapeResponseMetadata
meta.status_code;                   // i64
meta.title.as_deref();              // Option<&str>
meta.language.as_deref();           // Option<&str>
scraped.links.len();                // Vec<ScrapeResponseLink>
scraped.content.markdown;           // Option<String>
```

`metadata` carries about twenty parsed fields (Open Graph tags, canonical URL, author, published time, the HTTP status code), so you get the document's shape without writing a single selector. `content` holds whichever formats you asked for in `format`: `Markdown`, `HTML`, `CleanedHTML`, or `Readability`. Request only what you need; markdown alone keeps the payload small for LLM context.

`main` runs all three calls against Hacker News, prints the typed metadata, and writes `page.md`, `screenshot.png`, and `page.pdf` to the working directory. Screenshot and PDF responses are a hosted URL, not bytes, so the `download` helper fetches each URL with `reqwest` and writes the file. The artifacts live on Steel for a while after the call, which is handy if you would rather hand the URL to another service than store the bytes yourself.

## Run it

```bash
cd examples/scrape-rs
cp .env.example .env          # set STEEL_API_KEY
cargo run
```

Get a key at [app.steel.dev/settings/api-keys](https://app.steel.dev/settings/api-keys). The first build pulls `steel-rs`, `tokio`, and `reqwest`, so it takes a moment; later runs are fast.

Your output varies. Structure looks like this:

```text
Scraping https://news.ycombinator.com ...
  status     200
  title      Hacker News
  language   en
  links      183
  markdown   14217 chars
  wrote      page.md
Capturing screenshot ...
  wrote      screenshot.png
Rendering PDF ...
  wrote      page.pdf
Done.
```

Three calls cost a few cents of browser time total. Steel bills per session-minute, and these one-shot endpoints spin up and tear down their own browser, so there is nothing to leak: no cleanup call, no session left running against the default 5-minute timeout. The trade-off is that each call is independent, so you cannot log in once and scrape five pages behind the auth. For that, open a session and drive a real browser (see Related).

## Make it yours

- **Change the target.** Edit the `TARGET_URL` constant. Every call reads from it.
- **Pick formats.** Pass more variants in `format`, for example `vec![ScrapeRequestFormatItem::Markdown, ScrapeRequestFormatItem::HTML]`, then read `scraped.content.html`. Each requested format comes back as its own `Option` field on `content`.
- **Get the screenshot and PDF in one call.** `scrape()` takes `pdf: Some(true)` and `screenshot: Some(true)`; the URLs come back on `scraped.pdf` and `scraped.screenshot` instead of making three round trips.
- **Handle anti-bot pages.** Set `use_proxy: Some(true)` on any of the params to route through a Steel residential proxy. Add `delay: Some(2000)` to wait for late-loading content before capture.
- **Match on the status.** `meta.status_code` is an `i64`, so branch on it before trusting the content (a soft 404 still returns markdown).

## Related

[TypeScript version](../scrape-ts) and [Python version](../scrape-py) cover the same three endpoints. For a full browser session you connect to and drive over CDP, see [chromiumoxide](../chromiumoxide). For the HTTP surface these methods wrap, see the [reqwest docs](https://docs.rs/reqwest) and [Tokio docs](https://tokio.rs).
