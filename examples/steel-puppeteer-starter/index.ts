// run `npm start` in the terminal

import puppeteer from "puppeteer";
import Steel from "steel-sdk";
import dotenv from "dotenv";

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
    console.log("Creating Steel session...");

    // Create a new Steel session with all available options
    session = await client.sessions.create({
      // === Basic Options ===
      // useProxy: true, // Use Steel's proxy network (residential IPs)
      // proxyUrl: 'http://...',         // Use your own proxy (format: protocol://username:password@host:port)
      // solveCaptcha: true,             // Enable automatic CAPTCHA solving
      // sessionTimeout: 1800000,        // Session timeout in ms (default: 15 mins, max: 60 mins)
      // === Browser Configuration ===
      // userAgent: 'custom-ua-string',  // Set a custom User-Agent
    });

    console.log(`Session created successfully with Session ID: ${session.id}.
You can view the session live at ${session.sessionViewerUrl}
    `);

    // Connect Puppeteer to the Steel session
    browser = await puppeteer.connect({
      browserWSEndpoint: `wss://connect.steel.dev?apiKey=${STEEL_API_KEY}&sessionId=${session.id}`,
    });

    console.log("Connected to browser via Puppeteer");

    // Create a new page
    const page = await browser.newPage();

    // ============================================================
    // Your Automations Go Here!
    // ============================================================

    // Example script - Navigate to Hacker News and extract the top 5 stories (you can delete this)
    // Navigate to Hacker News
    console.log("Navigating to Hacker News...");
    await page.goto("https://news.ycombinator.com", {
      waitUntil: "networkidle0",
    });

    // Extract the top 5 stories
    const stories = await page.evaluate(() => {
      const items = [];
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
  } finally {
    // Cleanup: Gracefully close browser and release session when done (even when an error occurs)
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
