/*
 * Durable browser capture workflow with Temporal and Steel.
 * https://github.com/steel-dev/steel-cookbook/tree/main/examples/temporal-browser-workflow-ts
 */

import { proxyActivities } from "@temporalio/workflow";

export type BrowserWorkflowInput = {
  urls?: string[];
  linkLimit?: number;
  fullPageScreenshot?: boolean;
};

export type CapturePageInput = {
  url: string;
  linkLimit: number;
  fullPageScreenshot: boolean;
};

export type PageLink = {
  text: string;
  url: string;
};

export type PageCapture = {
  url: string;
  finalUrl: string;
  title: string;
  statusCode: number;
  markdownPreview: string;
  links: PageLink[];
  screenshotUrl: string;
  artifacts: {
    screenshotPath: string;
    markdownPath: string;
  };
  durationMs: number;
};

export type BrowserWorkflowResult = {
  pages: PageCapture[];
  pageCount: number;
};

type Activities = {
  capturePage(input: CapturePageInput): Promise<PageCapture>;
};

const { capturePage } = proxyActivities<Activities>({
  startToCloseTimeout: "2 minutes",
  retry: {
    initialInterval: "5 seconds",
    maximumInterval: "30 seconds",
    backoffCoefficient: 2,
    maximumAttempts: 3,
  },
});

function clampLinkLimit(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 8;
  }

  return Math.max(1, Math.min(Math.trunc(value), 25));
}

export async function browserWorkflow(
  input: BrowserWorkflowInput = {}
): Promise<BrowserWorkflowResult> {
  const urls =
    input.urls && input.urls.length > 0
      ? input.urls
      : ["https://news.ycombinator.com", "https://example.com"];
  const linkLimit = clampLinkLimit(input.linkLimit);
  const fullPageScreenshot = input.fullPageScreenshot ?? true;
  const pages: PageCapture[] = [];

  for (const url of urls.slice(0, 10)) {
    pages.push(
      await capturePage({
        url,
        linkLimit,
        fullPageScreenshot,
      })
    );
  }

  return {
    pages,
    pageCount: pages.length,
  };
}
