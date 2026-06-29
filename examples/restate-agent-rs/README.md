# Restate durable browser agent (Rust)

The Rust variant uses Restate's macro-based service definition. The `ResearchSession` trait declares an exclusive `answer` handler and a shared `history` handler, then `ResearchSessionImpl` supplies the agent loop. Values that cross Restate's journal use `Json<T>`, which keeps the typed structs local while letting the SDK serialize durable step results and object state.

Steel does the page fetch. The agent stores a compact markdown observation for each scraped URL, so a repeated call with the same session key can reuse prior context.

## Run it

Start Restate:

```bash
npm install --global @restatedev/restate-server@latest @restatedev/restate@latest
restate-server
```

Run the Rust service in another terminal:

```bash
cd examples/restate-agent-rs
cp .env.example .env          # set STEEL_API_KEY and OPENAI_API_KEY
cargo run
```

Register and invoke it:

```bash
restate deployments register http://localhost:9080 --force --yes

curl localhost:8080/restate/call/ResearchSession/demo/answer \
  --json '{"question":"Summarize the main stories on this page and cite the source URL.","seedUrl":"https://news.ycombinator.com","maxSteps":2}'
```

Your output varies. Structure looks like this:

```json
{
  "answer": "The page contains current Hacker News story links and metadata...",
  "sources": ["https://news.ycombinator.com/"],
  "observations": 1
}
```

The first build pulls `restate-sdk`, `steel-rs`, `reqwest`, and their transitive dependencies. Later runs start quickly.

## Make it yours

- **Return stricter evidence.** Add fields to `Observation` and let Serde carry them through `Json<Observation>`.
- **Bound the loop.** `MAX_STEPS` defaults to `2`, and the handler clamps request values to `1` through `4`.
- **Treat user errors differently.** Convert invalid URLs to `TerminalError` when you want Restate to stop retrying instead of treating them as transient failures.
- **Compose with workflows.** Keep this Virtual Object as the session store, then call it from a longer Restate workflow that schedules or fans out research.

## Related

[restate-agent-ts](../restate-agent-ts), [restate-agent-py](../restate-agent-py), and [restate-agent-go](../restate-agent-go) cover the same idea in other languages. Restate's [Rust SDK docs](https://docs.rs/restate-sdk/latest/restate_sdk/) describe the macros, `Json<T>`, and `HttpServer` used in this recipe.
