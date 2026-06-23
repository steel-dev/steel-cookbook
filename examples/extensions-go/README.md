# Extensions

A fresh Steel session boots a stock Chrome with no extensions. The Extensions API lets you upload a Chrome extension once, keep the returned ID on your account, and attach it to any session through `ExtensionIDs` on `Sessions.Create`. Content scripts run before chromedp ever issues a `Navigate`, so by the time the page renders the extension has already rewritten the DOM.

This recipe proves that attachment happened by waiting on a selector the extension creates, nothing more. It does not scrape or pretty-print the numbers the extension renders.

```go
list, _ := client.Extensions.List(ctx)
for _, ext := range list.Extensions {
	if ext.Name == "Github_Isometric_Contribu" {
		extID = ext.ID
	}
}

if extID == "" {
	uploaded, _ := client.Extensions.Upload(ctx, steel.ExtensionUploadParams{
		URL: steel.Ptr("https://chromewebstore.google.com/detail/github-isometric-contribu/mjoedlfflcchnleknnceiplgaeoegien"),
	})
	extID = uploaded.ID
}

sess, _ := client.Sessions.Create(ctx, steel.SessionCreateParams{
	ExtensionIDs: steel.F([]string{extID}),
})
```

## How the confirmation works

The demo attaches [GitHub Isometric Contributions](https://chromewebstore.google.com/detail/github-isometric-contribu/mjoedlfflcchnleknnceiplgaeoegien), which swaps GitHub's flat contribution grid for a 3D isometric one under a wrapper element it namespaces with `ic-`. After navigating to a profile, `chromedp.WaitVisible("div.ic-contributions-wrapper", chromedp.ByQuery)` runs against a 30-second timeout context. If the element appears, the extension loaded; if the context expires first, the wait returns an error and the run reports that the UI never showed. That selector belongs to the extension alone, so its presence is the proof.

Uploads persist on your account, which is why `Extensions.List` is the first call: a repeat run finds the existing ID and skips the re-upload. Names come back normalized, truncated and underscored, so the match is against `Github_Isometric_Contribu` rather than the full store title.

## Run it

```bash
cd examples/extensions-go
cp .env.example .env          # set STEEL_API_KEY
go mod tidy
go run .
```

Get a key at [app.steel.dev/settings/api-keys](https://app.steel.dev/settings/api-keys). The session viewer URL prints as the run starts; open it in another tab to watch the extension render on a live profile.

```text
Looking for an existing extension upload...
Not found. Uploading from the Chrome Web Store...
Uploaded extension ext_abc123
Creating Steel session with the extension attached...
Session created. Watch it live at https://app.steel.dev/sessions/ab12cd34
Navigating to https://github.com/junhsss...
Waiting for the extension to inject "div.ic-contributions-wrapper"...
Extension UI confirmed: the session attached and rewrote the DOM.
Releasing session...
```

## Make it yours

- **Upload your own extension.** `Extensions.Upload` takes any Chrome Web Store listing URL. Swap `storeURL` and update the `extensionName` that `Extensions.List` matches on, remembering the truncated, underscored form.
- **Target a different profile.** Change `profileURL` to any public GitHub user.
- **Stack extensions.** `ExtensionIDs` is a slice. Upload several and attach them together in one `Sessions.Create`.
- **Assert on real content.** Once the wrapper is visible, add `chromedp.Text` or `chromedp.Evaluate` steps to pull values the extension injected.

## Related

[extensions-ts](../extensions-ts) (Playwright sibling) · [extensions-py](../extensions-py) · [extensions-rs](../extensions-rs) · [profiles-go](../profiles-go) (reuse a full browser profile) · [chromedp docs](https://pkg.go.dev/github.com/chromedp/chromedp)
