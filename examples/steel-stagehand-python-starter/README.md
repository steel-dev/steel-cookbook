# Steel + Stagehand Python Starter

This template shows you how to use Steel with Stagehand to run AI-powered browser automations in the cloud using Python. It combines Steel's reliable cloud browser infrastructure with Stagehand's intelligent automation capabilities.

## What is Stagehand?

Stagehand is an AI-powered browser automation library that can understand and interact with web pages using natural language instructions. It can:

- Extract data from web pages using AI understanding
- Click buttons and fill forms based on descriptions
- Navigate complex UIs without brittle selectors
- Handle dynamic content intelligently

## Installation

Clone this repository, navigate to the `examples/steel-stagehand-python-starter`, and install dependencies:

```bash
git clone https://github.com/steel-dev/steel-cookbook
cd steel-cookbook/examples/steel-stagehand-python-starter
pip install -r requirements.txt
```

## Quick start

The example script in `main.py` shows you how to:

- Create and manage a Steel browser session
- Initialize Stagehand with the Steel session
- Use AI to extract data from web pages (Hacker News stories)
- Interact with page elements using natural language
- Handle errors and cleanup properly
- View your live session in Steel's session viewer

To run it:

1. Create a `.env` file in the `examples/steel-stagehand-python-starter` directory:

```bash
STEEL_API_KEY=your_steel_api_key_here
OPENAI_API_KEY=your_openai_api_key_here
```

2. Replace the API keys:

   - `your_steel_api_key_here` with your Steel API key. Don't have one? Get a free key at [app.steel.dev/settings/api-keys](https://app.steel.dev/settings/api-keys)
   - `your_openai_api_key_here` with your OpenAI API key. Get one at [platform.openai.com/api-keys](https://platform.openai.com/api-keys)

3. From the same directory, run the command:

```bash
python main.py
```

## Configuration Options

### Using Steel

The example uses Steel's cloud browser by default, connecting Stagehand to a Steel session:

```python
config = StagehandConfig(
    env="LOCAL",
    model_name="gpt-4o-mini",
    model_api_key=OPENAI_API_KEY,
    cdp_url=f"wss://connect.steel.dev?apiKey={STEEL_API_KEY}&sessionId={session.id}",
)
stagehand = Stagehand(config)
```

**Note**: You need to pass the OpenAI API key through the StagehandConfig for AI operations. The latest Stagehand version uses Pydantic models for structured data extraction.

## Writing your automation

Find this section in `main.py`:

```python
# ============================================================
# Your Automations Go Here!
# ============================================================
```

Replace the example code with your own automation logic. Here are some common patterns:

### Extracting Data

```python
from pydantic import BaseModel, Field

class Product(BaseModel):
    name: str = Field(..., description="Product name")
    price: str = Field(..., description="Product price")

class Products(BaseModel):
    products: list[Product] = Field(..., description="List of products")

data = await stagehand.page.extract(
    "extract all product names and prices from this page",
    schema=Products
)
```

### Interacting with Elements

```python
# Click elements using natural language
await stagehand.page.act("click the 'Add to Cart' button for the first product")

# Fill forms
await stagehand.page.act("type user@example.com in the email field")

# Observe before acting (optional)
action_preview = await stagehand.page.observe("find the submit button")
await stagehand.page.act(action_preview)
```

### Navigation

```python
# Navigate to pages
await stagehand.page.goto("https://example.com")

# Wait for content
await stagehand.page.wait_for_load_state("networkidle")
```

## Key Features

- **AI-Powered**: Uses computer vision and natural language processing to understand web pages
- **Reliable**: Runs on Steel's cloud infrastructure with proxy support and CAPTCHA solving
- **Easy**: No need to write complex selectors or handle dynamic content manually
- **Observable**: View your automation running live in Steel's session viewer

## Troubleshooting

### Common Issues

1. **Session connection fails**: Verify your Steel API key is correct
2. **Stagehand initialization fails**: Ensure you have the correct version of stagehand (0.4.0)
3. **AI instructions not working**:
   - Verify your OpenAI API key is correct and has sufficient credits
   - Be more specific in your instructions and check the page structure
   - Try using a different OpenAI model

### Getting Help

- [Steel Documentation](https://docs.steel.dev)
- [Stagehand Documentation](https://docs.stagehand.dev)
- [Steel Discord Community](https://discord.gg/steel)

## Next Steps

- Try different websites and automation tasks
- Experiment with complex multi-step workflows
- Combine Steel's session management with Stagehand's AI capabilities
- Use Steel's proxy network for geo-specific automations
- Leverage CAPTCHA solving for protected sites
