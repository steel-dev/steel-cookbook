# Swiftide research agent (Rust)

[Swiftide](https://swiftide.rs) is a Rust framework for LLM applications: indexing pipelines, query pipelines, and agents that loop over tool calls until they reach an answer. This recipe builds an agent whose only tool reads the web through Steel's `scrape` endpoint, so the model works from clean Markdown instead of raw HTML and never touches a browser library or CDP.

The agent runs on Anthropic (`claude-sonnet-4-6`) and the tool is a `#[derive(Tool)]` struct that owns the Steel client:

```rust
#[derive(Clone, swiftide::Tool)]
#[tool(
    description = "Fetch a web page through a Steel cloud browser and return it as clean \
                   Markdown along with the page's outbound links. Use this to read a URL.",
    param(name = "url", description = "Absolute URL of the page to read, including https://")
)]
struct ReadPage {
    client: Arc<Steel>,
}

impl ReadPage {
    async fn read_page(&self, _ctx: &dyn AgentContext, url: &str) -> Result<ToolOutput, ToolError> {
        let response = self.client.scrape(ClientScrapeParams {
            url: url.to_string(),
            format: Some(vec![ScrapeRequestFormatItem::Markdown]),
            ..
        }).await?;
        // ... return response.content.markdown plus response.links
    }
}
```

The derive macro reads the struct's snake-case name (`ReadPage` -> `read_page`), finds the method with that name, and turns each `#[tool(param(...))]` into a JSON Schema field via `schemars`. Anything that implements `Tool` slots into `Agent::builder().tools(...)`, so a stateful struct and a `#[swiftide::tool]` free function are interchangeable at the call site. The struct form is what lets the tool hold `Arc<Steel>`; a free function has nowhere to put it.

Wiring the agent is four builder calls:

```rust
let anthropic = Anthropic::builder().default_prompt_model("claude-sonnet-4-6").build()?;

let mut agent = Agent::builder()
    .llm(&anthropic)
    .tools(vec![ReadPage { client: Arc::clone(&client) }])
    .system_prompt(SYSTEM_PROMPT)
    .limit(8)
    .build()?;

agent.query(TASK).await?;
```

`query` drives the loop: Claude reads the task, calls `read_page` on Hacker News, optionally follows one or two links the scrape returned, then calls the always-present `stop` tool when it has the answer. `.limit(8)` caps the round trips so a confused model can't loop forever. The `on_new_message` hook in `main` prints each assistant turn as it lands.

## Run it

```bash
cd examples/swiftide-rs
cp .env.example .env          # set STEEL_API_KEY and ANTHROPIC_API_KEY
cargo run
```

Get a Steel key at [app.steel.dev/settings/api-keys](https://app.steel.dev/settings/api-keys) and an Anthropic key at [console.anthropic.com](https://console.anthropic.com/settings/keys). The Anthropic client reads `ANTHROPIC_API_KEY` from the environment on its own; the Steel key is passed to `Steel::new` explicitly.

Your output varies. Structure looks like this:

```text
Steel + Swiftide research agent
============================================================
    read_page: https://news.ycombinator.com (18243 chars)
The highest-scoring story on the front page is "Show HN: ..." with 642
points, submitted by pg. Let me open it to summarize.
    read_page: https://news.ycombinator.com/item?id=43218921 (9117 chars)
Top story: "Show HN: ..." by pg, 642 points. It is a ... . The author
built it to ... and the thread debates ... .

Done. Steel scrape calls bill a little browser time; no session to release.
```

Each `scrape` call spins up a short-lived Steel browser server-side, so a run costs a few cents of browser time plus a few thousand Anthropic tokens. There is no long-lived session to release here: `scrape` opens and closes its own browser per call, which is the trade for not managing a session yourself. If you switch to `client.sessions().create(...)` for a persistent browser, you own the `release` call and Steel bills per session-minute until you make it.

## One thing that will bite you

**The `#[derive(Tool)]` macro needs `serde` and `async-trait` as direct dependencies.** The expansion emits a bare `#[async_trait::async_trait]` and a `serde`-derived args struct without a `#[serde(crate = ...)]` override, so both crates have to resolve at the crate root even though you never name them. They are in `Cargo.toml` for that reason alone. The `#[swiftide::tool]` attribute macro on a free function fully qualifies its paths and does not need them, so that is the lighter option when your tool is stateless.

Steel's request builders implement `IntoFuture` with a `Send` future, so `client.scrape(...).await` works directly inside a Swiftide tool even though tools run on a multi-threaded Tokio runtime.

## Make it yours

- **Swap the task.** Change `TASK` and `SYSTEM_PROMPT` in `main.rs`. The tool stays the same; the agent re-plans against the new goal.
- **Give it more reach.** The tool already returns up to 40 of the page's links, which is what lets the model follow a story into its comments. Raise `.limit(8)` if you want it to crawl deeper, and widen or drop the link cap.
- **Add a second tool.** A `screenshot` tool backed by `client.screenshot(...)` (returns a base64 PNG) or a `pdf` tool backed by `client.pdf(...)` drops in as another `#[derive(Tool)]` struct in the `tools(vec![...])` list. The agent picks per turn.
- **Change the model.** Any Anthropic chat model works in `default_prompt_model`. Swiftide also ships OpenAI, Gemini, Groq, and Ollama integrations behind feature flags; swap the `Anthropic` builder for one of those and the tools are unaffected.

## Related

[Steel + rig (Rust)](../rig-rs) drives a real browser over CDP with chromiumoxide instead of the `scrape` endpoint. [Swiftide agent docs](https://swiftide.rs/agents/overview/) cover hooks, the `Tool` trait, and multi-agent setups.
