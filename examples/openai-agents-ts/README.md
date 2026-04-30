# OpenAI Agents SDK (TypeScript)

The [OpenAI Agents SDK](https://openai.github.io/openai-agents-js/) (`@openai/agents`) is a small runtime for agentic loops. You define an `Agent` with `instructions`, a `model`, `tools`, and an `outputType`. You call `run(agent, prompt)`. The SDK handles "pick a tool, call it, feed the result back, repeat" and validates the final message against your schema.

This recipe turns the tool layer into a Steel cloud browser. Four `tool()` wrappers in `index.ts` (`openSession`, `navigate`, `snapshot`, `extract`) shuttle CDP calls between the agent and Playwright. Demo task: scan `github.com/trending/python` and return the top 3 AI/ML repos as a validated `FinalReport`.

```typescript
const FinalReport = z.object({
  summary: z.string(),
  repos: z.array(z.object({
    name: z.string(),
    url: z.string(),
    stars: z.string().nullable(),
    description: z.string().nullable(),
  })).min(1).max(5),
});

const agent = new Agent({
  name: "SteelResearch",
  instructions: "You operate a Steel cloud browser via tools. Workflow: ...",
  model: "gpt-5-mini",
  tools: [openSession, navigate, snapshot, extract],
  outputType: FinalReport,
});

const result = await run(agent, "Go to https://github.com/trending/python ...", { maxTurns: 15 });
console.log(result.finalOutput); // typed as z.infer<typeof FinalReport>
```

The SDK compiles Zod to OpenAI's strict JSON Schema at registration, which tightens a couple of rules: no `.url()` format (pass a plain `z.string()`), and `.optional()` is rejected. Use `.nullable()` instead.

## Run it

```bash
cd examples/openai-agents-ts
cp .env.example .env          # set STEEL_API_KEY and OPENAI_API_KEY
npm install
npx playwright install chromium
npm start
```

Get keys at [app.steel.dev/settings/api-keys](https://app.steel.dev/settings/api-keys) and [platform.openai.com/api-keys](https://platform.openai.com/api-keys). A viewer URL prints as `openSession` runs.

Your output varies. Structure looks like this:

```text
Steel + OpenAI Agents SDK (TypeScript) Starter
============================================================
    open_session: 1432ms
    navigate: 2180ms
    snapshot: 412ms (3921 chars, 48 links)
    extract: 380ms (3 rows)

Agent finished.

{
  "summary": "All three repos focus on LLM tooling written in Python...",
  "repos": [
    { "name": "owner/repo", "url": "https://github.com/...", "stars": "1,204", "description": "..." },
    ...
  ]
}

Releasing Steel session...
Session released. Replay: https://app.steel.dev/sessions/ab12cd34...
```

A full run is ~20-40 seconds. Cost is a few cents of Steel session time plus OpenAI tokens per turn. The `finally` block calls `steel.sessions.release()`.

## Make it yours

- **Swap the task and schema.** Change the prompt passed to `run()` and rewrite `FinalReport`. The four tools are task-agnostic.
- **Add handoffs.** Pass `handoffs: [writerAgent]` on the `Agent`. The SDK routes between agents based on each one's description.
- **Add a guardrail.** Wire `inputGuardrails` or `outputGuardrails` on the `Agent` to vet the user's prompt or the final message. See the [guardrails guide](https://openai.github.io/openai-agents-js/guides/guardrails).
- **Use a stronger model.** `model: "gpt-5"` plans better on ambiguous pages at the cost of tokens and latency.
- **Turn on stealth.** Pass `useProxy`, `solveCaptcha`, or a longer `sessionTimeout` to `sessions.create()` for sites with anti-bot.

## Related

[Python version](../openai-agents-py) · [OpenAI Agents SDK docs](https://openai.github.io/openai-agents-js/) · [Computer Use version](../openai-computer-use-ts)
