# Steel Credentials Starter

This template demonstrates how to use the Steel Credentials API with Playwright to automate using stored credentials within your sessions. It includes session management, credential creation, error handling, and a basic example of how to inject the credentials into your session.

## Installation

Clone this repository, navigate to the `examples/steel-credentials-starter` directory, and install dependencies:

```bash
git clone https://github.com/steel-dev/steel-cookbook
cd steel-cookbook/examples/steel-credentials-starter
npm install
```

## Quick start

The example script in `index.ts` shows you how to:

- Create a credential for a specific website
- Create and manage a Steel browser session
- Connect Playwright to the session
- Navigate to website
- Wait for the extension to do it's magic
- Assert we're landed on the right page and capture a screenshot
- View your live session in Steel's session viewer

To run it:

1. Create a `.env` file in the `examples/steel-credentials-starter` directory:

```bash
STEEL_API_KEY=your_api_key_here
```

2. Replace `your_api_key_here` with your Steel API key. Don't have one? Get a free key at [app.steel.dev/settings/api-keys](https://app.steel.dev/settings/api-keys)

3. From the same directory, run the command:

```bash
npm start
```

## Writing your automation

Find this section in `index.ts`:

```typescript
// ============================================================
// Your Automations Go Here!
// ============================================================

// Example automation (you can delete this)
await page.goto("https://www.csvplot.com/");
// ... rest of example code
```

You can replace the code here with whatever automation scripts you want to run.

## Configuration

The template includes common Steel configurations you can enable:

```typescript
const session = await client.sessions.create({
  useProxy: true, // Use Steel's proxy network
  solveCaptcha: true, // Enable CAPTCHA solving
  sessionTimeout: 1800000, // 30 minute timeout (default: 5 mins)
  userAgent: "custom-ua", // Custom User-Agent
});
```

## Error handling

The template includes error handling and cleanup:

```typescript
try {
  // Your automation code
} finally {
  // Cleanup runs even if there's an error
  if (browser) await browser.close();
  if (session) await client.sessions.release(session.id);
}
```

## Support

- [Steel Documentation](https://docs.steel.dev)
- [API Reference](https://docs.steel.dev/api-reference)
- [Discord Community](https://discord.gg/steel-dev)
