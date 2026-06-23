# Steel + LangChainGo agent (Go)

[LangChainGo](https://github.com/tmc/langchaingo) is the Go port of LangChain: LLM wrappers, chains, and agents that loop over tools until they reach an answer. This recipe gives a LangChainGo agent one tool backed by Steel's `scrape` endpoint, so the model reads pages as clean Markdown and never touches a browser library or CDP. The agent runs on Anthropic (`claude-sonnet-4-6`) through a zero-shot ReAct (MRKL) executor.

LangChainGo's `tools.Tool` interface is deliberately small. A tool is a name, a description, and a `Call` that takes a string and returns a string:

```go
type scrapeTool struct{ client *steel.Client }

func (t scrapeTool) Name() string       { return "scrape" }
func (t scrapeTool) Description() string { return "Fetch a web page as clean Markdown. Input: one absolute URL." }

func (t scrapeTool) Call(ctx context.Context, input string) (string, error) {
    url := strings.Trim(strings.TrimSpace(input), "\"'")
    resp, err := t.client.Scrape(ctx, steel.ClientScrapeParams{
        URL:    url,
        Format: &[]steel.ScrapeRequestFormatItem{steel.ScrapeRequestFormatItemMarkdown},
    })
    // ... return the capped resp.Content.Markdown
}
```

The input arrives as a plain string because a ReAct agent emits `Action: scrape` then `Action Input: https://...` as text, and the executor hands you whatever follows. That is why `Call` trims surrounding quotes and whitespace before using the URL: the model's formatting is not guaranteed. There is no JSON schema and no typed argument struct, which is the trade LangChainGo makes for running on any text model.

Wiring the agent is one call:

```go
executor, err := agents.Initialize(
    llm,
    []tools.Tool{scrapeTool{client: client}},
    agents.ZeroShotReactDescription,
    agents.WithMaxIterations(5),
)
answer, err := chains.Run(ctx, executor, task)
```

`Initialize` builds the MRKL agent and wraps it in an `Executor`, which is itself a chain, so `chains.Run` drives the whole reason-act loop and returns the final string. `WithMaxIterations(5)` caps the loop so a model that never emits `Final Answer:` cannot spin forever.

## Run it

```bash
cd examples/langchaingo
cp .env.example .env          # set STEEL_API_KEY and ANTHROPIC_API_KEY
go run .
```

Get a Steel key at [app.steel.dev/settings/api-keys](https://app.steel.dev/settings/api-keys) and an Anthropic key at [console.anthropic.com](https://console.anthropic.com/settings/keys). Your output varies. Structure looks like this:

```text
Running LangChainGo agent...

The top 3 Hacker News stories right now are:
1. "..." with 512 points
2. "..." with 488 points
3. "..." with 401 points
```

Each scrape call spins up a short-lived Steel browser server-side, so a run costs a few cents of browser time plus the Anthropic tokens for the ReAct loop. There is no session to release: `scrape` opens and closes its own browser per call.

## Make it yours

- **Swap the task.** Change `task` in `main.go`. The tool stays the same; the agent re-plans against the new goal.
- **Add a tool.** Any struct with `Name`, `Description`, and `Call` slots into the `[]tools.Tool` list. A second tool backed by `client.Screenshot`, or one of LangChainGo's built-ins like the calculator, drops straight in and the MRKL agent picks per step.
- **Change the model.** Pass a different id to `anthropic.WithModel`, or swap `anthropic.New` for `openai.New` (LangChainGo ships both). The tool is unaffected.
- **Use native tool-calling.** `agents.NewOpenAIFunctionsAgent` replaces ReAct text parsing with structured function calls on models that support them.

## Related

[eino](../eino) is the closest sibling: another Go ReAct agent on Steel's scrape API, but with typed tool arguments instead of LangChainGo's string interface. [genkit](../genkit) drives a chromedp browser instead of the scrape endpoint. The [LangChainGo docs](https://tmc.github.io/langchaingo/docs/) cover chains, memory, and the agent types.
