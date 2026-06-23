# Google ADK Go Starter

[Google ADK](https://adk.dev/get-started/go/) is Google's Agent Development Kit, a code-first toolkit for building agents in Go. The pieces fit together as a tree: a `model.LLM`, a set of `tool.Tool` values, and an `llmagent` that owns them, all driven by a `runner.Runner` that turns one user message into a stream of events. This starter hands that agent three tools backed by a Steel cloud browser and points a Gemini model at Hacker News.

The runner is the part worth understanding first. You do not write the tool-calling loop. You hand `runner.New` a root agent and a session service, call `Run`, and range over the events it yields:

```go
r, _ := runner.New(runner.Config{AppName: appName, Agent: a, SessionService: sessionService})

for event, err := range r.Run(ctx, userID, sessionID, task, agent.RunConfig{
    StreamingMode: agent.StreamingModeNone,
}) {
    for _, part := range event.Content.Parts {
        if part.Text != "" {
            final = part.Text
        }
    }
}
```

`Run` returns a Go 1.23 iterator (`iter.Seq2[*session.Event, error]`). Each event is one step: a model turn that requests a tool, the tool's result fed back in, the next model turn, and so on until the model answers without calling anything. Every event carries a `genai.Content`, so ranging over `event.Content.Parts` lets you watch text, function calls, and function responses flow past. The loop in `main` keeps the last non-empty text part; that is the agent's final answer.

## Tools from a Go function

`functiontool.New` wraps a typed Go function as a tool. It is generic over the argument and result types and infers the JSON schema the model sees from your input struct by reflection:

```go
navigate, _ := functiontool.New(functiontool.Config{
    Name:        "navigate",
    Description: "Open a URL in the live browser tab and wait for it to load.",
}, func(tc agent.ToolContext, in navigateInput) (navigateOutput, error) {
    var title, url string
    err := chromedp.Run(b.tab,
        chromedp.Navigate(in.URL), chromedp.Title(&title), chromedp.Location(&url))
    return navigateOutput{Title: title, URL: url}, err
})
```

The schema comes from struct tags. A `jsonschema` tag on a field becomes that argument's description in the tool declaration, which is how the model learns what `rowSelector` or `attr` mean:

```go
type extractInput struct {
    RowSelector string      `json:"rowSelector" jsonschema:"CSS selector matching each item, e.g. 'tr.athing'."`
    Fields      []fieldSpec `json:"fields" jsonschema:"One entry per column to pull out of each row."`
    Limit       int         `json:"limit,omitempty" jsonschema:"Maximum number of rows to return. Defaults to 10."`
}
```

The first argument to every handler is an `agent.ToolContext`. It embeds `context.Context`, so the `scrape` tool passes `tc` straight to `client.Scrape` as the request context. The handlers return ordinary Go structs and errors; ADK marshals the struct into the function response and an error becomes a tool failure the model can react to.

Three tools cover the two access patterns a browsing agent needs:

- `navigate` and `extract` drive one live chromedp tab attached to the Steel session over CDP. `extract` takes a row selector plus a field-per-column list and runs the whole pull inside a single `chromedp.Evaluate`. Serial CDP round-trips to a cloud browser run about 200 to 300 ms each, so collapsing N rows by M fields into one evaluate keeps a page read under a second instead of stacking dozens of trips.
- `scrape` calls `client.Scrape` and returns clean Markdown for a URL without touching the tab. It is the reliable path when the agent just needs an article's text and sidesteps selector guesswork entirely.

## Run it

```bash
cd examples/google-adk-go
cp .env.example .env          # set STEEL_API_KEY and GOOGLE_API_KEY
go mod tidy
go run .
```

Get keys from [app.steel.dev](https://app.steel.dev/settings/api-keys) and [Google AI Studio](https://aistudio.google.com/apikey). `GOOGLE_GENAI_USE_VERTEXAI=FALSE` in `.env.example` keeps the genai client on the AI Studio backend, so the API key alone is enough and no Vertex project is required. The program prints a session viewer URL as it starts; open it in another tab to watch the browser run live. Each tool call prints its latency.

Your output varies. Structure looks like this:

```text
Steel + Google ADK Go Starter
============================================================
Session: https://app.steel.dev/sessions/ab12cd34...
    navigate: 1183ms
    extract: 412ms (5 rows)

Agent finished.
{
  "stories": [
    {
      "points": "342",
      "rank": 1,
      "title": "Show HN: ...",
      "url": "https://example.com/..."
    }
  ]
}

Releasing Steel session...
Session released. Replay: https://app.steel.dev/sessions/ab12cd34...
```

A run takes about 20 to 40 seconds and a handful of model turns. Cost is a few cents of Steel session time plus Gemini tokens. The deferred cleanup in `main` releases the session: Steel bills per session-minute, so a leaked session keeps running until the default 5-minute timeout.

## Structured output

ADK Go can pin an agent's reply to a `genai.Schema` through `OutputSchema` on the agent config, but setting it disables tools: an agent with an output schema can only reply, it cannot call functions. This agent needs its tools, so it returns JSON as text instead. The instruction asks for a bare JSON object, and `prettyJSON` in `main` strips a stray code fence if the model adds one, then re-indents the result. If you would rather have a typed value, split the work into two agents: a tool-using agent that gathers the rows and a second agent with `OutputSchema` set that formats them.

## Make it yours

- **Swap the model.** Change `modelName`. Any Gemini model your key can reach works without code changes, for example `gemini-2.5-pro`. `gemini.NewModel` takes the name and a `genai.ClientConfig`.
- **Swap the task.** Change the `task` content and the JSON shape named in the agent instruction. The tools stay the same; the agent re-plans against the new request.
- **Add a tool.** Write a `func(agent.ToolContext, In) (Out, error)`, wrap it with `functiontool.New`, and add it to the agent's `Tools`. A useful fourth is `click(selector string)` that runs `chromedp.Click` and waits for navigation.
- **Inspect the loop.** Range over more than text. Every event exposes `event.Content.Parts`, where `FunctionCall` and `FunctionResponse` parts let you log exactly which tool the agent reached for and what came back.

## Related

[Steel + Genkit (Go)](../genkit) and [Steel + Eino (Go)](../eino) build the same agent shape in other Go frameworks. The [ADK Go quickstart](https://adk.dev/get-started/go/) covers agents, tools, and the runner in depth.
