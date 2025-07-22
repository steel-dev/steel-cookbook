# Steel + Stagehand Node.js Starter

Use Steel with Stagehand for AI-powered browser automation.

Stagehand lets you interact with web pages using natural language - click buttons, extract data, fill forms without writing selectors.

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

```typescript
const stagehand = new Stagehand({
  env: "LOCAL",
  localBrowserLaunchOptions: {
    cdpUrl: `wss://connect.steel.dev?apiKey=${STEEL_API_KEY}&sessionId=${session.id}`,
  },
  enableCaching: true,
});
```

## Examples

Extract data:

```typescript
const data = await stagehand.extract({
  instruction: "extract all product names and prices",
  schema: {
    type: "object",
    properties: {
      products: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name: { type: "string" },
            price: { type: "string" },
          },
        },
      },
    },
  },
});
```

Interact with elements:

```typescript
await stagehand.act({
  action: "click",
  instruction: "click the 'Add to Cart' button",
});

await stagehand.act({
  action: "type",
  instruction: "enter email in the email field",
  text: "user@example.com",
});
```

## Links

- [Steel docs](https://docs.steel.dev)
- [Stagehand docs](https://docs.stagehand.dev)
- [Discord](https://discord.gg/steel)
