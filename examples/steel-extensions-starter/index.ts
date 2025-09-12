/*
 * Extension upload and usage with Steel sessions.
 * https://github.com/steel-dev/steel-cookbook/tree/main/examples/steel-extensions-starter
 */

import dotenv from "dotenv";
import { chromium } from "playwright";
import Steel from "steel-sdk";
import { scrapeStats } from "./stats";

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
      "⚠️  WARNING: Please replace 'your-steel-api-key-here' with your actual Steel API key",
    );
    console.warn(
      "   Get your API key at: https://app.steel.dev/settings/api-keys",
    );
    throw new Error("Set STEEL_API_KEY");
  }

  let session;
  let browser;
  let extension;

  try {
    console.log("\nChecking extension...");
    const extensionExists = (await client.extensions.list()).extensions.find(
      (ext) => ext.name === "Github_Isometric_Contribu",
    );
    console.log("Extension exists:", extensionExists);

    if (!extensionExists) {
      console.log("Client extension", client.extensions);
      console.log("\nUploading extension...");
      extension = await client.extensions
        .upload({
          url: "https://chromewebstore.google.com/detail/github-isometric-contribu/mjoedlfflcchnleknnceiplgaeoegien", // GitHub Isometric Contributor
        })
        .catch((error: unknown) => {
          console.error("Error uploading extension:", error);
          throw new Error(`Error uploading extension: ${error}`);
        });
      console.log("\nExtension uploaded:", extension);

      if (!extension || !extension.id) {
        console.error("Extension upload failed: missing extension ID.");
        throw new Error("Extension upload failed: missing extension ID");
      }
    } else {
      extension = extensionExists;
    }

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
        `View session at \x1b[1;37m${session.sessionViewerUrl}\x1b[0m`,
    );

    // Connect Playwright to the Steel session
    browser = await chromium.connectOverCDP(
      `${session.websocketUrl}&apiKey=${STEEL_API_KEY}`,
    );

    console.log("Connected to browser via Playwright");

    // Create page at existing context to ensure session is recorded.
    const currentContext = browser.contexts()[0];
    const page = currentContext.pages()[0];

    // ============================================================
    // Your Automations Go Here!
    // ============================================================
    const randomContributor = async (): Promise<string> => {
      const steelContributors = (await fetch(
        "https://api.github.com/repos/steel-dev/steel-browser/contributors",
      )
        .then((response) => response.json())
        .then((data) =>
          data.map((contributor: { login: string }) =>
            contributor.login.trim(),
          ),
        )) || [
        "fukoda",
        "danew",
        "hussufo",
        "jagadeshjai",
        "junhsss",
        "aspectrr",
        // You could be next!
      ];
      return steelContributors[
        Math.floor(Math.random() * steelContributors.length)
      ];
    }; // Switch out for your GitHub username!

    let retries = 0;
    let username;

    while (retries < 3) {
      try {
        username = await randomContributor();
        await scrapeStats(page, username);
        break;
      } catch (error) {
        console.error(`Failed to navigate to ${username}'s profile: ${error}`);
        retries++;
      }
    }

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
