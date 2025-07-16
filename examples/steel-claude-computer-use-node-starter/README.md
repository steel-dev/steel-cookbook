# Steel + Claude Computer Use Assistant in Node.js

This example shows how to integrate Steel with Claude's Computer Use capabilities to create a browser automation agent. The assistant sees the browser through Steel's cloud sessions, analyzes the screen, and performs actions like clicking, typing, and navigating.

## Prerequisites

- A Steel API key — [Get one here](https://app.steel.dev/settings/api-keys)
- An Anthropic API key — [Get one here](https://console.anthropic.com/)
- Node.js 18+ and npm installed

## Installation

Clone this repository and navigate to the project directory:

```bash
git clone https://github.com/steel-dev/steel-cookbook
cd steel-cookbook/examples/steel-claude-computer-use-node-starter

# Install dependencies
npm install
```

## Setup

1. Create a `.env` file in the project directory:

```bash
touch .env
```

2. Edit the `.env` file and add your API keys:

```env
STEEL_API_KEY=your_steel_api_key_here
ANTHROPIC_API_KEY=your_anthropic_api_key_here
```

## How it Works

This example demonstrates:

1. **Creating a Steel browser session** - Launches a remote browser in the cloud
2. **Connecting with browser automation** - Establishes control over the browser through Steel's API
3. **Integrating with Claude's Computer Use** - Sends screenshots to Claude and receives actions to execute
4. **Action execution** - Translates Claude's commands into browser actions (click, type, scroll, etc.)
5. **Continuous interaction loop** - Maintains a cycle of screenshots and actions until the task is complete

## Running the Example

Execute the main script:

```bash
# Use default model (Claude 3.5 Sonnet)
npm start

# Use a specific model
npm start -- --model claude-3-7-sonnet-20250219

# List available models
npm start -- --list-models
```

You'll be prompted to enter a task for the assistant to perform. Examples:

- "Take a screenshot of the current page"
- "Search for 'artificial intelligence' on Google"
- "Go to Wikipedia and find information about machine learning"
- "Navigate to GitHub and search for 'steel browser automation'"

The script will:

1. Create a Steel session (you'll see a URL where you can watch the session live)
2. Send the initial screenshot to Claude
3. Execute the commands received from Claude
4. Send updated screenshots after each action
5. Continue this loop until the task is complete

## Architecture

### SteelBrowser Class

Manages the Steel browser session and provides computer actions:

- Steel session creation and management
- Standard computer actions (click, type, scroll, etc.)
- CDP-based screenshot handling with fallback support
- Virtual mouse cursor support
- URL blocking and security checks
- Proper session cleanup

### ClaudeAgent Class

Manages the interaction loop between Claude and the computer:

- Handles Claude API requests/responses with multiple model support
- Processes computer actions and tool calls
- Manages safety checks and error handling
- Provides comprehensive action support (mouse, keyboard, scroll, utility)

## Available Models

| Model                        | Description                            |
| ---------------------------- | -------------------------------------- |
| `claude-3-5-sonnet-20241022` | Stable Claude 3.5 Sonnet (recommended) |
| `claude-3-7-sonnet-20250219` | Claude 3.7 Sonnet (newer features)     |
| `claude-sonnet-4-20250514`   | Claude 4 Sonnet (latest)               |
| `claude-opus-4-20250514`     | Claude 4 Opus (most capable)           |

## Key Features

- **Multiple model support**: Works with Claude 3.5 Sonnet, Claude 3.7 Sonnet, and Claude 4 models
- **Advanced screenshots**: CDP-based screenshots with fallback support
- **Virtual mouse**: Visual cursor for better interaction tracking
- **Security features**: Built-in URL blocking and safety checks
- **Complete action support**: Full keyboard, mouse, and scroll functionality
- **Session management**: Proper cleanup of Steel sessions and browser resources

## Customization

You can modify the example to:

- Change the initial URL and browser dimensions
- Select different Claude models based on your access level
- Adjust security settings and URL blocking rules
- Add custom computer actions or safety checks
- Modify the interaction flow and response handling

## Support

- [Steel Documentation](https://docs.steel.dev)
- [Anthropic Claude Documentation](https://docs.anthropic.com)
- [Steel Discord Community](https://discord.gg/steel)
