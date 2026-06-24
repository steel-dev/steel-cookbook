# Rod on a Steel browser (Go)

Rod talks the Chrome DevTools Protocol directly and exposes it through a chainable, panic-on-error API. A Steel session is a Chrome instance reachable over a websocket, so `ControlURL` is the only seam you need: hand Rod the session's websocket URL with your key appended, and the rest of your code is ordinary Rod against a browser that runs in Steel's cloud with stealth, proxies, and a live viewer. Nothing about the queries below knows or cares that the browser is remote.

```go
cdpURL := fmt.Sprintf("%s&apiKey=%s", session.WebsocketURL, apiKey)
browser := rod.New().ControlURL(cdpURL).MustConnect()
defer browser.MustClose()

page := browser.MustPage("https://quotes.toscrape.com").MustWaitStable()
```

`rod.New()` returns a `*Browser` you keep configuring by chaining. `ControlURL` points it at the remote Chrome instead of launching a local one, and `MustConnect` attaches over CDP. There is no `NewContext` or `NewPage` ceremony: `MustPage` opens a tab and returns a `*Page` you query straight away.

## The connect URL

`session.WebsocketURL` already carries Steel's session identifier. The one thing you add is your API key as a query parameter, which is why the code formats `%s&apiKey=%s` rather than passing the URL through untouched. Rod connects to exactly the URL you give it and does not rewrite the address, so the key has to be in the string before `ControlURL` sees it. If you forget it, the websocket handshake is rejected and `MustConnect` panics before the first page loads.

The session itself comes from the Steel SDK. `client.Sessions.Create` returns a `*Session` whose `WebsocketURL`, `SessionViewerURL`, and `ID` fields drive the rest of the program: the websocket URL to connect, the viewer URL to print, and the ID to release at the end.

```go
session, err := client.Sessions.Create(ctx, steel.SessionCreateParams{
    Dimensions: &steel.SessionCreateParamsDimensions{Width: 1280, Height: 800},
})
```

Every field on `SessionCreateParams` is a pointer, so an omitted field is a real "unset" rather than a zero value the API has to guess about. The `ptr` helper at the top of `main.go` is a one-line generic that wraps a literal in a pointer, which is what lets you write `Dimensions` inline and, later, flags like `SolveCaptcha: ptr(true)`.

The one field worth setting deliberately on a longer job is `Timeout`. It is the hard cap on session lifetime in milliseconds and defaults to 300000, five minutes. A scrape that needs longer has to raise it at creation time, because there is no way to extend a session once it is live: when the timeout elapses, Steel releases the browser out from under you and the next Rod call fails. For the quick scrape here the default is plenty, and the deferred `Release` ends the session in well under a second anyway.

## The Must idiom

The `Must` prefix is the whole style. `MustElement`, `MustText`, and `MustElements` panic instead of returning a `(value, error)` pair, which keeps a scrape readable as a straight line of selectors rather than an error check after every call. The trade is that a missing selector aborts the program, so the cleanup that releases the session has to run no matter how the scrape exits. That is what the two deferred calls in `main` are for: one closes the CDP connection, the other ends the Steel session.

`main.go` loads `quotes.toscrape.com` and pulls the first five quote cards off the page. For each `.quote` block it reads the quote text, the author, and the tag list:

```go
cards := page.MustElements(".quote")
for i, card := range cards {
    text := strings.Trim(card.MustElement(".text").MustText(), "“”\"")
    author := card.MustElement(".author").MustText()
    tags := card.MustElements(".tag")
    // ...
}
```

`MustElements` returns `rod.Elements`, which is a `[]*Element`, so you range over it like any slice. Scoping the next query to `card` (calling `MustElement` on the element, not the page) is how Rod expresses "find this inside that": each `.text` and `.author` lookup is relative to its own card, not the whole document. After the loop, `MustScreenshot("quotes.png")` writes a PNG of the rendered page to disk.

The screenshot is captured on the remote browser and streamed back as bytes, so the PNG lands on your machine even though Chrome never ran locally. The same is true of `MustHTML` and `page.MustEval` for JavaScript: Rod issues the CDP command, Steel runs it in the cloud, and you get the result. This is the reason a scrape needs no local Chrome and no driver binary on your path.

## Watch it run

The program prints `session.SessionViewerURL` right after `Create`. Opening that link shows the live browser: the page navigating, the DOM settling, and the screenshot firing, all in real time. It is the fastest way to debug a selector that is not matching, because you can see the actual rendered page rather than guessing from a panic message. The viewer also keeps showing the last frame after the session ends, so a run that failed mid-scrape still leaves you something to inspect.

## Run it

```bash
cd examples/rod
cp .env.example .env          # set STEEL_API_KEY
go mod tidy
go run .
```

Get a key at [app.steel.dev/settings/api-keys](https://app.steel.dev/settings/api-keys). The program prints a session viewer URL as it starts. Open it in another tab to watch the page load and the screenshot get taken in real time.

Your output varies with the site. Structure looks like this:

```text
Creating Steel session...
Session live at https://app.steel.dev/sessions/ab12cd34...

Connected to browser via Rod
Scraping quotes.toscrape.com...

Found 10 quotes on the page:

1. The world as we have created it is a process of our thinking.
   - Albert Einstein
   tags: change, deep-thoughts, thinking, world

2. It is our choices, Harry, that show what we truly are.
   - J.K. Rowling
   tags: abilities, choices

...

Saved screenshot to quotes.png

Releasing session...
Session released
Done!
```

A run takes a few seconds and costs a few cents of browser time. Steel bills per session-minute, so the `defer client.Sessions.Release(...)` call is not optional: skip it and the browser stays live until the default five-minute timeout, billing the whole time. `browser.MustClose()` closes the CDP connection; `Release` ends the Steel session. You want both, and you want them deferred so a panic from a `Must` call still triggers them on the way out.

## Make it yours

- **Swap the target.** Change the `MustPage` URL and the selectors in the loop. The `quotes.toscrape.com` site paginates with a `.next > a` link, so you can follow it in a loop and scrape every page instead of one. Session setup and cleanup stay the same.
- **Wait on real readiness.** `MustWaitStable` blocks until the DOM stops changing, which suits server-rendered pages. For a site that loads content with JavaScript after first paint, wait on the element you actually need with `page.MustElement(sel)`, which polls until it appears instead of guessing at a fixed delay.
- **Turn on stealth.** `SessionCreateParams` accepts `SolveCaptcha`, `UseProxy`, and `Timeout` for sites with anti-bot defenses. Each is a pointer, so set them through the `ptr` helper: `SolveCaptcha: ptr(true)`.
- **Survive missing elements.** The `Must` methods are convenient for a script. For a long-running job, use the non-`Must` variants (`page.Element` returns `(*rod.Element, error)`) or wrap the risky section in `rod.Try`, which converts a panic into an error you can inspect and recover from rather than crashing the process.

## Related

[chromedp version](../chromedp) drives the same kind of Steel session with a different Go library: chromedp batches actions into a single `Run` call rather than chaining element handles, so comparing the two `main.go` files is a quick way to decide which style fits your code. See the [Rod documentation](https://go-rod.github.io) for the full selector, input, and waiting API, and the [Playwright starter](../playwright-ts) for the same connect-over-CDP idea in TypeScript.
