#!/usr/bin/env node

/**
 * Quick-Start Entry Point
 * ----------------------
 * A minimal example that shows how to use the DeepResearchAgent with a single
 * provider.  When this file is executed directly (`node dist/index.js` after
 * building, or `ts-node src/index.ts` during development) it will:
 *   1. Load configuration (expects STEEL_API_KEY and one AI provider key).
 *   2. Instantiate the DeepResearchAgent.
 *   3. Attach simple console log hooks for progress, tool usage and text
 *      streaming.
 *   4. Run a single-iteration research query and print the resulting report.
 *
 * The full-featured interactive interface is still available via the CLI in
 * `src/cli.ts` (e.g. `npm run cli` or `npm run dev`).
 */

import { DeepResearchAgent } from "./core/DeepResearchAgent";
import { ResearchOptions } from "./core/interfaces";

/**
 * Execute a minimal research session and print the report.
 */
export async function quickStart(): Promise<void> {
  // ----- 1 & 2. Create agent (auto-configures from environment) ------------
  const agent = new DeepResearchAgent();

  // ----- 3. Attach simple logging hooks ------------------------------------
  agent.on("progress", (progress: any) => {
    const pct = Math.round(progress.progress || 0);
    const step = progress.currentStep || progress.phase || "processing";
    console.log(`[progress] ${step}: ${pct}%`);
  });

  agent.on("tool-call", (call: any) => {
    console.log(`[tool] → ${call.toolName}`);
  });

  agent.on("tool-result", (res: any) => {
    const status = res.success ? "✔" : "✖";
    console.log(`[tool] ${status} ${res.toolName}`);
  });

  // Stream generated text directly to stdout for a nice live experience
  agent.on("text", (text: string) => process.stdout.write(text));

  // ----- 4. Run research ----------------------------------------------------
  const prompt = "Explain quantum computing in simple terms.";
  const options: ResearchOptions = { depth: 1, breadth: 3, timeout: 30000 };

  const report = await agent.research(prompt, options);

  // Newline for readability if streaming output didn’t finish with one.
  console.log(
    "\n\n==================== QUICK-START REPORT ====================\n"
  );
  console.log(report.executiveSummary || report.content);
  console.log(
    "\n============================================================\n"
  );
}

// If the file is run directly via `node`/`ts-node`, execute quickStart.
if (require.main === module) {
  quickStart().catch((err) => {
    console.error("❌ Quick-start failed:", err);
    process.exit(1);
  });
}
