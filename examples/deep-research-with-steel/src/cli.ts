#!/usr/bin/env node

/**
 * Deep Research Agent - Beautiful CLI Interface
 * Inspired by Charm's design philosophy
 */

import { config } from "dotenv";
import { program } from "commander";
import chalk from "chalk";
import ora from "ora";
import inquirer from "inquirer";
import boxen from "boxen";
import gradient from "gradient-string";
import figures from "figures";
import { DeepResearchAgent } from "./core/DeepResearchAgent";
import { ResearchOptions } from "./core/interfaces";
import { openai } from "@ai-sdk/openai";

// Load environment variables
config();

// CLI Theme
const theme = {
  primary: "#8B5CF6",
  secondary: "#06B6D4",
  success: "#10B981",
  error: "#EF4444",
  text: "#E5E7EB",
  dim: "#6B7280",
};

const titleGradient = gradient([theme.primary, theme.secondary]);

function displayWelcome(): void {
  console.clear();
  console.log(
    titleGradient(`
  ╔═══════════════════════════════════════════════════════════════════════════╗
  ║                         🔍 DEEP RESEARCH AGENT                            ║
  ║                    Autonomous AI Research with Steel                      ║
  ╚═══════════════════════════════════════════════════════════════════════════╝
  `)
  );

  console.log(
    boxen(
      chalk.hex(theme.text)(`✨ Research • Analyze • Synthesize • Report`),
      {
        padding: 1,
        margin: 1,
        borderStyle: "round",
        borderColor: theme.primary,
        align: "center",
      }
    )
  );
}

async function promptForQuery(): Promise<{
  query: string;
  depth: number;
  breadth: number;
}> {
  const answers = await inquirer.prompt([
    {
      type: "input",
      name: "query",
      message: chalk.hex(theme.text)("🤔 What would you like to research?"),
      validate: (input: string) =>
        input.trim() ? true : "Please enter a research query",
    },
    {
      type: "list",
      name: "depth",
      message: chalk.hex(theme.text)("📊 Research depth:"),
      choices: [
        { name: "Quick (1 iteration)", value: 1 },
        { name: "Standard (2 iterations)", value: 2 },
        { name: "Deep (3 iterations) - Recommended", value: 3 },
        { name: "Thorough (4 iterations)", value: 4 },
      ],
      default: 2,
    },
    {
      type: "list",
      name: "breadth",
      message: chalk.hex(theme.text)("🔍 Search breadth:"),
      choices: [
        { name: "Focused (3 queries)", value: 3 },
        { name: "Balanced (5 queries) - Recommended", value: 5 },
        { name: "Comprehensive (7 queries)", value: 7 },
      ],
      default: 1,
    },
  ]);

  return answers;
}

function setupProgressDisplay(agent: DeepResearchAgent): void {
  let currentSpinner: ReturnType<typeof ora> | null = null;
  let strategicPlanBuffer = "";
  let isBufferingPlan = false;

  agent.on("progress", (progress) => {
    if (currentSpinner) currentSpinner.stop();

    const percentage = Math.round(progress.progress || 0);
    const filled = Math.round(percentage / 5);
    const empty = 20 - filled;
    const progressBar =
      chalk.hex(theme.success)("█".repeat(filled)) +
      chalk.hex(theme.dim)("░".repeat(empty));

    const currentStep = progress.currentStep || "Processing";

    currentSpinner = ora({
      text: chalk.hex(theme.text)(
        `${currentStep} ${progressBar} ${percentage}%`
      ),
      color: "cyan",
    }).start();
  });

  agent.on("tool-call", (toolCall) => {
    if (currentSpinner) currentSpinner.stop();

    const icon =
      toolCall.toolName === "search"
        ? "🔍"
        : toolCall.toolName === "scrape"
        ? "📄"
        : toolCall.toolName === "analyze"
        ? "🧠"
        : "🔧";

    let message = "";

    if (toolCall.toolName === "analyze" && toolCall.input?.action) {
      const action = toolCall.input.action;
      switch (action) {
        case "initial_planning":
          message = "Creating research plan";
          break;
        case "strategic_planning":
          message = "Developing strategic approach";
          break;
        case "query_extraction":
          message = "Extracting search queries";
          break;
        case "refined_strategic_planning":
          message = "Refining strategy based on findings";
          break;
        case "plan_refinement":
          message = "Updating research plan";
          break;
        case "early_termination":
          message = "Terminating research early";
          break;
        case "continue_research":
          message = "Continuing research";
          break;
        case "proceed_to_synthesis":
          message = "Proceeding to synthesis";
          break;
        default:
          message = `Analyzing: ${action}`;
      }
    } else if (toolCall.input?.query) {
      message = `Searching: "${toolCall.input.query}"`;
    } else if (toolCall.input?.url) {
      message = `Scraping: ${toolCall.input.url}`;
    } else {
      message = `Using ${toolCall.toolName}`;
    }

    currentSpinner = ora({
      text: chalk.hex(theme.text)(`${icon} ${message}`),
      color: "blue",
    }).start();
  });

  agent.on("tool-result", (result) => {
    if (currentSpinner) {
      let message = "";

      if (result.toolName === "analyze" && result.output?.metadata?.action) {
        const action = result.output.metadata.action;
        switch (action) {
          case "initial_planning":
            message = `Created plan with ${
              result.output.metadata.queryCount || 0
            } queries`;
            break;
          case "strategic_planning":
            message = `Strategic approach developed`;
            break;
          case "query_extraction":
            message = `Extracted ${
              result.output.metadata.queryCount || 0
            } queries`;
            break;
          case "refined_strategic_planning":
            message = `Strategy refined`;
            break;
          case "plan_refinement":
            message = `Plan updated with ${
              result.output.metadata.queryCount || 0
            } queries`;
            break;
          default:
            message = `Analysis completed`;
        }
      } else if (result.toolName === "search") {
        message = `Found ${result.output?.resultCount || 0} results`;
      } else if (result.toolName === "scrape") {
        message = `Scraped ${result.output?.contentLength || 0} characters`;
      } else {
        message = `${result.toolName} completed`;
      }

      if (result.success) {
        currentSpinner.succeed(chalk.hex(theme.success)(message));
      } else {
        currentSpinner.fail(
          chalk.hex(theme.error)(`${result.toolName} failed: ${result.error}`)
        );
      }
      currentSpinner = null;
    }
  });

  // Helper function to display strategic plan in a viewport
  function displayStrategicPlanViewport(planText: string): void {
    const lines = planText.split("\n").filter((line) => line.trim());
    const maxHeight = 12; // Maximum lines to show in viewport
    const maxWidth = 80; // Maximum width per line

    // Process lines to fit viewport
    const processedLines: string[] = [];
    lines.forEach((line) => {
      // Remove color codes for length calculation
      const cleanLine = line.replace(/\u001b\[[0-9;]*m/g, "");

      if (cleanLine.length <= maxWidth) {
        processedLines.push(line);
      } else {
        // Word wrap long lines
        const words = cleanLine.split(" ");
        let currentLine = "";

        words.forEach((word) => {
          if ((currentLine + word).length <= maxWidth) {
            currentLine += (currentLine ? " " : "") + word;
          } else {
            if (currentLine) processedLines.push(currentLine);
            currentLine = word;
          }
        });

        if (currentLine) processedLines.push(currentLine);
      }
    });

    // Determine what to show
    let displayLines: string[];
    let hasMore = false;

    if (processedLines.length <= maxHeight) {
      displayLines = processedLines;
    } else {
      displayLines = processedLines.slice(0, maxHeight - 1);
      hasMore = true;
    }

    // Build viewport content
    let viewportContent = displayLines.join("\n");

    if (hasMore) {
      const hiddenCount = processedLines.length - displayLines.length;
      viewportContent +=
        "\n" +
        chalk.hex(theme.dim)(
          `... ${hiddenCount} more lines (truncated for display)`
        );
    }

    // Display in a styled box
    console.log(
      "\n" +
        boxen(viewportContent, {
          title: chalk.hex(theme.secondary)(" 📋 Strategic Plan "),
          titleAlignment: "center",
          padding: 1,
          margin: { top: 0, bottom: 1, left: 2, right: 2 },
          borderStyle: "round",
          borderColor: theme.secondary,
          backgroundColor: "#1a1a1a",
        })
    );

    if (hasMore) {
      console.log(
        chalk.hex(theme.dim)(
          "   💡 Full plan details logged for AI processing\n"
        )
      );
    }
  }

  agent.on("text", (text) => {
    if (currentSpinner) {
      currentSpinner.stop();
      currentSpinner = null;
    }

    // Handle strategic plan text with viewport
    if (
      text.includes("📋 Strategic Research Plan:") ||
      text.includes("🔄 Refined Strategic Plan:") ||
      text.includes("🎯 Strategic Plan (Based on Guidance):")
    ) {
      isBufferingPlan = true;
      strategicPlanBuffer = text;
    } else if (isBufferingPlan) {
      // Continue buffering until we see the end of the plan
      strategicPlanBuffer += text;

      // Check if this is the end of the plan - look for double newlines which indicate completion
      // Also check for new plan headers to avoid missing transitions
      if (
        text === "\n\n" || // This is what QueryPlanner emits after the plan
        text.includes("🔄 Refined Strategic Plan:") ||
        text.includes("📋 Strategic Research Plan:") ||
        text.includes("🎯 Strategic Plan (Based on Guidance):")
      ) {
        // Display the buffered plan in viewport
        displayStrategicPlanViewport(strategicPlanBuffer);

        // Reset buffer
        strategicPlanBuffer = "";
        isBufferingPlan = false;

        // If this text starts a new plan, start buffering again
        if (
          text.includes("📋 Strategic Research Plan:") ||
          text.includes("🔄 Refined Strategic Plan:") ||
          text.includes("🎯 Strategic Plan (Based on Guidance):")
        ) {
          isBufferingPlan = true;
          strategicPlanBuffer = text;
        }
      }
    } else {
      // Regular text output for non-plan content
      process.stdout.write(chalk.hex(theme.text)(text));
    }
  });

  agent.on("done", () => {
    // Flush any remaining strategic plan buffer
    if (isBufferingPlan && strategicPlanBuffer.trim()) {
      displayStrategicPlanViewport(strategicPlanBuffer);
      strategicPlanBuffer = "";
      isBufferingPlan = false;
    }

    if (currentSpinner) {
      currentSpinner.succeed(
        chalk.hex(theme.success)("✨ Research completed!")
      );
    }
  });
}

function displayReport(report: any): void {
  console.log("\n");
  console.log(
    boxen(chalk.hex(theme.primary)("🎯 Research Report"), {
      padding: 1,
      margin: 1,
      borderStyle: "round",
      borderColor: theme.primary,
      align: "center",
    })
  );

  console.log(chalk.hex(theme.secondary)("\n📋 Executive Summary:"));
  console.log(chalk.hex(theme.text)(report.executiveSummary));

  console.log(chalk.hex(theme.secondary)("\n📊 Statistics:"));
  console.log(
    `  ${chalk.hex(theme.dim)("Sources:")} ${chalk.hex(theme.text)(
      report.citations?.length || 0
    )}`
  );
  console.log(
    `  ${chalk.hex(theme.dim)("Learnings:")} ${chalk.hex(theme.text)(
      report.learnings?.length || 0
    )}`
  );

  console.log(chalk.hex(theme.success)("\n📄 Full Report:"));
  console.log(chalk.hex(theme.text)(report.content));

  if (report.citations && report.citations.length > 0) {
    console.log(chalk.hex(theme.secondary)("\n🔗 Sources:"));
    report.citations.forEach((citation: any, index: number) => {
      console.log(
        `  ${chalk.hex(theme.dim)(`[${index + 1}]`)} ${chalk.hex(theme.text)(
          citation.title || "Untitled"
        )}`
      );
      console.log(`      ${chalk.hex(theme.dim)(citation.url)}`);
    });
  }
}

async function executeResearch(
  query: string,
  depth: number,
  breadth: number
): Promise<void> {
  try {
    const steelApiKey = process.env.STEEL_API_KEY;
    if (!steelApiKey) {
      throw new Error("STEEL_API_KEY environment variable is required");
    }

    const openaiKey = process.env.OPENAI_API_KEY;
    if (!openaiKey) {
      throw new Error("OPENAI_API_KEY environment variable is required");
    }

    const agent = new DeepResearchAgent({
      steelApiKey,
      aiProvider: openai("gpt-4o-mini"),
      research: {
        timeout: 30000,
        maxSources: 60,
        summaryTokens: 500,
        retryAttempts: 3,
      },
    });

    setupProgressDisplay(agent);

    console.log(
      boxen(
        `${chalk.hex(theme.primary)("🔍 Query:")} ${chalk.hex(theme.text)(
          query
        )}\n` +
          `${chalk.hex(theme.secondary)("📊 Depth:")} ${chalk.hex(theme.text)(
            depth
          )} iterations\n` +
          `${chalk.hex(theme.secondary)("🔍 Breadth:")} ${chalk.hex(theme.text)(
            breadth
          )} queries per iteration`,
        {
          padding: 1,
          margin: 1,
          borderStyle: "round",
          borderColor: theme.primary,
        }
      )
    );

    const researchOptions: ResearchOptions = {
      depth,
      breadth,
      timeout: 30000,
      includeImages: false,
      humanInTheLoop: false,
    };

    const report = await agent.research(query, researchOptions);
    displayReport(report);
  } catch (error) {
    console.log(chalk.hex(theme.error)("\n❌ Research failed:"));
    console.log(
      chalk.hex(theme.error)(
        error instanceof Error ? error.message : String(error)
      )
    );
    process.exit(1);
  }
}

async function main(): Promise<void> {
  displayWelcome();

  program
    .name("deep-research")
    .description("🔍 Deep Research Agent with Steel")
    .version("1.0.0")
    .argument("[query]", "Research query")
    .option("-d, --depth <number>", "Research depth (1-5)", "3")
    .option("-b, --breadth <number>", "Research breadth (1-10)", "5")
    .option("-i, --interactive", "Interactive mode")
    .parse();

  const options = program.opts();
  const query = program.args[0];

  if (options.interactive || !query) {
    const answers = await promptForQuery();
    await executeResearch(answers.query, answers.depth, answers.breadth);
  } else {
    await executeResearch(
      query,
      parseInt(options.depth),
      parseInt(options.breadth)
    );
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(chalk.hex(theme.error)("❌ Fatal error:"), error);
    process.exit(1);
  });
}

export { main };
