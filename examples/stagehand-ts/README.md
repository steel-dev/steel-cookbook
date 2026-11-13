# Stagehand Starter (TypeScript)

Stagehand replaces brittle selectors with two LLM-backed primitives:

- `stagehand.extract(instruction, schema)`: describe what you want, pass a Zod schema, get typed data back.
- `stagehand.act(instruction)`: describe an action in natural language, Stagehand figures out the click / type / scroll.

This starter targets **Stagehand v4**, which does its work inside a Chrome extension called Stagehand Runtime. The extension ships in the npm package, but a Steel session cannot load one from your disk. `uploadStagehandExtension()` sends the bundled copy to your Steel account, and the session starts with it:

```typescript
const file = await toFile(
  await getExtensionArchive(),
  "stagehand-runtime.zip"
);
const { extensions } = await client.extensions.list();
const existing = extensions.find((ext) => ext.name === "Stagehand Runtime");
if (existing) {
  await client.extensions.update(existing.id, { file });
  return existing.id;
}
const uploaded = await client.extensions.upload({ file });
return uploaded.id;
```

The upload replaces the stored copy on every run, so the extension in your account always matches the Stagehand version in `node_modules`. The returned ID goes into `extensionIds` when the script calls `client.sessions.create`.

Stagehand then connects to the session over CDP and finds the extension by name:

```typescript
browser = await localBrowser.connect({ cdpUrl: session.websocketUrl });
stagehand = await Stagehand.create({
  browser,
  model: { modelName: "openai/gpt-6.1-sol", apiKey: OPENAI_API_KEY },
});
```

`model` is the LLM that interprets every instruction. The extension makes the model calls from inside the Steel browser, so the OpenAI key you pass here is sent to the session along with the rest of the config.

Typed extraction, an instruction paired with a Zod schema:

```typescript
const [page] = await browser.context.pages();
await page.goto("https://news.ycombinator.com");

const { data } = await stagehand.extract(
  "extract the titles and ranks of the first 5 stories on the page",
  z.object({
    stories: z.array(z.object({ title: z.string(), rank: z.number() })),
  }),
  { page },
);
```

The schema is not just documentation. Stagehand constrains the LLM's output against it and gives you a typed result at runtime. Swap the prompt and schema for any extraction problem: forms, tables, search results, prices.

Pass `{ page }` on every call. Without it, Stagehand does not read the tab you navigated on a Steel session: `extract()` comes back with no stories and `act()` finds nothing to click.

Natural-language action, no selector required:

```typescript
const { data: action } = await stagehand.act(
  "click the 'new' link in the top navigation",
  { page },
);
if (!action.success) {
  throw new Error(`Could not navigate to new stories: ${action.message}`);
}
```

Stagehand reads the page, picks the matching element, and clicks it. When no element matches, `act()` does not throw. It returns `success: false` with a message, so `main()` checks the flag before it reports success.

## Run it

```bash
cd examples/stagehand-ts
cp .env.example .env          # set STEEL_API_KEY and OPENAI_API_KEY
npm install
npm start
```

Stagehand 4 needs Node.js 22.18 or newer. Get keys from [app.steel.dev](https://app.steel.dev/settings/api-keys) and [platform.openai.com](https://platform.openai.com/api-keys). A session viewer URL prints as the script starts. Open it in another tab to watch Stagehand work.

Your output varies. Structure looks like this:

```text
Uploading the Stagehand extension...
Creating Steel session...
Steel Session created!
View session at https://app.steel.dev/sessions/ab12cd34…
Connecting Stagehand...
[stagehand] INFO stagehand.init
Connected to browser via Stagehand
Navigating to Hacker News...
Extracting top stories using AI...
[stagehand] INFO Starting extraction using an accessibility snapshot {…}
[stagehand] INFO Extraction completed successfully {"category":"extraction","promptTokens":9629,…}

Top 5 Hacker News Stories:
1. Rust 1.100
2. Show HN: My $300 embroidery machine needed a subscription, so I built my own app
3. …

Navigating to HN's 'new' section via a natural-language click...
[stagehand] INFO Act inference completed {…}
Navigated to https://news.ycombinator.com/newest

Automation completed successfully!
```

A full run takes ~20 seconds. Each `extract` or `act` call sends ~10k prompt tokens to OpenAI, mostly the page snapshot, so a run costs a few cents of tokens plus Steel session time.

## Make it yours

- **Swap the schema and prompt.** `extract()` works on any data shape: forms, invoices, product grids, tables. Change the `stagehand.extract` call in `index.ts` to whatever you need to read off a page.
- **Chain acts and extracts.** Break a task into natural-language steps: "sign in with these creds, then extract invoices from the past month." Each step is one `act()` or `extract()`.
- **Try another model.** `modelName` also takes `anthropic/…` and `google/…` names. Swap `modelName` and `apiKey` in the `Stagehand.create` call.
- **Keep zod in step when you upgrade.** `package.json` keeps Stagehand on 4.4.x and pins `zod` to 4.6.6, the version Stagehand 4.4 depends on. When you move to a newer Stagehand, set `zod` to the version it depends on (`npm ls zod` shows it). With two copies installed, `tsc` either rejects the `extract` schema or runs out of memory comparing the two sets of types.

## Related

[Python version](../stagehand-py) · [Extensions recipe](../extensions-ts) · [Stagehand docs](https://docs.stagehand.dev)
