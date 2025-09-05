# Steel + Agno Starter

This example integrates Steel with the Agno agent framework.

## Installation

```bash
git clone https://github.com/steel-dev/steel-cookbook
cd steel-cookbook/examples/steel-agno-starter
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

- Initialize a Steel session on-demand in the toolkit
- Connect Playwright over CDP to that session
- Navigate and extract content from `quotes.toscrape.com`
- Print results and clean up the session

## Configuration

Adjust tool behavior by editing `main.py` (e.g., enable proxies or change navigation targets). The toolkit methods `navigate_to`, `screenshot`, and `get_page_content` can be extended for your needs.

## Error handling

The script validates missing env vars and ensures cleanup by closing the browser and releasing any active Steel session.

## Support

- Steel Documentation: https://docs.steel.dev
- API Reference: https://docs.steel.dev/api-reference
- Discord Community: https://discord.gg/steel-dev
