# Claude Computer Use Node Starter (Mobile Mode)

This example demonstrates how to use Claude AI with Steel's Computer Use capabilities for autonomous web task execution in mobile browser environments.

## What This Example Does

This example creates an AI-powered agent that can:
- Control a mobile Chrome browser using Claude's computer use tools
- Execute web automation tasks autonomously 
- Navigate mobile-optimized websites
- Take screenshots and interact with mobile UI elements
- Complete multi-step tasks independently

## Prerequisites

- **Steel API key** - Get one at [app.steel.dev](https://app.steel.dev/settings/api-keys)
- **Anthropic API key** - Get one at [console.anthropic.com](https://console.anthropic.com/)
- Node.js & TypeScript
- Install dependencies: `npm install`

## Implementation

The example consists of:
- `SteelBrowser` class: Manages mobile browser sessions with Steel
- `ClaudeAgent` class: Integrates Claude's computer use capabilities
- Mobile-optimized interaction handling
- Mobile viewport configuration
- Touch-friendly cursor visualization

## Key Features

- **Mobile Emulation**: Browser runs in mobile mode
- **Autonomous Execution**: Claude makes decisions and acts independently
- **Computer Use Tools**: Claude can screenshot, click, type, scroll, and navigate
- **Mobile-Specific Adaptations**: Optimized for mobile layouts and interactions
- **Error Handling**: Robust error recovery and session management

## Environment Setup

Create a `.env` file with your API keys:

```bash
STEEL_API_KEY=your_steel_api_key_here
ANTHROPIC_API_KEY=your_anthropic_api_key_here
TASK="Go to Google and search for 'mobile web development best practices'"
```

## Usage

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Set your API keys** in `.env`

3. **Run the example**:
   ```bash
   npm start
   ```

4. **Monitor progress**: Watch the agent work in the Steel session viewer URL that gets printed

## Task Customization

Modify the `TASK` environment variable to change what the AI agent does:

```bash
# Examples of mobile-friendly tasks:
TASK="Navigate to Amazon mobile site and search for wireless headphones"
TASK="Go to Wikipedia mobile and read about artificial intelligence"
TASK="Visit news.ycombinator.com mobile version and find the top story"
```

## Mobile-Specific Considerations

This example is optimized for mobile interactions:
- Uses mobile viewport dimensions
- Considers mobile-specific UI patterns
- Handles mobile keyboard interactions
- Optimized for mobile site layouts

## Common Challenges

- **API Keys**: Ensure both Steel and Anthropic API keys are correctly set
- **Mobile Layout**: Some sites may not have mobile-optimized versions
- **Touch Interactions**: Mobile interactions differ from desktop patterns
- **Viewport Size**: Mobile screen real estate is limited compared to desktop

The agent will work autonomously to complete the specified task and report results when finished.
