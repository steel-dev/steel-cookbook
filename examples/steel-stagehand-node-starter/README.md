# Steel + Stagehand Starter

This template shows you how to use Steel with Stagehand to run AI-powered browser automations in the cloud. It combines Steel's reliable cloud browser infrastructure with Stagehand's intelligent automation capabilities.

## What is Stagehand?

Stagehand is an AI-powered browser automation library that can understand and interact with web pages using natural language instructions. It can:

- Extract data from web pages using AI understanding
- Click buttons and fill forms based on descriptions
- Navigate complex UIs without brittle selectors
- Handle dynamic content intelligently

## Installation

Clone this repository, navigate to the `examples/steel-stagehand-starter`, and install dependencies:

```bash
git clone https://github.com/steel-dev/steel-cookbook
cd steel-cookbook/examples/steel-stagehand-starter
npm install
```

## Quick start

The example script in `index.ts` shows you how to:

- Create and manage a Steel browser session
- Initialize Stagehand with the Steel session
- Use AI to extract data from web pages (Hacker News stories)
- Interact with page elements using natural language
- Handle errors and cleanup properly
- View your live session in Steel's session viewer

To run it:

1. Create a `.env` file in the `examples/steel-stagehand-starter` directory:

```bash
STEEL_API_KEY=your_steel_api_key_here
OPENAI_API_KEY=your_openai_api_key_here
```

2. Replace the API keys:

   - `your_steel_api_key_here` with your Steel API key. Don't have one? Get a free key at [app.steel.dev/settings/api-keys](https://app.steel.dev/settings/api-keys)
   - `your_openai_api_key_here` with your OpenAI API key. Get one at [platform.openai.com/api-keys](https://platform.openai.com/api-keys)

3. From the same directory, run the command:

```bash
npm start
```

## Configuration Options

### Using Steel

The example uses Steel's cloud browser by default, connecting Stagehand to a Steel session:

```typescript
const stagehand = new Stagehand({
  env: "LOCAL",
  localBrowserLaunchOptions: {
    cdpUrl: `wss://connect.steel.dev?apiKey=${STEEL_API_KEY}&sessionId=${session.id}`,
  },
  enableCaching: true,
  // OpenAI API key is automatically picked up from OPENAI_API_KEY environment variable
});
```

**Note**: Stagehand automatically uses the `OPENAI_API_KEY` environment variable for AI operations. You can also configure specific models or providers by passing additional options to the constructor if needed.

## Writing your automation

Find this section in `index.ts`:

```typescript
// ============================================================
// Your Automations Go Here!
// ============================================================
```

Replace the example code with your own automation logic. Here are some common patterns:

### Extracting Data

```typescript
const data = await stagehand.extract({
  instruction: "extract all product names and prices from this page",
  schema: {
    type: "object",
    properties: {
      products: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name: { type: "string" },
            price: { type: "string" },
          },
        },
      },
    },
  },
});
```

### Interacting with Elements

```typescript
// Click elements using natural language
await stagehand.act({
  action: "click",
  instruction: "click the 'Add to Cart' button for the first product",
});

// Fill forms
await stagehand.act({
  action: "type",
  instruction: "enter email in the email field",
  text: "user@example.com",
});
```

### Navigation

```typescript
// Navigate to pages
await stagehand.page.goto("https://example.com");

// Wait for content
await stagehand.page.waitForLoadState("networkidle");
```

## Key Features

- **AI-Powered**: Uses computer vision and natural language processing to understand web pages
- **Reliable**: Runs on Steel's cloud infrastructure with proxy support and CAPTCHA solving
- **Easy**: No need to write complex selectors or handle dynamic content manually
- **Observable**: View your automation running live in Steel's session viewer

## Troubleshooting

### Common Issues

1. **Session connection fails**: Verify your Steel API key is correct
2. **Stagehand initialization fails**: Ensure you have the latest version of @browserbasehq/stagehand
3. **AI instructions not working**:
   - Verify your OpenAI API key is correct and has sufficient credits
   - Be more specific in your instructions and check the page structure
   - Try using a different OpenAI model (gpt-4o, gpt-4o-mini, etc.)

### Getting Help

- [Steel Documentation](https://docs.steel.dev)
- [Stagehand Documentation](https://docs.stagehand.dev)
- [Steel Discord Community](https://discord.gg/steel)

## Next Steps

- Try different websites and automation tasks
- Experiment with complex multi-step workflows
- Combine Steel's session management with Stagehand's AI capabilities
- Use Steel's proxy network for geo-specific automations
- Leverage CAPTCHA solving for protected sites
