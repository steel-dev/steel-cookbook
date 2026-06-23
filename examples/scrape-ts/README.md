# Scrape API (TypeScript)

`client.scrape()` takes a URL and returns the page already converted to Markdown. That matters because Markdown is the format large language models read best: headings, lists, and links survive, while the script tags, tracking pixels, and nav chrome that bloat a raw HTML dump are gone. You get a string you can drop straight into a prompt, with no headless Chrome on your machine and no DOM parsing in your code.

```typescript
const scraped = await client.scrape({
  url: TARGET_URL,
  format: ["markdown"],
});

const markdown = scraped.content.markdown ?? "";
```

`scrape()` runs the fetch and the cleanup on Steel's side, so there is no session to create, connect to, or release. One HTTP call in, structured content out. The same `client.screenshot()` and `client.pdf()` calls render the same page two other ways.

## Markdown for model context

The reason to reach for `scrape()` over a browser library is the format. A raw page is mostly markup a model has to wade through: a single news article can be tens of thousands of tokens of `<div>` soup before the first sentence. Markdown collapses that to the text, the structure, and the links, so you spend tokens on content instead of tags. The wiring is small once you have the string:

```typescript
const { content, metadata } = await client.scrape({
  url: TARGET_URL,
  format: ["markdown"],
});

const answer = await llm.chat({
  messages: [
    { role: "system", content: "Answer using only the page below." },
    { role: "user", content: `# ${metadata.title}\n\n${content.markdown}` },
  ],
});
```

That is the whole integration: scrape to Markdown, prepend the title, hand it to a model. No selectors, no `page.evaluate`, no waiting on a DOM you do not control.

One failure mode to plan for: a heavily client-rendered page can return near-empty Markdown if the content paints after the initial load. When `content.markdown` comes back short for a site you know is rich, add `delay` (milliseconds) to the `scrape()` call so the page settles before capture. Check `metadata.statusCode` too. A scrape of a 403 or a soft-blocked page still succeeds at the HTTP level but hands you the block page's text, not the content you wanted.

## What you get back

`format` is an array, so you can ask for more than one representation in a single call: `["markdown", "html", "cleaned_html", "readability"]`. Each lands under `content` on the response (`content.markdown`, `content.html`, and so on), and the field is undefined when you did not request that format, which is why the example reads `content.markdown ?? ""`.

The response carries more than the body. `scraped.metadata` holds the page `title`, `description`, `statusCode`, Open Graph tags, and the canonical URL. `scraped.links` is a flat array of `{ text, url }` for every link on the page, handy when you want an LLM to pick a next page to visit. The example prints the status code, title, link count, and the first 500 characters of Markdown so you can see the shape without dumping a whole article to the terminal.

`screenshot()` and `pdf()` differ from `scrape()` in one way worth knowing up front: they return a hosted URL, not bytes. `shot.url` and `pdf.url` point at the rendered artifact on Steel's storage, so the example logs the links rather than writing files. If you want the bytes on disk, fetch the URL yourself. The Python sibling does exactly that.

## Run it

```bash
cd examples/scrape-ts
cp .env.example .env          # set STEEL_API_KEY
npm install
npm start
```

Get a key at [app.steel.dev/settings/api-keys](https://app.steel.dev/settings/api-keys). `TARGET_URL` in `.env` is optional and defaults to Hacker News.

Your output varies. Structure looks like this:

```text
Steel Scrape API (TypeScript)
============================================================

Scraping https://news.ycombinator.com to markdown...
HTTP 200 | Hacker News
Links found: 174
Markdown length: 6841 characters

--- Markdown preview (first 500 chars) ---
# Hacker News

* [new](newest)
* [past](front)
* [comments](newcomments)
* [ask](ask)
* [show](show)
...
--- end preview ---

Capturing a full-page screenshot...
Screenshot hosted at: https://steel-screenshots.s3.amazonaws.com/...

Rendering the page to PDF...
PDF hosted at: https://steel-screenshots.s3.amazonaws.com/...

Done. Feed the markdown straight into an LLM prompt.
```

Each of the three calls is one billed request against Steel, so a full run costs a few cents of browser time. There is no session left open to leak: `scrape()`, `screenshot()`, and `pdf()` each return when the work is finished, so unlike the browser-driving recipes there is no `release()` to forget.

## Make it yours

- **Pipe Markdown into a model.** Pass `markdown` as the user message to your LLM of choice and ask it to summarize the page or pull out structured fields. This is the whole reason to scrape to Markdown instead of HTML.
- **Ask for several formats at once.** Set `format: ["markdown", "html"]` when you want the clean text for the model and the raw HTML for a fallback parser, both from a single request.
- **Bundle artifacts into the scrape.** Instead of separate `screenshot()` and `pdf()` calls, pass `screenshot: true` and `pdf: true` to `scrape()`. The URLs come back on `scraped.screenshot` and `scraped.pdf`, which is one billed request instead of three.
- **Get past anti-bot pages.** Add `useProxy: true` to route through Steel's residential proxies, or `delay: 3000` to wait for client-side rendering before the capture.
- **Pick a region.** `region` accepts values like `"iad"` or `"fra"` to run the fetch closer to the target or to your users.

## Related

[Python version](../scrape-py) renders the same endpoints and writes the screenshot and PDF to disk as files. [Rust version](../scrape-rs) is the lowest-friction way into the Rust SDK. For a recipe that drives a real browser instead of the direct API, see [playwright-ts](../playwright-ts). Full method and parameter reference lives in the [steel-sdk package](https://www.npmjs.com/package/steel-sdk).
