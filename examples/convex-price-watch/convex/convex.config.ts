// https://github.com/steel-dev/steel-cookbook/tree/main/examples/convex-price-watch
// ABOUTME: Mounts the Steel browser component so the scraper can reach
// ABOUTME: steel.steel.scrape with proxy support.

import { defineApp } from "convex/server";
import steel from "@steel-dev/convex/convex.config";

const app = defineApp();
app.use(steel);

export default app;
