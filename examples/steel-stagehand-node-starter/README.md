# Steel + Stagehand Node.js Starter

Use Steel with Stagehand for AI-powered browser automation.

Stagehand lets you interact with web pages using natural language - click buttons, extract data, fill forms without writing selectors.

This starter targets **Stagehand v3** (`@browserbasehq/stagehand`).

## Setup

```bash
git clone https://github.com/steel-dev/steel-cookbook
cd steel-cookbook/examples/steel-stagehand-node-starter
npm install
```

Create `.env`:

```bash
STEEL_API_KEY=your_steel_api_key_here
OPENAI_API_KEY=your_openai_api_key_here
```

Get keys: [Steel](https://app.steel.dev/settings/api-keys) | [OpenAI](https://platform.openai.com/api-keys)

## Usage

```bash
npm start
```

## Configuration

In v3, `modelClientOptions` is replaced by a unified `model` field, and AI methods (`act`, `extract`, `observe`) live on the `Stagehand` instance.

```typescript
const stagehand = new Stagehand({
  env: "LOCAL",
  localBrowserLaunchOptions: {
    cdpUrl: `${session.websocketUrl}&apiKey=${STEEL_API_KEY}`,
  },
  model: {
    modelName: "openai/gpt-5",
    apiKey: OPENAI_API_KEY,
  },
});

await stagehand.init();
const page = await stagehand.context.awaitActivePage();
```

## Examples

Extract data (positional `(instruction, schema)`):

```typescript
import { z } from "zod";

const data = await stagehand.extract(
  "extract all product names and prices",
  z.object({
    products: z.array(
      z.object({
        name: z.string(),
        price: z.string(),
      })
    ),
  })
);
```

Interact with elements:

```typescript
await stagehand.act("click the 'Add to Cart' button");

await stagehand.act("type 'user@example.com' in the email field");
```

## Links

- [Steel docs](https://docs.steel.dev)
- [Stagehand docs](https://docs.stagehand.dev)
- [Discord](https://discord.gg/steel)
