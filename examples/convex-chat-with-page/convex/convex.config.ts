// https://github.com/steel-dev/steel-cookbook/tree/main/examples/convex-chat-with-page
// ABOUTME: Mounts the Steel browser and Agent components so their tables and
// ABOUTME: actions are reachable from app code via ctx and components.*.

import { defineApp } from "convex/server";
import steel from "@steel-dev/convex/convex.config";
import agent from "@convex-dev/agent/convex.config";

const app = defineApp();
app.use(steel);
app.use(agent);

export default app;
