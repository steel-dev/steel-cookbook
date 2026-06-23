# Genkit Go Starter

[Genkit](https://genkit.dev/go/docs/get-started-go) is Google's Go framework for building LLM applications. `genkit.DefineTool` turns a typed Go function into a tool the model can call, inferring the tool's JSON schema from the input struct by reflection. This starter defines three tools over a Steel cloud browser and lets a Claude model drive them to read Hacker News.

```go
navigate := genkit.DefineTool(g, "navigate",
    "Open a URL in the live browser tab and wait for it to load.",
    func(tc *ai.ToolContext, in navigateInput) (string, error) {
        var title, url string
        err := chromedp.Run(b.tab,
            chromedp.Navigate(in.URL), chromedp.Title(&title), chromedp.Location(&url))
        return fmt.Sprintf("title=%q url=%s", title, url), err
    },
)

resp, err := genkit.Generate(ctx, g,
    ai.WithModelName("anthropic/claude-haiku-4-5"),
    ai.WithTools(navigate, extract, scrape),
    ai.WithMaxTurns(12),
    ai.WithOutputType(Report{}),
)
```

`genkit.Generate` runs the tool-calling loop for you. It calls the model, executes any tools the model requests, feeds the results back, and repeats until the model stops or `WithMaxTurns` is hit. You do not write the loop. `WithOutputType(Report{})` constrains the final turn to a Go struct, so `resp.Output(&out)` fills a typed `Report` and a malformed answer is sent back for the model to correct.

The schema the model sees comes from struct tags. `jsonschema_description` on a field becomes that argument's description in the tool definition, which is how the model learns what `rowSelector` or `attr` mean:

```go
type extractInput struct {
    RowSelector string      `json:"rowSelector" jsonschema_description:"CSS selector matching each item, e.g. 'tr.athing'."`
    Fields      []fieldSpec `json:"fields"`
    Limit       int         `json:"limit,omitempty"`
}
```

## Two ways to read a page

The tools cover the two access patterns a browsing agent needs:

- `navigate` + `extract` drive one live chromedp tab attached to the Steel session over CDP. `extract` takes a row selector plus a field-per-column list and runs the whole pull inside a single `chromedp.Evaluate`. Serial CDP round-trips to a cloud browser run about 200 to 300 ms each, so collapsing N rows by M fields into one evaluate keeps a page read under a second instead of stacking dozens of trips.
- `scrape` calls `client.Scrape` and returns clean Markdown for a URL without touching the tab. It is the reliable path when the agent just needs an article's text, and it sidesteps selector guesswork entirely.

The model picks per step. On Hacker News it navigates, extracts the story rows, and answers. Pointed at an article it tends to reach for `scrape`.

## Run it

```bash
cd examples/genkit-go
cp .env.example .env          # set STEEL_API_KEY and ANTHROPIC_API_KEY
go mod tidy
go run .
```

Get keys from [app.steel.dev](https://app.steel.dev/settings/api-keys) and [console.anthropic.com](https://console.anthropic.com/). The program prints a session viewer URL as it starts; open it in another tab to watch the browser run live. Each tool call prints its latency.

Your output varies. Structure looks like this:

```text
Steel + Genkit Go Starter
============================================================
Session: https://app.steel.dev/sessions/ab12cd34...
    navigate: 1183ms
    extract: 412ms (5 rows)

Agent finished.
{
  "summary": "The front page is mostly systems and AI tooling right now.",
  "stories": [
    {
      "rank": 1,
      "title": "Show HN: ...",
      "url": "https://example.com/...",
      "points": "342"
    }
  ]
}

tokens: 5120 in, 380 out

Releasing Steel session...
Session released. Replay: https://app.steel.dev/sessions/ab12cd34...
```

A run takes about 20 to 40 seconds and 4 to 8 model turns. Cost is a few cents of Steel session time plus Claude tokens. The deferred cleanup in `main` releases the session: Steel bills per session-minute, so a leaked session keeps running until the default 5-minute timeout.

## Notes

- **Go version.** Genkit Go 1.0 requires Go 1.25, so `go.mod` declares `go 1.25.0`. chromedp is pinned to `v0.13.6`, the last release that still builds on Go 1.23, to keep the rest of the tree from pulling the toolchain higher than Genkit needs.
- **Session reuse.** One Steel session and one chromedp tab live in the `browser` struct shared by every tool, so `navigate` and `extract` act on the same page. `chromedp.NoModifyURL` stops chromedp rewriting Steel's websocket URL, which would drop the `apiKey` query parameter.

## Make it yours

- **Swap the model.** Change `WithModelName`. Any model the [Anthropic plugin](https://pkg.go.dev/github.com/firebase/genkit/go/plugins/anthropic) exposes works without code changes, for example `anthropic/claude-sonnet-4-5`. To use Gemini instead, register `&googlegenai.GoogleAI{}` in `genkit.Init`, set `GEMINI_API_KEY`, and pass `googleai/gemini-2.5-flash`.
- **Swap the task.** Change the prompt and the `Report` struct in `main`. The tools stay the same; the agent re-plans against the new output shape.
- **Add a tool.** Write a function `func(tc *ai.ToolContext, in In) (Out, error)`, wrap it with `genkit.DefineTool`, and add it to `WithTools`. A useful fourth is `click(selector string)` that runs `chromedp.Click` and waits for navigation.
- **Expose it as a flow.** Wrap the `Generate` call in `genkit.DefineFlow` to get tracing in the Genkit Dev UI and an HTTP handler for the same logic.

## Related

[Steel + Eino (Go)](../eino-go) and [Steel + Pydantic AI (Python)](../pydantic-ai) build the same agent shape in other frameworks. [Genkit Go docs](https://genkit.dev/go/docs/get-started-go) cover tools, flows, and plugins.
