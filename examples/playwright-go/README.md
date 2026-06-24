# playwright-go + Steel (Go)

playwright-go exposes `pw.Chromium.ConnectOverCDP`, which attaches to any Chrome speaking the DevTools Protocol. A Steel session is exactly that: a remote Chrome reachable over a websocket. Hand the connect call the session's websocket URL with your key appended and the rest is ordinary Playwright, running against a browser in Steel's cloud with stealth, proxies, and a live viewer.

```go
cdpURL := fmt.Sprintf("%s&apiKey=%s", sess.WebsocketURL, apiKey)
browser, err := pw.Chromium.ConnectOverCDP(cdpURL)

page := browser.Contexts()[0].Pages()[0]
```

Steel returns a context with a page already open, so there is no `NewContext` / `NewPage` ceremony: reach into `Contexts()[0].Pages()[0]` and start driving. Everything after, `Goto`, `Evaluate`, `QuerySelectorAll`, `Screenshot`, is the same Playwright API the JavaScript and Python bindings expose.

## The driver, not the browser

playwright-go is not a pure-Go CDP client the way [chromedp](../chromedp) and [Rod](../rod) are. It drives the same Node-based Playwright driver the other language bindings use, so that driver has to exist on disk before `playwright.Run()` will start. The program installs it on the first line of `run`:

```go
if err := playwright.Install(&playwright.RunOptions{SkipInstallBrowsers: true}); err != nil {
    return fmt.Errorf("install driver: %w", err)
}
pw, err := playwright.Run()
```

`SkipInstallBrowsers: true` is the part that matters for Steel. A normal Playwright install also downloads Chromium, Firefox, and WebKit, hundreds of megabytes you never run, because the browser lives in Steel's cloud, not on your machine. The flag fetches the driver alone. Drop it and the first run still works, but it pulls three browser engines you will never launch. Calling `Install` in code is convenient for a one-file example; in a larger project you would run `go run github.com/playwright-community/playwright-go/cmd/playwright install` once at build time instead and let `Run` assume the driver is present.

The extraction reads the way it does in [chromedp](../chromedp) for the same reason. `page.Evaluate` returns an `interface{}`, and a slice of structs does not cross that boundary cleanly, so the page-side script `JSON.stringify`s its result and the Go side `json.Unmarshal`s the string into a typed `[]story`. The `extractTopStories` constant holds that script: it pulls title, link, and points from the top five `tr.athing` rows.

## Run it

```bash
cd examples/playwright-go
cp .env.example .env          # set STEEL_API_KEY
go mod tidy
go run .
```

Get a key at [app.steel.dev/settings/api-keys](https://app.steel.dev/settings/api-keys). The first `go run` downloads the Playwright driver, which takes a moment; later runs reuse it. The program prints a session viewer URL as it starts. Open it in another tab to watch the page load live, and it writes `hackernews.png` to the working directory on the way out.

Your output varies with the site. Structure looks like this:

```text
Creating Steel session...
Session created. Watch it live at https://app.steel.dev/sessions/ab12cd34
Connected to browser via playwright-go
Navigating to Hacker News...

Top 5 Hacker News Stories:

1. A compiler that fits in a tweet
   Link: https://example.com/tiny-compiler
   Points: 521

2. Show HN: I mapped every CDP command to a Go method
   Link: https://news.ycombinator.com/item?id=43990011
   Points: 274

Saved screenshot to hackernews.png
Releasing session...
```

A run costs a few cents of browser time. Steel bills per session-minute, so the deferred `client.Sessions.Release` is not optional. The `defer` sits right after the create call, so the session is released whether `run` returns clean or errors partway through. Drop it and the browser stays up until the default five-minute timeout, on your dime.

## Make it yours

- **Swap the target.** Change the `page.Goto` URL and the `extractTopStories` script. The JSON-string bridge works for any shape: define a matching Go struct and unmarshal. Session setup and cleanup stay identical.
- **Skip the JS.** `page.QuerySelectorAll("tr.athing")` returns `ElementHandle` values with `TextContent` and `GetAttribute`, if you would rather query node by node than evaluate a script. It is more round-trips and easier to debug one selector at a time.
- **Turn on stealth.** `SessionCreateParams` carries `UseProxy`, `SolveCaptcha`, and `Timeout` for sites with anti-bot defenses. Set them on the struct you pass to `Sessions.Create`.
- **Add steps.** Playwright auto-waits on actionability, so `page.Click`, `page.Fill`, and `page.WaitForSelector` are reliable without manual sleeps when you fill forms or paginate before extracting.

## Related

[chromedp](../chromedp) and [Rod](../rod) are the pure-Go options: both speak CDP directly with no Node driver to install, so compare their `main.go` against this one to decide whether the Playwright API is worth the extra dependency. The [TypeScript](../playwright-ts) and [Python](../playwright-py) starters connect to Steel the same way through the official Playwright bindings. See the [playwright-go docs](https://pkg.go.dev/github.com/playwright-community/playwright-go) for the full page, locator, and screenshot API.
