/*
 * Clear an email verification gate with a DevInbox inbox the agent owns.
 * https://github.com/steel-dev/steel-cookbook/tree/main/examples/devinbox-email-verification-ts
 */

import { chromium } from "playwright";
import type { Page } from "playwright";
import Steel from "steel-sdk";
import dotenv from "dotenv";

dotenv.config();

const STEEL_API_KEY = process.env.STEEL_API_KEY || "your-steel-api-key-here";
const DEVINBOX_API_KEY =
  process.env.DEVINBOX_API_KEY || "your-devinbox-api-key-here";

const DEVINBOX_API = "https://api.devinbox.io";
const APP = "https://practice.expandtesting.com/notes/app";

// The pattern DevInbox matches against the arriving body. {{link}} runs to the end
// of its line, so the parsed message carries { link: "https://..." }.
const TEMPLATE_KEY = "expandtesting-reset";
const TEMPLATE_BODY = "Reset password link: {{link}}";

const SIGNUP_PASSWORD = "Correct-Horse-9-Battery";
const RESET_PASSWORD = "Rotated-Horse-42-Staple";

const client = new Steel({ steelAPIKey: STEEL_API_KEY });

const devinboxHeaders = {
  "X-Api-Key": DEVINBOX_API_KEY,
  "Content-Type": "application/json",
};

interface Inbox {
  key: string;
  address: string;
}

interface ParsedMessage {
  subject: Record<string, string> | null;
  body: Record<string, string> | null;
  received: string;
}

/**
 * Registers the extraction template. A 409 means an earlier run already created it,
 * which is just as good: templates are defined once and reused.
 */
async function ensureTemplate(): Promise<void> {
  const res = await fetch(`${DEVINBOX_API}/templates`, {
    method: "POST",
    headers: devinboxHeaders,
    body: JSON.stringify({ key: TEMPLATE_KEY, body: TEMPLATE_BODY }),
  });

  if (res.status !== 201 && res.status !== 409) {
    throw new Error(
      `Could not create template: ${res.status} ${await res.text()}`
    );
  }

  console.log(`Extraction template '${TEMPLATE_KEY}' ready`);
}

/**
 * Mints a throwaway address. Temporary inboxes never touch SQL and expire an hour
 * later, so every run gets a fresh account with no cleanup and no collisions.
 */
async function createInbox(): Promise<Inbox> {
  const res = await fetch(`${DEVINBOX_API}/mailboxes`, {
    method: "POST",
    headers: devinboxHeaders,
    body: JSON.stringify({ isTemporary: true }),
  });

  if (!res.ok) {
    throw new Error(`Could not create inbox: ${res.status} ${await res.text()}`);
  }

  return (await res.json()) as Inbox;
}

/**
 * Blocks until the reset mail lands and returns the link the template pulled out of it.
 * `since` is captured before the form is submitted, so a sender that beats the request
 * cannot slip a message past the window.
 */
async function waitForResetLink(inbox: Inbox, since: string): Promise<string> {
  const res = await fetch(
    `${DEVINBOX_API}/messages/${inbox.key}/wait` +
      `?timeout=90&template=${TEMPLATE_KEY}&since=${encodeURIComponent(since)}`,
    { headers: devinboxHeaders }
  );

  if (res.status === 204) {
    throw new Error(
      "No mail arrived within 90s. Click the site's resend control and wait again with a fresh timestamp."
    );
  }

  if (!res.ok) {
    throw new Error(`Wait failed: ${res.status} ${await res.text()}`);
  }

  const message = (await res.json()) as ParsedMessage;
  const link = message.body?.link;

  if (!link) {
    throw new Error(
      `Mail arrived but did not match '${TEMPLATE_KEY}'. The sender changed their format.`
    );
  }

  return link;
}

async function register(page: Page, address: string): Promise<void> {
  await page.goto(`${APP}/register`, { waitUntil: "domcontentloaded" });
  await page.fill('[data-testid="register-name"]', "Steel Cookbook Agent");
  await page.fill('[data-testid="register-email"]', address);
  await page.fill('[data-testid="register-password"]', SIGNUP_PASSWORD);
  await page.fill('[data-testid="register-confirm-password"]', SIGNUP_PASSWORD);
  await page.click('[data-testid="register-submit"]');
  await page.waitForSelector('[data-testid="login-view"]');
}

async function requestReset(page: Page, address: string): Promise<string> {
  await page.goto(`${APP}/forgot-password`, { waitUntil: "domcontentloaded" });
  await page.fill('[data-testid="forgot-password-email"]', address);

  // Take the timestamp before the click, not after the mail is requested.
  const since = new Date().toISOString();
  await page.click('[data-testid="forgot-password-submit"]');

  return since;
}

async function setNewPassword(page: Page, link: string): Promise<void> {
  await page.goto(link, { waitUntil: "domcontentloaded" });
  await page.fill('[data-testid="password"]', RESET_PASSWORD);
  await page.fill('[data-testid="confirm-password"]', RESET_PASSWORD);
  await page.click('[data-testid="update-password"]');
  await page.waitForSelector('[data-testid="login"]');
}

async function signIn(page: Page, address: string): Promise<void> {
  await page.goto(`${APP}/login`, { waitUntil: "domcontentloaded" });
  await page.fill('[data-testid="login-email"]', address);
  await page.fill('[data-testid="login-password"]', RESET_PASSWORD);
  await page.click('[data-testid="login-submit"]');
  await page.waitForSelector('[data-testid="notes-list"]');
}

async function main() {
  console.log("Steel + DevInbox email verification");
  console.log("=".repeat(60));

  if (STEEL_API_KEY === "your-steel-api-key-here") {
    console.warn(
      "WARNING: Please replace 'your-steel-api-key-here' with your actual Steel API key"
    );
    console.warn(
      "   Get your API key at: https://app.steel.dev/settings/api-keys"
    );
    throw new Error("Set STEEL_API_KEY");
  }

  if (DEVINBOX_API_KEY === "your-devinbox-api-key-here") {
    console.warn(
      "WARNING: Please replace 'your-devinbox-api-key-here' with your actual DevInbox API key"
    );
    console.warn("   Get your API key at: https://devinbox.io");
    throw new Error("Set DEVINBOX_API_KEY");
  }

  let session;
  let browser;

  try {
    await ensureTemplate();

    const inbox = await createInbox();
    console.log(`Inbox ready: ${inbox.address}`);

    console.log("\nCreating Steel session...");

    session = await client.sessions.create();

    console.log(
      `\x1b[1;93mSteel Session created!\x1b[0m\n` +
        `View session at \x1b[1;37m${session.sessionViewerUrl}\x1b[0m`
    );

    browser = await chromium.connectOverCDP(
      `${session.websocketUrl}&apiKey=${STEEL_API_KEY}`
    );

    console.log("Connected to browser via Playwright");

    // Create page at existing context to ensure session is recorded.
    const currentContext = browser.contexts()[0];
    const page = await currentContext.pages()[0];

    console.log("\nRegistering an account on the inbox address...");
    await register(page, inbox.address);
    console.log("Account created");

    console.log("Requesting a password reset link...");
    const since = await requestReset(page, inbox.address);

    console.log("Waiting for the mail (long-poll, up to 90s)...");
    const startedAt = Date.now();
    const link = await waitForResetLink(inbox, since);
    const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
    console.log(`Link extracted after ${elapsed}s`);
    console.log(`   ${link}`);

    console.log("Setting a new password from the emailed link...");
    await setNewPassword(page, link);
    console.log("Password updated");

    console.log("Signing in with the new password...");
    await signIn(page, inbox.address);
    console.log(`Signed in. Landed on ${page.url()}`);
  } catch (error) {
    console.error("An error occurred:", error);
    throw error;
  } finally {
    if (session) {
      console.log("\nReleasing session...");
      await client.sessions.release(session.id);
      console.log("Session released");
    }

    console.log("Done!");
  }
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error("Unhandled error:", error);
    process.exit(1);
  });
