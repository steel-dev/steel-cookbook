# Steel + Claude Computer Use Python Starter

Connect Claude to a Steel browser session for autonomous web interactions.

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
TASK=Go to Steel.dev and find the latest news
```

Get keys: [Steel](https://app.steel.dev/settings/api-keys) | [Anthropic](https://console.anthropic.com/)

## Usage

```bash
# Run with default task
python main.py

# Custom task
TASK="Find the current weather in New York City" python main.py
```

## How it works

1. Creates a Steel browser session
2. Takes screenshots, sends to Claude
3. Claude analyzes and returns browser actions (click, type, scroll)
4. Executes actions via Steel's Input API
5. Repeats until task is complete

## Links

- [Steel docs](https://docs.steel.dev)
- [Anthropic Computer Use](https://platform.claude.com/docs/en/agents-and-tools/tool-use/computer-use-tool)
- [Discord](https://discord.gg/steel-dev)
