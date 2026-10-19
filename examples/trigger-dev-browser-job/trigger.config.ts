/*
 * Trigger.dev configuration for running Steel browser jobs.
 * https://github.com/steel-dev/steel-cookbook/tree/main/examples/trigger-dev-browser-job
 */

import "dotenv/config";
import { defineConfig } from "@trigger.dev/sdk";

export default defineConfig({
  project: process.env.TRIGGER_PROJECT_REF ?? "proj_your_project_ref",
  dirs: ["./src/trigger"],
  runtime: "node",
  logLevel: "log",
  maxDuration: 300,
  retries: {
    enabledInDev: true,
    default: {
      maxAttempts: 3,
      minTimeoutInMs: 1000,
      maxTimeoutInMs: 30000,
      factor: 2,
      randomize: true,
    },
  },
});
