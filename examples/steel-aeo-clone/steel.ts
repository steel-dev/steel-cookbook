import {
  chromium,
  type Browser,
  type Page,
  type Locator,
  type ElementHandle,
} from "playwright";
import Steel from "steel-sdk";

export const DefaultSelectors = {
  input: [
    'textarea[placeholder*="Message"]',
    'textarea[placeholder*="Ask"]',
    'input[placeholder*="Ask"]',
    'textarea[aria-label*="Message"]',
    "textarea",
    'input[type="text"]',
    '[contenteditable="true"]',
    '[role="textbox"]',
    "[name='q']",
    "#prompt",
  ],
  output: [
    // app-level containers
    'main[role="main"]',
    '[role="main"]',
    "main",
    "article",
    "section",
    // common content containers
    ".markdown",
    ".prose",
    ".result",
    "[data-testid*='result']",
    "[data-testid*='conversation']",
    // some SPAs
    "#__next main",
    "#root main",
  ],
};

export type RunSiteQueryParams = {
  url: string;
  query: string;
  inputSelectors?: string[];
  outputSelectors?: string[];
  navigationTimeoutMs?: number; // default 45s
  responseTimeoutMs?: number; // default 120s
  userAgent?: string;
};

export type RunSiteQueryResult = {
  success: boolean;
  url: string;
  responseText?: string;
  durationMs: number;
  error?: string;
};

export async function runSiteQuery(
  params: RunSiteQueryParams,
): Promise<RunSiteQueryResult> {
  const t0 = Date.now();

  const url = params.url;
  const query = params.query;
  const inputSelectors = params.inputSelectors?.length
    ? params.inputSelectors
    : DefaultSelectors.input;
  const outputSelectors = params.outputSelectors?.length
    ? params.outputSelectors
    : DefaultSelectors.output;

  const navigationTimeoutMs =
    typeof params.navigationTimeoutMs === "number" &&
    params.navigationTimeoutMs > 0
      ? params.navigationTimeoutMs
      : 30_000;

  const responseTimeoutMs =
    typeof params.responseTimeoutMs === "number" && params.responseTimeoutMs > 0
      ? params.responseTimeoutMs
      : 60_000;

  let browser: Browser | null = null;
  let client: Steel | null = null;
  let page: Page | null = null;
  let session: Steel.Sessions.Session | null = null;

  try {
    client = new Steel();
    ({ browser, page, session } = await createBrowserAndPage(client));

    // Navigate
    await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: navigationTimeoutMs,
    });

    // Some sites show consent/popups; attempt to dismiss common ones (best-effort).
    // await bestEffortDismissPopups(page);

    // Find an input element and submit the query
    const input = await findFirstExisting(page, inputSelectors, 20_000);
    if (!input) {
      throw new Error(
        `Failed to locate any input field. Tried selectors: ${inputSelectors.slice(0, 5).join(", ")}${inputSelectors.length > 5 ? "..." : ""}`,
      );
    }

    // Try multiple strategies to send the query
    await sendQueryToInput(page, input, query);

    // await dismissForms(page);
    // Wait for a response in any matching output container; poll and collect
    const { text } = await waitForResponseContent(
      page,
      outputSelectors,
      responseTimeoutMs,
    );

    return {
      success: true,
      url,
      responseText: text,
      durationMs: Date.now() - t0,
    };
  } catch (err: any) {
    return {
      success: false,
      url,
      error: String(err?.message || err),
      durationMs: Date.now() - t0,
    };
  } finally {
    if (session) {
      await browser?.close();
      await client?.sessions.release(session.id);
    }
  }
}

async function createBrowserAndPage(client: Steel): Promise<{
  browser: Browser;
  page: Page;
  session: Steel.Sessions.Session | null;
}> {
  const session = await client.sessions.create({
    timeout: 90000,
  });
  const browser = await chromium.connectOverCDP(
    `wss://connect.steel.dev?apiKey=${process.env.STEEL_API_KEY}&sessionId=${session.id}`,
  );
  const currentContext = browser.contexts()[0];

  const page = currentContext.pages()[0];

  return { browser, page, session };
}

async function dismissForms(page: Page) {
  // Simple best-effort dismissals, non-blocking
  const metaAgeForm = `//div[@role="button"][.//span[contains(text(), 'Year')]]`;
  const el = await page.$(metaAgeForm);
  if (el) {
    await el.click({ timeout: 500 }).catch(() => undefined);
  }

  const candidates = [
    'a:has-text("Stay logged out")',
    'span:has-text("Stay logged out")',
    'button:has-text("I agree")',
    'button:has-text("Accept")',
    'button:has-text("Agree")',
    'button:has-text("Okay")',
    'button:has-text("Got it")',
    'button[aria-label*="close" i]',
    '[role="dialog"] button:has-text("Close")',
  ];
  for (const sel of candidates) {
    try {
      const el = await page.$(sel);
      if (el) {
        await el.click({ timeout: 500 }).catch(() => undefined);
      }
    } catch {
      // ignore
    }
  }
}

async function bestEffortDismissPopups(page: Page) {
  // Simple best-effort dismissals, non-blocking
  const candidates = [
    'button:has-text("I agree")',
    'a:has-text("Stay logged out")',
    'button:has-text("Accept")',
    'button:has-text("Agree")',
    'button:has-text("Okay")',
    'button:has-text("Got it")',
    'button[aria-label*="close" i]',
    '[role="dialog"] button:has-text("Close")',
  ];
  for (const sel of candidates) {
    try {
      const el = await page.$(sel);
      if (el) {
        await el.click({ timeout: 500 }).catch(() => undefined);
      }
    } catch {
      // ignore
    }
  }
}

async function findFirstExisting(
  page: Page,
  selectors: string[],
  overallTimeoutMs: number,
): Promise<ElementHandle<Element> | null> {
  const start = Date.now();
  const stepTimeout = 2_000;
  for (const selector of selectors) {
    const remaining = Math.max(0, overallTimeoutMs - (Date.now() - start));
    if (remaining <= 0) break;
    try {
      const handle = await page.waitForSelector(selector, {
        timeout: Math.min(stepTimeout, remaining),
        state: "visible",
      });
      if (handle) return handle as any;
    } catch {
      // continue
    }
  }
  return null;
}

async function sendQueryToInput(
  page: Page,
  handle: ElementHandle<Element>,
  query: string,
) {
  const tag = await page.evaluate((el) => el.tagName.toLowerCase(), handle);
  const isContentEditable = await page.evaluate(
    (el) => el.getAttribute("contenteditable") === "true",
    handle,
  );

  // Strategy 1: Try fill for inputs/textareas
  if (tag === "textarea" || tag === "input") {
    try {
      await (handle as any).fill(query, { timeout: 3_000 });
      // Hit Enter to submit
      await (handle as any).press("Enter");
      return;
    } catch {
      // fallthrough
    }
  }

  // Strategy 2: For contenteditable or unknown, click + type + Enter
  try {
    await handle.click({ timeout: 3_000 });
  } catch {
    // Attempt to focus via JS
    try {
      await page.evaluate((el) => (el as HTMLElement).focus(), handle);
    } catch {}
  }

  if (isContentEditable || tag !== "input") {
    // Type slowly to reduce rate-limiting heuristics
    await page.keyboard.type(query, { delay: 20 });
    await page.keyboard.press("Enter");
    return;
  }

  await page.keyboard.press("Enter");
}

async function waitForResponseContent(
  page: Page,
  selectors: string[],
  timeoutMs: number,
): Promise<{ text: string }> {
  const start = Date.now();
  let bestText = "";

  // Minimal grace period to let response start rendering
  await page.waitForTimeout(10000);

  while (Date.now() - start < timeoutMs) {
    // Try to read content from any of the selectors
    const { text } = await readCombinedTextFromSelectors(page, selectors);

    // Keep the "best" snapshot so far
    if (text.trim().length > bestText.trim().length) {
      bestText = text;
    }

    if (bestText.trim() === text.trim()) {
      break;
    }

    await page.waitForTimeout(800);
  }

  if (!bestText.trim()) {
    // Last-chance attempt: dump full body text (bounded)
    const bodyText = await page.evaluate(() => document.body?.innerText || "");
    bestText = (bodyText || "").trim();
  }

  return {
    text: sanitizeText(bestText),
  };
}

async function readCombinedTextFromSelectors(page: Page, selectors: string[]) {
  const elements = (
    await Promise.all(selectors.map((s) => page.locator(`${s}`)))
  ).flat();

  const uniqueHandles: Set<Locator> = new Set();
  for (const h of elements) {
    try {
      const isAttached = await h.evaluate((el) => !!el.isConnected);
      if (!isAttached) continue;
      uniqueHandles.add(h);
    } catch {
      // ignore
    }
  }

  let combinedText = "";
  for (const h of uniqueHandles) {
    try {
      const txt = await h.evaluate(
        (el) =>
          (el as HTMLElement).innerText ||
          (el as HTMLElement).textContent ||
          "",
      );
      const t = (txt || "").trim();
      if (t && !combinedText.includes(t)) {
        combinedText += (combinedText ? "\n\n" : "") + t;
      }
    } catch {
      // ignore
    }
  }

  return { text: combinedText };
}

function sanitizeText(s: string): string {
  // Normalize whitespace and remove excessive blank lines
  return s
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
