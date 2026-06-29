# Temporal Browser Workflow (Go)

This Go recipe keeps the Temporal pieces in one process for local runs. `main` connects to Temporal, starts a worker on `steel-browser-workflows-go`, registers `BrowserWorkflow` and `CapturePage`, then starts one workflow execution through the same SDK client.

`BrowserWorkflow` is pure workflow code. It configures `workflow.ActivityOptions`, clamps the batch size, and calls `workflow.ExecuteActivity` once per URL. `CapturePage` is regular Go code: it calls Steel's scrape and screenshot APIs, writes artifacts, and returns a typed `PageCapture`.

## Run it

Start Temporal locally:

```bash
temporal server start-dev
```

Run the Go worker and starter:

```bash
cd examples/temporal-browser-workflow-go
cp .env.example .env
go mod tidy
go run .
```

Set `STEEL_API_KEY` in `.env`. Get a Steel key at [app.steel.dev/settings/api-keys](https://app.steel.dev/settings/api-keys).

Your output varies. Structure looks like this:

```text
Started Temporal workflow: steel-browser-go-1782740000000
Target URLs: https://news.ycombinator.com, https://example.com
Workflow result:
{Pages:[{URL:https://news.ycombinator.com/ Title:Hacker News ...}] PageCount:2}
```

The Temporal UI shows one Activity task for each URL, with the retry policy configured in `BrowserWorkflow`.

## Make it yours

- **Change the batch.** Set `TARGET_URLS` to a comma-separated list. The workflow caps each run at 10 URLs.
- **Keep the worker long-lived.** Remove `startWorkflow` from `main` when you want a worker process that only polls and executes tasks.
- **Add more Steel calls.** Put PDF generation, profile-backed sessions, or proxy options inside `CapturePage`.
- **Route artifacts elsewhere.** Replace `os.WriteFile` and `download` with S3, GCS, or your own blob store.

## Related

[temporal-browser-workflow-ts](../temporal-browser-workflow-ts), [temporal-browser-workflow-py](../temporal-browser-workflow-py), and [temporal-browser-workflow-rs](../temporal-browser-workflow-rs) cover the same workflow in other SDKs. See the [Temporal Go SDK](https://docs.temporal.io/develop/go) and [Steel scrape recipe](../scrape-go).
