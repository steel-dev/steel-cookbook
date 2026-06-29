# Temporal Browser Workflow (TypeScript)

This recipe runs a Temporal Workflow named `browserWorkflow`. The Workflow stays deterministic: it clamps small inputs, loops over URLs, and delegates each Steel scrape plus screenshot to the `capturePage` Activity. The Activity writes Markdown and PNG artifacts locally, then returns the compact page summary recorded in workflow history.

The retry boundary lives on the Activity proxy in `workflows.ts`:

```ts
const { capturePage } = proxyActivities<Activities>({
  startToCloseTimeout: "2 minutes",
  retry: {
    initialInterval: "5 seconds",
    maximumInterval: "30 seconds",
    backoffCoefficient: 2,
    maximumAttempts: 3,
  },
});
```

If a page fetch fails, Temporal retries that Activity. If the worker restarts after one URL succeeds, the completed Activity result is replayed from history and the workflow resumes at the next URL.

## Run it

Install the Temporal CLI if you do not already have it, then start a local dev server:

```bash
temporal server start-dev
```

In another terminal, run the worker and workflow client:

```bash
cd examples/temporal-browser-workflow-ts
cp .env.example .env
npm install
npm start
```

Set `STEEL_API_KEY` in `.env`. Get a Steel key at [app.steel.dev/settings/api-keys](https://app.steel.dev/settings/api-keys). The Temporal dev server listens on `localhost:7233`, which matches `TEMPORAL_ADDRESS` in `.env.example`.

Your output varies. Structure looks like this:

```json
{
  "pages": [
    {
      "url": "https://news.ycombinator.com/",
      "title": "Hacker News",
      "statusCode": 200,
      "screenshotUrl": "https://...",
      "artifacts": {
        "screenshotPath": "artifacts/news-ycombinator-com-2026-06-29T10-30-00-000Z.png",
        "markdownPath": "artifacts/news-ycombinator-com-2026-06-29T10-30-00-000Z.md"
      }
    }
  ],
  "pageCount": 2
}
```

Open the Temporal UI printed by `temporal server start-dev`. The workflow history shows one `capturePage` Activity per URL.

## Why Steel runs in an Activity

Temporal Workflows replay, so they should not call Steel, `fetch`, `Date.now()`, the filesystem, or any other side-effecting API. `browserWorkflow` only decides which Activity to schedule next. `capturePage` owns the browser work and artifact writes:

```ts
const scraped = await steel.scrape({ url, format: ["markdown"] });
const screenshot = await steel.screenshot({ url, fullPage });
await writeFile(markdownPath, toMarkdown(result, markdown), "utf8");
await download(screenshot.url, screenshotPath);
```

This keeps browser cost tied to Activity attempts. A failed Activity can retry. A completed Activity is not re-run during workflow replay.

## Make it yours

- **Change the batch.** Set `TARGET_URLS` to a comma-separated list. The workflow caps each run at 10 URLs.
- **Adjust extraction.** Use more fields from the Steel scrape response, or add PDF generation inside `capturePage`.
- **Store artifacts durably.** Upload the PNG and Markdown files to object storage inside the Activity before returning.
- **Deploy the worker.** Point `TEMPORAL_ADDRESS`, `TEMPORAL_NAMESPACE`, and `TEMPORAL_TASK_QUEUE` at your Temporal cluster, then run the same worker process.

## Related

[temporal-browser-workflow-py](../temporal-browser-workflow-py), [temporal-browser-workflow-go](../temporal-browser-workflow-go), and [temporal-browser-workflow-rs](../temporal-browser-workflow-rs) implement the same workflow in other SDKs. See the [Temporal TypeScript SDK](https://docs.temporal.io/develop/typescript), [Steel scrape recipe](../scrape-ts), and [Trigger.dev browser job](../trigger-dev-browser-job).
