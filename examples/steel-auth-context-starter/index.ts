/*
 * Demonstrating how to persist authentication state across Steel sessions.
 * https://github.com/steel-dev/steel-cookbook/tree/main/examples/steel-auth-context-starter
 */

import { chromium, Page } from "playwright";
import Steel from "steel-sdk";
import dotenv from "dotenv";

dotenv.config();

const STEEL_API_KEY = process.env.STEEL_API_KEY || "your-steel-api-key-here";

const client = new Steel({
  steelAPIKey: STEEL_API_KEY,
});

// Helper function to perform login
async function login(page: Page) {
  await page.goto("https://practice.expandtesting.com/login");
  await page.fill('input[name="username"]', "practice");
  await page.fill('input[name="password"]', "SuperSecretPassword!");
  await page.click('button[type="submit"]');
}

// Helper function to verify authentication
async function verifyAuth(page: Page): Promise<boolean> {
  await page.goto("https://practice.expandtesting.com/secure");
  const welcomeText = await page.textContent("#username");
  return welcomeText?.includes("Hi, practice!") ?? false;
}

async function main() {
  console.log("🚀 Steel + Reuse Auth Context Example");
  console.log("=".repeat(60));

  if (STEEL_API_KEY === "your-steel-api-key-here") {
    console.warn(
      "⚠️  WARNING: Please replace 'your-steel-api-key-here' with your actual Steel API key"
    );
    console.warn(
      "   Get your API key at: https://app.steel.dev/settings/api-keys"
    );
    throw new Error("Set STEEL_API_KEY");
  }

  let session;
  let browser;

  try {
    // Step 1: Create and authenticate initial session
    console.log("\nCreating initial Steel session...");
    session = await client.sessions.create();
    console.log(
      `\x1b[1;93mSteel Session #1 created!\x1b[0m\n` +
        `View session at \x1b[1;37m${session.sessionViewerUrl}\x1b[0m`
    );

    // Connect Playwright to the session
    browser = await chromium.connectOverCDP(
      `${session.websocketUrl}&apiKey=${STEEL_API_KEY}`
    );

    const page = await browser.contexts()[0].pages()[0];
    await login(page);

    if (await verifyAuth(page)) {
      console.log("✓ Initial authentication successful");
    }

    // Step 2: Capture and transfer authentication
    const sessionContext = await client.sessions.context(session.id);

    // Clean up first session
    await client.sessions.release(session.id);
    console.log("Session #1 released");

    // Step 3: Create new authenticated session

    session = await client.sessions.create({ sessionContext: sessionContext });
    console.log(
      `\x1b[1;93mSteel Session #2 created!\x1b[0m\n` +
        `View session at \x1b[1;37m${session.sessionViewerUrl}\x1b[0m`
    );

    // Connect to new session
    browser = await chromium.connectOverCDP(
      `${session.websocketUrl}&apiKey=${STEEL_API_KEY}`
    );

    // Verify authentication transfer
    const newPage = await browser.contexts()[0].pages()[0];
    if (await verifyAuth(newPage)) {
      console.log("\x1b[32m✓ Authentication successfully transferred!\x1b[0m");
    }
  } catch (error) {
    console.error("Error:", error);
    throw error;
  } finally {
    // Cleanup
    if (session) {
      await client.sessions.release(session.id);
      console.log("Session #2 released");
    }
  }
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error("Task execution failed:", error);
    process.exit(1);
  });
