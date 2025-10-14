/*
 * Demonstrating how to use Profiles across Steel sessions with a Shopping Cart Demo.
 * https://github.com/steel-dev/steel-cookbook/tree/main/examples/steel-profiles-starter
 */

import { chromium } from "playwright";
import Steel from "steel-sdk";
import dotenv from "dotenv";
import {
  selectOrCreateProfile,
  verifyAuth,
  login,
  addItemsToCart,
  checkItemsInCart,
} from "./utils";

dotenv.config();

const STEEL_API_KEY = process.env.STEEL_API_KEY || "your-steel-api-key-here";

const client = new Steel({
  steelAPIKey: STEEL_API_KEY,
});

async function main() {
  console.log("🚀 Steel Profiles Demo");
  console.log("=".repeat(60));

  // Validate API key
  if (STEEL_API_KEY === "your-steel-api-key-here") {
    console.warn(
      "⚠️  WARNING: Please replace 'your-steel-api-key-here' with your actual Steel API key",
    );
    console.warn(
      "   Get your API key at: https://app.steel.dev/settings/api-keys",
    );
    throw new Error("Set STEEL_API_KEY");
  }

  let session;
  let browser;
  let profileId;

  try {
    // Step 1: Select or create a profile
    profileId = await selectOrCreateProfile(client);

    if (!profileId) {
      // Create initial session with profile persistence
      session = await client.sessions.create({
        persistProfile: true,
        profileId,
      });

      console.log(
        `\x1b[1;93mSteel Session #1 created!\x1b[0m\n` +
          `View session at \x1b[1;37m${session.sessionViewerUrl}\x1b[0m`,
      );

      profileId = session.profileId;
      console.log(`Profile ID: ${profileId}`);

      // Connect Playwright to Steel session
      browser = await chromium.connectOverCDP({
        endpointURL: `${session.websocketUrl}&apiKey=${STEEL_API_KEY}`,
      });

      const contexts = browser.contexts();
      const context = contexts[0];
      const pages = context.pages();
      const page = pages[0];

      // Initialize the demo shop
      await login(page);

      // Verify site access and add items to cart
      if (await verifyAuth(page)) {
        console.log("Successfully logged in");

        const itemsAdded = await addItemsToCart(page);
        if (itemsAdded) {
          console.log("Items successfully added to cart");
        } else {
          console.log("Some items may not have been added, but continuing...");
        }
      } else {
        throw new Error("Failed to access");
      }

      // Clean up first session
      await client.sessions.release(session.id);
      console.log("\nSession #1 released");

      await new Promise((resolve) => setTimeout(resolve, 3000));
    } else {
      console.log(`\nUsing existing profile: ${profileId}`);
    }

    session = await client.sessions.create({
      persistProfile: true,
      profileId,
    });

    console.log(
      `\x1b[1;93mSteel Session #2 created!\x1b[0m\n` +
        `View session at \x1b[1;37m${session.sessionViewerUrl}\x1b[0m`,
    );
    console.log(`Profile ID: ${profileId}`);

    // Connect Playwright to new session
    browser = await chromium.connectOverCDP({
      endpointURL: `${session.websocketUrl}&apiKey=${STEEL_API_KEY}`,
    });

    const newContexts = browser.contexts();
    const newContext = newContexts[0];
    const newPages = newContext.pages();
    const newPage = newPages[0];

    // Verify persistence
    if (await verifyAuth(newPage)) {
      const persistenceWorking = await checkItemsInCart(newPage);

      if (persistenceWorking) {
        console.log("Found your shopping cart!");
      } else {
        console.log("\nFailed Profile persistence test");
      }
    } else {
      throw new Error("Failed to verify new session access");
    }
  } catch (error) {
    console.error("\nFailed ");
  } finally {
    if (session) {
      console.log("Releasing session...");
      await client.sessions.release(session.id);
      console.log("Session released");
    }
  }
}

// Execute the demo
main()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error("Task execution failed:", error);
    process.exit(1);
  });
