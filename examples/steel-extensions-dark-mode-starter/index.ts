/*
 * Extension upload and usage with Steel sessions.
 * https://github.com/steel-dev/steel-cookbook/tree/main/examples/steel-extensions-dark-mode-starter
 */

import dotenv from "dotenv";
import { chromium } from "playwright";
import Steel from "steel-sdk";

dotenv.config();

const STEEL_API_KEY = process.env.STEEL_API_KEY || "your-steel-api-key-here";
// Initialize Steel client with the API key from environment variables
const client = new Steel({
  steelAPIKey: STEEL_API_KEY,
});

async function main() {
  console.log("🚀 Steel + Extensions API Starter");
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
    console.log("\nUploading extension...");
    const extension = await client.extensions
      .upload({
        url: "https://chromewebstore.google.com/detail/dark-mode/declgfomkjdohhjbcfemjklfebflhefl", // Dark Mode Extension
      })
      .catch((error: unknown) => {
        console.error("Error uploading extension:", error);
        throw new Error("Error uploading extension");
      });

    if (!extension || !extension.id) {
      console.error("Extension upload failed: missing extension ID.");
      throw new Error("Extension upload failed: missing extension ID");
    }

    console.log("\nExtension uploaded:", extension);

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
      extensionIds: extension?.id ? [extension.id] : [],
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
    const page = currentContext.pages()[0];

    // ============================================================
    // Your Automations Go Here!
    // ============================================================

    // Example script - Navigate to a random Wikipedia article
    console.log("Navigating to random Wikipedia page...");
    await page.goto("https://en.wikipedia.org/wiki/Special:Random", {
      waitUntil: "networkidle",
    });

    // Extract page information
    const pageData = await page.evaluate(() => {
      // Get the page title
      const title =
        document.querySelector("#firstHeading")?.textContent ||
        "No title found";

      // Get the main content paragraphs
      const contentDiv = document.querySelector("#mw-content-text");
      const paragraphs = contentDiv?.querySelectorAll("p") || [];

      // Extract text from paragraphs, filtering out empty ones
      const content = Array.from(paragraphs)
        .map((p) => p.textContent?.trim())
        .filter((text) => text && text.length > 10) // Filter out very short paragraphs
        .slice(0, 5); // Take first 5 meaningful paragraphs

      // Get categories
      const categoryLinks = document.querySelectorAll("#mw-normal-catlinks a");
      const categories = Array.from(categoryLinks)
        .map((link) => link.textContent)
        .filter((cat) => cat !== "Categories:");

      // Get infobox data if available
      const infobox = document.querySelector(".infobox");
      let infoboxData = {};
      if (infobox) {
        const rows = infobox.querySelectorAll("tr");
        rows.forEach((row) => {
          const header = row.querySelector("th")?.textContent?.trim();
          const data = row.querySelector("td")?.textContent?.trim();
          if (header && data) {
            //@ts-ignore
            infoboxData[header] = data;
          }
        });
      }

      // Get the current URL
      const url = window.location.href;

      return {
        title,
        url,
        content,
        categories: categories.slice(0, 10), // Limit categories
        infobox: infoboxData,
        lastModified:
          document.querySelector("#footer-info-lastmod")?.textContent ||
          "Unknown",
      };
    });

    console.log("\n=== WIKIPEDIA PAGE SCRAPER RESULTS ===\n");
    console.log(`Title: ${pageData.title}`);
    console.log(`URL: ${pageData.url}`);
    console.log(`Last Modified: ${pageData.lastModified}`);

    if (Object.keys(pageData.infobox).length > 0) {
      console.log("\n--- INFOBOX DATA ---");
      Object.entries(pageData.infobox).forEach(([key, value]) => {
        console.log(`${key}: ${value}`);
      });
    }

    console.log("\n--- MAIN CONTENT ---");
    pageData.content.forEach((paragraph, index) => {
      console.log(`\nParagraph ${index + 1}:`);
      console.log(paragraph);
    });

    if (pageData.categories.length > 0) {
      console.log("\n--- CATEGORIES ---");
      console.log(pageData.categories.join(", "));
    }

    return pageData;

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
