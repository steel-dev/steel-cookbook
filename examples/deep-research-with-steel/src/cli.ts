#!/usr/bin/env node

/**
 * Deep Research Agent - Beautiful CLI Interface
 * Inspired by Charm's design philosophy
 */

import { program } from "commander";
import chalk from "chalk";
import ora from "ora";
import inquirer from "inquirer";
import boxen from "boxen";
import gradient from "gradient-string";
import figures from "figures";
import { loadConfig } from "./config";
import { DeepResearchAgent } from "./core/DeepResearchAgent";
import { ResearchOptions } from "./core/interfaces";

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

  agent.on("progress", (progress) => {
    if (currentSpinner) currentSpinner.stop();

    const percentage = Math.round(progress.progress);
    const filled = Math.round(percentage / 5);
    const empty = 20 - filled;
    const progressBar =
      chalk.hex(theme.success)("█".repeat(filled)) +
      chalk.hex(theme.dim)("░".repeat(empty));

    currentSpinner = ora({
      text: chalk.hex(theme.text)(
        `${progress.currentStep} ${progressBar} ${percentage}%`
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
        : "🧠";
    const message = toolCall.query
      ? `Searching: "${toolCall.query}"`
      : `Using ${toolCall.toolName}`;

    currentSpinner = ora({
      text: chalk.hex(theme.text)(`${icon} ${message}`),
      color: "blue",
    }).start();
  });

  agent.on("tool-result", (result) => {
    if (currentSpinner) {
      const message =
        result.toolName === "search"
          ? `Found ${result.resultCount || 0} results`
          : `${result.toolName} completed`;

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

  agent.on("text", (text) => {
    if (currentSpinner) {
      currentSpinner.stop();
      currentSpinner = null;
    }
    process.stdout.write(chalk.hex(theme.text)(text));
  });

  agent.on("done", () => {
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
      report.citations.length
    )}`
  );
  console.log(
    `  ${chalk.hex(theme.dim)("Learnings:")} ${chalk.hex(theme.text)(
      report.learnings.length
    )}`
  );

  console.log(chalk.hex(theme.success)("\n📄 Full Report:"));
  console.log(chalk.hex(theme.text)(report.content));

  if (report.citations.length > 0) {
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
    const config = loadConfig();
    const agent = new DeepResearchAgent(config);

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
