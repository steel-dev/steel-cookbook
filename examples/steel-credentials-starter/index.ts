import dotenv from "dotenv";
import { setTimeout } from "node:timers/promises";
import { writeFile } from "node:fs/promises";
import { chromium } from "playwright";
import Steel from "steel-sdk";

dotenv.config();

const STEEL_API_KEY = process.env.STEEL_API_KEY;

// Initialize Steel client with the API key from environment variables
const client = new Steel({
  steelAPIKey: STEEL_API_KEY,
});

async function main() {
  let session;
  let browser;

  try {
    console.log("Creating credential...");
    await client.credentials.create({
      origin: "https://demo.testfire.net",
      value: {
        username: "admin",
        password: "admin",
      }
    }).catch((err) => {
      if (err.error.message === "Credential already exists") {
        console.log("Credential already exists, moving on.");
        return;
      }
      throw err;
    })

    console.log("Creating Steel session...");

    // Create a new Steel session with credentials enabled
    session = await client.sessions.create({
      credentials: {}
    });

    console.log(
      `\x1b[1;93mSteel Session created!\x1b[0m\n` +
      `View session at \x1b[1;37m${session.sessionViewerUrl}\x1b[0m`
    );

    // Connect Playwright to the Steel session
    browser = await chromium.connectOverCDP(
      `wss://connect.steel.dev?apiKey=${STEEL_API_KEY}&sessionId=${session.id}`
    );

    console.log("Connected to browser via Playwright");

    // Create page at existing context to ensure session is recorded.
    const currentContext = browser.contexts()[0];
    const page = currentContext.pages()[0];

    // ============================================================
    // Your Automations Go Here!
    // ============================================================

    //  Navigate to the demo website and wait for the page to load.
    await page.goto("https://demo.testfire.net", {
      waitUntil: "networkidle"
    });

    // Navigate to the login page
    await page.click('#AccountLink');

    // Wait for the login to succeed
    await setTimeout(2000);

    const headingText = await page.textContent('h1');
    if (headingText?.trim() === "Hello Admin User") {
      console.log("Success, you are logged in");
    } else {
      console.log("Uh oh, something went wrong!");
    }

    const buffer = await page.screenshot();
    await writeFile(`./final-screenshot.png`, buffer);

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
