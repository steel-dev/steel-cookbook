# Files API

Each Steel session owns a scoped filesystem inside its VM, and `client.sessions().files()` moves bytes across the boundary between your machine and that sandbox. This recipe reads a local CSV, uploads it with `upload`, captures the path the file landed at inside the session, and hands that path to a remote `<input type="file">` so csvplot.com renders a chart against bytes that never touched the browser's own disk.

```rust
let uploaded = client
    .sessions()
    .files()
    .upload(
        session_id,
        SessionFileUploadParams {
            path: Some("stock.csv".into()),
            ..SessionFileUploadParams::new(
                Upload::from_bytes("stock.csv", bytes).with_content_type("text/csv"),
            )
        },
    )
    .await?;
```

`Upload::from_bytes` takes a filename and the raw bytes; `with_content_type` is the builder step for the MIME type. `path` names the file in the session. Steel does not use the filename in `Upload`, and without `path` it names the file with a random ID. What comes back is a `File` whose `path` is the file's place inside the session VM, `/files/stock.csv`. That path is meaningful to the browser running on Steel, not to your laptop, and keeping those two namespaces straight is the whole point of the recipe.

## Driving a file input over raw CDP

chromiumoxide's typed helpers resolve file paths on the machine running your code, which is the wrong filesystem here. The fix is to issue the `DOM` commands yourself. chromiumoxide re-exports the generated CDP types under `chromiumoxide::cdp::browser_protocol`, and `page.execute(...)` sends any of them and deserializes the typed reply:

```rust
let document = page.execute(GetDocumentParams::default()).await?;
let input = page
    .execute(QuerySelectorParams::new(document.root.node_id, "#load-file"))
    .await?;

page.execute(SetFileInputFilesParams {
    files: vec![uploaded.path.clone()],
    node_id: Some(input.node_id),
    backend_node_id: None,
    object_id: None,
})
.await?;
```

`DOM.setFileInputFiles` runs browser-side, so `uploaded.path` resolves against the session VM, which is exactly where `upload` wrote the bytes. After that it is ordinary automation: poll for `svg.main-svg`, scroll it into view, and screenshot the element to `stock.png` on your local disk.

## Run it

```bash
cd examples/files-rs
cp .env.example .env          # set STEEL_API_KEY
cargo run
```

Get a key at [app.steel.dev/settings/api-keys](https://app.steel.dev/settings/api-keys). The program prints a session viewer URL as it starts. Open it in another tab to watch the upload land and the chart render.

Your output varies. One run printed:

```text
Creating Steel session...
Session live at https://app.steel.dev/sessions/bda6c36d-12e7-44e9-b8ea-d23998cb980b
Uploading stock.csv (5488 bytes) to the session...
Uploaded. Path inside the session VM: /files/stock.csv
Connected over CDP, opening csvplot.com...
Setting the uploaded file on the page's #load-file input...
Saved stock.png (45607 bytes)
Releasing session...
Session released
```

`stock.png` lands in the recipe folder: the rendered chart, captured server-side after the CSV was parsed remotely, then saved locally.

## Make it yours

- **Upload from a URL.** Steel can fetch a public `http://` or `https://` URL into the session, so you can skip reading large fixtures locally. `Upload` takes only file content, so send that request with `reqwest`. The [Steel files docs](https://steel.dev/docs/features/files#keep-global-files) show the request in TypeScript and Python.
- **Harvest generated files.** Swap the csvplot flow for a site that exports. After the download fires, call `files().list(session_id)` to discover the new path, then `files().download(session_id, path)` with the path minus its `/files/` prefix to pull the bytes back.
- **Target a nested path.** Change `path` to `Some("inputs/stock.csv".into())` to put the file in a folder. Without `path`, Steel gives the file a random ID as its name.

## Related

[files-ts](../files-ts), [files-py](../files-py), and [files-go](../files-go) are the same recipe in other languages. The [Steel files docs](https://steel.dev/docs/features/files) cover session and global files. The [chromiumoxide docs](https://docs.rs/chromiumoxide) cover `page.execute` and the generated CDP command types under `chromiumoxide::cdp::browser_protocol`.
