# Steel + OpenAI Computer Use Assistant in Node.js

This example integrates Steel with OpenAI's Computer Use Assistant API to create a browser automation agent that reads tasks from environment variables and executes them autonomously.

## Prerequisites

- Steel API key — [Get one here](https://app.steel.dev/settings/api-keys)
- OpenAI API key with Computer Use Assistant access
- Node.js 18+

## Installation

```bash
git clone https://github.com/steel-dev/steel-cookbook
cd steel-cookbook/examples/steel-oai-computer-use-node-starter

npm install
```

## Setup

Create a `.env` file:

```
STEEL_API_KEY=your_steel_api_key_here
OPENAI_API_KEY=your_openai_api_key_here
TASK=Search for the latest news about artificial intelligence and summarize the top 3 articles
```

## Usage

```bash
export TASK="Find the current weather in New York City"
npm start
```

Or inline:

```bash
TASK="Go to Wikipedia and search for machine learning" npm start
```

## How it Works

1. Creates a Steel browser session
2. Uses OpenAI's Computer Use Assistant to analyze screenshots
3. Executes browser actions (click, type, scroll) autonomously
4. Provides task completion summary

The agent uses a specialized system prompt for single-task automation and includes safety checks, error handling, and iteration limits to prevent infinite loops.

## Configuration

Customize the agent behavior:

```typescript
const agent = new Agent(
  "computer-use-preview",
  computer,
  [],
  true // Auto-acknowledge safety checks
);
```

## Support

- [Steel Documentation](https://docs.steel.dev)
- [OpenAI Computer Use Documentation](https://platform.openai.com/docs/guides/computer-use)
- [Discord Community](https://discord.gg/steel-dev)
