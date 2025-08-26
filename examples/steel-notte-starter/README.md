# Steel + Notte Integration

Control browsers with AI using Steel's cloud infrastructure and notte's reasoning engine.

## Setup

Get API keys:

- [Steel API key](https://app.steel.dev/sign-up) (100 free hours)
- [Notte API key](https://notte.cc)

```bash
git clone https://github.com/steel-dev/steel-cookbook.git
cd steel-cookbook/examples/steel-notte-starter

python -m venv .venv
source .venv/bin/activate

pip install -r requirements.txt

cp .env.example .env
# Edit .env with your API keys
```

## Usage

```bash
python main.py
```

The script creates a Steel browser session, connects notte to it via WebSocket, and runs your AI task.

## Configuration

Set these in `.env`:

- `STEEL_API_KEY` - Your Steel API key
- `NOTTE_API_KEY` - Your Notte API key
- `TASK` - What you want the AI to do (default: search Wikipedia for machine learning)

You can also modify the reasoning model in `main.py` (supports gpt-4o, claude-3-sonnet, etc.).
