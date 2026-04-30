# Mastra Starter (TypeScript)

[Mastra](https://mastra.ai/) is a TypeScript framework that wraps the Vercel AI SDK with typed tools, a model router, and a built-in Studio playground for chatting with your agents and inspecting traces.

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

A full run takes ~20-40 seconds and a few cents of Steel session time plus Anthropic tokens. The `finally` block calls `steel.sessions.release()`; skip it and the session keeps billing until the default 5-minute timeout.

## Open the Studio

Mastra ships a local playground for chatting with agents, watching tool calls, and replaying traces. Run alongside the script:

```bash
npx mastra dev
```

It serves at `http://localhost:4111` and reads the `mastra` registry exported from `index.ts`. Pick `research-agent` in the sidebar, drop in a prompt, and watch each tool call as the agent works.

## Make it yours

- **Swap the model.** Change the `model` string. `"openai/gpt-5-mini"`, `"google/gemini-2.5-flash"`, `"anthropic/claude-sonnet-4-6"` all work; set the matching API key in `.env`.
- **Swap the task.** Change the prompt and the `FinalReport` schema. The four tools are task-agnostic.
- **Add a tool.** A `click` tool wrapping `page.click`, a `screenshot` tool returning a base64 PNG. Add to the `tools` record.
- **Add memory.** Install `@mastra/memory` plus a storage adapter (`@mastra/libsql`), pass `memory` on the `Agent`, then call `generate(prompt, { memory: { resource, thread } })` to persist conversation across runs. See [Mastra memory docs](https://mastra.ai/docs/memory/overview).
- **Wrap it in a workflow.** For multi-step pipelines (login → scrape → summarize) where each step needs to be retryable or human-resumable, port the tool calls into `createStep` blocks under a `createWorkflow`. See [Mastra workflows](https://mastra.ai/docs/workflows/overview).
- **Turn on stealth.** Pass `useProxy`, `solveCaptcha`, or `sessionTimeout` to `steel.sessions.create({...})` for sites with anti-bot.

## Related

[Vercel AI SDK version](../vercel-ai-sdk-ts) · [OpenAI Agents SDK version](../openai-agents-ts) · [Mastra docs](https://mastra.ai/docs) · [Mastra Studio](https://mastra.ai/docs/studio/overview)
