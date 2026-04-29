# Claude Agent SDK (TypeScript)

`@anthropic-ai/claude-agent-sdk` is the engine behind the Claude Code CLI, exposed as a Node library. The package bundles a native Claude Code binary as an optional dependency, so `npm install` is the entire setup. You get the CLI's agent loop, hooks, subagents, MCP support, and built-in tool catalog (`Read`, `Edit`, `Bash`, `Grep`, ...) without spawning the CLI yourself.

This recipe disables those built-ins and attaches a Steel cloud browser instead. Four MCP tools (`openSession`, `navigate`, `snapshot`, `extract`) sit in front of Playwright; the agent calls them by name and streams back typed messages.

## Tools with Zod-typed inputs

Each `tool()` call pairs a Zod schema with an async handler. The `args` parameter is inferred straight from the schema, so the handler is typed end to end:

```typescript
const navigate = tool(
  "navigate",
  "Navigate the open session to a URL and wait for it to load.",
  { url: z.string().describe("Absolute URL to navigate to") },
  async ({ url }) => {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45_000 });
    return {
      content: [
        { type: "text", text: JSON.stringify({ url: page.url(), title: await page.title() }) },
      ],
    };
  },
);
```

`.describe()` writes a per-field hint that Claude reads when deciding which tool to pick. For optional parameters add `.default()`. Zod records the default in the schema and the SDK forwards it through to JSON Schema.

Returning `{ content: [...] }` matches MCP's `CallToolResult` type. Setting `isError: true` on the return keeps the loop alive after a handler-level failure: Claude sees the failure as data and adapts, instead of the whole `query()` call throwing.

Tools combine into a single in-process server:

```typescript
const steelServer = createSdkMcpServer({
  name: "steel",
  version: "1.0.0",
  tools: [openSession, navigate, snapshot, extract],
});
```

"In-process" is literal: no stdio bridge, no child process. The MCP server lives inside your Node process and dispatches calls in microseconds.

## Driving the agent loop

`query()` returns a `Query`, which is an async generator over `SDKMessage` plus a few extra controls (`interrupt()`, `setPermissionMode()`, `setModel()`). The options block wires Steel in and locks the agent down:

```typescript
for await (const message of query({
  prompt: PROMPT,
  options: {
    model: "claude-sonnet-4-6",
    systemPrompt: SYSTEM_PROMPT,
    mcpServers: { steel: steelServer },
    allowedTools: ["mcp__steel__*"],
    tools: [],
    settingSources: [],
    maxTurns: 20,
    permissionMode: "bypassPermissions",
  },
})) {
  ...
}
```

Tool names follow `mcp__{server}__{tool}`, where the server segment matches the `mcpServers` key. The wildcard `mcp__steel__*` pre-approves every Steel tool without per-call prompts. `tools: []` drops the entire Claude Code built-in catalog: no filesystem reads, no `Bash`, no `WebFetch`. The agent only sees what you wrote. `settingSources: []` skips loading `.claude/` from your working directory or home, so the recipe behaves the same on every machine.

`permissionMode: "bypassPermissions"` is the unattended-script setting. Combined with `tools: []` and the explicit allow list, there is nothing risky to bypass.

## Reading typed messages

The generator yields a discriminated union. Narrow with `message.type`:

```typescript
for await (const message of query({...})) {
  if (message.type === "assistant") {
    for (const block of message.message.content) {
      if (block.type === "tool_use") {
        const name = block.name.replace(/^mcp__steel__/, "");
        console.log(`  -> ${name}(${JSON.stringify(block.input).slice(0, 120)})`);
      }
    }
  } else if (message.type === "result") {
    if (message.subtype === "success") finalText = message.result ?? "";
  }
}
```

`assistant` messages carry the model's content blocks (`text`, `tool_use`, `thinking`). `result` arrives once at the end with the final answer plus `total_cost_usd`, `usage`, and `duration_ms`.

The Agent SDK does not return a typed final object the way `@openai/agents` does with `outputType`. If you need structured output, request JSON in the prompt and parse `message.result`, or run a short follow-up `query()` to reformat the answer.

## Run it

```bash
cd examples/claude-agent-sdk-ts
cp .env.example .env          # set STEEL_API_KEY and ANTHROPIC_API_KEY
npm install
npx playwright install chromium
npm start
```

Get keys at [app.steel.dev/settings/api-keys](https://app.steel.dev/settings/api-keys) and [console.anthropic.com](https://console.anthropic.com/). A Steel session viewer URL prints when `openSession` runs; open it in another tab to watch the browser live.

Your output varies. Structure looks like this:

```text
Steel + Claude Agent SDK (TypeScript) Starter
============================================================
Sure, let me open a browser session and pull that page.
  -> open_session({})
    open_session: 1747ms
  -> navigate({"url":"https://github.com/trending/python?since=daily"})
    navigate: 2007ms
  -> snapshot({})
    snapshot: 272ms (4000 chars, 49 links)
I have everything I need. Top three trending repos ...

--- Final answer ---
Top 3 AI/ML-related repos:
1. owner/repo - description (X stars)
...

Releasing Steel session...
Session released. Replay: https://app.steel.dev/sessions/ab12cd34...
```

A run takes ~25 to 45 seconds and 3 to 6 turns. Cost is Steel session-minutes plus Anthropic tokens; the snapshot's text dominates each turn's prompt.

The `finally` block calls `steel.sessions.release()`. Without it the cloud browser idles until the default timeout while you keep paying.

## Make it yours

- **Swap the task.** Change `PROMPT` and (optionally) `SYSTEM_PROMPT`. The four tools are task-agnostic; any page with visible text and repeating rows fits.
- **Reach for Opus 4.7.** Set `model: "claude-opus-4-7"` for harder reasoning. The bundled CLI auto-uses `ANTHROPIC_API_KEY`.
- **Add a tool.** Define another `tool()`, append it to the `tools` array in `createSdkMcpServer`. A `click(selector)` tool that calls `page.click` is the most common fifth one.
- **Hook the lifecycle.** Pass a `hooks` option with callbacks for `PreToolUse`, `PostToolUse`, `Stop`, `SessionStart` to audit, log, or block individual tool calls.
- **Resume sessions.** Capture `session_id` from the first `system`/`init` message, pass `resume: sessionId` on the next `query()` call to keep agent memory across runs.
- **Persist a login.** Pair with [credentials](../credentials) or [auth-context](../auth-context) so Steel sessions start already authenticated.

## Related

[Anthropic Agent SDK docs](https://platform.claude.com/docs/en/agent-sdk/overview) · [Python version](../claude-agent-sdk-py) · [Claude Computer Use (TypeScript)](../claude-computer-use-ts) for the raw screenshot loop
