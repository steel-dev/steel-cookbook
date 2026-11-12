# Files API

Every Steel session ships with a scoped filesystem inside the session VM. `client.sessions.files` exposes methods to move bytes across the boundary between your machine and that sandbox. This recipe uses `upload` to push a local CSV into the session, hands the resulting path to a remote `<input type="file">` over CDP, and lets the browser render a chart against it.

```typescript
const uploadedFile = await client.sessions.files.upload(session.id, {
  file,
  path: "stock.csv",
});
```

`file` is a Web `File` built from `fs.readFileSync("./assets/stock.csv")`. `path` names the file in the session. Steel does not use the name of the file you upload, and without `path` it names the file with a random ID. What comes back is a record whose `path` is the file's place inside the session VM, `/files/stock.csv`. That path is not valid on your laptop, and paths on your laptop are not valid inside the session. The whole recipe hinges on keeping that distinction straight.

## Wiring a remote file into a DOM input

`page.setInputFiles("./local.csv")` resolves paths on the machine running Playwright. Since Chromium lives on a Steel VM, you need to resolve the path there instead. The `main` function drops down to raw CDP:

```typescript
const cdpSession = await currentContext.newCDPSession(page);
const document = await cdpSession.send("DOM.getDocument");

const inputNode = await cdpSession.send("DOM.querySelector", {
  nodeId: document.root.nodeId,
  selector: "#load-file",
});

await cdpSession.send("DOM.setFileInputFiles", {
  files: [uploadedFile.path],
  nodeId: inputNode.nodeId,
});
```

`DOM.setFileInputFiles` runs browser-side, so `uploadedFile.path` resolves against the session VM, which is exactly where `upload()` wrote the bytes. After that, it is plain Playwright: wait for `svg.main-svg`, scroll into view, screenshot to `stock.png` on your local disk.

## Run it

```bash
cd examples/files-ts
cp .env.example .env          # set STEEL_API_KEY
npm install
npm start
```

Get a key at [app.steel.dev/settings/api-keys](https://app.steel.dev/settings/api-keys). The script prints a session viewer URL as it starts. Open it in another tab to watch the upload land and the chart render.

Your output varies. One run printed:

```text
Steel + Files API Starter
============================================================

Creating Steel session...
Steel Session created!
View session at https://app.steel.dev/sessions/bc0c861f-e32c-4cd4-a0ad-5cb312816624
Uploading CSV file to the Steel session...
CSV file uploaded successfully!
File path on Steel session: /files/stock.csv
Connected to browser via Playwright
Releasing session...
Session released
Done!
```

`stock.png` lands in the recipe folder. It is the rendered chart, captured server-side after the CSV was parsed remotely, then saved locally. A run takes about 20 seconds.

## The rest of the surface

The recipe touches `upload` and nothing else, but `client.sessions.files` has more:

- `list(sessionId)`: returns every file in the session namespace with `{ path, size, lastModified }`. Useful after the browser triggers a download and you need to find the new file.
- `download(sessionId, path)`: pulls a single file back out. Pass the path without the `/files/` prefix, and stream the response body to disk.
- `downloadArchive(sessionId)`: zips the whole namespace into one response. One call instead of N.
- `delete(sessionId, path)` and `deleteAll(sessionId)`: explicit cleanup. Steel keeps a session's files after the session ends, so you can still list and download them.

Browser-initiated downloads (PDF exports, file-save dialogs) land in the same namespace automatically, so the inverse of this recipe is: drive the page to export, then `list()` and `download()` what showed up.

There is also `client.files` (without `.sessions`), an organization-scoped store that persists across sessions. Same method shape. Useful for fixtures and assets you do not want to re-upload every run.

## Make it yours

- **Upload from a URL.** Steel can fetch a public `http://` or `https://` URL into the session, so the bytes skip your machine. The SDK's `file` field takes only file content, so send that request without the SDK, as the [Steel files docs](https://steel.dev/docs/features/files#keep-global-files) show.
- **Harvest generated files.** Swap the `csvplot.com` flow for a site that exports. After the download fires, call `list()` to discover the new path, then `download()` it back without the `/files/` prefix.
- **Target a nested path.** Pass `path: "inputs/stock.csv"` to put the file in a folder. Without `path`, Steel gives the file a random ID as its name.

## Related

[Credentials](../credentials-ts) for auth tokens kept out of the filesystem. [Auth context](../auth-context-ts) for cookies and storage state. [Profiles](../profiles-ts) for persistent user-data directories across runs. [Extensions](../extensions-ts) for adding Chrome extensions to a session. The [Steel files docs](https://steel.dev/docs/features/files) cover session and global files.
