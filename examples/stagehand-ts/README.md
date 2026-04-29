# Stagehand Starter (TypeScript)

Stagehand replaces brittle selectors with two LLM-backed primitives:

- `stagehand.extract(instruction, schema)`: describe what you want, pass a Zod schema, get typed data back.
- `stagehand.act(instruction)`: describe an action in natural language, Stagehand figures out the click / type / scroll.

Both run against a Steel session over CDP, so Stagehand handles the reasoning and Steel handles the browser (stealth, proxies, live viewer).

```typescript
stagehand = new Stagehand({
  env: "LOCAL",
  localBrowserLaunchOptions: {
    cdpUrl: `${session.websocketUrl}&apiKey=${STEEL_API_KEY}`,
  },
  model: { modelName: "openai/gpt-5", apiKey: OPENAI_API_KEY },
});

await stagehand.init();
```

`env: "LOCAL"` tells Stagehand "I'll hand you the browser." That browser is Steel, reached via the CDP URL. `model` is the LLM that interprets every instruction. This starter targets **Stagehand v3**.

Typed extraction, an instruction paired with a Zod schema:

```typescript
const stories = await stagehand.extract(
  "extract the titles and ranks of the first 5 stories on the page",
  z.object({
    stories: z.array(z.object({ title: z.string(), rank: z.number() })),
  }),
);
```

The schema isn't just documentation. Stagehand constrains the LLM's output against it and gives you a typed result at runtime. Swap the prompt and schema for any extraction problem: forms, tables, search results, prices.

Natural-language action, no selector required:

```typescript
await stagehand.act("click the 'new' link in the top navigation");
```

Stagehand inspects the DOM, picks the matching element, and clicks it.

## Run it

```bash
cd examples/stagehand-ts
cp .env.example .env          # set STEEL_API_KEY and OPENAI_API_KEY
npm install
npm start
```

Get keys from [app.steel.dev](https://app.steel.dev/settings/api-keys) and [platform.openai.com](https://platform.openai.com/api-keys). A session viewer URL prints as the script starts. Open it in another tab to watch Stagehand work.

Your output varies. Structure looks like this:

```text
Creating Steel session...
Steel Session created!
View session at https://app.steel.dev/sessions/ab12cd34…

Initializing Stagehand...
Connected to browser via Stagehand
Navigating to Hacker News...
Extracting top stories using AI...

Top 5 Hacker News Stories:
1. Claude 4.7 Opus released today
2. Show HN: A browser extension for reading on slow connections
3. …

Navigating to HN's 'new' section via a natural-language click...
Navigated to new stories!

Automation completed successfully!
```

A full run takes ~30 seconds and costs a few cents of Steel session time plus OpenAI tokens for each `extract` / `act` call.

## Make it yours

- **Swap the schema and prompt.** `extract()` works on any data shape: forms, invoices, product grids, tables. Change the `stagehand.extract` call in `index.ts` to whatever you need to read off a page.
- **Chain acts and extracts.** Break a task into natural-language steps: "sign in with these creds, then extract invoices from the past month." Each step is one `act()` or `extract()`.
- **Try another model.** `gpt-5` works well out of the box; Claude and Gemini also work. Swap `modelName` and `apiKey` in the `Stagehand` config.

## Related

[Python version](../stagehand-py) · [Stagehand docs](https://docs.stagehand.dev)
