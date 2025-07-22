# Steel + Claude Computer Use Python Starter

Connect Claude to a Steel browser session for automated web interactions.

## Setup

```bash
git clone https://github.com/steel-dev/steel-cookbook
cd steel-cookbook/examples/steel-claude-computer-use-python-starter

python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

Create `.env`:

```bash
STEEL_API_KEY=your_steel_api_key_here
ANTHROPIC_API_KEY=your_anthropic_api_key_here
```

Get keys: [Steel](https://app.steel.dev/settings/api-keys) | [Anthropic](https://console.anthropic.com/)

## Usage

```bash
# Default model (recommended)
python main.py

# Specific model
python main.py --model claude-3-7-sonnet-20250219

# List models
python main.py --list-models
```

## How it works

1. Launches Steel browser session
2. Takes screenshot, sends to Claude
3. Claude analyzes and returns actions
4. Executes actions in browser
5. Repeat until done

## Models

| Model                        | Tool                | Notes            |
| ---------------------------- | ------------------- | ---------------- |
| `claude-3-5-sonnet-20241022` | `computer_20241022` | Stable (default) |
| `claude-3-7-sonnet-20250219` | `computer_20250124` | Newer            |
| `claude-sonnet-4-20250514`   | `computer_20250124` | Latest           |
| `claude-opus-4-20250514`     | `computer_20250124` | Most capable     |

## Links

- [Steel docs](https://docs.steel.dev)
- [Anthropic Computer Use](https://docs.anthropic.com/claude/docs/computer-use)
- [Discord](https://discord.gg/steel-dev)
