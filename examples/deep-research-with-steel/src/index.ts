#!/usr/bin/env node

/**
 * Deep Research Agent with Steel - Main Entry Point
 *
 * Beautiful CLI interface for autonomous AI research
 */

import { main as runCLI } from "./cli";

// Re-export CLI main function
export { runCLI as main };

// Execute CLI if called directly
if (require.main === module) {
  runCLI().catch((error) => {
    console.error("❌ Fatal error:", error);
    process.exit(1);
  });
}
