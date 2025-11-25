# Steel + Claude Computer Use Node.js Starter

Connect Claude to a Steel browser session for autonomous web interactions.

## Setup

```bash
git clone https://github.com/steel-dev/steel-cookbook
cd steel-cookbook/examples/steel-claude-computer-use-node-starter

npm install
```

Create `.env`:

```env
STEEL_API_KEY=your_steel_api_key_here
ANTHROPIC_API_KEY=your_anthropic_api_key_here
TASK=Go to Steel.dev and find the latest news
```

Get keys: [Steel](https://app.steel.dev/settings/api-keys) | [Anthropic](https://console.anthropic.com/)

## Usage

```bash
# Run with default task
npm start

# Custom task
TASK="Find the current weather in New York City" npm start
```

## How it works

1. Creates a Steel browser session
2. Takes screenshots, sends to Claude
3. Claude analyzes and returns browser actions (click, type, scroll)
4. Executes actions via Steel's Input API
5. Repeats until task is complete

## Links

- [Steel docs](https://docs.steel.dev)
- [Anthropic Computer Use](https://docs.anthropic.com/claude/docs/computer-use)
- [Discord](https://discord.gg/steel-dev)
