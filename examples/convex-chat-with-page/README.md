# Chat with any webpage on Convex

A Convex app where the user pastes a URL, asks a question, and an AI agent answers from the live page. The agent runs server-side as a `pageAgent` defined in `convex/agent.ts`, with a single tool, `scrapePage`, that fetches the URL through the `@steel-dev/convex` component and serves the markdown back in chunks. Tokens stream into the UI over websockets via `@convex-dev/agent`'s delta sync.

```
convex/
├── convex.config.ts    mounts steel + agent components
├── schema.ts           scrapeCache table
├── scrape.ts           cache helpers (getCached / putCached / latestForOwner)
├── agent.ts            pageAgent + scrapePage tool
└── chat.ts             createThread / sendMessage / listThreadMessages
src/
├── App.tsx             two-pane chat UI
└── components/         Markdown, Spinner, ScrapedPagePane, ui/*
```

The agent's loop runs entirely on Convex. The browser only renders messages and the scraped markdown pane.

## Run it

Set up environment variables on your shell, scaffold a deployment, then push the keys to it. Convex actions don't inherit shell env, so they have to be set on the deployment.

```bash
cd examples/convex-chat-with-page
npm install
cp .env.example .env       # fill in STEEL_API_KEY and OPENAI_API_KEY
npx convex dev             # creates a dev deployment on first run
```

In a second terminal:

```bash
npx convex env set STEEL_API_KEY "$STEEL_API_KEY"
npx convex env set OPENAI_API_KEY "$OPENAI_API_KEY"
npm run dev                # vite frontend
```

Get keys at [app.steel.dev/settings/api-keys](https://app.steel.dev/settings/api-keys) and [platform.openai.com/api-keys](https://platform.openai.com/api-keys).

Open the Vite URL, paste a URL into the input, and ask a question:

```text
https://en.wikipedia.org/wiki/Steel

When was stainless steel invented? Quote a phrase from the article.
```

A typical first run goes:

1. The user message appears.
2. The "thinking..." bubble shows with a spinner.
3. `scrapePage` fires. Steel opens a session, fetches the page, writes one row to `scrapeCache` and one to the Steel component's `sessions` table.
4. The right pane slides in with the rendered markdown.
5. Tokens stream into the assistant bubble on the left.

A second send of the same URL within 10 minutes hits the cache and skips the Steel call. The session count in the Convex dashboard stays flat.

## How streaming wires together

Three pieces have to line up or no tokens flow.

**Action.** `sendMessage` in `convex/chat.ts` calls `thread.streamText({ prompt }, { saveStreamDeltas: true })` and `await result.consumeStream()`. `saveStreamDeltas: true` writes each delta to the database as it arrives.

**Query.** `listThreadMessages` returns the merged result of `listMessages` (persisted history) and `syncStreams` (in-flight deltas). Without `syncStreams`, the client never sees the incremental rows.

**Hook.** `App.tsx` calls `useThreadMessages(api.chat.listThreadMessages, args, { stream: true })`. The `stream: true` flag is what tells the hook to subscribe to deltas in addition to persisted messages.

Drop any one of the three and the answer arrives all at once at the end. Drop the action's `consumeStream`, and it never arrives at all.

## HTML to markdown locally

`convex/agent.ts` fetches HTML from Steel and converts it on the Convex side using `node-html-markdown`, instead of asking Steel to return markdown directly:

```ts
const result = await steel.steel.scrape(
  ctx,
  { url, commandArgs: { format: ["html"], delay: 100 } },
  { ownerId },
);
const html = result?.content?.html ?? "";
const markdown = htmlToMarkdown.translate(html);
```

Steel's built-in markdown extractor drops the article body on some sites (LessWrong returned title plus footnotes only). HTML is consistent across sites, so the recipe takes the conversion hit and stays predictable.

The result is then chunked at paragraph boundaries into ~25k-character pieces (`chunkMarkdown`) and stored in `scrapeCache` keyed by `(url, ownerId)`. The model paginates by calling `scrapePage` again with `chunkIndex: 1`, `chunkIndex: 2`, etc. `stopWhen: stepCountIs(8)` on the `Agent` constructor lets it page through long articles and still answer.

## Make it yours

- **Plug in real auth.** `ownerId` is a single string. Replace the hardcoded `alice` / `bob` toggle in `App.tsx` with the user id from Clerk, WorkOS, or your auth provider, and the app becomes multi-tenant against real users.
- **Add login walls.** Compose with the [`credentials`](../credentials-ts) recipe to log in to a real account before scraping, and the [`profiles`](../profiles-ts) recipe to keep cookies across sessions.
- **Solve captchas in-session.** Steel's `solveCaptcha` flag handles the common challenges. Pass it through `commandArgs` on `steel.steel.scrape`.
- **Swap models.** `openai.chat("gpt-5.4-mini")` is one line in `convex/agent.ts`. Any `@ai-sdk/openai` model that supports tool calls works.
- **Adjust the cache TTL.** `CACHE_TTL_MS` is 10 minutes in `scrape.ts`. Lower for fast-moving content, raise for static articles.

## Related

- [`@steel-dev/convex` component](https://www.convex.dev/components/steel-dev)
- [`@convex-dev/agent` component](https://www.convex.dev/components/agent)
- [Sibling recipe: convex-price-watch](../convex-price-watch) (scheduled scraping, no LLM)
