# Files API

A Steel session carries its own filesystem inside the session VM. `client.Sessions.Files` moves bytes across the boundary between your machine and that sandbox. This recipe reads a local CSV, uploads it with `Upload`, then hands the returned server-side path to a remote `<input type="file">` so csvplot.com can render a chart against bytes that never lived on the browser host's local disk.

The upload takes an `io.Reader`, and the SDK assembles the multipart form for you. `steel.FileParam` attaches the filename and content type that the form part carries:

```go
uploaded, err := client.Sessions.Files.Upload(ctx, sess.ID, steel.SessionFileUploadParams{
	File: steel.FileParam(bytes.NewReader(csvBytes), "stock.csv", "text/csv"),
	Path: steel.F("stock.csv"),
})
```

`bytes.NewReader` wraps the raw `[]byte` you got from `os.ReadFile`. `Path` names the file in the session. Steel does not use the filename that `steel.FileParam` carries, and without `Path` it names the file with a random ID. What comes back is a `*steel.File` whose `Path` is the file's place inside the session VM, `/files/stock.csv`. That path is meaningless on your laptop, and your laptop's paths are meaningless inside the session. Keeping that distinction straight is the whole point.

## Wiring a remote file into a DOM input

chromedp's `chromedp.SetUploadFiles` resolves paths on the machine running chromedp, which is your laptop. The file we want lives on the Steel VM, so we drop to raw CDP from `github.com/chromedp/cdproto/dom` instead. `DOM.setFileInputFiles` runs browser-side, so `uploaded.Path` resolves against the session VM, exactly where `Upload` wrote the bytes. `setRemoteFileInput` wraps the three CDP calls in a `chromedp.ActionFunc` so it slots into a normal `chromedp.Run` task list:

```go
func setRemoteFileInput(selector, remotePath string) chromedp.Action {
	return chromedp.ActionFunc(func(ctx context.Context) error {
		root, err := dom.GetDocument().Do(ctx)
		if err != nil {
			return err
		}
		nodeID, err := dom.QuerySelector(root.NodeID, selector).Do(ctx)
		if err != nil {
			return err
		}
		return dom.SetFileInputFiles([]string{remotePath}).WithNodeID(nodeID).Do(ctx)
	})
}
```

After that it is ordinary chromedp: `WaitVisible("svg.main-svg")`, then `FullScreenshot` to `stock.png` on your local disk.

## Run it

```bash
cd examples/files-go
cp .env.example .env          # set STEEL_API_KEY
go mod tidy
go run .
```

Get a key at [app.steel.dev/settings/api-keys](https://app.steel.dev/settings/api-keys). The program prints a session viewer URL as it starts. Open it in another tab to watch the upload land and the chart render.

Your output varies. One run printed:

```text
Creating Steel session...
Session created. Watch it live at https://app.steel.dev/sessions/6e9e7824-592d-4165-ae2d-cf19ea9599a2
Uploading stock.csv to the session...
Uploaded. Path inside the session VM: /files/stock.csv
Loading csvplot.com and feeding it the uploaded file...
Saved chart to stock.png
Releasing session...
```

`stock.png` lands in the recipe folder. It is the rendered chart, captured server-side after the CSV was parsed remotely, then saved locally.

## Make it yours

- **Upload from a URL.** Steel can fetch a public `http://` or `https://` URL into the session, so the bytes skip your machine. The SDK's `File` field takes only file content, so send that request with `net/http`. The [Steel files docs](https://steel.dev/docs/features/files#keep-global-files) show the request in TypeScript and Python.
- **Harvest generated files.** Swap the csvplot.com flow for a site that exports. After the download fires, call `client.Sessions.Files.List(ctx, sess.ID)` to discover the new path, then `client.Sessions.Files.Download(ctx, sess.ID, path)` with the path minus its `/files/` prefix to pull it back as an `*http.Response` whose `Body` streams the file.
- **Target a nested path.** Set `Path: steel.F("inputs/stock.csv")` to put the file in a folder. Without `Path`, Steel gives the file a random ID as its name.

## Related

[files-ts](../files-ts) and [files-py](../files-py) and [files-rs](../files-rs) for the same recipe in other languages. The [Steel files docs](https://steel.dev/docs/features/files) cover session and global files. [chromedp](https://github.com/chromedp/chromedp) and its [cdproto/dom](https://pkg.go.dev/github.com/chromedp/cdproto/dom) package for the raw CDP surface used here.
