# Agent Kit Starter (TypeScript)

Agent Kit is Inngest's framework for multi-agent systems: a **tool** is a typed function the model can call, an **agent** bundles a system prompt with a tool set, and a **network** groups agents so they can collaborate on a task. Agent Kit handles the routing between them and wraps each call in Inngest's `step.run` checkpoint, so a network that crashes mid-flight resumes from the last finished step.

This starter wires Agent Kit to Steel through a single tool, `browse_hacker_news`, that opens a Steel session, drives it with Playwright over CDP, and returns structured rows.

```typescript
const browseHackerNews = createTool({
  name: "browse_hacker_news",
  description:
    "Fetch Hacker News stories (top/best/new) and optionally filter by topics",
  parameters: z.object({
    section: z.enum(["top", "best", "new"]).default("top"),
    topics: z.array(z.string()).nullable(),
    limit: z.number().int().min(1).max(20).default(5),
  }),
  handler: async ({ section, topics, limit }, { step }) => {
    const browse = async () => {
      const session = await client.sessions.create({});
      const browser = await chromium.connectOverCDP(
        session.websocketUrl
      );
      try {
        // navigate, evaluate, filter, dedupe
      } finally {
        await client.sessions.release(session.id);
      }
    };
    return step ? await step.run("browse-hn", browse) : await browse();
  },
});
```

The `step.run("browse-hn", ...)` wrapper is Agent Kit's checkpoint boundary, inherited from Inngest: completed steps are cached by name, so a rerun skips a browser call that already succeeded. `npm start` runs the network outside an Inngest function, where `step` is undefined, so the handler calls `browse()` directly.

`topics` is `.nullable()`, not `.optional()`. Agent Kit sends OpenAI tools in strict mode, which needs every property listed in `required`. The model passes `null` to skip the filter.

```typescript
const hnAgent = createAgent({
  name: "hn_curator",
  description: "Curates interesting Hacker News stories by topic",
  system:
    "Surface novel, high-signal Hacker News stories. Favor technical depth, originality, and relevance to requested topics. Call the tool once, then answer with concise picks.",
  tools: [browseHackerNews],
});

const hnNetwork = createNetwork({
  name: "hacker-news-network",
  agents: [hnAgent],
  maxIter: 2,
  router: ({ lastResult }) =>
    lastResult && lastResult.toolCalls.length === 0 ? undefined : hnAgent,
  defaultModel: openai({
    model: "gpt-6-luna",
    defaultParameters: { reasoning_effort: "none" } as Parameters<
      typeof openai
    >[0]["defaultParameters"],
  }),
});

const run = await hnNetwork.run(
  "Curate 5 interesting Hacker News stories about AI, TypeScript, and tooling. Prefer 'best' if relevant. Return title, url, points."
);
```

The router sends each turn to `hn_curator` until it answers without calling a tool. Agent Kit's default routing agent would pick by `description`, but in Agent Kit 0.13.2 its `select_agent` tool has an optional field that OpenAI's strict mode rejects. Agent Kit's OpenAI adapter calls Chat Completions, where GPT-6 models call tools only with `reasoning_effort: "none"`. Agent Kit's parameter type does not list `reasoning_effort` yet, hence the cast.

## Run it

```bash
cd examples/agentkit
cp .env.example .env          # set STEEL_API_KEY and OPENAI_API_KEY
npm install
npm start
```

Get keys at [app.steel.dev](https://app.steel.dev/settings/api-keys) and [platform.openai.com](https://platform.openai.com/api-keys). Each tool invocation creates a fresh session.

Your output varies. Structure looks like this:

```text
Steel + Agent Kit Starter
============================================================

Running HN curation...

Results:
[
  {
    "agentName": "hn_curator",
    "output": [
      {
        "role": "assistant",
        "stop_reason": "tool",
        "type": "tool_call",
        "tools": [
          {
            "name": "browse_hacker_news",
            "input": { "section": "best", "topics": ["AI", "TypeScript", "tooling"], "limit": 5 },
            ...
          }
        ]
      }
    ],
    "toolCalls": [
      {
        "type": "tool_result",
        "content": {
          "data": [
            { "rank": 4, "title": "My AI agents found an unmapped Maya site?", "points": 1027, ... },
            ...
          ]
        },
        ...
      }
    ],
    ...
  },
  {
    "agentName": "hn_curator",
    "output": [
      {
        "role": "assistant",
        "stop_reason": "stop",
        "type": "text",
        "content": "I found only three stories matching the requested topics: ..."
      }
    ],
    "toolCalls": [],
    ...
  }
]
Done!
```

A run takes about 10 seconds.

## Make it yours

- **Add tools.** Drop another `createTool` (a form filler, a screenshot-and-describe, a per-site scraper) into `hnAgent.tools`.
- **Add agents.** Split the work: one agent browses, another summarizes, a third writes to a database. Put them in the same network and return the next one from `router`.
- **Swap the model.** `gpt-6-luna` is cheap and fast. `gpt-6.1-terra` and `gpt-6-sol` are stronger and also accept `reasoning_effort: "none"`. `gpt-6.1-sol` and `gpt-6-astra` do not, so they cannot call tools through this adapter. Agent Kit also ships Anthropic and Gemini adapters.
- **Reuse sessions.** The current handler creates and releases per call. For a chain of tool calls hitting the same site, hoist session creation out of the handler and pass the session ID through the network's shared state.

## Related

[Agent Kit docs](https://agentkit.inngest.com) · [Playwright version](../playwright-ts) · [Stagehand version](../stagehand-ts)
