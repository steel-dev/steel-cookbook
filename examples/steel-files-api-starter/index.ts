/*
 * File upload and download operations with Steel sessions.
 * https://github.com/steel-dev/steel-cookbook/tree/main/examples/steel-files-api-starter
 */

import dotenv from "dotenv";
import fs from "fs";
import { chromium } from "playwright";
import Steel from "steel-sdk";

dotenv.config();

const STEEL_API_KEY = process.env.STEEL_API_KEY || "your-steel-api-key-here";

// Initialize Steel client with the API key from environment variables
const client = new Steel({
  steelAPIKey: STEEL_API_KEY,
});

async function main() {
  console.log("🚀 Steel + Files API Starter");
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

    const file = new File(
      [fs.readFileSync("./assets/stock.csv")],
      "stock.csv",
      {
        type: "text/csv",
      }
    );

    console.log("Uploading CSV file to the Steel session...");

    // Upload CSV file to the Steel session.
    const uploadedFile = await client.sessions.files.upload(session.id, {
      file,
    });

    console.log(
      `\x1b[1;92mCSV file uploaded successfully!\x1b[0m\n` +
        `File path on Steel session: \x1b[1;37m${uploadedFile.path}\x1b[0m`
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

    //  Navigate to the CSV plotting website and wait for the page to load.
    await page.goto("https://www.csvplot.com/");

    // Create a CDP session to pass in some custom controls
    const cdpSession = await currentContext.newCDPSession(page);
    const document = await cdpSession.send("DOM.getDocument");

    // We need to find the input element using the selector
    const inputNode = await cdpSession.send("DOM.querySelector", {
      nodeId: document.root.nodeId,
      selector: "#load-file",
    });

    // Set the CSV file as input on the page.
    await cdpSession.send("DOM.setFileInputFiles", {
      files: [uploadedFile.path],
      nodeId: inputNode.nodeId,
    });

    // Wait for the rendered SVG, scroll it into view, and capture a screenshot.
    const svg = await page.waitForSelector("svg.main-svg");
    await svg.scrollIntoViewIfNeeded();
    await svg.screenshot({ path: "stock.png" });

    // ============================================================
    // End of Automations
    // ============================================================
  } catch (error) {
    console.error("An error occurred:", error);
  } finally {
    // Cleanup: Gracefully close browser and release session when done
    if (browser) {
      await browser.close();
      console.log("Browser closed");
    }

    if (session) {
      console.log("Releasing session...");
      await client.sessions.release(session.id);
      console.log("Session released");
    }

    console.log("Done!");
  }
}

// Run the script
main();
