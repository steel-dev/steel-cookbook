# Trigger.dev Browser Job

This recipe runs browser automation as a queued background job. The request
path only enqueues `steel-browser-job`; the task creates a Steel session,
connects Playwright over CDP, extracts a page summary, saves artifacts, and
releases the session in `finally`.

The core workflow lives in `src/trigger/browser-job.ts`:

```ts
export const browserJob = task({
  id: "steel-browser-job",
  maxDuration: 300,
  retry: { maxAttempts: 3 },
  queue: { concurrencyLimit: 2 },
  run: async (payload) => {
    session = await steel.sessions.create({ sessionTimeout: 600000 });
    browser = await chromium.connectOverCDP(
      `${session.websocketUrl}&apiKey=${steelApiKey}`
    );
    // browser work
  },
});
```

`maxDuration` caps runaway jobs at 5 minutes. `retry` gives transient page or
network failures another attempt. `queue.concurrencyLimit` keeps only two
browser jobs active at once, so a burst of requests does not create an
unbounded number of sessions.

## Run it

```bash
cd examples/trigger-dev-browser-job
cp .env.example .env
npm install
npm run dev
```

Set `STEEL_API_KEY`, `TRIGGER_SECRET_KEY`, and `TRIGGER_PROJECT_REF` in `.env`.
Get a Steel key at [app.steel.dev/settings/api-keys](https://app.steel.dev/settings/api-keys).
Use your Trigger.dev project ref from the Trigger.dev dashboard.

In another terminal, enqueue one run:

```bash
npm run trigger
```

The trigger script reads `TARGET_URL` and `LINK_LIMIT` from `.env`, calls
`tasks.trigger("steel-browser-job", payload)`, and prints the run id. Watch the
run in the Trigger.dev dashboard. Task output includes the Steel Live View URL,
a hosted screenshot URL, local artifact paths, the extracted links, and
duration in milliseconds.

Local artifacts are written to `ARTIFACT_DIR`:

```text
artifacts/
|-- browser-job-2026-06-29T10-30-00-000Z.png
`-- browser-job-2026-06-29T10-30-00-000Z.md
```

## Why the browser lives in the task

Browser sessions are slow compared to HTTP handlers. A page can take 20-60
seconds when the site hydrates, retries, or challenges automation. Putting that
work in a Trigger.dev task gives you a run record, logs, retries, a timeout,
and queue backpressure. The API caller gets a run id immediately instead of
waiting for the browser.

The task still releases the Steel session on every path:

```ts
finally {
  if (browser) await browser.close();
  if (session) await steel.sessions.release(session.id);
}
```

That cleanup is the cost control. If extraction throws after navigation, the
remote browser still shuts down instead of idling until the session timeout.

## Make it yours

- **Swap the extraction.** Replace the `page.evaluate` block with your site's
  selectors, form submission, or file download flow.
- **Store artifacts durably.** Keep the hosted screenshot URL for public pages,
  or upload the `page.screenshot()` bytes to your own object storage when the
  artifact depends on logged-in session state.
- **Tune concurrency.** Raise `queue.concurrencyLimit` for high-throughput
  crawls, or lower it when each job holds a logged-in profile.
- **Add idempotency.** Pass an idempotency key from the caller when the same
  URL should not create duplicate browser runs.

## Related

[Playwright recipe](../playwright-ts) |
[Files recipe](../files-ts) |
[Trigger.dev tasks](https://trigger.dev/docs/tasks/overview)
