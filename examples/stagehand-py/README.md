# Steel + Stagehand Python Starter

Use Steel with Stagehand for AI-powered browser automation.

Stagehand lets you interact with web pages using natural language - click buttons, extract data, fill forms without writing selectors.

This starter targets **Stagehand v3** (Python package `stagehand`, published on PyPI). The legacy `stagehand-py` package is deprecated.

## Setup

```bash
git clone https://github.com/steel-dev/steel-cookbook
cd steel-cookbook/examples/steel-stagehand-python-starter
pip install -r requirements.txt
```

Create `.env`:

```bash
STEEL_API_KEY=your_steel_api_key_here
OPENAI_API_KEY=your_openai_api_key_here
```

Get keys: [Steel](https://app.steel.dev/settings/api-keys) | [OpenAI](https://platform.openai.com/api-keys)

## Usage

```bash
python main.py
```

## Configuration

Stagehand v3 runs an embedded local server that drives the browser. To drive a Steel-hosted browser, pass the Steel CDP URL into `sessions.start`:

```python
from stagehand import AsyncStagehand

stagehand = AsyncStagehand(
    server="local",
    model_api_key=OPENAI_API_KEY,
)

stagehand_session = await stagehand.sessions.start(
    model_name="openai/gpt-5",
    browser={
        "type": "local",
        "launchOptions": {
            "cdpUrl": f"{session.websocket_url}&apiKey={STEEL_API_KEY}",
        },
    },
)
session_id = stagehand_session.data.session_id
```

## Examples

Extract data with a JSON schema:

```python
PRODUCTS_SCHEMA = {
    "type": "object",
    "properties": {
        "products": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "name": {"type": "string"},
                    "price": {"type": "string"},
                },
            },
        }
    },
}

extract_stream = stagehand.sessions.extract(
    id=session_id,
    instruction="extract all product names and prices",
    schema=PRODUCTS_SCHEMA,
    stream_response=True,
    x_stream_response="true",
)
```

Interact with elements:

```python
await stagehand.sessions.act(
    id=session_id,
    instruction="click the 'Add to Cart' button",
    stream_response=True,
    x_stream_response="true",
)

await stagehand.sessions.act(
    id=session_id,
    instruction="type user@example.com in the email field",
    stream_response=True,
    x_stream_response="true",
)
```

## Links

- [Steel docs](https://docs.steel.dev)
- [Stagehand docs](https://docs.stagehand.dev)
- [Discord](https://discord.gg/steel)
