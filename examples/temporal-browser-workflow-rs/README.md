# Temporal Browser Workflow (Rust)

This recipe uses Temporal's prerelease Rust SDK (`temporalio-sdk` 0.4). `BrowserWorkflow` is declared with `#[workflow]` and keeps only deterministic control flow. `SteelActivities::capture_page` is declared with `#[activities]`, and that is where Steel, HTTP downloads, timestamps, and filesystem writes happen.

The Rust SDK makes the workflow/activity boundary explicit:

```rust
let page = ctx
    .start_activity(
        SteelActivities::capture_page,
        CapturePageInput { url, link_limit, full_page_screenshot },
        activity_options.clone(),
    )
    .await?;
```

The binary has two modes because the prerelease Rust worker is not `Send`; run the worker and starter as separate commands.

## Run it

Start Temporal locally:

```bash
temporal server start-dev
```

Run the Rust worker:

```bash
cd examples/temporal-browser-workflow-rs
cp .env.example .env
cargo run -- worker
```

Start one workflow from another terminal:

```bash
cd examples/temporal-browser-workflow-rs
cargo run -- start
```

Set `STEEL_API_KEY` in `.env`. Get a Steel key at [app.steel.dev/settings/api-keys](https://app.steel.dev/settings/api-keys). The first build pulls Temporal Core, the Rust SDK macros, `steel-rs`, and their transitive dependencies.

Your output varies. Structure looks like this:

```json
{
  "pages": [
    {
      "url": "https://news.ycombinator.com/",
      "title": "Hacker News",
      "statusCode": 200,
      "screenshotUrl": "https://...",
      "markdownPath": "artifacts/news-ycombinator-com-1782740000.md"
    }
  ],
  "pageCount": 2
}
```

## Make it yours

- **Keep the worker running.** `cargo run -- worker` already polls indefinitely. Put it under your process manager for a long-lived deployment.
- **Tune retries.** Edit the `RetryPolicy` in `BrowserWorkflow::run`.
- **Capture more artifacts.** Add PDF generation or object storage writes inside `capture_page_impl`.
- **Watch SDK churn.** The Rust SDK is prerelease, so pin the `temporalio-*` crate versions before deploying.

## Related

[temporal-browser-workflow-ts](../temporal-browser-workflow-ts), [temporal-browser-workflow-py](../temporal-browser-workflow-py), and [temporal-browser-workflow-go](../temporal-browser-workflow-go) cover the same workflow in stable SDKs. See the [Temporal Rust SDK crate](https://crates.io/crates/temporalio-sdk) and [Steel scrape recipe](../scrape-rs).
