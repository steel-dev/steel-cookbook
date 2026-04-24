# OpenAI Agents SDK (TypeScript)

The [OpenAI Agents SDK](https://openai.github.io/openai-agents-js/) (`@openai/agents`) is a small runtime for agentic loops. You define an `Agent` with `instructions`, a `model`, `tools`, and an `outputType`. You call `run(agent, prompt)`. The SDK handles "pick a tool, call it, feed the result back, repeat" and validates the final message against your schema. It also ships handoffs (one agent calls another), guardrails (pre/post checks), and traces out of the box.

This recipe turns the tool layer into a Steel cloud browser. Four `tool()` wrappers in `index.ts` (`openSession`, `navigate`, `snapshot`, `extract`) shuttle CDP calls between the agent and Playwright. The agent only sees typed arguments in and structured JSON out. Demo task: scan `github.com/trending/python` and return the top 3 AI/ML repos as a validated `FinalReport`.

This is a different primitive from OpenAI's computer-use API. Computer-use streams screenshots and mouse coordinates through `responses.create` and you write the loop yourself. The Agents SDK sits a layer above: typed function tools, no pixels, and the SDK owns the loop.

## The four tools

Every `tool()` call pairs a Zod `parameters` schema with an async `execute`. The SDK compiles Zod to OpenAI's strict JSON Schema at registration, which tightens a couple of rules: no `.url()` format (pass a plain `z.string()`), and `.optional()` is rejected. Use `.nullable()` instead. The `attr: z.string().nullable()` field inside `extract` exists for that reason.

`openSession` creates the Steel session, attaches Playwright over CDP, and stashes `session`, `browser`, and `page` in module scope so the other three tools share them:

```typescript
const openSession = tool({
  name: "open_session",
  description: "Open a Steel cloud browser session. Call exactly once, before anything else.",
  parameters: z.object({}),
  execute: async () => {
    session = await steel.sessions.create({});
    browser = await chromium.connectOverCDP(
      `${session.websocketUrl}&apiKey=${STEEL_API_KEY}`,
    );
    const ctx = browser.contexts()[0];
    page = ctx.pages()[0] ?? (await ctx.newPage());
    return { sessionId: session.id, liveViewUrl: session.sessionViewerUrl };
  },
});
```

Module-level state is fine here because `run()` fires once per script. For a long-lived server, move the session into a per-run context object and pass it to each tool's closure.

`snapshot` is the cheap look-around. It returns `title`, `url`, a capped `innerText`, and the first N anchor tags, all inside one `page.evaluate`. The agent is told to call it before `extract` so it can pick a real CSS selector instead of hallucinating one.

`extract` takes a `rowSelector` and a `fields[]` spec (name + selector + optional `attr`) and returns `Record<string, string>[]`. The whole query runs inside a single `page.evaluate`. Serial CDP round-trips against a cloud browser cost roughly 200-300ms each, so N rows by M fields in sequence burns real seconds. Batching collapses it to one round trip.

`navigate` is a thin `page.goto` wrapper with a 45-second timeout and `waitUntil: "domcontentloaded"`.

## The output contract

`outputType` accepts a Zod schema. The SDK attaches it to the final assistant message and fails the run if the model drifts off-shape:

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

Some providers force a JSON-only mode when you ask for structured output, which kills tool use. OpenAI does not. The agent calls tools freely throughout the loop and only formats against the schema on the final message.

`maxTurns: 15` caps the loop. One turn is one model response, which may contain any number of tool calls. The demo finishes in 4-6 turns.

## Run it

```bash
cd examples/openai-agents-ts
cp .env.example .env          # set STEEL_API_KEY and OPENAI_API_KEY
npm install
npx playwright install chromium
npm start
```

Get keys at [app.steel.dev/settings/api-keys](https://app.steel.dev/settings/api-keys) and [platform.openai.com/api-keys](https://platform.openai.com/api-keys). A viewer URL prints as `openSession` runs. Open it in another tab to watch the browser live.

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

A full run is ~20-40 seconds. Cost is a few cents of Steel session time plus OpenAI tokens per turn. `gpt-5-mini` keeps the bill small; the snapshot text and link list dominate each turn's prompt.

The `finally` block calls `steel.sessions.release()`. Skip it and the session runs until the default 5-minute timeout while you pay for idle browser time.

## Make it yours

- **Swap the task and schema.** Change the prompt passed to `run()` and rewrite `FinalReport`. The four tools are task-agnostic: any page that yields text plus anchors plus repeating rows works. Pricing pages, job boards, and dashboards fit the same shape.
- **Add handoffs.** Pass `handoffs: [writerAgent]` on the `Agent`. The SDK routes between agents based on each one's description. Useful when "browse" and "synthesize" want different models or prompts.
- **Add a guardrail.** Wire `inputGuardrails` or `outputGuardrails` on the `Agent` to vet the user's prompt or the final message. See the [guardrails guide](https://openai.github.io/openai-agents-js/guides/guardrails).
- **Use a stronger model.** `model: "gpt-5"` plans better on ambiguous pages at the cost of tokens and latency. For well-structured targets like GitHub trending, `gpt-5-mini` is enough.
- **Turn on stealth.** Pass `useProxy`, `solveCaptcha`, or a longer `sessionTimeout` to `sessions.create()` for sites with anti-bot.

## Related

[Python version](../openai-agents-py) · [OpenAI Agents SDK docs](https://openai.github.io/openai-agents-js/) · [Computer Use version](../openai-computer-use-ts)
