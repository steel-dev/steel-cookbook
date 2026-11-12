/*
 * Managing and using stored credentials with Steel for automated authentication.
 * https://github.com/steel-dev/steel-cookbook/tree/main/examples/credentials-ts
 */

import dotenv from "dotenv";
import { chromium } from "playwright";
import Steel from "steel-sdk";

dotenv.config();

const STEEL_API_KEY = process.env.STEEL_API_KEY || "your-steel-api-key-here";
const ORIGIN = "https://practice.expandtesting.com";

// Initialize Steel client with the API key from environment variables
const client = new Steel({
  steelAPIKey: STEEL_API_KEY,
});

async function main() {
  console.log("Steel + Credentials Starter");
  console.log("=".repeat(60));

  if (STEEL_API_KEY === "your-steel-api-key-here") {
    console.warn(
      "WARNING: Please replace 'your-steel-api-key-here' with your actual Steel API key"
    );
    console.warn(
      "   Get your API key at: https://app.steel.dev/settings/api-keys"
    );
    throw new Error("Set STEEL_API_KEY");
  }

  let session;
  let browser;

  try {
    console.log("\nStoring credential...");
    try {
      await client.credentials.create({
        origin: ORIGIN,
        value: {
          username: "practice",
          password: "SuperSecretPassword!",
        },
      });
      console.log("Credential stored.");
    } catch (err) {
      if (!(err instanceof Steel.ConflictError)) throw err;
      console.log("Credential already exists, moving on.");
    }

    console.log("Creating Steel session...");

    // Create a new Steel session with credentials enabled
    session = await client.sessions.create({
      credentials: {},
    });

    console.log(
      `\x1b[1;93mSteel Session created!\x1b[0m\n` +
        `View session at \x1b[1;37m${session.sessionViewerUrl}\x1b[0m`
    );

    // Connect Playwright to the Steel session
    browser = await chromium.connectOverCDP(session.websocketUrl);

    console.log("Connected to browser via Playwright");

    // Create page at existing context to ensure session is recorded.
    const currentContext = browser.contexts()[0];
    const page = currentContext.pages()[0];

    // ============================================================
    // Your Automations Go Here!
    // ============================================================

    await page.goto(`${ORIGIN}/login`);
    await page.waitForURL(`${ORIGIN}/secure`, { timeout: 20_000 });

    const message = await page.locator("#flash b").innerText();
    console.log(`Steel signed in. The site says: ${message}`);

    // ============================================================
    // End of Automations
    // ============================================================
  } catch (error) {
    console.error("An error occurred:", error);
    throw error;
  } finally {
    if (session) {
      console.log("Releasing session...");
      await client.sessions.release(session.id);
      console.log("Session released");
    }

    console.log("Done!");
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
