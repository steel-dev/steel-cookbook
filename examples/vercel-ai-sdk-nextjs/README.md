# Steel + Vercel AI SDK v6 — Next.js Chat Starter

A Next.js App Router chat app where a [Vercel AI SDK v6](https://ai-sdk.dev/docs/agents/overview) agent drives a Steel cloud browser. The Steel **Live View** is embedded next to the chat so you watch the browser in real time as the agent works.

**What this showcases**
- `streamText` + `useChat` with Steel tools (`openSession`, `navigate`, `extract`)
- `stopWhen: stepCountIs(15)` and `prepareStep` phase-gating (first step opens a session, later steps can navigate/extract)
- `needsApproval: true` on a demo `submitForm` tool (v6 feature)
- Steel Live View iframe pulled from the `openSession` tool output

For a pure-Node `ToolLoopAgent` example, see [`steel-ai-sdk-starter`](../steel-ai-sdk-starter).

## Setup

```bash
git clone https://github.com/steel-dev/steel-cookbook
cd steel-cookbook/examples/steel-ai-sdk-nextjs-starter
npm install
npx playwright install chromium
```

Create `.env.local`:

```bash
STEEL_API_KEY=your_steel_api_key_here
ANTHROPIC_API_KEY=your_anthropic_api_key_here
```

Get keys: [Steel](https://app.steel.dev/settings/api-keys) | [Anthropic](https://console.anthropic.com/)

## Run

```bash
npm run dev
```

Open http://localhost:3000 and ask:
> Go to https://github.com/trending/python and tell me the top 3 AI/ML repos.

The agent opens a Steel session, navigates, extracts, and replies. The Live View iframe on the right streams the browser while it happens.

## How it works

### Route (`app/api/chat/route.ts`)
`streamText` with Steel tools, closure-scoped `session`/`browser`/`page` per request, cleanup in `onFinish`/`onAbort`:

```ts
const result = streamText({
  model: anthropic("claude-haiku-4-5"),
  messages: await convertToModelMessages(messages),
  stopWhen: stepCountIs(15),
  tools: { openSession, navigate, extract, submitForm },
  prepareStep: async ({ stepNumber, steps }) => { /* phase-gate */ },
  onFinish: cleanup,
});
return result.toUIMessageStreamResponse();
```

### Page (`app/page.tsx`)
`useChat` renders tool calls inline. The Live View URL is plucked from `message.parts[].output.liveViewUrl` whenever `openSession` runs:

```tsx
const liveViewUrl = messages
  .flatMap((m) => m.parts ?? [])
  .find((p: any) => p.type === "tool-openSession" && p.output?.liveViewUrl)
  ?.output?.liveViewUrl;
```

## Deploying to Vercel

1. Push to GitHub.
2. Import the repo into Vercel.
3. Add `STEEL_API_KEY` and `ANTHROPIC_API_KEY` as Environment Variables.
4. Deploy.

Playwright's Chromium is downloaded at build time via `npx playwright install chromium`. Add this to the Vercel Build Command if your project doesn't run it automatically:

```
npx playwright install chromium && next build
```

Alternatively, skip the local Playwright connection and use Steel's CDP-only API on Vercel's Edge Runtime — see the Steel docs for the edge-compatible client pattern.

## Next steps

- Wire up the `submitForm` approval UI (see AI SDK docs on human-in-the-loop tools)
- Add a `screenshot` tool and stream it into the chat as an image part
- Swap Anthropic for OpenAI GPT-5 or Gemini 2.5 via the AI Gateway string form

## Links

- **Steel docs**: https://docs.steel.dev
- **AI SDK Agents**: https://ai-sdk.dev/docs/agents/overview
- **Loop control**: https://ai-sdk.dev/docs/agents/loop-control
- **Session lifecycle**: https://docs.steel.dev/overview/sessions-api/session-lifecycle
