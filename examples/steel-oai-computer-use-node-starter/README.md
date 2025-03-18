# Steel + OpenAI Computer Use Assistant in Node.js

This example demonstrates how to integrate Steel with OpenAI's Computer Use Assistant (CUA) API in a Node.js application. It creates a browser automation agent where the assistant sees the browser through Steel's cloud sessions, analyzes the screen, and performs actions like clicking, typing, and navigating.

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

There are two ways to run the example:

### Using ts-node (for development):

```bash
npm run dev
```

### Building and running the compiled JavaScript:

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

## Key Components

### SteelBrowser Class

A TypeScript class that wraps around the Steel session and Playwright browser, providing methods for:

- Creating and managing a browser session
- Taking screenshots
- Executing various browser actions (click, type, scroll, etc.)

The class implements additional browser actions like:

- Navigation (`goto`, `back`, `refresh`)
- Mouse interactions (`click`, `doubleClick`, `move`, `drag`)
- Keyboard input (`type`, `keypress`)
- Waiting and scrolling

### OpenAI Integration

The script connects to OpenAI's Computer Use Assistant API to:

- Send browser screenshots
- Receive actions to execute
- Process text responses from the assistant

It handles the complete interaction loop, including:

- Initial task submission
- Action execution
- Screenshot capture and response processing
- Final task completion and cleanup

## Customization

You can modify the example to:

- Change the initial URL (currently Bing.com)
- Adjust the browser dimensions
- Add more action types
- Implement additional error handling
- Customize the UI/UX of the interaction

## TypeScript Support

This example is written in TypeScript for better type safety and developer experience. The TypeScript configuration is set up to:

- Target modern JavaScript (ES2020)
- Enable strict type checking
- Generate declaration files
- Support ES modules

## Support

- [Steel Documentation](https://docs.steel.dev)
- [OpenAI Computer Use Assistant Documentation](https://platform.openai.com/docs/guides/computer-use)
- [Discord Community](https://discord.gg/steel-dev)
