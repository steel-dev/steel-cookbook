# Steel + Gemini Computer Use Python Starter

Connect Google's Gemini Computer Use model to a Steel browser session for autonomous web interactions.

## Setup

```bash
git clone https://github.com/steel-dev/steel-cookbook
cd steel-cookbook/examples/steel-gemini-computer-use-python-starter

python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

Create `.env`:

```bash
STEEL_API_KEY=your_steel_api_key_here
GEMINI_API_KEY=your_gemini_api_key_here
TASK=Go to Steel.dev and find the latest news
```

Get keys: [Steel](https://app.steel.dev/settings/api-keys) | [Google AI Studio](https://aistudio.google.com/apikey)

## Usage

```bash
# Run with default task
python main.py

# Custom task
TASK="Find the current weather in New York City" python main.py
```

## How it works

1. Creates a Steel browser session
2. Takes screenshots, sends to Gemini's Computer Use model
3. Gemini analyzes and returns browser actions (click, type, scroll, navigate)
4. Executes actions via Steel's Input API
5. Repeats until task is complete

## Links

- [Steel docs](https://docs.steel.dev)
- [Gemini API docs](https://ai.google.dev/docs)
- [Discord](https://discord.gg/steel-dev)
