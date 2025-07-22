# Steel + Stagehand Python Starter

Use Steel with Stagehand for AI-powered browser automation.

Stagehand lets you interact with web pages using natural language - click buttons, extract data, fill forms without writing selectors.

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

```python
config = StagehandConfig(
    env="LOCAL",
    model_name="gpt-4o-mini",
    model_api_key=OPENAI_API_KEY,
    cdp_url=f"wss://connect.steel.dev?apiKey={STEEL_API_KEY}&sessionId={session.id}",
)
stagehand = Stagehand(config)
```

## Examples

Extract data:

```python
from pydantic import BaseModel, Field

class Product(BaseModel):
    name: str = Field(..., description="Product name")
    price: str = Field(..., description="Product price")

data = await stagehand.page.extract(
    "extract all product names and prices",
    schema=Products
)
```

Interact with elements:

```python
await stagehand.page.act("click the 'Add to Cart' button")
await stagehand.page.act("type user@example.com in the email field")
```

## Links

- [Steel docs](https://docs.steel.dev)
- [Stagehand docs](https://docs.stagehand.dev)
- [Discord](https://discord.gg/steel)
