# Scrape API (Python)

Steel's `/v1/scrape` endpoint runs a browser server-side and hands back the rendered page. There is no session to create, no CDP socket to attach to, and no browser library on your machine. You call one method, and you get the page content, plus an optional screenshot and PDF. This recipe turns that single call into three files on disk: `page.md`, `screenshot.png`, and `page.pdf`.

```python
result = client.scrape(
    url=TARGET_URL,
    format=["markdown"],
    screenshot=True,
    pdf=True,
)
```

The one detail worth internalizing: the response mixes inline data and hosted artifacts. `result.content.markdown` is a string you can write straight to a file. But `result.screenshot.url` and `result.pdf.url` are **hosted URLs**, not bytes. Steel renders the image and PDF, stores them, and returns links. So the recipe writes the markdown directly, then fetches the two URLs with `urllib` and saves the bytes. The `download` helper does the fetch; `main` wires the three writes.

Because there is no session object, there is no teardown. `client.sessions.release(...)` does not apply here. You pay for the render, the response comes back, and you are done. That makes scrape the lowest-friction way to pull a page into an agent's context: one call, structured output, no lifecycle to manage.

## Run it

```bash
cd examples/scrape-py
cp .env.example .env          # set STEEL_API_KEY
uv run main.py
```

Grab a key at [app.steel.dev/settings/api-keys](https://app.steel.dev/settings/api-keys). `uv sync` runs automatically on first `uv run`, so there is no separate install step.

Your output varies. Structure looks like this:

```text
Steel Scrape API (Python)
============================================================
Scraping https://news.ycombinator.com ...
Fetched "Hacker News" (HTTP 200)
Markdown: 8421 chars, 147 links
Saved page.md (8421 chars)
Saved screenshot.png (184320 bytes)
Saved page.pdf (96774 bytes)

Artifacts written to /path/to/examples/scrape-py/output
Done!
```

The three files land in `output/` next to `main.py`. Open `page.md` to see the markdown an LLM would read, `screenshot.png` for the rendered viewport, and `page.pdf` for a print-layout capture.

A scrape costs a few cents of browser time. You are billed per render, not per minute, so a one-shot scrape is cheaper than spinning up a full session for the same page. If you only need text, drop `screenshot=True` and `pdf=True` and you skip the render-and-host work for the artifacts you are not using.

## Make it yours

- **Change the target.** Set `TARGET_URL` in `.env`, or edit the default in `main.py`. Everything downstream is the same.
- **Pick your formats.** `format` accepts any of `markdown`, `html`, `cleaned_html`, and `readability`. Pass a list to get several at once, then read them off `result.content` (`result.content.html`, `result.content.cleaned_html`, and so on). `cleaned_html` strips scripts and boilerplate; `readability` returns article-extracted structure.
- **Mine the metadata.** `result.metadata` carries `title`, `description`, `status_code`, Open Graph fields (`og_title`, `og_image`), `canonical`, `author`, and `json_ld`. `result.links` is a list of `{text, url}` for every link on the page, which is a ready-made frontier for a crawler.
- **Get the artifacts without the markdown.** `client.screenshot(url=..., full_page=True)` and `client.pdf(url=...)` are standalone calls that each return a single hosted URL. Use them when you want a capture and nothing else. `full_page=True` captures past the fold.
- **Reach difficult sites.** Pass `use_proxy=True` to route the render through Steel's residential proxy network for pages that block datacenter traffic.

## How scrape differs from a browser session

The other recipes in the cookbook connect a browser library (Playwright, Selenium) to a live Steel session over CDP, then drive clicks and reads themselves. That is the right tool when you need to log in, fill forms, or step through an app. Scrape is the right tool when you just want the page as it renders: one request in, content out, nothing to keep alive. If your agent's job is "read this URL," reach for scrape first and graduate to a session only when you need interaction.

## Related

[TypeScript version](../scrape-ts) covers the same endpoint with the clean-markdown-for-LLM angle. [Rust version](../scrape-rs) walks the three calls separately. For a live, interactive browser instead, see [playwright-py](../playwright-py).
