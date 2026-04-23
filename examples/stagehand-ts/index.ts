/*
 * AI-powered browser automation using Stagehand with Steel browsers.
 * https://github.com/steel-dev/steel-cookbook/tree/main/examples/steel-stagehand-node-starter
 */

import { Stagehand } from "@browserbasehq/stagehand";
import Steel from "steel-sdk";
import { z } from "zod";
import dotenv from "dotenv";

// gpt-5 is a reasoning model and doesn't accept `temperature`; silence the
// AI SDK warning that Stagehand triggers by passing a default temperature.
(globalThis as any).AI_SDK_LOG_WARNINGS = false;

dotenv.config();

const STEEL_API_KEY = process.env.STEEL_API_KEY || "your-steel-api-key-here";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "your-openai-api-key-here";

// Initialize Steel client with the API key from environment variables
const client = new Steel({
  steelAPIKey: STEEL_API_KEY,
});

async function main() {
  console.log("🚀 Steel + Stagehand Node Starter");
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

  if (OPENAI_API_KEY === "your-openai-api-key-here") {
    console.warn(
      "⚠️  WARNING: Please replace 'your-openai-api-key-here' with your actual OpenAI API key"
    );
    console.warn("   Get your API key at: https://platform.openai.com/");
    throw new Error("Set OPENAI_API_KEY");
  }

  let session;
  let stagehand: Stagehand | undefined;

  try {
    console.log("\nCreating Steel session...");

    session = await client.sessions.create({
      // === Basic Options ===
      // useProxy: true, // Use Steel's proxy network (residential IPs)
      // proxyUrl: 'http://...',         // Use your own proxy (format: protocol://username:password@host:port)
      // solveCaptcha: true,             // Enable automatic CAPTCHA solving
      // sessionTimeout: 1800000,        // Session timeout in ms (default: 5 mins)
      // === Browser Configuration ===
      // userAgent: 'custom-ua-string',  // Set a custom User-Agent
    });

    console.log(
      `\x1b[1;93mSteel Session created!\x1b[0m\n` +
        `View session at \x1b[1;37m${session.sessionViewerUrl}\x1b[0m`
    );

    stagehand = new Stagehand({
      env: "LOCAL", // Using LOCAL env to connect to Steel session
      localBrowserLaunchOptions: {
        cdpUrl: `${session.websocketUrl}&apiKey=${STEEL_API_KEY}`,
      },
      model: {
        modelName: "openai/gpt-5",
        apiKey: OPENAI_API_KEY,
      },
    });

    console.log("Initializing Stagehand...");
    await stagehand.init();

    console.log("Connected to browser via Stagehand");

    const page = await stagehand.context.awaitActivePage();

    console.log("Navigating to Hacker News...");
    await page.goto("https://news.ycombinator.com");

    console.log("Extracting top stories using AI...");

    const stories = await stagehand.extract(
      "extract the titles and ranks of the first 5 stories on the page",
      z.object({
        stories: z.array(
          z.object({
            title: z.string(),
            rank: z.number(),
          })
        ),
      })
    );

    console.log("\n\x1b[1;92mTop 5 Hacker News Stories:\x1b[0m");
    stories.stories?.forEach((story) => {
      console.log(`${story.rank}. ${story.title}`);
    });

    console.log("\nNavigating to HN's 'new' section via a natural-language click...");

    try {
      await stagehand.act("click the 'new' link in the top navigation");
      console.log("Navigated to new stories!");
    } catch (error) {
      console.log("Could not navigate to new stories:", error);
    }

    await new Promise((resolve) => setTimeout(resolve, 2000));

    console.log("\n\x1b[1;92mAutomation completed successfully!\x1b[0m");
  } catch (error) {
    console.error("Error during automation:", error);
    throw error;
  } finally {
    if (stagehand) {
      console.log("Closing Stagehand...");
      try {
        await stagehand.close();
      } catch (error) {
        console.error("Error closing Stagehand:", error);
      }
    }

    if (session) {
      console.log("Releasing Steel session...");
      try {
        await client.sessions.release(session.id);
        console.log("Steel session released successfully");
      } catch (error) {
        console.error("Error releasing session:", error);
      }
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
