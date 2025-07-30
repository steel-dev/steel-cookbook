/*
 * AI-powered browser automation using Magnitude with Steel browsers.
 * https://github.com/steel-dev/steel-cookbook/tree/main/examples/steel-magnitude-starter
 */

import * as dotenv from "dotenv";
import { Steel } from "steel-sdk";
import { z } from "zod";
import { startBrowserAgent } from "magnitude-core";

dotenv.config();

// Replace with your own API keys
const STEEL_API_KEY = process.env.STEEL_API_KEY || "your-steel-api-key-here";
const ANTHROPIC_API_KEY =
  process.env.ANTHROPIC_API_KEY || "your-anthropic-api-key-here";

// Initialize Steel client with the API key from environment variables
const client = new Steel({
  steelAPIKey: STEEL_API_KEY,
});

async function main() {
  console.log("🚀 Steel + Magnitude Node Starter");
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

  if (ANTHROPIC_API_KEY === "your-anthropic-api-key-here") {
    console.warn(
      "⚠️  WARNING: Please replace 'your-anthropic-api-key-here' with your actual Anthropic API key"
    );
    console.warn("   Get your API key at: https://console.anthropic.com/");
    return;
  }

  let session;
  let agent;

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

    agent = await startBrowserAgent({
      url: "https://news.ycombinator.com",
      narrate: true,
      llm: {
        provider: "anthropic",
        options: {
          model: "claude-3-7-sonnet-latest",
          apiKey: process.env.ANTHROPIC_API_KEY,
        },
      },
      browser: {
        cdp: `${session.websocketUrl}&apiKey=${STEEL_API_KEY}`,
      },
    });

    console.log("Connected to browser via Magnitude");

    console.log("Extracting top stories using AI...");

    const stories = await agent.extract(
      "extract the titles of the first 5 stories on the page",
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
    stories.stories?.forEach((story: any, index: number) => {
      console.log(`${index + 1}. ${story.title}`);
    });

    console.log("\nLooking for search functionality...");

    try {
      await agent.act(
        "find and click on the search link or button if it exists"
      );
      console.log("Found search functionality!");

      await agent.act("type 'AI' in the search box");
      console.log("Typed 'AI' in search box");
    } catch (error) {
      console.log("No search functionality found or accessible");
    }

    await new Promise((resolve) => setTimeout(resolve, 2000));

    console.log("\n\x1b[1;92mAutomation completed successfully!\x1b[0m");
  } catch (error) {
    console.error("Error during automation:", error);
  } finally {
    if (agent) {
      console.log("Stopping Magnitude agent...");
      try {
        await agent.stop();
      } catch (error) {
        console.error("Error stopping agent:", error);
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
