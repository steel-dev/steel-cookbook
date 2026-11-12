# Files API (Python)

`client.sessions.files` moves bytes between your machine and the filesystem that lives inside a Steel session VM. This recipe uploads a local CSV into the session, hands the path the upload returns to a remote `<input type="file">` over raw CDP, and screenshots the chart the page renders from it. The whole thing turns on one fact: a file you push over the API lands at a path the browser can read, and that path means nothing back on your laptop.

## Shaping the upload

The Python SDK speaks `multipart/form-data`, so the `file` argument takes the same tuple shape as `requests` or the OpenAI client: `(filename, content, content_type)`.

```python
csv_bytes = (Path(__file__).parent / "assets" / "stock.csv").read_bytes()

uploaded = client.sessions.files.upload(
    session.id,
    file=("stock.csv", csv_bytes, "text/csv"),
    path="stock.csv",
)
```

`path` names the file in the session. Steel does not use the filename in the tuple, and without `path` it names the file with a random ID. `uploaded.path` comes back as the file's place inside the session, `/files/stock.csv`.

## Reaching the input over CDP

`page.set_input_files("./stock.csv")` resolves paths on the host running Playwright. The browser is on a Steel VM, so the file has to be resolved there. That means dropping under Playwright's locators to the Chrome DevTools Protocol, which `new_cdp_session` exposes as a `send(method, params)` call:

```python
cdp = current_context.new_cdp_session(page)
document = cdp.send("DOM.getDocument")
input_node = cdp.send(
    "DOM.querySelector",
    {"nodeId": document["root"]["nodeId"], "selector": "#load-file"},
)
cdp.send(
    "DOM.setFileInputFiles",
    {"files": [uploaded.path], "nodeId": input_node["nodeId"]},
)
```

`send` returns plain dicts, so the node ids are read with subscript access. Because `DOM.setFileInputFiles` runs browser-side, `uploaded.path` resolves against the VM, exactly where `upload` wrote it. After that it is ordinary Playwright: wait for `svg.main-svg`, scroll it into view, and screenshot it to `stock.png` on your local disk.

## Run it

```bash
cd examples/files-py
cp .env.example .env          # set STEEL_API_KEY
uv run main.py
```

Grab a key at [app.steel.dev/settings/api-keys](https://app.steel.dev/settings/api-keys). `uv sync` runs automatically on first `uv run`, so there is no separate install step. The script prints a session viewer URL as it starts. Open it in another tab to watch the upload land and the chart render.

Your output varies. One run printed:

```text
Steel + Files API Starter
============================================================

Creating Steel session...
Steel Session created!
View session at https://app.steel.dev/sessions/dc84b51e-7843-4a4d-95c7-c996bbbb9a8b
Uploading CSV file to the Steel session...
CSV file uploaded successfully!
File path on Steel session: /files/stock.csv
Connected to browser via Playwright
Releasing session...
Session released
Done!
```

`stock.png` lands in the recipe folder: the chart, parsed and drawn remotely, captured server-side, then saved to your disk. A run takes about 15 seconds.

## Make it yours

- **Skip your machine.** Steel can fetch a public `http://` or `https://` URL into the session instead of taking the bytes from you. The SDK's `file` argument takes only file content, so send that request with `httpx`, as the [Steel files docs](https://steel.dev/docs/features/files#keep-global-files) show.
- **Nest the upload.** Pass `path="inputs/stock.csv"` to put the file in a folder. Without `path`, Steel gives the file a random ID as its name.
- **Pull files back out.** `client.sessions.files.list(session.id)` enumerates the namespace, and `download(session.id, path)` returns the bytes. Pass `download` the path without the `/files/` prefix. Browser-initiated downloads land in the same namespace, so the inverse recipe is: drive the page to export, then list and download what appeared.

## Related

[TypeScript version](../files-ts) covers the same flow with the Web `File` API. [Go version](../files-go) and [Rust version](../files-rs) build the upload from typed structs. The [Steel files docs](https://steel.dev/docs/features/files) cover session and global files. The CDP calls map to Playwright's [`new_cdp_session`](https://playwright.dev/python/docs/api/class-cdpsession); the protocol methods are in the [DOM domain reference](https://chromedevtools.github.io/devtools-protocol/tot/DOM/).
