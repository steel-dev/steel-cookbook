# Files API

A Steel session carries its own filesystem inside the session VM. `client.Sessions.Files` moves bytes across the boundary between your machine and that sandbox. This recipe reads a local CSV, uploads it with `Upload`, then hands the returned server-side path to a remote `<input type="file">` so csvplot.com can render a chart against bytes that never lived on the browser host's local disk.

The upload is a plain Go value, not an `io.Reader` or a multipart form you assemble yourself:

```go
uploaded, err := client.Sessions.Files.Upload(ctx, sess.ID, steel.SessionFileUploadParams{
	File: steel.FileUpload{
		Name:        "stock.csv",
		Content:     csvBytes,
		ContentType: "text/csv",
	},
})
```

`Content` is the raw `[]byte` you got from `os.ReadFile`. What comes back is a `*steel.File` whose `Path` is a handle inside the session VM (typically `stock.csv` at the sandbox root). That path is meaningless on your laptop, and your laptop's paths are meaningless inside the session. Keeping that distinction straight is the whole point.

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

Your output varies. Structure looks like this:

```text
Creating Steel session...
Session created. Watch it live at https://app.steel.dev/sessions/ab12cd34...
Uploading stock.csv to the session...
Uploaded. Path inside the session VM: stock.csv
Loading csvplot.com and feeding it the uploaded file...
Saved chart to stock.png
Releasing session...
```

`stock.png` lands in the recipe folder. It is the rendered chart, captured server-side after the CSV was parsed remotely, then saved locally.

## Make it yours

- **Upload from a URL.** `steel.FileUpload` carries bytes, but the underlying API also accepts a URL string for the file field. Fetch a report server-side and skip your machine entirely.
- **Harvest generated files.** Swap the csvplot.com flow for a site that exports. After the download fires, call `client.Sessions.Files.List(ctx, sess.ID)` to discover the new path, then `client.Sessions.Files.Download(ctx, sess.ID, path)` to pull it back as an `io.ReadCloser`.
- **Target a nested path.** `SessionFileUploadParams` has an optional `Path` field. The default is the filename at the sandbox root; set `Path` to a pointer to nest the upload, for example under `inputs/`.

## Related

[files-ts](../files-ts) and [files-py](../files-py) and [files-rs](../files-rs) for the same recipe in other languages. [chromedp](https://github.com/chromedp/chromedp) and its [cdproto/dom](https://pkg.go.dev/github.com/chromedp/cdproto/dom) package for the raw CDP surface used here.
