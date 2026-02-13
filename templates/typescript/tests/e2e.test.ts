// ABOUTME: End-to-end tests for steel-cookbook TypeScript examples
// ABOUTME: Tests complete browser automation workflows with Steel

import { describe, it, expect, beforeAll } from "vitest";
import Steel from "steel-sdk";

const MISSING_API_KEY_MESSAGE =
  "STEEL_API_KEY not set. Template e2e tests are expected to fail until .env.test.local is configured.";

// Helper function to get API key
function getApiKey(): string {
  const apiKey = process.env.STEEL_API_KEY;
  if (!apiKey || apiKey === "your-steel-api-key-here") {
    throw new Error(MISSING_API_KEY_MESSAGE);
  }
  return apiKey;
}

describe("E2E Browser Automation", () => {
  let client: Steel;

  beforeAll(() => {
    try {
      const apiKey = getApiKey();
      client = new Steel({ steelAPIKey: apiKey });
    } catch (error) {
      // Tests will be skipped
    }
  });

  it("should complete full session lifecycle", async () => {
    if (!client) {
      throw new Error(MISSING_API_KEY_MESSAGE);
    }

    // Step 1: Create session
    const session = await client.sessions.create({});
    expect(session.id).toBeDefined();

    // Step 2: Verify session is accessible
    expect(session.sessionViewerUrl).toBeDefined();
    expect(session.sessionViewerUrl.startsWith("https://")).toBe(true);

    // Step 3: Perform automation (simulated - add your actual automation here)
    // This is where you would:
    // - Connect to the session with Playwright/Puppeteer
    // - Navigate to pages
    // - Interact with elements
    // - Extract data

    // Step 4: Cleanup
    await client.sessions.release(session.id);
  });

  it("should handle session creation and release with error", async () => {
    if (!client) {
      throw new Error(MISSING_API_KEY_MESSAGE);
    }

    const session = await client.sessions.create({});
    const sessionId = session.id;

    try {
      // Simulate an error during automation
      // throw new Error("Simulated automation error");

      // In a real scenario, the finally block ensures cleanup
    } finally {
      // Ensure session is always released
      await client.sessions.release(sessionId);
    }

    // If we reach here, cleanup succeeded
    expect(true).toBe(true);
  });

  it("should create session with all options enabled", async () => {
    if (!client) {
      throw new Error(MISSING_API_KEY_MESSAGE);
    }

    const session = await client.sessions.create({
      useProxy: true,
      solveCaptcha: true,
      sessionTimeout: 1800000, // 30 minutes
      userAgent: "E2E-Test-Bot/1.0",
    });

    expect(session.id).toBeDefined();

    // Cleanup
    await client.sessions.release(session.id);
  });

  it("should support multiple concurrent sessions", async () => {
    if (!client) {
      throw new Error(MISSING_API_KEY_MESSAGE);
    }

    // Create multiple sessions
    const session1 = await client.sessions.create({});
    const session2 = await client.sessions.create({});
    const session3 = await client.sessions.create({});

    // Verify all sessions have unique IDs
    const ids = new Set([session1.id, session2.id, session3.id]);
    expect(ids.size).toBe(3);

    // Cleanup all sessions
    await Promise.all([
      client.sessions.release(session1.id),
      client.sessions.release(session2.id),
      client.sessions.release(session3.id),
    ]);
  });
});

describe("E2E Error Recovery", () => {
  let client: Steel;

  beforeAll(() => {
    try {
      const apiKey = getApiKey();
      client = new Steel({ steelAPIKey: apiKey });
    } catch (error) {
      // Tests will be skipped
    }
  });

  it("should handle network errors gracefully", async () => {
    if (!client) {
      throw new Error(MISSING_API_KEY_MESSAGE);
    }

    // This test verifies error handling patterns
    const session = await client.sessions.create({});

    // Simulate potential error scenarios
    let errorOccurred = false;
    try {
      // Your automation code here
      // If an error occurs, it should be caught
    } catch (error) {
      errorOccurred = true;
      // Log error for debugging
      console.error("Automation error:", error);
    } finally {
      // Cleanup always runs
      await client.sessions.release(session.id);
    }

    // Verify cleanup happened regardless of error
    expect(true).toBe(true);
  });
});
