# chromedp + Steel (Go)

chromedp speaks the Chrome DevTools Protocol over a websocket and never shells out to a local Chrome. A Steel session exposes exactly that websocket, so `chromedp.NewRemoteAllocator` points at the remote browser and every `chromedp.Run` step executes in the cloud, behind Steel's stealth, proxies, and live viewer. No browser on your machine.

```go
cdpURL := fmt.Sprintf("%s&apiKey=%s", sess.WebsocketURL, apiKey)

allocCtx, cancelAlloc := chromedp.NewRemoteAllocator(ctx, cdpURL, chromedp.NoModifyURL)
defer cancelAlloc()

browserCtx, cancelBrowser := chromedp.NewContext(allocCtx)
defer cancelBrowser()
```

`NoModifyURL` is the one detail that matters here. By default chromedp probes `/json/version` and rewrites the websocket it gets back. Steel already hands you the exact browser endpoint with its auth query string attached, so rewriting it breaks the connection. The flag tells chromedp to dial the URL verbatim.

After that it is plain chromedp. `run` builds one task list and ships it in a single `chromedp.Run`: navigate, wait for the story rows, pull data out, screenshot.

```go
err = chromedp.Run(runCtx,
    chromedp.Navigate("https://news.ycombinator.com"),
    chromedp.WaitVisible("tr.athing", chromedp.ByQuery),
    chromedp.Evaluate(extractTopStories, &raw),
    chromedp.FullScreenshot(&screenshot, 90),
)
```

The extraction step is the part worth reading. chromedp's `Evaluate` decodes a JS return value into a Go variable, but a list of structs does not map cleanly across that boundary. The reliable pattern is to have the page-side script `JSON.stringify` its result into a string, then `json.Unmarshal` it into a typed `[]story` on the Go side. The `extractTopStories` constant holds that script: it reads the top five `tr.athing` rows and returns title, link, and points for each.

## Run it

```bash
cd examples/chromedp
cp .env.example .env          # set STEEL_API_KEY
go mod tidy
go run .
```

Get a key at [app.steel.dev/settings/api-keys](https://app.steel.dev/settings/api-keys). The program prints a session viewer URL as it starts. Open it in another tab to watch the run live. It writes `hackernews.png` to the working directory on the way out.

Your output varies. Structure looks like this:

```text
Creating Steel session...
Session created. Watch it live at https://app.steel.dev/sessions/ab12cd34
Navigating to Hacker News...

Top 5 Hacker News Stories:

1. A tiny font renderer that fits in your CPU cache
   Link: https://example.com/font-renderer
   Points: 642

2. Show HN: I rebuilt my home network on a single Raspberry Pi
   Link: https://news.ycombinator.com/item?id=43990011
   Points: 318

Saved screenshot to hackernews.png
Releasing session...
```

A run costs a few cents of browser time. Steel bills per session-minute, so the deferred `client.Sessions.Release` is not optional. The `defer` sits right after the create call, which means the session is released whether `run` returns clean or errors out partway through. Drop it and the browser stays up until the default five-minute timeout, on your dime.

## Make it yours

- **Swap the target.** Change the `chromedp.Navigate` URL, the `WaitVisible` selector, and the `extractTopStories` script. Session setup and cleanup stay identical. The JSON-string bridge works for any shape: define a matching Go struct and unmarshal.
- **Add steps.** chromedp tasks compose, so append `chromedp.Click`, `chromedp.SendKeys`, or `chromedp.SetValue` to the `Run` list to fill forms or paginate before you extract.
- **Turn on stealth.** `SessionCreateParams` takes pointers like `BlockAds`, `SolveCaptcha`, and `UseProxy` for sites with anti-bot, plus `Timeout` to extend the session past five minutes. Set the field to the address of a value (`v := true; params.BlockAds = &v`) since they are all optional.
- **Tune the screenshot.** `FullScreenshot` captures the whole scroll height at the given JPEG quality (0 to 100). Swap it for `chromedp.CaptureScreenshot` to grab only the viewport.

## Related

[Playwright version](../playwright-ts) and [Python Playwright](../playwright-py) connect over CDP the same way with a different driver. [Rod](../rod) is the other Go option, with a fluent page API instead of a task list. chromedp's own [examples](https://github.com/chromedp/chromedp/tree/master/examples) cover clicks, downloads, and network interception.
