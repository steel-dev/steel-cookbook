# Mastra Starter (TypeScript)

[Mastra](https://mastra.ai/) is a TypeScript framework that wraps the Vercel AI SDK with its own primitives: typed tools with input _and_ output schemas, a top-level `Mastra` registry that wires agents into storage and observability, a model router that turns `'anthropic/claude-haiku-4-5'` into a working client without a provider package install, and a built-in Studio playground for chatting with your agents and inspecting traces.

This recipe is a four-tool browser agent: `open-session`, `navigate`, `snapshot`, `extract`. Each tool drives a Steel cloud session over Playwright. The agent runs against `github.com/trending/python` and returns a Zod-validated `FinalReport`.

```typescript
const researchAgent = new Agent({
  id: "research-agent",
  name: "Steel Research",
  instructions: "You operate a Steel cloud browser via tools. ...",
  model: "anthropic/claude-haiku-4-5",
  tools: { openSession, navigate, snapshot, extract },
});

export const mastra = new Mastra({ agents: { researchAgent } });

const result = await researchAgent.generate(prompt, {
  structuredOutput: {
    schema: FinalReport,
    model: "anthropic/claude-haiku-4-5",
  },
  maxSteps: 15,
  onStepFinish: async (step) => { ... },
});

console.log(result.object); // typed as z.infer<typeof FinalReport>
```

## Tools as a record, not an array

`tools` is a record (`{ openSession, navigate, ... }`), not an array. The keys are what the model sees in its tool list and what comes back as `toolName` in the step stream; the `id` field on each `createTool` is Mastra's internal handle for telemetry and storage. Tool objects are first-class values you can compose, share between agents, or hand to a `Workflow` step.

Each `createTool` call carries both an `inputSchema` and an `outputSchema`. The input schema is the model's contract: Mastra compiles it to JSON Schema and the model validates against it before your `execute` runs. The output schema isn't strictly enforced for agents (it doesn't reject a returning tool), but it's the type the model sees described and what `Workflow` steps validate when piping data between them. Leaving it off is fine; declaring it makes the tool's surface explicit on both sides.

```typescript
const navigate = createTool({
  id: "navigate",
  description:
    "Navigate the open session to a URL and wait for the page to load.",
  inputSchema: z.object({ url: z.string().url() }),
  outputSchema: z.object({ url: z.string(), title: z.string() }),
  execute: async ({ url }) => {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45_000 });
    return { url: page.url(), title: await page.title() };
  },
});
```

The four tools share one Steel session and one Playwright `page` through module-level closures, so successive calls compose naturally against the same browser state. `openSession` creates the session and connects Playwright over CDP, `navigate` wraps `page.goto`, `snapshot` returns a capped `innerText` plus the first N anchor tags so the agent never has to guess CSS selectors, and `extract` runs N rows by M fields inside one `page.evaluate` (serial CDP round trips against a cloud browser are ~200-300ms each, batching collapses it to one).

## Structured output via a structuring pass

`structuredOutput` pins the final answer to a Zod schema and reads back as `result.object`. The recipe uses Mastra's documented "maximum compatibility" path:

```typescript
structuredOutput: {
  schema: FinalReport,
  model: "anthropic/claude-haiku-4-5",
}
```

The agent runs its tool loop normally and produces a free-text answer. After it finishes, Mastra runs a second cheap pass with the structuring model to coerce that text into the `FinalReport` schema. `result.object` is typed as `z.infer<typeof FinalReport>`.

The simpler form, `structuredOutput: { schema }`, asks the provider to emit structured output natively. That works well for OpenAI but bites on Anthropic + tools today: `output_config.format.schema` rejects array constraints (`minItems`, `maxItems`), and the model often keeps calling tools when the schema is also active. The structuring-pass form sidesteps both. The trade-off is one extra model call per run; on Haiku 4.5 that's a few tenths of a cent.

If you want zero extra calls and don't mind less-reliable formatting, swap the two-pass path for `jsonPromptInjection: true`, which puts the schema in the system prompt and parses JSON out of the final assistant message.

## The Mastra Model Router

`model: "anthropic/claude-haiku-4-5"` is a string, not an imported provider object. Mastra's router resolves the prefix (`anthropic/`, `openai/`, `google/`, ...) to a client and reads the matching env var (`ANTHROPIC_API_KEY` here) at run time. There's no `@ai-sdk/anthropic` in `package.json`. To swap providers you change the string and the env var. You can still pass a raw AI SDK model object anywhere a string is accepted if you need provider-specific options the router doesn't expose.

## The Mastra registry

`new Mastra({ agents: { researchAgent } })` is technically optional for `agent.generate()` to run. It earns its keep when you turn on storage, telemetry, or workflows: those features look up agents through the registry. It's also what `mastra dev` reads to populate Studio. Setting it up day one (even with one agent) means you don't move code around when you add memory or scorers later.

## Run it

```bash
cd examples/mastra
cp .env.example .env          # set STEEL_API_KEY and ANTHROPIC_API_KEY
npm install
npx playwright install chromium
npm start
```

Get keys at [app.steel.dev/settings/api-keys](https://app.steel.dev/settings/api-keys) and [console.anthropic.com](https://console.anthropic.com/). The `open-session` tool prints a Live View URL; open it in another tab to watch the browser as the agent works.

Mastra requires Node 22.13+. If `npm install` complains about engines, `nvm use 22` (or newer) first.

Your output varies. Structure looks like this:

```text
Steel + Mastra Starter
============================================================
    open-session: 1433ms
  step: openSession | 1549 tokens
    navigate: 708ms
  step: navigate | 1702 tokens
    snapshot: 400ms (2630 chars, 99 links)
  step: snapshot | 1829 tokens
    extract: 120ms (14 rows)
  step: extract | 5595 tokens
  step: (text only) | 6802 tokens

Agent finished.

Structured output:
{
  "summary": "These repositories represent cutting-edge AI and ML...",
  "repos": [
    { "name": "owner/repo", "url": "...", "stars": "1,204", "description": "..." },
    ...
  ]
}

Releasing Steel session...
Session released. Replay: https://app.steel.dev/sessions/ab12cd34...
```

`step: openSession` is the record key the model used in its tool call; `open-session: 1433ms` is the `id` printed inside the tool's `execute` body. Both refer to the same tool.

A full run takes ~20-40 seconds and a few cents of Steel session time plus Anthropic tokens. The `finally` block calls `steel.sessions.release()`; skip it and the session keeps billing until the default 5-minute timeout.

## Open the Studio

Mastra ships a local playground for chatting with agents, watching tool calls, and replaying traces. Run alongside the script:

```bash
npx mastra dev
```

It serves at `http://localhost:4111` and reads the `mastra` registry exported from `index.ts`. Pick `research-agent` in the sidebar, drop in a prompt, and watch each tool call as the agent works. Useful for iterating on instructions without paying for full Steel sessions on every change.

## Make it yours

- **Swap the model.** Change the `model` string. `"openai/gpt-5-mini"`, `"google/gemini-2.5-flash"`, `"anthropic/claude-sonnet-4-6"` all work; set the matching API key in `.env`. Pass a structuring model via `structuredOutput.model` if the primary model is great at browsing but flaky at JSON.
- **Swap the task.** Change the prompt and the `FinalReport` schema. The four tools are task-agnostic.
- **Add a tool.** A `click` tool wrapping `page.click`, a `screenshot` tool returning a base64 PNG. Add to the `tools` record.
- **Add memory.** Install `@mastra/memory` plus a storage adapter (`@mastra/libsql`), pass `memory` on the `Agent`, then call `generate(prompt, { memory: { resource, thread } })` to persist conversation across runs. See [Mastra memory docs](https://mastra.ai/docs/memory/overview).
- **Wrap it in a workflow.** For multi-step pipelines (login → scrape → summarize) where each step needs to be retryable or human-resumable, port the tool calls into `createStep` blocks under a `createWorkflow`. See [Mastra workflows](https://mastra.ai/docs/workflows/overview).
- **Turn on stealth.** Pass `useProxy`, `solveCaptcha`, or `sessionTimeout` to `steel.sessions.create({...})` for sites with anti-bot.

## Related

[Vercel AI SDK version](../vercel-ai-sdk-ts) (raw AI SDK without Mastra's primitives) · [OpenAI Agents SDK version](../openai-agents-ts) (sibling typed-agent recipe with handoffs) · [Mastra docs](https://mastra.ai/docs) · [Mastra Studio](https://mastra.ai/docs/studio/overview)
