/*
 * Run a Temporal workflow whose activities capture pages with Steel.
 * https://github.com/steel-dev/steel-cookbook/tree/main/examples/temporal-browser-workflow-ts
 */

import "dotenv/config";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { Client, Connection } from "@temporalio/client";
import { NativeConnection, Worker } from "@temporalio/worker";
import Steel from "steel-sdk";
import {
  browserWorkflow,
  type BrowserWorkflowInput,
  type CapturePageInput,
  type PageCapture,
} from "./workflows";

const DEFAULT_TEMPORAL_ADDRESS = "localhost:7233";
const DEFAULT_NAMESPACE = "default";
const DEFAULT_TASK_QUEUE = "steel-browser-workflows-ts";
const DEFAULT_URLS = ["https://news.ycombinator.com", "https://example.com"];

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Set ${name} in .env before running this recipe`);
  }
  return value;
}

function readUrls(): string[] {
  const raw = process.env.TARGET_URLS;
  if (!raw) {
    return DEFAULT_URLS;
  }

  const urls = raw
    .split(",")
    .map((url) => url.trim())
    .filter(Boolean);

  return urls.length > 0 ? urls : DEFAULT_URLS;
}

function readLinkLimit(): number {
  const value = Number(process.env.LINK_LIMIT ?? 8);
  if (!Number.isInteger(value) || value < 1 || value > 25) {
    throw new Error("LINK_LIMIT must be an integer between 1 and 25");
  }
  return value;
}

function artifactBaseName(url: string): string {
  const hostname = new URL(url).hostname.replace(/[^a-z0-9-]/gi, "-");
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `${hostname}-${timestamp}`;
}

function markdownPreview(markdown: string): string {
  return markdown.replace(/\s+/g, " ").trim().slice(0, 800);
}

function toMarkdown(page: PageCapture, markdown: string): string {
  const links = page.links
    .map((link, index) => `${index + 1}. [${link.text}](${link.url})`)
    .join("\n");

  return [
    `# ${page.title || "Untitled page"}`,
    "",
    `Requested URL: ${page.url}`,
    `Final URL: ${page.finalUrl}`,
    `HTTP status: ${page.statusCode}`,
    `Screenshot URL: ${page.screenshotUrl}`,
    "",
    "## Markdown",
    "",
    markdown || "(no markdown returned)",
    "",
    "## Links",
    "",
    links || "(no links found)",
    "",
  ].join("\n");
}

async function download(url: string, dest: string): Promise<void> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download ${url}: HTTP ${response.status}`);
  }

  const data = Buffer.from(await response.arrayBuffer());
  await writeFile(dest, data);
}

function buildWorkflowInput(): BrowserWorkflowInput {
  return {
    urls: readUrls(),
    linkLimit: readLinkLimit(),
    fullPageScreenshot: process.env.FULL_PAGE_SCREENSHOT !== "false",
  };
}

export async function capturePage(input: CapturePageInput): Promise<PageCapture> {
  const startedAt = Date.now();
  const steel = new Steel({ steelAPIKey: requireEnv("STEEL_API_KEY") });
  const artifactDir = path.resolve(process.env.ARTIFACT_DIR ?? "artifacts");
  const requestedUrl = new URL(input.url).toString();

  const scraped = await steel.scrape({
    url: requestedUrl,
    format: ["markdown"],
  });

  const screenshot = await steel.screenshot({
    url: requestedUrl,
    fullPage: input.fullPageScreenshot,
  });

  const finalUrl =
    scraped.metadata.urlSource ?? scraped.metadata.canonical ?? requestedUrl;
  const markdown = scraped.content.markdown ?? "";
  const baseName = artifactBaseName(finalUrl);
  const screenshotPath = path.join(artifactDir, `${baseName}.png`);
  const markdownPath = path.join(artifactDir, `${baseName}.md`);

  const result: PageCapture = {
    url: requestedUrl,
    finalUrl,
    title: scraped.metadata.title ?? "(untitled)",
    statusCode: scraped.metadata.statusCode ?? 0,
    markdownPreview: markdownPreview(markdown),
    links: scraped.links.slice(0, input.linkLimit).map((link) => ({
      text: link.text || link.url,
      url: link.url,
    })),
    screenshotUrl: screenshot.url,
    artifacts: {
      screenshotPath,
      markdownPath,
    },
    durationMs: Date.now() - startedAt,
  };

  await mkdir(artifactDir, { recursive: true });
  await writeFile(markdownPath, toMarkdown(result, markdown), "utf8");
  await download(screenshot.url, screenshotPath);

  return result;
}

async function runWorkflow(client: Client, taskQueue: string): Promise<void> {
  const workflowId = `steel-browser-ts-${Date.now()}`;
  const input = buildWorkflowInput();

  const handle = await client.workflow.start(browserWorkflow, {
    taskQueue,
    workflowId,
    args: [input],
  });

  console.log(`Started Temporal workflow: ${handle.workflowId}`);
  console.log(`Target URLs: ${input.urls?.join(", ")}`);

  const result = await handle.result();

  console.log("Workflow result:");
  console.log(JSON.stringify(result, null, 2));
}

async function main() {
  const address = process.env.TEMPORAL_ADDRESS ?? DEFAULT_TEMPORAL_ADDRESS;
  const namespace = process.env.TEMPORAL_NAMESPACE ?? DEFAULT_NAMESPACE;
  const taskQueue = process.env.TEMPORAL_TASK_QUEUE ?? DEFAULT_TASK_QUEUE;

  const clientConnection = await Connection.connect({ address });
  const workerConnection = await NativeConnection.connect({ address });

  try {
    const client = new Client({
      connection: clientConnection,
      namespace,
    });

    const worker = await Worker.create({
      connection: workerConnection,
      namespace,
      taskQueue,
      workflowsPath: require.resolve("./workflows"),
      activities: {
        capturePage,
      },
    });

    await worker.runUntil(runWorkflow(client, taskQueue));
  } finally {
    clientConnection.close();
    workerConnection.close();
  }
}

main().catch((error) => {
  console.error("Temporal browser workflow failed:", error);
  process.exit(1);
});
