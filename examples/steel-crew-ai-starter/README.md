# Steel + CrewAI Starter

This example integrates Steel with the CrewAI agent framework.

## Installation

```bash
git clone https://github.com/steel-dev/steel-cookbook
cd steel-cookbook/examples/steel-crew-ai-starter
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\\Scripts\\activate
pip install -r requirements.txt
```

## Quick start

1. Create a `.env` file in this directory with your keys:

```env
STEEL_API_KEY=your_steel_api_key_here
```

2. Run the example:

```bash
python main.py
```

The script will:

- Initialize a Steel client and custom scraping tool
- Run a researcher and reporting analyst crew on a sample topic
- Write an output `report.md`

## Configuration

You can change the inputs (like `topic`) inside `main.py`. The custom `SteelScrapeWebsiteTool` can be adjusted for formats or proxy behavior.

## Error handling

The script checks for required environment variables, reports runtime errors, and exits cleanly.

## Support

- Steel Documentation: https://docs.steel.dev
- API Reference: https://docs.steel.dev/api-reference
- Discord Community: https://discord.gg/steel-dev
