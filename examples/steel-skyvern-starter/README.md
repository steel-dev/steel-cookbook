# Steel + Skyvern Integration Starter

This example demonstrates how to integrate Steel with the [Skyvern](https://github.com/Skyvern-AI/skyvern) framework to create a powerful AI agent that leverages Steel's managed browser infrastructure for intelligent web automation.

By connecting Skyvern to a Steel session via a CDP WebSocket URL, you can execute complex, natural-language-based automation tasks in a secure and reliable cloud browser environment.

## Features

- **AI-Powered Automation**: Uses Skyvern's LLM and Computer Vision capabilities to perform tasks from natural language prompts.
- **Managed Cloud Browsers**: Leverages Steel's robust infrastructure for scalable, secure browser sessions with built-in anti-bot protection.
- **Remote Browser Integration**: Seamlessly connects Skyvern to a Steel browser using the `cdp_url` parameter, requiring no local browser installation.
- **Live Session Viewing**: Provides a real-time viewer URL for every Steel session, allowing you to watch the AI agent at work.
- **Structured Data Extraction**: Defines a JSON schema to ensure consistent, reliable data extraction from web pages.
- **Comprehensive Error Handling**: Includes try/finally blocks to ensure Steel sessions are always released, even if errors occur.

## Prerequisites

- Python 3.11 or higher
- A [Steel API key](https://app.steel.dev/sign-up) (provides 100 free browser hours)
- Docker installed (needed for Skyvern initialization)

## Installation

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/steel-dev/steel-cookbook.git
    cd steel-cookbook/examples/steel-skyvern-starter
    ```

2.  **Create and activate a virtual environment:**
    ```bash
    python -m venv .venv
    source .venv/bin/activate  # On Windows, use: .venv\Scripts\activate
    ```

3.  **Install the required dependencies:**
    ```bash
    pip install -e .
    ```

4.  **Initialize Skyvern:**
    ```bash
    skyvern init
    ```
    This will guide you through setting up Skyvern's local service, including Docker and API key configuration. It will create a `.env` file in your directory.

5.  **Add Your Steel API Key:**
    Open the `.env` file created by Skyvern and add your Steel API key to it:
    ```env
    STEEL_API_KEY=your_steel_api_key_here
    ```

## Usage

Simply run the `main.py` script:

```bash
python main.py
```

The script will:
1.  Initialize the Steel client.
2.  Create a new Steel browser session and print the live viewer URL.
3.  Connect Skyvern to the session's remote browser.
4.  Execute a pre-defined AI task (e.g., extracting the top story from Hacker News).
5.  Print the structured data extracted by the agent.
6.  Automatically release the Steel session.

## How It Works

The integration works in two main steps:

### 1. Setup Skyvern Environment (Once)

First, you need to initialize the Skyvern environment with `skyvern init`. This command sets up a local service, Docker containers, and a `.env` file with the necessary configurations (like your OpenAI API key).

### 2. Connect to Remote Browser

Then, the integration passes the Steel session's CDP WebSocket URL directly to the Skyvern client, telling it to use the remote Steel browser instead of a local one.

```python
# 1. Create a Steel browser session
steel_client = Steel(steel_api_key=STEEL_API_KEY)
session = steel_client.sessions.create()

# 2. Generate the CDP WebSocket URL for the session
cdp_url = f"wss://connect.steel.dev?apiKey={STEEL_API_KEY}&sessionId={session.id}"

# 3. Initialize Skyvern with the remote browser URL
skyvern = Skyvern(cdp_url=cdp_url)

# 4. Run any AI-powered task
task = await skyvern.run_task(
    prompt="Go to Hacker News and extract the top story details",
    data_extraction_schema={...}
)
```

## Remote Browser Connection

This integration uses Skyvern's remote browser connection feature, which allows Skyvern to connect to any browser via a CDP WebSocket URL. Although Skyvern still requires some local setup, it connects directly to Steel's managed browser infrastructure for the actual automation.

Key benefits:
- **Simplified setup** - Just run `skyvern init` once for the local environment
- **Remote browser execution** - Tasks run on Steel's managed browsers, not locally
- **Live session monitoring** - Watch AI automation in real-time through Steel's viewer
- **Anti-bot protection** - Leverage Steel's built-in protection mechanisms



## Troubleshooting

### Missing API Key
Ensure your `STEEL_API_KEY` is set in the `.env` file.

### Skyvern Installation Issues
Make sure Skyvern is properly installed:
```bash
pip install skyvern
```

### Connection Timeout
If you encounter connection timeouts, the script includes a 3-second wait for Steel sessions to initialize. You can adjust this if needed.

### Steel Session Limits
Free Steel accounts include 100 browser hours. Monitor your usage at [https://app.steel.dev](https://app.steel.dev).

## Advanced Usage

### Custom Tasks
Modify the `task_prompt` in `main.py` to create your own automation tasks:

```python
task_prompt = """
Your custom automation instructions here.
Be specific about what actions to take and what data to extract.
"""
```

### Form Filling Demo
Uncomment the form filling demo at the bottom of `main.py` to see an example of automated form submission.

### Self-hosted Steel
If using a self-hosted Steel instance, add to your `.env`:
```env
STEEL_BASE_URL=http://your-steel-instance:3000
```

## Contributing

Found an issue or have suggestions? Please open an issue or pull request in the [Steel Cookbook repository](https://github.com/steel-dev/steel-cookbook).

## License

This example is part of the Steel Cookbook and is available under the MIT License.
