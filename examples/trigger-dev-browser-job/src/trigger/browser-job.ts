/*
 * Run a Steel browser workflow as a Trigger.dev background job.
 * https://github.com/steel-dev/steel-cookbook/tree/main/examples/trigger-dev-browser-job
 */

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { logger, task } from "@trigger.dev/sdk/v3";
import { chromium, type Browser } from "playwright";
import Steel from "steel-sdk";
import { z } from "zod";

const payloadSchema = z.object({
  targetUrl: z.string().url().default("https://news.ycombinator.com"),
  linkLimit: z.number().int().min(1).max(25).default(8),
  fullPageScreenshot: z.boolean().default(true),
});

type BrowserJobPayload = z.input<typeof payloadSchema>;

type PageLink = {
  text: string;
  href: string;
};

type PageSummary = {
  title: string;
  finalUrl: string;
  textPreview: string;
  links: PageLink[];
};

function requireEnv(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Set ${name} before running this task`);
  }
  return value;
}

function artifactBaseName() {
  return `browser-job-${new Date().toISOString().replace(/[:.]/g, "-")}`;
}

function toMarkdown(summary: PageSummary) {
  const links = summary.links
    .map((link, index) => `${index + 1}. [${link.text}](${link.href})`)
    .join("\n");

  return [
    `# ${summary.title || "Untitled page"}`,
    "",
    `URL: ${summary.finalUrl}`,
    "",
    "## Text preview",
    "",
    summary.textPreview || "(no visible text)",
    "",
    "## Links",
    "",
    links || "(no links found)",
    "",
  ].join("\n");
}

export const browserJob = task({
  id: "steel-browser-job",
  maxDuration: 300,
  retry: {
    maxAttempts: 3,
    minTimeoutInMs: 3000,
    maxTimeoutInMs: 30000,
    factor: 2,
    randomize: true,
  },
  queue: {
    concurrencyLimit: 2,
  },
  run: async (rawPayload: BrowserJobPayload) => {
    const payload = payloadSchema.parse(rawPayload ?? {});
    const steelApiKey = requireEnv("STEEL_API_KEY");
    const artifactDir = path.resolve(process.env.ARTIFACT_DIR ?? "artifacts");
    const startedAt = Date.now();

    const steel = new Steel({
      steelAPIKey: steelApiKey,
    });

    let session: Awaited<ReturnType<typeof steel.sessions.create>> | undefined;
    let browser: Browser | undefined;

    try {
      logger.info("Creating Steel session", {
        targetUrl: payload.targetUrl,
      });

      session = await steel.sessions.create({
        blockAds: true,
        sessionTimeout: 600000,
      });

      logger.info("Steel session ready", {
        sessionId: session.id,
        liveView: session.sessionViewerUrl,
      });

      browser = await chromium.connectOverCDP(
        `${session.websocketUrl}&apiKey=${steelApiKey}`
      );

      const context = browser.contexts()[0];
      if (!context) {
        throw new Error("Steel CDP connection did not expose a browser context");
      }

      const page = context.pages()[0] ?? (await context.newPage());

      await page.goto(payload.targetUrl, {
        waitUntil: "domcontentloaded",
        timeout: 60000,
      });

      await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {
        logger.warn("Page did not reach networkidle before extraction");
      });

      const summary = await page.evaluate((limit) => {
        const textPreview = document.body.innerText
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 800);

        const links = Array.from(
          document.querySelectorAll<HTMLAnchorElement>("a[href]")
        )
          .slice(0, limit)
          .map((anchor) => ({
            text: anchor.innerText.replace(/\s+/g, " ").trim() || anchor.href,
            href: anchor.href,
          }));

        return {
          title: document.title,
          finalUrl: location.href,
          textPreview,
          links,
        };
      }, payload.linkLimit);

      await mkdir(artifactDir, { recursive: true });

      const baseName = artifactBaseName();
      const screenshotPath = path.join(artifactDir, `${baseName}.png`);
      const markdownPath = path.join(artifactDir, `${baseName}.md`);

      await page.screenshot({
        path: screenshotPath,
        fullPage: payload.fullPageScreenshot,
      });

      await writeFile(markdownPath, toMarkdown(summary), "utf8");

      const hostedScreenshot = await steel.screenshot({
        url: summary.finalUrl,
        fullPage: payload.fullPageScreenshot,
      });

      logger.info("Browser job finished", {
        title: summary.title,
        linkCount: summary.links.length,
        screenshotPath,
        hostedScreenshot: hostedScreenshot.url,
      });

      return {
        title: summary.title,
        finalUrl: summary.finalUrl,
        linkCount: summary.links.length,
        sessionId: session.id,
        sessionViewerUrl: session.sessionViewerUrl,
        artifacts: {
          hostedScreenshotUrl: hostedScreenshot.url,
          localScreenshotPath: screenshotPath,
          localMarkdownPath: markdownPath,
        },
        links: summary.links,
        durationMs: Date.now() - startedAt,
      };
    } finally {
      if (browser) {
        await browser.close().catch((error) => {
          logger.warn("Failed to close Playwright connection", { error });
        });
      }

      if (session) {
        await steel.sessions.release(session.id).catch((error) => {
          logger.error("Failed to release Steel session", {
            sessionId: session?.id,
            error,
          });
        });
      }
    }
  },
});
