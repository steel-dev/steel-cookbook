# Steel + Agent Kit Starter

This example integrates Steel with the Agent-kit framework.

## Installation

```bash
git clone https://github.com/steel-dev/steel-cookbook
cd steel-cookbook/examples/steel-agent-kit-starter
npm install
```

## Quick start

The script in `index.ts` will:

- Create a Steel session on-demand inside a tool
- Connect Playwright to the session via CDP
- Scrape Hacker News items and filter/deduplicate
- Return a concise list of stories

To run it:

1. Create a `.env` file in this directory:

```bash
STEEL_API_KEY=your_api_key_here
OPENAI_API_KEY=your_openai_api_key_here
```

2. From the same directory, run:

```bash
npm start
```

## Configuration

You can customize the agent's model and iteration settings in `index.ts`:

```ts
const hnNetwork = createNetwork({
  name: "hacker-news-network",
  agents: [hnAgent],
  maxIter: 2,
  defaultModel: openai({ model: "gpt-4o-mini" }),
});
```

## Error handling

The script prints helpful warnings if required environment variables are missing and outputs any runtime errors to the console.

## Support

- Steel Documentation: https://docs.steel.dev
- API Reference: https://docs.steel.dev/api-reference
- Discord Community: https://discord.gg/steel-dev
