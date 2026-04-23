# Steel + OpenAI Computer Use Node.js Starter

Connect OpenAI's Computer Use Assistant to a Steel browser session for autonomous web interactions.

## Setup

```bash
git clone https://github.com/steel-dev/steel-cookbook
cd steel-cookbook/examples/steel-oai-computer-use-node-starter

npm install
```

Create `.env`:

```env
STEEL_API_KEY=your_steel_api_key_here
OPENAI_API_KEY=your_openai_api_key_here
TASK=Go to Steel.dev and find the latest news
```

Get keys: [Steel](https://app.steel.dev/settings/api-keys) | [OpenAI](https://platform.openai.com/)

## Usage

```bash
# Run with default task
npm start

# Custom task
TASK="Find the current weather in New York City" npm start
```

## How it works

1. Creates a Steel browser session
2. Takes screenshots, sends to OpenAI's Computer Use model
3. Model analyzes and returns browser actions (click, type, scroll)
4. Executes actions via Steel's Input API
5. Repeats until task is complete

## Links

- [Steel docs](https://docs.steel.dev)
- [OpenAI Computer Use](https://platform.openai.com/docs/guides/computer-use)
- [Discord](https://discord.gg/steel-dev)
