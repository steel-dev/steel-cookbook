# Magnitude Starter (TypeScript)

Magnitude grew out of end-to-end testing and kept the bias: an agent loop that narrates each turn, a CDP-level browser hookup, and LLM-backed primitives designed to intermix navigation, action, and typed readback. `startBrowserAgent()` hands you a `BrowserAgent` with a small surface this recipe exercises:

- `agent.extract(instruction, schema)`: describe what to pull off the page, pass a Zod schema, get a typed result.
- `agent.act(instruction)`: describe an interaction in natural language. The agent plans, clicks, types, retries.
- `agent.stop()`: flush and tear down. Pair with `client.sessions.release()` in a `finally`.

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

`browser.cdp` is the whole wiring. `narrate: true` streams a log of what the agent is doing between screenshot turns. The `url` option does the first navigation, so there is no separate `goto` call in `main()`.

## What the demo does

`main()` walks a three-step flow against Steel's public leaderboard repo:

1. Extract the user behind the most recent commit:

```typescript
const mostRecentCommitter = await agent.extract(
  "Find the user with the most recent commit",
  z.object({
    user: z.string(),
    commit: z.string(),
  }),
);
```

2. Act to open the pull request that produced that commit:

```typescript
await agent.act(
  "Find the pull request behind the most recent commit if there is one",
);
```

3. Extract a prose summary of what the PR changed.

The `act` call sits in `try / catch` because the leaderboard head commit is not always tied to a merged PR.

## Run it

```bash
cd examples/magnitude
cp .env.example .env          # set STEEL_API_KEY and ANTHROPIC_API_KEY
npm install
npm start
```

Steel keys live at [app.steel.dev/settings/api-keys](https://app.steel.dev/settings/api-keys); Anthropic keys at [console.anthropic.com](https://console.anthropic.com/).

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

A full run takes ~45 seconds. The `finally` block stops the agent first, then releases the session. Reverse that order and Magnitude can try to screenshot a browser Steel already tore down.

## Make it yours

- **Swap the schema and prompt.** `extract()` is schema-driven: forms, tables, invoices, search results.
- **Chain `act` calls for multi-step flows.** Login, filter, paginate, export. Each step is one natural-language instruction.
- **Switch models.** `llm.provider` accepts `"anthropic"` (used here) among others. Point `model` and `apiKey` at a different provider in `startBrowserAgent()`.
- **Turn on stealth.** Uncomment `useProxy`, `solveCaptcha`, or `sessionTimeout` in `client.sessions.create()` for sites with anti-bot.

## Related

[Magnitude docs](https://docs.magnitude.run)
