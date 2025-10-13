/*
 * Demonstrating how to use profiles across Steel sessions.
 * https://github.com/steel-dev/steel-cookbook/tree/main/examples/steel-profiles-starter
 */

import puppeteer, { Page } from "puppeteer-core";
import Steel from "steel-sdk";
import dotenv from "dotenv";
import { selectOrCreateProfile, verifyAuth, login } from "./utils";

dotenv.config();

const STEEL_API_KEY = process.env.STEEL_API_KEY || "your-steel-api-key-here";

const client = new Steel({
  steelAPIKey: STEEL_API_KEY,
});

async function main() {
  console.log("🚀 Steel + Profiles Example");
  console.log("=".repeat(60));

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
    profileId = await selectOrCreateProfile(client);

    if (!profileId) {
      // Step 1: Create and authenticate initial session
      console.log("\nCreating initial Steel session...");
      session = await client.sessions.create({
        persistProfile: true,
        profileId,
      });
      console.log(
        `\x1b[1;93mSteel Session #1 created!\x1b[0m\n` +
          `View session at \x1b[1;37m${session.sessionViewerUrl}\x1b[0m`,
      );

      profileId = session.profileId;

      // Connect Playwright to the session
      browser = await puppeteer.connect({
        browserWSEndpoint: `${session.websocketUrl}&apiKey=${STEEL_API_KEY}`,
      });

      const pages = await browser.pages();
      const page = pages[0];
      await login(page);

      if (await verifyAuth(page)) {
        console.log("✓ Initial authentication successful");
      }

      // Clean up first session
      await client.sessions.release(session.id);
      console.log("Session #1 released");
      // Step 3: Create new authenticated session
    }

    session = await client.sessions.create({
      persistProfile: true,
      profileId,
    });
    console.log(
      `\x1b[1;93mSteel Session #1 created!\x1b[0m\n` +
        `View session at \x1b[1;37m${session.sessionViewerUrl}\x1b[0m`,
    );

    // Connect to new session
    browser = await puppeteer.connect({
      browserWSEndpoint: `${session.websocketUrl}&apiKey=${STEEL_API_KEY}`,
    });

    const newPages = await browser.pages();
    const newPage = newPages[0];

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
