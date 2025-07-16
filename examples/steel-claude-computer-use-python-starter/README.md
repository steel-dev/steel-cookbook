# Steel + Claude Computer Use Python Starter

This example shows how to integrate Steel with Anthropic's Claude Computer Use API to create a browser automation agent. The assistant sees the browser through Steel's cloud sessions, analyzes the screen, and performs actions like clicking, typing, and navigating.

## Prerequisites

- A Steel API key — [Get one here](https://app.steel.dev/settings/api-keys)
- An Anthropic API key — [Get one here](https://console.anthropic.com/)

## Installation

Clone this repository and navigate to the project directory:

```bash
git clone https://github.com/steel-dev/steel-cookbook
cd steel-cookbook/examples/steel-claude-computer-use-python-starter

# Create and activate virtual environment (recommended)
python -m venv venv
source venv/bin/activate  # On Windows use: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt
```

## Setup

1. Create a `.env` file in the project directory:

```bash
# Create a .env file or set environment variables
export STEEL_API_KEY="your_steel_api_key_here"
export ANTHROPIC_API_KEY="your_anthropic_api_key_here"
```

## How it Works

This example demonstrates:

1. **Creating a Steel browser session** - Launches a remote browser in the cloud
2. **Connecting with Playwright** - Establishes a direct connection to control the browser
3. **Integrating with Claude Computer Use** - Sends screenshots to Claude and receives actions to execute
4. **Action execution** - Translates Claude's commands into browser actions (click, type, scroll, etc.)
5. **Continuous interaction loop** - Maintains a cycle of screenshots and actions until the task is complete

## Running the Example

### Basic Usage

Run with the default stable model:

```bash
python main.py
```

### Model Selection

Choose a specific Claude model:

```bash
# Use stable Claude 3.5 Sonnet (default)
python main.py --model claude-3-5-sonnet-20241022

# Use newer Claude 3.7 Sonnet
python main.py --model claude-3-7-sonnet-20250219

# Use Claude 4 Sonnet
python main.py --model claude-sonnet-4-20250514
```

### List Available Models

See all available models:

```bash
python main.py --list-models
```

The script will:

1. Create a Steel session (you'll see a URL where you can watch the session live)
2. Send the initial screenshot to Claude
3. Execute the commands received from Claude
4. Send updated screenshots after each action
5. Continue this loop until the task is complete

## Example Commands

Try these example commands:

- "Search for Steel browser on Google and tell me about it"
- "Find today's weather for New York City"
- "Go to Wikipedia and find information about machine learning"
- "Take a screenshot of the current page"
- "Scroll down to see more content"

## Architecture

### SteelBrowser Class

Manages the Steel browser session and provides computer actions:

- Steel session creation and management
- Standard computer actions (click, type, scroll, etc.)
- Screenshot capabilities and action execution
- Virtual mouse cursor support
- URL blocking and security checks
- Proper session cleanup

### ClaudeAgent Class

Manages the interaction loop between Claude and the computer:

- Handles Anthropic API requests/responses
- Processes computer actions and tool calls
- Uses Claude's stable `computer_20241022` beta tool for screen interaction
- Manages safety checks and error handling

## Key Features

- **Safety checks**: Includes URL blocking and security protection against malicious domains
- **Error handling**: Graceful handling of browser and API errors
- **Session management**: Automatic cleanup of Steel sessions and browser resources
- **Virtual mouse cursor**: Visual feedback for mouse movements
- **Model flexibility**: Support for multiple Claude models

## Supported Models

| Model                        | Tool Type           | Description         |
| ---------------------------- | ------------------- | ------------------- |
| `claude-3-5-sonnet-20241022` | `computer_20241022` | Stable, well-tested |
| `claude-3-7-sonnet-20250219` | `computer_20250124` | Newer features      |
| `claude-sonnet-4-20250514`   | `computer_20250124` | Latest model        |
| `claude-opus-4-20250514`     | `computer_20250124` | Most capable        |

**Recommendation**: Start with `claude-3-5-sonnet-20241022` for stability.

## Customization

You can modify the example to:

- Change the initial URL (currently Google.com)
- Adjust browser dimensions and settings
- Add custom safety checks
- Implement additional security features
- Customize the interaction flow

## Support

- [Steel Documentation](https://docs.steel.dev)
- [Anthropic Computer Use Documentation](https://docs.anthropic.com/claude/docs/computer-use)
- [Discord Community](https://discord.gg/steel-dev)
