# Steel + OpenAI Computer Use Assistant in Node.js

This example shows how to integrate Steel with OpenAI's Computer Use Assistant (CUA) API to create a browser automation agent. The assistant sees the browser through Steel's cloud sessions, analyzes the screen, and performs actions like clicking, typing, and navigating.

## Prerequisites

- A Steel API key — [Get one here](https://app.steel.dev/settings/api-keys)
- An OpenAI API key with access to the Computer Use Assistant preview
- Node.js 18+ and npm installed

## Installation

Clone this repository and navigate to the project directory:

```bash
git clone https://github.com/steel-dev/steel-cookbook
cd steel-cookbook/examples/steel-oai-computer-use-node-starter

# Install dependencies
npm install
```

## Setup

1. Create a `.env` file in the project directory by copying the example:

```bash
cp .env.example .env
```

2. Edit the `.env` file and add your API keys:

```
STEEL_API_KEY=your_steel_api_key_here
OPENAI_API_KEY=your_openai_api_key_here
```

## How it Works

This example demonstrates:

1. **Creating a Steel browser session** - Launches a remote browser in the cloud
2. **Connecting with Playwright** - Establishes a direct connection to control the browser
3. **Integrating with OpenAI's Computer Use Assistant** - Sends screenshots to OpenAI and receives actions to execute
4. **Action execution** - Translates OpenAI's commands into browser actions (click, type, scroll, etc.)
5. **Continuous interaction loop** - Maintains a cycle of screenshots and actions until the task is complete

## Running the Example

Execute the main script:

```bash
npm start
```

You'll be prompted to enter a task for the assistant to perform. Examples:

- "Search for Steel browser on Bing and tell me about it"
- "Find today's weather for New York City"
- "Go to Wikipedia and find information about machine learning"

The script will:

1. Create a Steel session (you'll see a URL where you can watch the session live)
2. Send the initial screenshot to OpenAI
3. Execute the commands received from OpenAI
4. Send updated screenshots after each action
5. Continue this loop until the task is complete

## Architecture

### SteelBrowser Class

Manages the Steel browser session and provides computer actions:

- Steel session creation and management
- Standard computer actions (click, type, scroll, etc.)
- Custom CDP screenshot handling
- Virtual mouse cursor support
- URL blocking and security checks
- Proper session cleanup

### Agent Class

Manages the interaction loop between OpenAI and the computer:

- Handles OpenAI API requests/responses
- Processes computer actions and function calls
- Manages safety checks and error handling
- Provides debug and image display options

## Key Features

- **Safety checks**: Includes URL blocking and user confirmation for safety-critical actions
- **Error handling**: Proper exception handling and fallback mechanisms
- **Session management**: Proper cleanup of Steel sessions and browser resources
- **Single file design**: Clean separation of concerns in one easy-to-understand file

## Customization

You can modify the example to:

- Change the initial URL (currently Google.com)
- Adjust the browser dimensions and settings
- Add custom function tools
- Implement additional security checks
- Customize the interaction flow

## Support

- [Steel Documentation](https://docs.steel.dev)
- [OpenAI Computer Use Assistant Documentation](https://platform.openai.com/docs/guides/computer-use)
- [Discord Community](https://discord.gg/steel-dev)
