# Steel + MCP server (Python)

This is a [Model Context Protocol](https://modelcontextprotocol.io) server that hands any MCP client a Steel cloud browser to drive. It uses [FastMCP](https://github.com/modelcontextprotocol/python-sdk), the decorator API in the official Python SDK, and drives the browser with Playwright over CDP. Because it connects to a remote browser with `connect_over_cdp`, there are no local browser binaries to install: the server is a thin process that owns the cloud session and nothing else, and it has no model key of its own.

Five tools make up the surface. `create_session` opens a Steel session and returns its id; `navigate`, `extract`, and `screenshot` act on a session by id; `release_session` closes it.

## The decorator is the schema, the id is the handle

Each tool is a plain async function under `@mcp.tool()`. FastMCP reads the type hints and the docstring to build the JSON Schema the client sees, so the signature is the whole contract:

```python
@mcp.tool()
async def navigate(session_id: str, url: str) -> dict:
    """Open a URL in the session's browser tab and wait for it to load.

    Args:
        session_id: Handle returned by create_session.
        url: Absolute URL to open, e.g. https://news.ycombinator.com.
    """
    page = _page(session_id)
    await page.goto(url, wait_until="domcontentloaded", timeout=45_000)
    return {"url": page.url, "title": await page.title()}
```

Every tool except `create_session` takes a `session_id` and looks it up in `_sessions`, a plain dict keyed by the Steel session id. That id is the handle the model threads back on each call, which is what keeps browsers apart: the server holds no hidden "current page," so two clients with two ids never touch each other's sessions. The [Go recipe](../mcp-go) covers why the explicit handle, rather than one session hidden in server state, is the shape the MCP spec now recommends. `screenshot` returns FastMCP's `Image`, so the client renders the PNG instead of a base64 string, and `release_session` plus the `_release_all` cleanup make sure a session does not keep billing after the client goes away.

## Run it

```bash
cd examples/mcp-py
cp .env.example .env          # set STEEL_API_KEY for local runs
uv sync
```

Get a Steel key at [app.steel.dev/settings/api-keys](https://app.steel.dev/settings/api-keys). Point an MCP client at the script through `uv run` and pass the key in the client's `env` block. For Claude Desktop, add this to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "steel": {
      "command": "uv",
      "args": ["run", "--directory", "/absolute/path/to/examples/mcp-py", "python", "main.py"],
      "env": { "STEEL_API_KEY": "your-steel-api-key" }
    }
  }
}
```

Restart the client and ask it to open a page and read it back. It calls `create_session`, then `navigate` and `extract` against the returned id, and `release_session` at the end. Watch the run at the `live_view_url` that `create_session` returns. One stdio rule: stdout carries the JSON-RPC stream, so the server prints nothing there. Log to stderr if you add diagnostics.

## Make it yours

- **Add a tool.** Write one more `async def` under `@mcp.tool()` that takes `session_id`, look the page up with `_page`, and act on it. A `click` tool is `await page.click(selector)`.
- **Start authenticated.** Pass arguments to `steel.sessions.create` to attach a [profile](../profiles-py) or [credentials](../credentials-py) so a session opens already logged in.
- **Return typed data.** Tools here return dicts, strings, and an `Image`. Return a Pydantic model from a tool and FastMCP emits a structured-content schema the client can validate against.

## Related

[Steel + MCP server (Go)](../mcp-go) and [Steel + MCP server (Rust)](../mcp-rs) are the same five tools as single static binaries; read the Go one for the handle-versus-hidden-state rationale. [stagehand-py](../stagehand-py) and [google-adk-py](../google-adk-py) are the in-process agent recipes in Python. The [Python SDK docs](https://github.com/modelcontextprotocol/python-sdk) cover transports, resources, and prompts beyond the tools shown here.
