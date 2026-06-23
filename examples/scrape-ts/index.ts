/*
 * Turn a URL into clean markdown, a screenshot, and a PDF with Steel's direct API. No browser library.
 * https://github.com/steel-dev/steel-cookbook/tree/main/examples/scrape-ts
 */

import Steel from "steel-sdk";
import dotenv from "dotenv";

dotenv.config();

const STEEL_API_KEY = process.env.STEEL_API_KEY || "your-steel-api-key-here";
const TARGET_URL = process.env.TARGET_URL || "https://news.ycombinator.com";

const client = new Steel({
  steelAPIKey: STEEL_API_KEY,
});

async function main() {
  console.log("Steel Scrape API (TypeScript)");
  console.log("=".repeat(60));

  if (STEEL_API_KEY === "your-steel-api-key-here") {
    console.warn(
      "WARNING: Please replace 'your-steel-api-key-here' with your actual Steel API key"
    );
    console.warn(
      "   Get your API key at: https://app.steel.dev/settings/api-keys"
    );
    throw new Error("Set STEEL_API_KEY");
  }

  console.log(`\nScraping ${TARGET_URL} to markdown...`);

  const scraped = await client.scrape({
    url: TARGET_URL,
    format: ["markdown"],
  });

  const markdown = scraped.content.markdown ?? "";
  const { title, statusCode, description } = scraped.metadata;

  console.log(`HTTP ${statusCode} | ${title ?? "(no title)"}`);
  if (description) {
    console.log(`Description: ${description}`);
  }
  console.log(`Links found: ${scraped.links.length}`);
  console.log(`Markdown length: ${markdown.length} characters`);

  console.log("\n--- Markdown preview (first 500 chars) ---");
  console.log(markdown.slice(0, 500));
  console.log("--- end preview ---");

  console.log("\nCapturing a full-page screenshot...");
  const shot = await client.screenshot({
    url: TARGET_URL,
    fullPage: true,
  });
  console.log(`Screenshot hosted at: ${shot.url}`);

  console.log("\nRendering the page to PDF...");
  const pdf = await client.pdf({
    url: TARGET_URL,
  });
  console.log(`PDF hosted at: ${pdf.url}`);

  console.log("\nDone. Feed the markdown straight into an LLM prompt.");
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error("An error occurred:", error);
    process.exit(1);
  });
