# Steel + MCP server (TypeScript)

This is a [Model Context Protocol](https://modelcontextprotocol.io) server that hands any MCP client a Steel cloud browser to drive. It uses the official [TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk) and drives the browser with Playwright over CDP through `connectOverCDP`, so there is no local Chrome to launch. The server carries no model key of its own: the client supplies the model, this process owns the cloud session.

Five tools make up the surface. `create_session` opens a Steel session and returns its id; `navigate`, `extract`, and `screenshot` take that id and act on the browser; `release_session` closes it.

## Each tool declares its shape, the id ties them together

Every tool is a `server.registerTool` call: a name, a description, an `inputSchema` written as a Zod shape, and the handler. The shape is the contract the client sees and the type of the handler's argument in one place:

```ts
server.registerTool(
  "navigate",
  {
    description: "Open a URL in the session's browser tab and wait for it to load. Returns the resolved title and URL.",
    inputSchema: {
      session_id: z.string().describe("Handle returned by create_session."),
      url: z.string().describe("Absolute URL to open, e.g. https://news.ycombinator.com."),
    },
  },
  async ({ session_id, url }) => {
    const page = getPage(session_id);
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45_000 });
    return { content: [{ type: "text", text: JSON.stringify({ url: page.url(), title: await page.title() }) }] };
  },
);
```

Every tool except `create_session` takes a `session_id` and resolves it through `getPage`, which reads a `Map` keyed by the Steel session id. That id is the handle the model threads back on each call, and it is what keeps browsers apart: the server holds no hidden "current page," so two clients with two ids never touch each other's sessions. The [Go recipe](../mcp-go) covers why the explicit handle, rather than one session hidden in server state, is the shape the MCP spec now recommends. `screenshot` returns an image content block so the client renders the PNG, and `release_session` plus the `releaseAll` signal handlers make sure a session stops billing when the client goes away.

## Run it

```bash
cd examples/mcp-ts
cp .env.example .env          # set STEEL_API_KEY for local runs
npm install
```

Get a Steel key at [app.steel.dev/settings/api-keys](https://app.steel.dev/settings/api-keys). The server runs straight from TypeScript with `ts-node`, so an MCP client launches it through `npx` and gets the key from the client's `env` block. For Claude Desktop, add this to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "steel": {
      "command": "npx",
      "args": ["ts-node", "/absolute/path/to/examples/mcp-ts/index.ts"],
      "env": { "STEEL_API_KEY": "your-steel-api-key" }
    }
  }
}
```

Restart the client and ask it to open a page and read it back. It calls `create_session`, then `navigate` and `extract` against the returned id, and `release_session` at the end. Open the `live_view_url` from `create_session` to watch the browser. Stdio uses stdout for the JSON-RPC stream, so the server logs only to stderr.

## Make it yours

- **Add a tool.** Another `server.registerTool` with a `session_id` field, resolve the page with `getPage`, and act on it. A `click` tool is `await page.click(selector)`.
- **Start authenticated.** Pass options to `steel.sessions.create` to attach a [profile](../profiles-ts) or [credentials](../credentials-ts) so a session opens already logged in.
- **Return structured output.** Add an `outputSchema` to a tool and return `structuredContent` so the client gets typed fields instead of a JSON string.

## Related

[Steel + MCP server (Go)](../mcp-go) and [Steel + MCP server (Rust)](../mcp-rs) are the same five tools as single static binaries; read the Go one for the handle-versus-hidden-state rationale. [puppeteer-ts](../puppeteer-ts) and [playwright-ts](../playwright-ts) are the bare browser recipes, and [vercel-ai-sdk-ts](../vercel-ai-sdk-ts) drives Steel from an in-process agent. The [TypeScript SDK docs](https://github.com/modelcontextprotocol/typescript-sdk) cover transports, resources, and prompts beyond the tools shown here.
