// https://github.com/steel-dev/steel-cookbook/tree/main/examples/convex-price-watch
// ABOUTME: Runs captureAll every 10 minutes so the dashboard shows live
// ABOUTME: price movement without the user clicking "Snapshot now".

import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval(
  "price snapshot",
  { minutes: 10 },
  internal.scraper.captureAll,
);

export default crons;
