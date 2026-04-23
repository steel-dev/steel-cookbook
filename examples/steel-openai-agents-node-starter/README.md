# Steel + OpenAI Agents SDK (TypeScript) Starter

Use Steel with the [OpenAI Agents SDK for TypeScript](https://openai.github.io/openai-agents-js/) for typed, tool-using browser agents.

Four `tool()` wrappers expose Steel's cloud browser to the agent (`open_session`, `navigate`, `snapshot`, `extract`). The final answer is validated against a Zod schema via `outputType`. `maxTurns: 15` caps the loop. Demo task: find the top 3 AI/ML repos on GitHub trending.

## Setup

```bash
git clone https://github.com/steel-dev/steel-cookbook
cd steel-cookbook/examples/steel-openai-agents-node-starter
npm install
npx playwright install chromium
```

Create `.env`:

```bash
STEEL_API_KEY=your_steel_api_key_here
OPENAI_API_KEY=your_openai_api_key_here
```

Get keys: [Steel](https://app.steel.dev/settings/api-keys) | [OpenAI](https://platform.openai.com/)

## Usage

```bash
npm start
```

You'll see per-tool timing in the console, then the final Zod-validated JSON.

## How it works

```typescript
import { Agent, run, tool } from "@openai/agents";
import { z } from "zod";

const FinalReport = z.object({
  summary: z.string(),
  repos: z.array(z.object({ name: z.string(), url: z.string(), /* ... */ })),
});

const agent = new Agent({
  name: "SteelResearch",
  instructions: "...",
  model: "gpt-5",
  tools: [openSession, navigate, snapshot, extract],
  outputType: FinalReport,
});

const result = await run(agent, "...", { maxTurns: 15 });
console.log(result.finalOutput); // Zod-parsed FinalReport
```

Each tool is a typed `tool()` with a Zod `parameters` schema. Unlike some providers that force JSON-only mode when you ask for structured output, OpenAI supports **`outputType` + tools together** — the agent uses tools freely and still returns a validated final answer.

## Swap the model

```typescript
const agent = new Agent({ /* ... */, model: "gpt-5-mini" }); // faster, cheaper
```

## Next steps

- **OpenAI Agents SDK (TS) docs**: https://openai.github.io/openai-agents-js/
- **Steel docs**: https://docs.steel.dev
- **Session lifecycle**: https://docs.steel.dev/overview/sessions-api/session-lifecycle
