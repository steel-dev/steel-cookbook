# Steel + rig agent (Rust)

[rig](https://docs.rs/rig-core) is a Rust framework for LLM applications: you define tools as trait impls, hand them to an `Agent`, and call `prompt`, which loops the model over those tools until it produces an answer. This recipe gives the agent two tools backed by a real Chrome running in the cloud through Steel, driven over CDP with [chromiumoxide](https://docs.rs/chromiumoxide). The model navigates and reads the live DOM itself instead of receiving pre-scraped text, so it can follow links and work on pages that only exist after JavaScript runs.

Each tool is a struct that owns a `chromiumoxide::Page` and implements rig's `Tool` trait:

```rust
struct Navigate { page: chromiumoxide::Page }

impl Tool for Navigate {
    const NAME: &'static str = "navigate";
    type Error = ToolError;
    type Args = NavigateArgs;     // { url: String }, Deserialize
    type Output = NavigateOutput; // { url, title }, Serialize

    async fn definition(&self, _prompt: String) -> ToolDefinition {
        ToolDefinition { name: Self::NAME.to_string(), description: "...", parameters: json!({ ... }) }
    }

    async fn call(&self, args: Self::Args) -> Result<Self::Output, Self::Error> {
        self.page.goto(args.url).await.map_err(|e| ToolError(e.to_string()))?;
        self.page.wait_for_navigation().await.map_err(|e| ToolError(e.to_string()))?;
        // ... return the resolved url and page title
    }
}
```

`definition` is the JSON Schema Claude sees; `call` is what runs when the model picks the tool. rig deserializes `Args` from the model's arguments and serializes `Output` back into the transcript, so those two types are the whole contract. `ExtractText` is the second tool: it runs `document.body.innerText` and a `querySelectorAll('a[href]')` snippet through `page.evaluate(...).into_value()`, returning capped body text plus up to 50 links so the model reads real anchors instead of guessing selectors.

Wiring the agent is one builder chain:

```rust
let agent = anthropic::Client::new(&anthropic_api_key)?
    .agent("claude-sonnet-4-6")
    .preamble(SYSTEM_PROMPT)
    .max_tokens(2048)
    .tool(Navigate { page: page.clone() })
    .tool(ExtractText { page })
    .build();

let answer = agent.prompt(TASK).max_turns(8).await?;
```

Both tools hold the same page. `page.clone()` is a cheap handle to the one open tab, so `navigate` and `extract_text` act on the same browser rather than spawning new ones. `prompt(...).max_turns(8)` is what makes this an agent and not a single call: rig feeds each tool result back to the model and re-prompts up to eight times, so Claude navigates, reads, then answers inside one `await`. The `8` is also the safety cap that stops a confused model from looping forever.

## The handler you must not forget

```rust
let (mut browser, mut handler) = Browser::connect(cdp_url).await?;
let handler_task = tokio::spawn(async move { while handler.next().await.is_some() {} });
```

`Browser::connect` returns a `Browser` and a `handler` stream. The `Browser` only sends CDP commands; the `handler` is what pumps responses and events back off the WebSocket. If you never poll it, every `goto` and `evaluate` hangs forever with no error and no panic. Spawning a task that drives `handler` to exhaustion is mandatory, and it is the one thing people miss with chromiumoxide. On the way out, release the Steel session, call `browser.close()`, then `handler_task.abort()`, in that order.

## Run it

```bash
cd examples/rig
cp .env.example .env          # set STEEL_API_KEY and ANTHROPIC_API_KEY
cargo run
```

Get a Steel key at [app.steel.dev/settings/api-keys](https://app.steel.dev/settings/api-keys) and an Anthropic key at [console.anthropic.com](https://console.anthropic.com/settings/keys). Both keys are read from the environment; the Steel key is also passed to `Steel::new` explicitly so the same value signs the CDP WebSocket URL.

The run is quiet until the answer lands, since the agent loops without streaming its intermediate turns. Your output varies. Structure looks like this:

```text
Session: https://app.steel.dev/sessions/3f2a...

Releasing Steel session...

Top 3 Hacker News stories right now:
1. "Show HN: ..." (642 points) https://news.ycombinator.com/item?id=...
2. "..." (511 points) https://...
3. "..." (388 points) https://...
```

A run costs a few cents of browser time plus the Anthropic tokens for up to eight turns. Because this drives a real session (`sessions().create`), Steel bills per session-minute until the `release` call, so the cleanup in `main` is not optional.

## Make it yours

- **Swap the task.** Change `TASK` and the preamble in `main.rs`. The tools stay the same; the agent re-plans against the new goal.
- **Add a tool.** A `click` tool (`page.find_element(...).click()`) or a `screenshot` tool (`page.screenshot(...)`) drops in as another `impl Tool` and one more `.tool(...)` call. The model picks per turn.
- **Tune the reach.** Raise `max_turns` to let it crawl deeper, or lower the link cap and `max_chars` in `extract_text` to spend fewer tokens per read.
- **Change the model.** Any Anthropic model id works in `.agent(...)`. rig also ships OpenAI, Gemini, and other providers; swap the `anthropic::Client` for one of those and the tools are unaffected.

## Related

[Steel + Swiftide (Rust)](../swiftide) is the other Rust agent recipe. It reads pages through Steel's `scrape` endpoint instead of driving a browser, so compare the two when you choose between live DOM access and clean Markdown. [chromiumoxide](../chromiumoxide) is the same CDP browser without the agent layer. [genkit](../genkit) and [pydantic-ai](../pydantic-ai) are the tool-calling-agent shape in other languages. The [rig docs](https://docs.rs/rig-core) cover the `Tool` trait, multi-turn prompting, and the provider list.
