# Steel + Selenium Starter

This template shows you how to use Steel with Selenium to run browser automations in the cloud. It includes session management, error handling, and a basic example you can customize.

[![Run on Repl.it](https://replit.com/badge/github/steel-dev/steel-selenium-starter)](https://replit.com/@steel-dev/steel-selenium-starter?v=1#README.md)

## Installation

Clone this repository, navigate to the `examples/steel-selenium-starter`, and install dependencies:

```bash
git clone https://github.com/steel-dev/steel-cookbook
cd steel-cookbook/examples/steel-selenium-starter

# Create and activate virtual environment (recommended)
python -m venv .venv
source .venv/bin/activate  # On Windows use: .venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt
```

## Quick start

The example script in `main.py` shows you how to:

- Create and manage a Steel browser session
- Connect Selenium to the session
- Navigate to a website (Hacker News in this example)
- Extract data from the page (top 5 stories)
- Handle errors and cleanup properly
- View your live session in Steel's session viewer

To run it:

1.  Create a `.env` file in the `examples/steel-selenium-starter` directory:

```bash
STEEL_API_KEY=your_api_key_here
```

2. Replace `your_api_key_here` with your Steel API key. Don't have one? Get a free key at [app.steel.dev/settings/api-keys](https://app.steel.dev/settings/api-keys)

3. From the same directory, run the command:

```bash
python main.py
```

## Writing your automation

Find this section in `main.py`:

```python
# ============================================================
# Your Automations Go Here!
# ============================================================

# Example automation (you can delete this)
driver.get('https://news.ycombinator.com')
# ... rest of example code
```

You can replace the code here with whatever automation scripts you want to run.

## Configuration

The template includes common Steel configurations you can enable:

```python
session = client.sessions.create(
    use_proxy=True,              # Use Steel's proxy network
    session_timeout=1800000,     # 30 minute timeout (default: 5 mins)
)
```

_Note:_
Certain features like captcha solving, proxies, and cookie management are not supported with selenium sessions yet. Check out the docs for more details on this [here](https://docs.steel.dev/overview/guides/connect-with-selenium).

## Error handling

The template includes error handling and cleanup:

```python
try:
    # Your automation code
finally:
    # Cleanup runs even if there's an error
    if driver:
        driver.quit()
    if session:
        client.sessions.release(session.id)
```

## Support

- [Steel Documentation](https://docs.steel.dev)
- [API Reference](https://docs.steel.dev/api-reference)
- [Discord Community](https://discord.gg/steel-dev)
