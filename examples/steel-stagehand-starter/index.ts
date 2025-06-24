import { Stagehand } from "@browserbasehq/stagehand";
import Steel from "steel-sdk";
import dotenv from "dotenv";
import * as z from "zod";

dotenv.config();

const STEEL_API_KEY = process.env.STEEL_API_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// Initialize Steel client with the API key from environment variables
const client = new Steel({
  steelAPIKey: STEEL_API_KEY,
});

async function main() {
  let session;
  let stagehand: Stagehand | undefined;

  try {
    console.log("Creating Steel session...");

    // Create a new Steel session with all available options
    session = await client.sessions.create({
      // === Basic Options ===
      // useProxy: true, // Use Steel's proxy network (residential IPs)
      // proxyUrl: 'http://...',         // Use your own proxy (format: protocol://username:password@host:port)
      // solveCaptcha: true,             // Enable automatic CAPTCHA solving
      // timeout: 1800000,      // Session timeout in ms (default: 5 mins)
      // === Browser Configuration ===
      // userAgent: 'custom-ua-string',  // Set a custom User-Agent
    });

    console.log(
      `\x1b[1;93mSteel Session created!\x1b[0m\n` +
      `View session at \x1b[1;37m${session.sessionViewerUrl}\x1b[0m`
    );

    // Connect Stagehand to the Steel session

    stagehand = new Stagehand({
      env: "LOCAL",
      modelName: "gpt-4o",
      modelClientOptions: {
        apiKey: OPENAI_API_KEY,
      },
      localBrowserLaunchOptions: {
        cdpUrl: `wss://connect.steel.dev?apiKey=${STEEL_API_KEY}&sessionId=${session.id}`,
      }
    });

    await stagehand.init();

    const page = stagehand.page;

    console.log("Connected to browser via Stagehand");

    // ============================================================
    // Your Automations Go Here!
    // ============================================================

    await page.goto("https://github.com/steel-dev");

    const { reasons } = await page.extract(
      {
        instruction: "Why I should use Steel?",
        schema: z.object({
          reasons: z.array(z.string()),
        }),
      }
    );

    //write the reasons to the console

    reasons.forEach((reason, index) => {
      console.log(`Reason ${index + 1}: ${reason}`);
    });

    // ============================================================
    // End of Automations
    // ============================================================
  } catch (error) {
    console.error("An error occurred:", error);
  } finally {
    // Cleanup: Gracefully close browser and release session when done
    if (stagehand) {
      await stagehand.close();
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
