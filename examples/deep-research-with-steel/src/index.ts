#!/usr/bin/env node

/**
 * Quick-Start Entry Point
 * ----------------------
 * A minimal example showing how to use the DeepResearchAgent with the new
 * simplified configuration approach. When executed directly, it will:
 *   1. Read STEEL_API_KEY from environment
 *   2. Create DeepResearchAgent with explicit config (no AI models = fallback mode)
 *   3. Attach simple console log hooks for progress and tool usage
 *   4. Run a single-iteration research query and print the report
 *
 * For production usage with real AI models:
 *   - Import AI SDK providers: `import { openai } from '@ai-sdk/openai'`
 *   - Pass models in config: `aiProvider: openai('gpt-4o-mini')`
 *   - Or use task-specific models via the `models` field
 *
 * The full-featured interactive interface is still available via the CLI in
 * `src/cli.ts` (e.g. `npm run cli` or `npm run dev`).
 */

import { DeepResearchAgent } from "./core/DeepResearchAgent";
import { ResearchOptions } from "./core/interfaces";
import { openai } from "@ai-sdk/openai";
// import { anthropic } from '@ai-sdk/anthropic';
import { config } from "dotenv";

config();

/**
 * Execute a minimal research session and print the report.
 */
export async function quickStart(): Promise<void> {
  // ----- 1 & 2. Create agent (requires explicit config now) ---------------
  const steelApiKey = process.env.STEEL_API_KEY;
  if (!steelApiKey) {
    throw new Error("STEEL_API_KEY environment variable is required");
  }

  // Create minimal config - AI models will be null/fallback (for demo purposes)
  // In production, you'd pass actual AI SDK models like openai('gpt-4o-mini')
  const agent = new DeepResearchAgent({
    steelApiKey,
    aiProvider: openai("gpt-4o-mini"),
    research: { maxSources: 100, summaryTokens: 750 },
  });

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
  const options: ResearchOptions = { depth: 2, breadth: 1, timeout: 30000 };

  const report = await agent.research(prompt, options);

  // Newline for readability if streaming output didn’t finish with one.
  console.log(
    "\n\n==================== QUICK-START REPORT ====================\n"
  );
  console.log("EXECUTIVE SUMMARY \n");
  console.log(report.executiveSummary);
  console.log("----------------------------------\n");
  console.log("\nCONTENT \n");
  console.log(report.content);
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
