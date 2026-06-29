/*
 * Enqueue the Steel browser job from a local script.
 * https://github.com/steel-dev/steel-cookbook/tree/main/examples/trigger-dev-browser-job
 */

import "dotenv/config";
import { tasks } from "@trigger.dev/sdk/v3";
import type { browserJob } from "./src/trigger/browser-job";

const DEFAULT_TARGET_URL = "https://news.ycombinator.com";

function readLinkLimit() {
  const value = Number(process.env.LINK_LIMIT ?? 8);
  if (!Number.isInteger(value) || value < 1 || value > 25) {
    throw new Error("LINK_LIMIT must be an integer between 1 and 25");
  }
  return value;
}

async function main() {
  const targetUrl = process.env.TARGET_URL ?? DEFAULT_TARGET_URL;
  const linkLimit = readLinkLimit();

  const handle = await tasks.trigger<typeof browserJob>("steel-browser-job", {
    targetUrl,
    linkLimit,
    fullPageScreenshot: true,
  });

  console.log(`Queued Trigger.dev run: ${handle.id}`);
  console.log("Open the Trigger.dev dashboard to watch logs and task output.");
}

main().catch((error) => {
  console.error("Failed to enqueue browser job:", error);
  process.exit(1);
});
