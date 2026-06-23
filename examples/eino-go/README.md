# Eino Research Agent (Go)

[Eino](https://www.cloudwego.io/docs/eino/) is ByteDance's LLM application framework for Go. Its `flow/agent/react` package ships a prebuilt ReAct agent: give it a tool-calling model and a set of tools, and it runs the reason-act loop for you. This recipe gives that agent two tools backed by Steel's Scrape API and points it at a news front page to write a short research briefing.

Unlike a CDP-driven recipe, there is no browser session to open or release here. `client.Scrape` runs a browser on Steel's side, fetches the page, and returns clean Markdown plus the page's links. The agent reads pages the way an LLM wants to read them (as text, not pixels), so the tools are plain HTTP calls and the whole program is stateless between turns.

```go
chatModel, _ := claude.NewChatModel(ctx, &claude.Config{
    APIKey:    anthropicKey,
    Model:     "claude-sonnet-4-6",
    MaxTokens: 2048,
})

agent, _ := react.NewAgent(ctx, &react.AgentConfig{
    ToolCallingModel: chatModel,
    ToolsConfig: compose.ToolsNodeConfig{
        Tools: []tool.BaseTool{scrapeTool, linksTool},
    },
    MaxStep: 24,
})

out, _ := agent.Generate(ctx, []*schema.Message{schema.UserMessage(task)})
```

`react.NewAgent` binds the tools to the model for you. You do not call a separate `BindTools`: passing tools in `ToolsConfig` is enough, and the agent advertises them to Claude on every turn. `Generate` runs the loop until the model stops calling tools or `MaxStep` is hit, then returns the final assistant message. There is also a `Stream` method with the same arguments if you want tokens as they arrive.

## Tools from a Go struct

`utils.InferTool` turns a typed function into a tool. It reads the input struct's tags to build the JSON schema the model sees, so you describe each argument once, in Go:

```go
type scrapePageArgs struct {
    URL string `json:"url" jsonschema:"required" jsonschema_description:"Absolute http(s) URL of the page to read."`
}

scrapeTool, _ := utils.InferTool(
    "scrape_page",
    "Fetch a web page through Steel and return it as clean Markdown plus title and description.",
    func(ctx context.Context, args scrapePageArgs) (string, error) {
        format := []steel.ScrapeRequestFormatItem{steel.ScrapeRequestFormatItemMarkdown}
        res, err := client.Scrape(ctx, steel.ClientScrapeParams{URL: args.URL, Format: &format})
        // ... marshal title + markdown to a JSON string for the model
    },
)
```

The companion `extract_links` tool calls the same endpoint and returns `res.Links` (text plus absolute URL) so the agent can pick which stories to open from an index page instead of guessing at URLs. Each tool truncates its output (Markdown to ~8k chars, links to 40) so a long page does not blow the model's context window. Both tools return a JSON string, which is what Eino feeds back to the model as the tool result.

## Run it

```bash
cd examples/eino-go
cp .env.example .env          # set STEEL_API_KEY and ANTHROPIC_API_KEY
go mod tidy
go run .
```

Get a Steel key at [app.steel.dev/settings/api-keys](https://app.steel.dev/settings/api-keys) and an Anthropic key at [console.anthropic.com](https://console.anthropic.com/). Each tool call prints its target and latency so you can watch the agent work through the page.

Your output varies. Structure looks like this:

```text
Steel + Eino research agent
============================================================
    extract_links https://news.ycombinator.com -> 40 links in 1840ms
    scrape_page https://news.ycombinator.com -> 5212 chars in 1502ms
    scrape_page https://example.com/post-a -> 4806 chars in 1733ms
    scrape_page https://example.com/post-b -> 3920 chars in 1611ms

Agent finished.
------------------------------------------------------------
1. Title of the first story
   https://example.com/post-a
   Why it matters in two sentences.

2. Title of the second story
   https://example.com/post-b
   ...
```

A run is typically 5 to 9 agent turns and ~15 to 35 seconds against Hacker News. Cost is a few cents: Steel bills the Scrape calls (one short browser fetch each), plus Claude tokens for the loop. Scrape sessions are short-lived and clean themselves up, so there is no `release` call to forget here. A long-lived CDP session is the case where forgetting cleanup keeps the meter running; see the chromedp recipe for that pattern.

## Make it yours

- **Swap the task.** Change the `task` constant. The tools stay the same; the agent re-plans against the new instructions. Try a comparison ("read these two pricing pages and tabulate the differences") or a single-page extraction.
- **Swap the model.** Eino's model components are interchangeable. Replace the `claude` import and `claude.NewChatModel` with `github.com/cloudwego/eino-ext/components/model/openai` and `openai.NewChatModel(ctx, &openai.ChatModelConfig{...})`; the tools and agent wiring do not change because tool schemas are provider-agnostic.
- **Return richer Markdown.** Add `steel.ScrapeRequestFormatItemReadability` or `steel.ScrapeRequestFormatItemCleanedHTML` to the `Format` slice and surface those fields if you want the article body without site chrome.
- **Add a tool.** Write another typed function and pass it through `utils.InferTool`, then add it to the `Tools` slice. A useful third tool is a `screenshot` call backed by `client.Screenshot` when the agent needs to confirm a page rendered.
- **Cap the loop differently.** `MaxStep` bounds how many model-plus-tool rounds run before the agent returns whatever it has. Lower it to fail fast on hard tasks, raise it for multi-page research.

## Related

[Genkit Go agent](../genkit-go) drives a live CDP browser through chromedp tools, the complementary angle to this stateless Scrape agent. [Pydantic AI](../pydantic-ai) is the same idea in Python. See the [Eino ReAct agent manual](https://www.cloudwego.io/docs/eino/core_modules/flow_integration_components/react_agent_manual/) for the agent internals and [Eino tools guide](https://www.cloudwego.io/docs/eino/core_modules/components/tools_node_guide/) for `InferTool`.
