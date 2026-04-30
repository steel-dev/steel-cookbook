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

`reportFindings` is the terminator. Its `inputSchema` is a Zod object (a `summary` string and an array of repo records) and it has **no `execute`**. In AI SDK v6, a tool with no `execute` stops the loop the moment the model calls it, and the call's `input` is your final typed answer. This sidesteps the Anthropic-on-tools issue where forcing JSON response format disables tool calling.

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

A full run takes ~20 seconds and costs a few cents of Steel session time plus a small number of Anthropic tokens. The `finally` block in `main` calls `steel.sessions.release()`.

## Make it yours

- **Swap the task.** Change the `prompt` in `main()` and the `reportFindings` schema. Everything else is task-agnostic.
- **Swap the model.** `claude-haiku-4-5` is the default. For harder tasks, try `anthropic("claude-sonnet-4-6")`, `openai("gpt-5")`, or `google("gemini-2.5-pro")`. You can also use the [AI Gateway](https://vercel.com/docs/ai-gateway) string form, like `"anthropic/claude-haiku-4-5"`, to route through Vercel.
- **Add tools.** A `click` tool wrapping `page.click`, a `fill` tool over `page.fill`, a `screenshot` tool that returns a base64 PNG for vision models.
- **Phase-gate steps.** Use `prepareStep` to restrict which tools are callable on a given step. See the AI SDK's [loop control](https://ai-sdk.dev/docs/agents/loop-control) page.
- **Turn on stealth.** Pass `useProxy`, `solveCaptcha`, or `sessionTimeout` to `steel.sessions.create({...})` inside `openSession` for sites with anti-bot.

## Related

[Next.js version](../vercel-ai-sdk-nextjs) · [AI SDK agents docs](https://ai-sdk.dev/docs/agents/overview) · [ToolLoopAgent reference](https://ai-sdk.dev/docs/agents/building-agents)
