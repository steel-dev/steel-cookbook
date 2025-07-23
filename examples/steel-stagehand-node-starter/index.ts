/*
 * AI-powered browser automation using Stagehand with Steel browsers.
 * https://github.com/steel-dev/steel-cookbook/tree/main/examples/steel-stagehand-node-starter
 */

import { Stagehand } from "@browserbasehq/stagehand";
import Steel from "steel-sdk";
import { z } from "zod";
import dotenv from "dotenv";

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
    return;
  }

  if (OPENAI_API_KEY === "your-openai-api-key-here") {
    console.warn(
      "⚠️  WARNING: Please replace 'your-openai-api-key-here' with your actual OpenAI API key"
    );
    console.warn("   Get your API key at: https://platform.openai.com/");
    return;
  }

  let session;
  let stagehand;

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
      enableCaching: true,
      // OpenAI API key will be automatically picked up from OPENAI_API_KEY environment variable
    });

    console.log("Initializing Stagehand...");
    await stagehand.init();

    console.log("Connected to browser via Stagehand");

    console.log("Navigating to Hacker News...");
    await stagehand.page.goto("https://news.ycombinator.com");

    console.log("Extracting top stories using AI...");

    const stories = await stagehand.page.extract({
      instruction: "extract the titles of the first 5 stories on the page",
      schema: z.object({
        stories: z.array(
          z.object({
            title: z.string(),
            rank: z.number(),
          })
        ),
      }),
    });

    console.log("\n\x1b[1;92mTop 5 Hacker News Stories:\x1b[0m");
    stories.stories?.forEach((story: any, index: number) => {
      console.log(`${index + 1}. ${story.title}`);
    });

    console.log("\nLooking for search functionality...");

    try {
      await stagehand.page.act(
        "find and click on the search link or button if it exists"
      );
      console.log("Found search functionality!");

      await stagehand.page.act("type 'AI' in the search box");
      console.log("Typed 'AI' in search box");
    } catch (error) {
      console.log("No search functionality found or accessible");
    }

    await new Promise((resolve) => setTimeout(resolve, 2000));

    console.log("\n\x1b[1;92mAutomation completed successfully!\x1b[0m");
  } catch (error) {
    console.error("Error during automation:", error);
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

main().catch((error) => {
  console.error("Unhandled error:", error);
  process.exit(1);
});
