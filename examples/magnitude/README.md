# Magnitude Starter (TypeScript)

Magnitude grew out of end-to-end testing and kept the bias: an agent loop that narrates each turn, a CDP-level browser hookup, and LLM-backed primitives designed to intermix navigation, action, and typed readback. `startBrowserAgent()` hands you a `BrowserAgent` with a small surface this recipe exercises:

- `agent.extract(instruction, schema)`: describe what to pull off the page, pass a Zod schema, get a typed result.
- `agent.act(instruction)`: describe an interaction in natural language. The agent plans, clicks, types, retries.
- `agent.stop()`: flush and tear down. Pair with `client.sessions.release()` in a `finally`.

Steel supplies the browser over CDP, so Magnitude never launches its own Chromium:

```typescript
const agent = await startBrowserAgent({
  url: "https://github.com/steel-dev/leaderboard",
  narrate: true,
  telemetry: false,
  llm: {
    provider: "anthropic",
    options: {
      model: "claude-sonnet-4-6",
      apiKey: ANTHROPIC_API_KEY,
    },
  },
  browser: {
    cdp: `${session.websocketUrl}&apiKey=${STEEL_API_KEY}`,
  },
});
```

`browser.cdp` is the whole wiring. Magnitude attaches to the context Steel hands back instead of spawning a local browser. `narrate: true` streams a log of what the agent is doing between screenshot turns, which is the setting worth leaving on while you tune prompts. The `url` option does the first navigation for you, so there is no separate `goto` call in `main()`.

## What the demo does

`main()` in `index.ts` walks a three-step flow against Steel's public leaderboard repo:

1. Extract the user behind the most recent commit, against a small Zod schema:

```typescript
const mostRecentCommitter = await agent.extract(
  "Find the user with the most recent commit",
  z.object({
    user: z.string(),
    commit: z.string(),
  }),
);
```

The schema is the contract. Magnitude constrains the model's output against it, and the returned value is typed at the call site. Swap the shape for any read problem: forms, invoices, tables, search results.

2. Act to open the pull request that produced that commit. No selector, no URL; the agent reads the page, finds the link, clicks it:

```typescript
await agent.act(
  "Find the pull request behind the most recent commit if there is one",
);
```

3. Extract a prose summary of what the PR changed. Same `extract` shape, different schema.

The `act` call sits in `try / catch` because the leaderboard head commit is not always tied to a merged PR. When it is not, Magnitude throws and the script logs "No pull request found or accessible" and moves on. Worth copying that pattern for any step that depends on page state you cannot guarantee.

## Run it

```bash
cd examples/magnitude
cp .env.example .env          # set STEEL_API_KEY and ANTHROPIC_API_KEY
npm install
npm start
```

Steel keys live at [app.steel.dev/settings/api-keys](https://app.steel.dev/settings/api-keys); Anthropic keys at [console.anthropic.com](https://console.anthropic.com/). The script prints a session viewer URL on boot. Open it in another tab to watch Magnitude drive the page.

Your output varies. Structure looks like this:

```text
Steel + Magnitude Node Starter
============================================================

Creating Steel session...
Steel Session created!
View session at https://app.steel.dev/sessions/ab12cd34...

Connected to browser via Magnitude
Looking for commits
[narrate] taking screenshot of github.com/steel-dev/leaderboard
[narrate] extracting: Find the user with the most recent commit

Most recent committer:
alice-dev has the most recent commit

Looking for pull request behind the most recent commit
[narrate] clicking commit SHA link
[narrate] navigating to pull/482
Found pull request!
Adds a tie-breaker rule when two contributors have identical scores.

Automation completed successfully!
Stopping Magnitude agent...
Releasing Steel session...
Steel session released successfully
```

A full run takes ~45 seconds; most of that is Claude picking actions. You pay for a minute or two of Steel session time plus a handful of Anthropic tokens per `act` / `extract` call. Each agent turn consumes a screenshot, so the bill grows with the number of steps, not the length of the page.

The `finally` block stops the agent first, then releases the session. Reverse that order and Magnitude can try to screenshot a browser Steel already tore down.

## Make it yours

- **Swap the schema and prompt.** `extract()` is schema-driven: forms, tables, invoices, search results. Change the Zod shape and the instruction; everything else holds.
- **Chain `act` calls for multi-step flows.** Login, filter, paginate, export. Each step is one natural-language instruction; errors are catchable per step, like the PR lookup here.
- **Switch models.** `llm.provider` accepts `"anthropic"` (used here) among others. Point `model` and `apiKey` at a different provider in `startBrowserAgent()` and the rest of the script stays put.
- **Turn on stealth.** Uncomment `useProxy`, `solveCaptcha`, or `sessionTimeout` in `client.sessions.create()` for sites with anti-bot.

## Related

[Magnitude docs](https://docs.magnitude.run)
