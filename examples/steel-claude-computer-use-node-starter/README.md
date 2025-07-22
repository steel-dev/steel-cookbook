# Steel + Claude Computer Use Node.js Starter

Connect Claude to a Steel browser session for automated web interactions.

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
```

Get keys: [Steel](https://app.steel.dev/settings/api-keys) | [Anthropic](https://console.anthropic.com/)

## Usage

```bash
# Default model
npm start

# Specific model
npm start -- --model claude-3-7-sonnet-20250219

# List models
npm start -- --list-models
```

## How it works

1. Launches Steel browser session
2. Takes screenshot, sends to Claude
3. Claude analyzes and returns actions
4. Executes actions in browser
5. Repeat until done

## Models

| Model                        | Notes            |
| ---------------------------- | ---------------- |
| `claude-3-5-sonnet-20241022` | Stable (default) |
| `claude-3-7-sonnet-20250219` | Newer features   |
| `claude-sonnet-4-20250514`   | Latest           |
| `claude-opus-4-20250514`     | Most capable     |

## Links

- [Steel docs](https://docs.steel.dev)
- [Anthropic docs](https://docs.anthropic.com)
- [Discord](https://discord.gg/steel)
