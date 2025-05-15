# Steel + Beam Starter

This template shows you how to use Steel with Beam to run AI-powered browser automations in the cloud. It includes LLM integration, session management, event handling, and a basic example you can customize.

## Installation

Clone this repository, navigate to the `examples/steel-beam-starter`, and install dependencies:

```bash
git clone https://github.com/steel-dev/steel-cookbook
cd steel-cookbook/examples/steel-beam-starter
npm install
```

## Quick start

The example script in `index.ts` shows you how to:

- Create and manage a Steel browser session with Beam
- Configure an OpenAI LLM (GPT-4.1-mini) to control the browser
- Handle various events (text, plan, tool calls, results)
- Complete a simple task (summarizing Hacker News stories)
- View your live session in Steel's session viewer

To run it:

1. Create a `.env` file in the `examples/steel-beam-starter` directory:

```bash
STEEL_API_KEY=your_steel_api_key_here
OPENAI_API_KEY=your_openai_api_key_here
```

2. Replace the placeholders with your API keys:
   - Get a free Steel API key at [app.steel.dev/settings/api-keys](https://app.steel.dev/settings/api-keys)
   - Get an OpenAI API key at [platform.openai.com/api-keys](https://platform.openai.com/api-keys)

3. From the same directory, run the command:

```bash
npm start
```

## Writing your automation

Find this section in `index.ts`:

```typescript
const result = await beam.run({
  task: "Go to news.ycombinator.com and summarize the top 3 stories",
});
```

You can change the `task` parameter to any instruction you want Beam to execute in the browser.

## Configuration

The template includes common Steel configurations you can enable:

```typescript
const beam = new Beam({
  llm: openai("gpt-4.1-mini"), // Change to any OpenAI model
  useSteel: true,
  steel: {
    steelAPIKey: process.env.STEEL_API_KEY,
    // Optional: custom connect URL
    // connectUrl: "wss://custom-connect.example.com",
    // Optional: custom base URL
    // baseURL: "https://custom-api.example.com",
  },
});
```

## Event handling

The template includes event handlers for different types of outputs:

```typescript
beam.on("text", content => process.stdout.write(content));
beam.on("plan", content => process.stdout.write(content));
beam.on("tool-call", toolCall => console.log(`Using tool: ${toolCall.toolName}`));
beam.on("tool-result", toolResult =>
  console.log(`Tool result: ${JSON.stringify(toolResult, null, 2)}`)
);
```

## Support

- [Steel Documentation](https://docs.steel.dev)
- [API Reference](https://docs.steel.dev/api-reference)
- [Discord Community](https://discord.gg/steel-dev)
- [Beam Documentation](https://github.com/steel-dev/beam/tree/main/docs)
