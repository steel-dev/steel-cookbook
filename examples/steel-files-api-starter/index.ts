import dotenv from "dotenv";
import fs from "fs";
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
    console.log("Creating Steel session...");

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
      `wss://connect.steel.dev?apiKey=${STEEL_API_KEY}&sessionId=${session.id}`
    );

    console.log("Connected to browser via Playwright");

    // Create page at existing context to ensure session is recorded.
    const currentContext = browser.contexts()[0];
    const page = currentContext.pages()[0];

    // ============================================================
    // Upload Files
    // ============================================================

    const file = new File(
      [fs.readFileSync("./assets/steel.png")],
      "steel.png",
      {
        type: "image/png",
      }
    );

    console.log("Uploading PNG file to the Steel session...");

    // Upload PNG file to the Steel session.
    const uploadedFile = await client.sessions.files.upload(session.id, {
      file,
    });

    console.log(
      `\x1b[1;92mPNG file uploaded successfully!\x1b[0m\n` +
        `File path on Steel session: \x1b[1;37m${uploadedFile.path}\x1b[0m`
    );

    await page.goto("https://browser-tests-steel.vercel.app/upload");

    // Create a CDP session to pass in some custom controls
    const cdpSession = await currentContext.newCDPSession(page);
    const document = await cdpSession.send("DOM.getDocument");

    // We need to find the input element using the selector
    const inputNode = await cdpSession.send("DOM.querySelector", {
      nodeId: document.root.nodeId,
      selector: "#uploadFile",
    });

    // Set the PNG file as input on the page.
    await cdpSession.send("DOM.setFileInputFiles", {
      files: [uploadedFile.path],
      nodeId: inputNode.nodeId,
    });

    await page.waitForSelector("#fileName");
    console.log("fileName:", await page.textContent("#fileName"));

    // ============================================================
    // Download Files
    // ============================================================

    await page.goto("https://browser-tests-steel.vercel.app/download");

    // Pass in some custom controls
    await cdpSession.send("Browser.setDownloadBehavior", {
      behavior: "allow",
      downloadPath: `/files`,
      eventsEnabled: true,
    });

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.locator("#downloadFile").click(),
    ]);

    const files = await client.sessions.files.list(session.id);

    for (const file of files.data) {
      const downloadedFile = await (
        await client.sessions.files.download(session.id, file.id)
      ).arrayBuffer();

      fs.writeFileSync(`./${file.name}`, Buffer.from(downloadedFile));
    }

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
