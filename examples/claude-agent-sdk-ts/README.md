# Claude Agent SDK (TypeScript)

`@anthropic-ai/claude-agent-sdk` is the engine behind the Claude Code CLI, exposed as a Node library. You get the CLI's agent loop, hooks, subagents, MCP support, and built-in tool catalog (`Read`, `Edit`, `Bash`, `Grep`, ...) without spawning the CLI yourself.

This recipe disables those built-ins and attaches a Steel cloud browser instead. Four MCP tools (`openSession`, `navigate`, `snapshot`, `extract`) sit in front of Playwright; the agent calls them by name and streams back typed messages.

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

const steelServer = createSdkMcpServer({
  name: "steel",
  version: "1.0.0",
  tools: [openSession, navigate, snapshot, extract],
});

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

`tools: []` drops the entire Claude Code built-in catalog: no filesystem reads, no `Bash`, no `WebFetch`. `settingSources: []` skips loading `.claude/` from your working directory or home, so the recipe behaves the same on every machine.

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

A run takes ~25 to 45 seconds and 3 to 6 turns. Cost is Steel session-minutes plus Anthropic tokens. The `finally` block calls `steel.sessions.release()`.

## Make it yours

- **Swap the task.** Change `PROMPT` and (optionally) `SYSTEM_PROMPT`. The four tools are task-agnostic.
- **Reach for Opus 4.7.** Set `model: "claude-opus-4-7"` for harder reasoning.
- **Add a tool.** Define another `tool()`, append it to the `tools` array in `createSdkMcpServer`. A `click(selector)` tool that calls `page.click` is the most common fifth one.
- **Hook the lifecycle.** Pass a `hooks` option with callbacks for `PreToolUse`, `PostToolUse`, `Stop`, `SessionStart` to audit, log, or block individual tool calls.
- **Resume sessions.** Capture `session_id` from the first `system`/`init` message, pass `resume: sessionId` on the next `query()` call to keep agent memory across runs.
- **Persist a login.** Pair with [credentials](../credentials) or [auth-context](../auth-context) so Steel sessions start already authenticated.

## Related

[Anthropic Agent SDK docs](https://platform.claude.com/docs/en/agent-sdk/overview) · [Python version](../claude-agent-sdk-py) · [Claude Computer Use (TypeScript)](../claude-computer-use-ts)
