# Temporal Browser Workflow (Python)

`BrowserWorkflow` is a Python Temporal Workflow that batches page captures without putting network calls in replayed code. The workflow module contains only dataclasses and the deterministic loop. `main.py` registers `capture_page` as an Activity, and that Activity calls Steel, downloads the screenshot, and writes the Markdown report.

The Python SDK's sandbox is the reason for the split. `workflows.py` does not import Steel or touch the filesystem. The worker imports both modules, registers the workflow and Activity, starts one workflow run, waits for the result, then shuts the local worker down.

## Run it

Start a local Temporal dev server:

```bash
temporal server start-dev
```

Run the Python worker and starter in another terminal:

```bash
cd examples/temporal-browser-workflow-py
cp .env.example .env
python -m venv .venv
source .venv/bin/activate
pip install -e .
python main.py
```

Set `STEEL_API_KEY` in `.env`. Get a Steel key at [app.steel.dev/settings/api-keys](https://app.steel.dev/settings/api-keys).

Your output varies. Structure looks like this:

```text
Started Temporal workflow: steel-browser-py-1782740000000
Workflow result:
{
  "pages": [
    {
      "url": "https://news.ycombinator.com",
      "title": "Hacker News",
      "status_code": 200,
      "screenshot_path": "artifacts/news.ycombinator.com-2026-06-29T10-30-00.png"
    }
  ],
  "page_count": 2
}
```

Artifacts land in `ARTIFACT_DIR`:

```text
artifacts/
|-- news.ycombinator.com-2026-06-29T10-30-00.png
`-- news.ycombinator.com-2026-06-29T10-30-00.md
```

## Make it yours

- **Change the batch.** Set `TARGET_URLS` to a comma-separated list. The workflow caps each run at 10 URLs.
- **Return typed fields.** Add dataclass fields to `PageCapture`, then populate them inside `capture_page_sync`.
- **Tighten failure policy.** Adjust `RetryPolicy` in `workflows.py` when a target site should stop retrying sooner.
- **Move storage out of disk.** Replace `download` and `markdown_path.write_text` with object storage writes inside the Activity.

## Related

[temporal-browser-workflow-ts](../temporal-browser-workflow-ts), [temporal-browser-workflow-go](../temporal-browser-workflow-go), and [temporal-browser-workflow-rs](../temporal-browser-workflow-rs) cover the same shape in other SDKs. See the [Temporal Python SDK](https://docs.temporal.io/develop/python) and [Steel scrape recipe](../scrape-py).
