# Steel + MCP server (Rust)

This is a [Model Context Protocol](https://modelcontextprotocol.io) server that lends a Steel cloud browser to any MCP client. It is built on [rmcp](https://docs.rs/rmcp), the official Rust SDK, and drives the browser over CDP with [chromiumoxide](https://docs.rs/chromiumoxide). It compiles to a single binary with no interpreter and no model key of its own: the client supplies the model, this process owns the browser and nothing else.

Five tools make up the surface. `create_session` opens a Steel session and returns its id; `navigate`, `extract`, and `screenshot` take that id and act on the browser; `release_session` closes it. Each tool is one `#[tool]`-annotated method on `SteelMcp`, and `#[tool_router]` plus `#[tool_handler]` turn those methods into the served schema.

## Holding the browser open between calls

The hard part of a browser MCP server is not any single tool, it is keeping one browser alive and reachable across separate calls. `create_session` does three things that have to outlive the call that made them:

```rust
let (browser, mut handler) = Browser::connect(cdp_url).await?;
let handler_task = tokio::spawn(async move { while handler.next().await.is_some() {} });
let page = browser.new_page("about:blank").await?;
```

`Browser::connect` returns a command handle plus a `handler` stream that pumps the CDP websocket. Nothing polls it on its own, so the spawned task that drives it to exhaustion is mandatory: drop it and the next `goto` hangs with no error. All three, the `Browser`, the join handle, and the `Page`, go into a `SessionEntry` stored in `Arc<Mutex<HashMap<String, SessionEntry>>>`, keyed by the Steel session id. Because `Page` and the `Arc`s are cheap to clone, `get` copies a whole entry out and releases the map lock before any browser work, so two sessions never block each other.

That id is the handle the model threads back on every later call, which is what keeps sessions apart. The [Go recipe](../mcp-go) covers why the explicit handle, rather than one browser hidden in server state, is what the MCP spec now asks for. The short version: each Steel session is its own isolated cloud browser, and naming it on every call means two clients holding two ids can never read each other's pages. `release_session` removes the entry, aborts the handler task, and releases the Steel session so it stops billing.

## Run it

```bash
cd examples/mcp-rs
cp .env.example .env          # set STEEL_API_KEY for local `cargo run`
cargo build --release
```

Get a Steel key at [app.steel.dev/settings/api-keys](https://app.steel.dev/settings/api-keys). Point an MCP client at the compiled binary and pass the key through the client's `env` block. For Claude Desktop, add this to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "steel": {
      "command": "/absolute/path/to/examples/mcp-rs/target/release/mcp-rs",
      "env": { "STEEL_API_KEY": "your-steel-api-key" }
    }
  }
}
```

Restart the client and ask it to open a page and read it back. It calls `create_session`, then `navigate` and `extract` against the returned id, and `release_session` at the end. Open the `live_view_url` from `create_session` to watch the browser work. Note that stdio uses stdout for the JSON-RPC stream, so the server keeps it clean and writes nothing there itself.

## Make it yours

- **Add a tool.** Write one more `async fn` with a `#[tool]` attribute and a `Parameters<T>` argument carrying `session_id`. A `click` tool is `entry.page.find_element(sel).await?.click().await?`.
- **Start authenticated.** Pass a populated `SessionCreateParams` to `sessions().create` to attach a [profile](../profiles-rs) or [credentials](../credentials-rs) so the session opens already logged in.
- **Return richer output.** Tools here return `Content::text` and `Content::image`. Swap in structured JSON content when a client wants typed fields instead of a string.

## Related

[Steel + MCP server (Go)](../mcp-go) is the same five tools on the official Go SDK and chromedp; read it for the handle-versus-hidden-state rationale. [chromiumoxide](../chromiumoxide) is the bare CDP browser, [rig](../rig) drives it from an in-process agent, and [swiftide](../swiftide) reads pages through Steel's scrape API instead. The [rmcp docs](https://docs.rs/rmcp) cover transports, resources, and prompts past the tools shown here.
