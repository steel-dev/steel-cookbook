# Steel + Magnitude Node.js Starter

Use Steel with Magnitude for AI-powered browser automation.

Magnitude provides high-level browser automation with natural language instructions - extract data, interact with elements, and navigate pages without writing complex selectors.

## Setup

```bash
git clone https://github.com/steel-dev/steel-cookbook
cd steel-cookbook/examples/steel-magnitude-starter
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

## Configuration

```typescript
const agent = await startBrowserAgent({
  url: "https://news.ycombinator.com",
  narrate: true,
  llm: {
    provider: "anthropic",
    options: {
      model: "claude-3-7-sonnet-latest",
      apiKey: process.env.ANTHROPIC_API_KEY,
    },
  },
  browser: {
    cdp: `${session.websocketUrl}&apiKey=${STEEL_API_KEY}`,
  },
});
```

## Examples

Extract data:

```typescript
const data = await agent.extract(
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
await agent.act("click the 'Add to Cart' button");

await agent.act("enter email in the email field", {
  data: { email: "user@example.com" },
});
```

Navigate to pages:

```typescript
await agent.nav("https://example.com");
```

## Links

- [Steel docs](https://docs.steel.dev)
- [Magnitude docs](https://docs.magnitude.run)
- [Discord](https://discord.gg/steel)
