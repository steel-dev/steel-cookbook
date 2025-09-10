/*
 * Web automation using Playwright with Steel's cloud browsers.
 * https://github.com/steel-dev/steel-cookbook/tree/main/examples/steel-playwright-starter
 */

import { chromium } from "playwright";
import Steel from "steel-sdk";
import dotenv from "dotenv";

dotenv.config();

const STEEL_API_KEY = process.env.STEEL_API_KEY || "your-steel-api-key-here";

// Initialize Steel client with the API key from environment variables
const client = new Steel({
  steelAPIKey: STEEL_API_KEY,
});

async function main() {
  console.log("🚀 Steel + Playwright TypeScript Starter");
  console.log("=".repeat(60));

  if (STEEL_API_KEY === "your-steel-api-key-here") {
    console.warn(
      "⚠️  WARNING: Please replace 'your-steel-api-key-here' with your actual Steel API key"
    );
    console.warn(
      "   Get your API key at: https://app.steel.dev/settings/api-keys"
    );
    process.exit(1);
  }

  let session;
  let browser;

  try {
    console.log("\nCreating Steel session...");

    // Create a new Steel session with all available options
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

    // Connect Playwright to the Steel session
    browser = await chromium.connectOverCDP(
      `${session.websocketUrl}&apiKey=${STEEL_API_KEY}`
    );

    console.log("Connected to browser via Playwright");

    // Create page at existing context to ensure session is recorded.
    const currentContext = browser.contexts()[0];
    const page = await currentContext.pages()[0];

    // ============================================================
    // Your Automations Go Here!
    // ============================================================

    // Example script - Navigate to Hacker News and extract the top 5 stories
    console.log("Navigating to Hacker News...");
    await page.goto("https://news.ycombinator.com", {
      waitUntil: "networkidle",
    });

    // Extract the top 5 stories
    const stories = await page.evaluate(() => {
      const items: { title: string; link: string; points: string }[] = [];
      // Get all story items
      const storyRows = document.querySelectorAll("tr.athing");

      // Loop through first 5 stories
      for (let i = 0; i < 5; i++) {
        const row = storyRows[i];
        const titleElement = row.querySelector(".titleline > a");
        const subtext = row.nextElementSibling;
        const score = subtext?.querySelector(".score");

        items.push({
          title: titleElement?.textContent || "",
          link: titleElement?.getAttribute("href") || "",
          points: score?.textContent?.split(" ")[0] || "0",
        });
      }
      return items;
    });

    // Print the results
    console.log("\nTop 5 Hacker News Stories:");
    stories.forEach((story, index) => {
      console.log(`\n${index + 1}. ${story.title}`);
      console.log(`   Link: ${story.link}`);
      console.log(`   Points: ${story.points}`);
    });

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

// Run the script
main().catch((error) => {
  console.error("Unhandled error:", error);
  process.exit(1);
});
