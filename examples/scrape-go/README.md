# Steel Scrape API (Go)

Steel's direct API turns a URL into clean content with no browser library and no session to manage. One `client.Scrape` call runs a browser server-side and returns the page as Markdown (or HTML, readability, or cleaned HTML) inline, while `client.Screenshot` and `client.Pdf` render the same page to hosted files. This recipe scrapes a page to Markdown, prints a preview, then captures a full-page screenshot and a PDF. It is the lowest-friction way to reach a page from Go: no CDP, no chromedp, no `defer release`.

The scrape call leads:

```go
scraped, err := client.Scrape(ctx, steel.ClientScrapeParams{
    URL:    targetURL,
    Format: &[]steel.ScrapeRequestFormatItem{steel.ScrapeRequestFormatItemMarkdown},
})
markdown := deref(scraped.Content.Markdown, "")
title := deref(scraped.Metadata.Title, "(no title)")
```

Two Go specifics show up here. Optional request fields are pointers (`Format` is a `*[]ScrapeRequestFormatItem`, `FullPage` is a `*bool`), and steel-go ships no pointer constructors, so the recipe defines a one-line `ptr[T]` generic. Response fields like `Content.Markdown` and `Metadata.Title` are `*string`, so a small `deref` helper supplies a fallback. The format is a typed constant (`steel.ScrapeRequestFormatItemMarkdown`), not a bare string.

Screenshot and PDF come back as hosted URLs, not bytes:

```go
shot, _ := client.Screenshot(ctx, steel.ClientScreenshotParams{URL: targetURL, FullPage: ptr(true)})
fmt.Println(shot.URL) // https://...

pdf, _ := client.Pdf(ctx, steel.ClientPdfParams{URL: targetURL})
fmt.Println(pdf.URL)
```

To keep the files, fetch each URL with `net/http` and write the bytes to disk.

## Run it

```bash
cd examples/scrape-go
cp .env.example .env          # set STEEL_API_KEY
go run .
```

Get a Steel key at [app.steel.dev/settings/api-keys](https://app.steel.dev/settings/api-keys). Point it at any page with `TARGET_URL` in `.env`. Your output varies. Structure looks like this:

```text
Steel Scrape API (Go)
============================================================

Scraping https://news.ycombinator.com to markdown...
HTTP 200 | Hacker News
Links found: 184
Markdown length: 8423 characters

--- Markdown preview (first 500 chars) ---
[ clean Markdown for the page ]
--- end preview ---

Capturing a full-page screenshot...
Screenshot hosted at: https://...
Rendering the page to PDF...
PDF hosted at: https://...

Done. Feed the markdown straight into an LLM prompt.
```

A scrape call costs a few cents of browser time. Steel starts and tears down the browser per call, so there is no session to release.

## Make it yours

- **Change the page.** Set `TARGET_URL` in `.env`, or pass a different URL to `client.Scrape`.
- **Ask for several formats.** `Format` takes a slice, so request more than one at once (`ScrapeRequestFormatItemMarkdown`, `...HTML`, `...Readability`, `...CleanedHTML`). Each lands under its own field on `Content`.
- **Save the artifacts.** Fetch `shot.URL` and `pdf.URL` with `net/http` and `os.WriteFile` to write `screenshot.png` and `page.pdf`, the way the Python recipe does.
- **Scrape behind a proxy.** Set `UseProxy: ptr(true)` to route through a Steel residential proxy for geofenced or bot-sensitive pages.

## Related

[scrape-ts](../scrape-ts) and [scrape-py](../scrape-py) are the same direct API in TypeScript and Python, where the Python recipe writes the screenshot and PDF to disk. [scrape-rs](../scrape-rs) is the Rust version. For a full browser you drive yourself, [chromedp](../chromedp) and [rod](../rod) connect over CDP instead.
