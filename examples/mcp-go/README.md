# Steel + MCP server (Go)

This is a [Model Context Protocol](https://modelcontextprotocol.io) server that hands any MCP client (Claude Desktop, an IDE, your own agent) a Steel cloud browser to drive. It is built on the [official MCP Go SDK](https://github.com/modelcontextprotocol/go-sdk) and talks to the browser over CDP with [chromedp](https://github.com/chromedp/chromedp). The whole server is one statically linked binary with no runtime, no `node_modules`, and no model key of its own: the client brings the model, this process only owns the browser.

The server exposes five tools. `create_session` starts a Steel session and returns its id; `navigate`, `extract`, and `screenshot` act on a session; `release_session` tears it down. The id Steel returns is the only thing tying the calls together.

## The session id is the handle

A browser MCP server has to answer one question: when two tools run against "the browser," which browser do they mean? Hiding a single session in a global is the trap the [MCP spec calls out](https://blog.modelcontextprotocol.io/posts/2026-07-28-release-candidate/), because a second client on the same process would inherit the first one's cookies and page. The 2026 spec removed the transport-level session and says state should ride on an explicit handle "a `browser_id` minted from a tool and passed back as an ordinary argument." That is exactly what `create_session` does:

```go
func (s *server) createSession(ctx context.Context, _ *mcp.CallToolRequest, _ createInput) (*mcp.CallToolResult, createOutput, error) {
	steelSession, err := s.steel.Sessions.Create(ctx, steel.SessionCreateParams{ ... })
	// ... connect chromedp to steelSession.WebsocketURL ...
	s.sessions[steelSession.ID] = sess
	return nil, createOutput{SessionID: steelSession.ID, LiveViewURL: sess.viewerURL}, nil
}
```

Every other tool takes a `session_id` and looks it up in `server.sessions` (a plain `map` behind a mutex), so the model names the browser it means on each call. Two clients hold two ids and never collide, and because the handle is a normal tool argument it works the same whether the client connected over stdio or HTTP. The Steel session itself is the isolation boundary: each one is its own cloud browser with its own cookies, so the server's only job is to never share a single id across callers.

The allocator in `createSession` runs on `context.Background()`, not the request context. The request is cancelled the moment the tool call returns, but the browser has to outlive that call to serve the next one. `releaseAll`, deferred in `main`, releases whatever is still open when the client disconnects, so a forgotten session does not bill against your account until its idle timeout.

## Run it

```bash
cd examples/mcp-go
cp .env.example .env          # set STEEL_API_KEY for local `go run`
go build -o steel-mcp .
```

Get a Steel key at [app.steel.dev/settings/api-keys](https://app.steel.dev/settings/api-keys). Point an MCP client at the binary and pass the key through the client's `env` block. For Claude Desktop, add this to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "steel": {
      "command": "/absolute/path/to/examples/mcp-go/steel-mcp",
      "env": { "STEEL_API_KEY": "your-steel-api-key" }
    }
  }
}
```

Restart the client and ask it to "open news.ycombinator.com and tell me the top story." It will call `create_session`, `navigate`, `extract`, then `release_session` on its own. Watch the run live at the `live_view_url` that `create_session` returns.

One stdio rule: the JSON-RPC stream owns stdout, so the server logs only to stderr (`log` writes there by default). A stray `fmt.Println` corrupts the protocol and the client drops the connection.

## Make it yours

- **Add a tool.** A `click` tool is a few `chromedp.Click` lines and one more `mcp.AddTool` call. Take a `session_id`, look it up with `s.get`, act on the tab.
- **Start authenticated.** Swap the `SessionCreateParams` in `createSession` to attach a [profile](../profiles-go) or [credentials](../credentials-go) so a session opens already logged in.
- **Go remote.** Replace `mcp.StdioTransport` with the SDK's streamable-HTTP handler to serve many clients from one process. The handle pattern already carries the state, so nothing else changes.

## Related

[Steel + MCP server (Rust)](../mcp-rs) is the same server built on `rmcp` and chromiumoxide; compare the two for how each language holds the session map. [chromedp](../chromedp), [genkit](../genkit), and [google-adk-go](../google-adk-go) are the other Go recipes, covering the raw browser, a tool-calling agent, and Google's ADK. The [MCP Go SDK docs](https://pkg.go.dev/github.com/modelcontextprotocol/go-sdk/mcp) cover transports, resources, and prompts beyond the tools used here.
