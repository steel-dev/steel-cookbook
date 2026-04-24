# Vercel AI SDK v6 Starter (TypeScript)

The [Vercel AI SDK v6](https://ai-sdk.dev/docs/agents/overview) ships `ToolLoopAgent`, a typed agent that picks a tool, calls it, observes the result, and decides the next step. Give it tools that drive a Playwright page connected to a Steel session and you get a terminal browser agent with no UI scaffolding in the way.

```typescript
const researchAgent = new ToolLoopAgent({
  model: anthropic("claude-haiku-4-5"),
  instructions: "You operate a Steel cloud browser via tools...",
  stopWhen: [stepCountIs(15), hasToolCall("reportFindings")],
  tools: { openSession, navigate, snapshot, extract, reportFindings },
  onStepFinish: async ({ stepNumber, toolCalls, usage }) => { ... },
});

const result = await researchAgent.generate({ prompt: "..." });
```

Each entry in `tools` is a Zod-typed `tool()`. The agent runs until `stopWhen` fires. `onStepFinish` logs the tool called and tokens spent per step so you can watch the loop unfold.

## The tool surface

Five tools, defined at the top of `index.ts`. They share one Steel session and one Playwright `page` via module-level closure, so consecutive tool calls compose naturally against the same browser state.

`openSession` creates a Steel session, connects Playwright with `chromium.connectOverCDP`, and returns the session id plus a live viewer URL. The instructions tell the agent to call this exactly once, first.

`navigate` wraps `page.goto` with `waitUntil: "domcontentloaded"` and a 45s timeout, returning the final URL and title.

`snapshot` runs one `page.evaluate` that collects the page title, visible text (capped), and a list of links with text and href. It exists so the agent can read the page before guessing selectors. The system prompt says: snapshot first, extract only if you need structured rows beyond what snapshot gives you.

`extract` takes a row selector, a list of per-row field selectors (with optional attribute), and a limit. The whole extraction runs inside a single `page.evaluate`, so you pay CDP latency once instead of N*M times. Serial CDP calls are the biggest source of slowness on a cloud browser.

`reportFindings` is the terminator. Its `inputSchema` is a Zod object (a `summary` string and an array of repo records) and it has **no `execute`**. In AI SDK v6, a tool with no `execute` stops the loop the moment the model calls it, and the call's `input` is your final typed answer.

## Why no `output: Output.object(...)`

The natural instinct is to declare a typed final answer with `output`. That path breaks on Anthropic models: forcing JSON response format disables tool calling, and the provider warns `JSON response format does not support tools. The provided tools are ignored.`

The "final tool with no `execute`" pattern is the v6-idiomatic workaround. You keep the tool loop and still get a Zod-typed final result, with the schema living in one place (`reportFindings.inputSchema`) instead of drifting across `tools` and `output`.

## Run it

```bash
cd examples/vercel-ai-sdk-ts
cp .env.example .env          # set STEEL_API_KEY and ANTHROPIC_API_KEY
npm install
npm start
```

Get keys at [app.steel.dev/settings/api-keys](https://app.steel.dev/settings/api-keys) and [console.anthropic.com](https://console.anthropic.com/). The demo task is wired into `main()`: find the top 3 AI/ML repos on `github.com/trending/python?since=daily` and return name, URL, stars, and description.

Your output varies. Structure looks like this:

```text
Steel + AI SDK v6 (ToolLoopAgent) Starter
============================================================
    openSession: session=842ms cdp=411ms
  step 1: openSession | 1183 tokens
    navigate: 1621ms
  step 2: navigate | 1402 tokens
    snapshot: 124ms (3892 chars, 48 links)
  step 3: snapshot | 5104 tokens
    extract: 98ms (10 rows)
  step 4: extract | 2881 tokens
  step 5: reportFindings | 3150 tokens

Agent finished.

Structured output:
{
  "summary": "The top trending Python repos today center on...",
  "repos": [
    { "name": "owner/repo", "url": "...", "stars": "1,204", "description": "..." },
    ...
  ]
}

Releasing Steel session...
Session released. Replay: https://app.steel.dev/sessions/ab12cd34...
```

A full run takes ~20 seconds and costs a few cents of Steel session time plus a small number of Anthropic tokens (Haiku 4.5 is cheap by design). The `finally` block in `main` calls `steel.sessions.release()`; forgetting it keeps the browser running until the default 5-minute timeout.

## Loop control

`stopWhen` accepts a single condition or an array (the loop stops when any condition fires). Pair a step cap with a tool-based terminator so the agent can't loop forever and can't forget to produce a final answer:

```typescript
stopWhen: [stepCountIs(15), hasToolCall("reportFindings")]
```

For phase-gated workflows, add `prepareStep` to restrict which tools are callable on a given step:

```typescript
prepareStep: async ({ stepNumber, steps }) => ({
  activeTools: stepNumber === 0
    ? ["openSession"]
    : ["navigate", "snapshot", "extract", "reportFindings"],
})
```

See the AI SDK's [loop control](https://ai-sdk.dev/docs/agents/loop-control) page for more patterns: dynamic instructions, message compaction, per-step tool filters.

## Make it yours

- **Swap the task.** Change the `prompt` in `main()` and the `reportFindings` schema. Everything else is task-agnostic: session lifecycle, navigation, snapshot, extract.
- **Swap the model.** `claude-haiku-4-5` is the default because tool loops round-trip the model 3-5 times per run, so fast-and-cheap matters. For harder tasks, try `anthropic("claude-sonnet-4-6")`, `openai("gpt-5")`, or `google("gemini-2.5-pro")`. You can also use the [AI Gateway](https://vercel.com/docs/ai-gateway) string form, like `"anthropic/claude-haiku-4-5"`, to route through Vercel.
- **Add tools.** A `click` tool wrapping `page.click`, a `fill` tool over `page.fill`, a `screenshot` tool that returns a base64 PNG for vision models. Tools compose through the shared `page` closure.
- **Turn on stealth.** Pass `useProxy`, `solveCaptcha`, or `sessionTimeout` to `steel.sessions.create({...})` inside `openSession` for sites with anti-bot.

## Related

[Next.js version](../vercel-ai-sdk-nextjs) (same agent, browser UI on top) · [AI SDK agents docs](https://ai-sdk.dev/docs/agents/overview) · [ToolLoopAgent reference](https://ai-sdk.dev/docs/agents/building-agents)
