A Next.js chat app where an AI SDK v6 agent drives a Steel cloud browser server-side and streams every tool call back into the UI. `useChat` on the client posts to `/api/chat`; that route calls `streamText` with four Steel-backed tools (`openSession`, `navigate`, `snapshot`, `extract`). Each tool call surfaces as a typed `tool-*` part on the message stream, and a Live View iframe on the right lights up the moment the agent opens a session.

```
app/
├── api/chat/route.ts   # streamText + Steel tools, Node runtime
├── page.tsx            # useChat, tool-call rendering, Live View iframe
├── layout.tsx          # Geist fonts, dark theme
└── globals.css
```

The server/client split is load-bearing. `streamText` holds the Playwright `Browser`, the Steel session handle, and your API keys; none of that can leak to the client. The client only sees message parts coming off `result.toUIMessageStreamResponse()`.

## The route

`app/api/chat/route.ts` pins `runtime = "nodejs"` (Playwright will not run on Edge) and `maxDuration = 120` (a 15-step browser loop can blow past the 10-second default). `next.config.mjs` lists `playwright`, `playwright-core`, and `steel-sdk` under `serverExternalPackages` so Next skips bundling them into the server build.

The `POST` handler builds a per-request closure around three variables:

```ts
let session: Awaited<ReturnType<typeof steel.sessions.create>> | null = null;
let browser: Browser | null = null;
let page: Page | null = null;
```

Every tool's `execute` reads and writes these. That is what keeps one conversation turn glued to one browser. `streamText` runs up to 15 steps (`stopWhen: stepCountIs(15)`), and both `onFinish` and `onAbort` call `cleanup()` to close the browser and `steel.sessions.release(session.id)`. Forgetting the release keeps the session alive until the default 5-minute timeout, and Steel bills per session-minute.

## The four tools

`openSession` creates the Steel session, connects Playwright over CDP, grabs the existing page (Steel sessions start with a blank tab already open), and returns `{ sessionId, liveViewUrl, debugUrl }`. Those URLs flow back through the stream and into the UI.

`navigate` is a thin wrapper over `page.goto` with `waitUntil: "domcontentloaded"` and a 45-second timeout.

`snapshot` runs one `page.evaluate` that returns the page's title, URL, a capped slice of `document.body.innerText`, and up to 50 `{ text, href }` link records. The system prompt tells the model to call this before `extract` so it reads real DOM structure instead of guessing selectors. One round-trip, not fifty.

`extract` takes a `rowSelector`, a list of `{ name, selector, attr? }` fields, and a row limit. The whole extraction runs inside a single `page.evaluate`. Serial CDP calls (`row.$`, `el.getAttribute`, `el.innerText`) are the biggest latency cost on a cloud browser, so batching matters.

A fifth tool, `submitForm`, carries `needsApproval: true`. Its body only runs if your approval UI confirms the call. It ships as a demo hook; wire it up when you add real destructive actions.

## Phase-gating with `prepareStep`

Tool misuse by the model is a real failure mode. A second `openSession` mid-run would leak a browser; a `navigate` before any session exists throws. `prepareStep` constrains the active tool set per step:

```ts
prepareStep: async ({ stepNumber, steps }) => {
  const sessionOpened = steps.some((s) =>
    s.toolCalls?.some((tc) => tc.toolName === "openSession")
  );
  if (stepNumber === 0 || !sessionOpened) {
    return { activeTools: ["openSession"] };
  }
  return { activeTools: ["navigate", "snapshot", "extract", "submitForm"] };
},
```

Step 0 sees only `openSession`. Once a step has actually called it, `openSession` drops out and the rest appear. The model cannot open a second session even if it tries.

## Streaming tool calls into the UI

`app/page.tsx` is one client component. `useChat()` gives you `messages`, `sendMessage`, and a `status` that walks through `submitted`, `streaming`, `ready`. Messages arrive as `parts` arrays. Text parts render as Markdown (piped through `marked`, sanitized via `isomorphic-dompurify`). Anything with a `type` starting with `tool-` goes through the `ToolCall` component: a collapsible row with the tool name, a colored state dot (`input-streaming`, `output-available`, `output-error`), and the JSON input/output on expand.

Two hooks do most of the orchestration. `durationsRef` records `Date.now()` on the first sighting of each `toolCallId` and stamps an end time when the part transitions to `output-available` or `output-error`, so each tool call shows wall-clock duration. `useMemo` walks every part looking for a `tool-openSession` with an `output`:

```tsx
const { debugUrl, liveViewUrl, sessionId } = useMemo(() => {
  for (const m of messages) {
    for (const part of (m.parts ?? []) as any[]) {
      if (part?.type === "tool-openSession" && part?.output) {
        return {
          debugUrl: part.output.debugUrl ?? null,
          liveViewUrl: part.output.liveViewUrl ?? null,
          sessionId: part.output.sessionId ?? null,
        };
      }
    }
  }
  return { debugUrl: null, liveViewUrl: null, sessionId: null };
}, [messages]);
```

The iframe uses `debugUrl` (interactive embed). The "open in new tab" link uses `liveViewUrl` (shareable viewer). Both arrive through the same stream that renders the message, so the right pane lights up the same second the first tool call resolves.

## Run it

```bash
cd examples/vercel-ai-sdk-nextjs
cp .env.example .env          # set STEEL_API_KEY and ANTHROPIC_API_KEY
npm install
npx playwright install chromium
npm run dev
```

Get keys at [app.steel.dev/settings/api-keys](https://app.steel.dev/settings/api-keys) and [console.anthropic.com](https://console.anthropic.com/). Open [http://localhost:3000](http://localhost:3000) and try one of the seeded prompts:

> Go to https://github.com/trending/python and tell me the top 3 AI/ML repos.

A typical run takes ~20 seconds: `openSession` (~3s), `navigate` (~2s), `snapshot` (~1s), `extract` (~1s), then the model writes its reply. Your output varies. The server console logs each step with its tool name and token count; structure looks like this:

```text
  step: openSession | 412 tokens
  step: navigate | 1083 tokens
  step: snapshot | 2847 tokens
  step: extract | 3104 tokens
  step: (text) | 3298 tokens
```

## Deploying to Vercel

Push to GitHub, import into Vercel, add `STEEL_API_KEY` and `ANTHROPIC_API_KEY` as environment variables. Playwright's Chromium has to be downloaded during the build, so set the Build Command to:

```
npx playwright install chromium && next build
```

The `/api/chat` route already declares `maxDuration = 120` and `runtime = "nodejs"`, so it runs on Vercel's Node serverless runtime with a 120-second ceiling.

## Make it yours

- **Change the model.** Swap `anthropic("claude-haiku-4-5")` for any model in `@ai-sdk/*`. The Zod tool schemas stay the same.
- **Add a screenshot tool.** `await page.screenshot({ type: "png" })` returns a Buffer; return it base64-encoded and render it as an `<img>` in the tool-call panel.
- **Stream a plan step.** Add a `plan` tool with no side effects and a string input. The model can narrate its intent before executing, which reads nicely in chat.
- **Turn on stealth.** Pass `useProxy`, `solveCaptcha`, or `sessionTimeout` options to `steel.sessions.create()` inside `openSession`.
- **Wire the approval UI.** `needsApproval: true` on `submitForm` pauses execution and surfaces the call as a `tool-submitForm` part in `state: "input-available"`. Render an Approve/Reject pair and call `addToolResult` from `@ai-sdk/react` to resume.

## Related

[Plain TS version](../vercel-ai-sdk-ts) · [AI SDK agents](https://ai-sdk.dev/docs/agents/overview) · [Loop control](https://ai-sdk.dev/docs/agents/loop-control) · [Next.js App Router](https://nextjs.org/docs/app)
