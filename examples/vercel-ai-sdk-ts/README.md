# Steel + Vercel AI SDK v6 (ToolLoopAgent) Starter

Use Steel with the [Vercel AI SDK v6](https://ai-sdk.dev/docs/agents/overview) `ToolLoopAgent` for typed, tool-using browser agents.

This starter wires Steel's cloud browser into a `ToolLoopAgent` with four tools (`openSession`, `navigate`, `extract`, and a final `reportFindings` that terminates the loop with a Zod-typed result). The loop is capped with `stopWhen: [stepCountIs(15), hasToolCall("reportFindings")]`. The demo task: find the top 3 AI/ML repos on GitHub's trending page.

> **Why `reportFindings` instead of `output: Output.object(...)`?** On Anthropic, forcing JSON response format disables tool calling (the provider warns `"JSON response format does not support tools. The provided tools are ignored."`). The "final tool with no `execute`" pattern is the v6-idiomatic way to combine a tool loop with a typed final answer — the tool call's `input` *is* the result.

## Setup

```bash
git clone https://github.com/steel-dev/steel-cookbook
cd steel-cookbook/examples/steel-ai-sdk-starter
npm install
```

Create `.env`:

```bash
STEEL_API_KEY=your_steel_api_key_here
ANTHROPIC_API_KEY=your_anthropic_api_key_here
```

Get keys: [Steel](https://app.steel.dev/settings/api-keys) | [Anthropic](https://console.anthropic.com/)

## Usage

```bash
npm start
```

You'll see per-step tool calls and token usage in the console, then the final structured JSON.

## How it works

```typescript
const reportFindings = tool({
  description: "Call LAST with final findings. Ends the research.",
  inputSchema: z.object({ summary: z.string(), repos: z.array(...) }),
  // no execute → v6 stops the loop
});

const researchAgent = new ToolLoopAgent({
  model: anthropic("claude-haiku-4-5"),
  instructions: "...",
  stopWhen: [stepCountIs(15), hasToolCall("reportFindings")],
  tools: { openSession, navigate, extract, reportFindings },
  onStepFinish: async ({ stepNumber, toolCalls, usage }) => { ... },
});

const result = await researchAgent.generate({ prompt: "..." });
// structured result is the reportFindings call's input, found in result.steps
```

Each tool is a typed `tool()` with a Zod input schema. The agent drives the loop: pick a tool, call it, observe the result, decide next step. `reportFindings` has no `execute` — v6 stops the loop the moment it's called, and its `input` is the typed final answer.

## Swap the model

The default is Claude Haiku 4.5 — it's fast and cheap, which matters for agents that round-trip through the model 3-5 times per run. Swap up when the task needs stronger reasoning:

```typescript
import { openai } from "@ai-sdk/openai";
import { google } from "@ai-sdk/google";

// model: anthropic("claude-sonnet-4-6"), // smarter, slower
// model: openai("gpt-5"),
// model: google("gemini-2.5-pro"),
```

Or use the [AI Gateway](https://vercel.com/docs/ai-gateway) string form (e.g. `"anthropic/claude-haiku-4-5"`) to route through Vercel.

## Loop control

- `stopWhen: stepCountIs(n)` — cap steps
- `stopWhen: [stepCountIs(n), hasToolCall("name")]` — stop on either condition
- `prepareStep: async ({ stepNumber, steps }) => ({ activeTools: [...] })` — phase-gate tools per step

## Next steps

- **Vercel AI SDK docs**: https://ai-sdk.dev/docs/agents/overview
- **ToolLoopAgent reference**: https://ai-sdk.dev/docs/agents/building-agents
- **Loop control**: https://ai-sdk.dev/docs/agents/loop-control
- **Steel docs**: https://docs.steel.dev
- **Session lifecycle**: https://docs.steel.dev/overview/sessions-api/session-lifecycle
