# Steel Extensions API Starter

This template demonstrates how to use the Steel Extensions API with Playwright to upload a GitHub Stats extension. It includes session management, extension uploads, error handling, and a basic use case of scraping data from the GitHub extension you can customize.

## Installation

Clone this repository, navigate to the `examples/steel-extensions-starter` directory, and install dependencies:

```bash
git clone https://github.com/steel-dev/steel-cookbook
cd steel-cookbook/examples/steel-extensions-starter
npm install
```

## Quick start

The example script in `index.ts` shows you how to:

- Create and manage a Steel browser session
- Connect Playwright to the session
- Upload an extension using Steel's Extensions API. We provide a GitHub Stats extension so you can see which developer is pushing the most :)
- Navigate to a random profile from a [steel-browser](https://github.com/steel-dev/steel-browser) contributor!
- Handle errors and cleanup properly
- View your live session in Steel's session viewer

To run it:

1. Create a `.env` file in the `examples/steel-extensions-dark-mode-starter` directory:

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
const randomContributor = async (): Promise<string> => {
  const steelContributors = (await fetch(
    "https://api.github.com/repos/steel-dev/steel-browser/contributors",
  )
    .then((response) => response.json())
    .then((data) =>
      data.map((contributor: { login: string }) =>
        contributor.login.trim(),
      ),
    )) || [
    "fukoda",
    "danew",
    "hussufo",
    "jagadeshjai",
    "junhsss",
    "aspectrr",
    // You could be next!
  ];
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
  extensionIds: ["extension-id", extension.id] // Upload your extension first and provide ID here!
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
