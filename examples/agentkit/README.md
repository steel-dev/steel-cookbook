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
    topics: z.array(z.string()).optional(),
    limit: z.number().int().min(1).max(20).default(5),
  }),
  handler: async ({ section, topics, limit }, { step }) => {
    return await step?.run("browse-hn", async () => {
      const session = await client.sessions.create({});
      const browser = await chromium.connectOverCDP(
        `${session.websocketUrl}&apiKey=${STEEL_API_KEY}`
      );
      try {
        // navigate, evaluate, filter, dedupe
      } finally {
        await client.sessions.release(session.id);
      }
    });
  },
});
```

The `step.run("browse-hn", ...)` wrapper is Agent Kit's checkpoint boundary, inherited from Inngest: completed steps are cached by name, so a rerun skips a browser call that already succeeded.

```typescript
const hnAgent = createAgent({
  name: "hn_curator",
  description: "Curates interesting Hacker News stories by topic",
  system:
    "Surface novel, high-signal Hacker News stories. Favor technical depth, originality, and relevance to requested topics...",
  tools: [browseHackerNews],
});

const hnNetwork = createNetwork({
  name: "hacker-news-network",
  agents: [hnAgent],
  maxIter: 2,
  defaultModel: openai({ model: "gpt-5-nano" }),
});

const run = await hnNetwork.run(
  "Curate 5 interesting Hacker News stories about AI, TypeScript, and tooling. Prefer 'best' if relevant. Return title, url, points."
);
```

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
    "type": "tool_call",
    "tool": "browse_hacker_news",
    "input": { "section": "best", "topics": ["AI", "TypeScript"], "limit": 5 },
    "output": [
      { "rank": 3, "title": "Claude 4.7 Opus released today", "points": 892, ... },
      ...
    ]
  },
  {
    "type": "text",
    "content": "Here are 5 high-signal stories..."
  }
]
Done!
```

A run lands in the ~20-40 second range.

## Make it yours

- **Add tools.** Drop another `createTool` (a form filler, a screenshot-and-describe, a per-site scraper) into `hnAgent.tools`.
- **Add agents.** Split the work: one agent browses, another summarizes, a third writes to a database. Put them in the same network and let Agent Kit route based on each agent's `description`.
- **Swap the model.** `gpt-5-nano` is cheap and fast; `gpt-5` handles longer reasoning chains. Agent Kit also ships Anthropic and Gemini adapters.
- **Reuse sessions.** The current handler creates and releases per call. For a chain of tool calls hitting the same site, hoist session creation out of the handler and pass the session ID through the network's shared state.

## Related

[Agent Kit docs](https://agentkit.inngest.com) · [Playwright version](../playwright-ts) · [Stagehand version](../stagehand-ts)
