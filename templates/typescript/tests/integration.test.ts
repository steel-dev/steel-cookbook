// ABOUTME: Integration tests for steel-cookbook TypeScript examples
// ABOUTME: Tests require STEEL_API_KEY and make actual API calls to Steel

import { describe, it, expect, beforeAll } from "vitest";
import Steel from "steel-sdk";

const MISSING_API_KEY_MESSAGE =
  "STEEL_API_KEY not set. Template integration tests are expected to fail until .env.test.local is configured.";

// Helper function to get API key
function getApiKey(): string {
  const apiKey = process.env.STEEL_API_KEY;
  if (!apiKey || apiKey === "your-steel-api-key-here") {
    throw new Error(MISSING_API_KEY_MESSAGE);
  }
  return apiKey;
}

describe("Steel Session Creation", () => {
  let client: Steel;
  let apiKey: string;

  beforeAll(() => {
    try {
      apiKey = getApiKey();
      client = new Steel({ steelAPIKey: apiKey });
    } catch (error) {
      // Tests will be skipped
    }
  });

  it("should create actual Steel session", async () => {
    if (!client) {
      throw new Error(MISSING_API_KEY_MESSAGE);
    }

    const session = await client.sessions.create({});

    expect(session).toBeDefined();
    expect(session.id).toBeDefined();
    expect(session.id.length).toBeGreaterThan(0);
    expect(session.sessionViewerUrl).toBeDefined();

    // Cleanup
    await client.sessions.release(session.id);
  });

  it("should create session with proxy option", async () => {
    if (!client) {
      throw new Error(MISSING_API_KEY_MESSAGE);
    }

    const session = await client.sessions.create({
      useProxy: true,
    });

    expect(session.id).toBeDefined();
    expect(session.sessionViewerUrl).toBeDefined();

    // Cleanup
    await client.sessions.release(session.id);
  });

  it("should create session with custom timeout", async () => {
    if (!client) {
      throw new Error(MISSING_API_KEY_MESSAGE);
    }

    const session = await client.sessions.create({
      sessionTimeout: 300000, // 5 minutes
    });

    expect(session.id).toBeDefined();

    // Cleanup
    await client.sessions.release(session.id);
  });

  it("should release session properly", async () => {
    if (!client) {
      throw new Error(MISSING_API_KEY_MESSAGE);
    }

    const session = await client.sessions.create({});
    const sessionId = session.id;

    // Release should not throw
    await expect(client.sessions.release(sessionId)).resolves.toBeUndefined();
  });
});

describe("Session Viewer URL", () => {
  let client: Steel;

  beforeAll(() => {
    try {
      const apiKey = getApiKey();
      client = new Steel({ steelAPIKey: apiKey });
    } catch (error) {
      // Tests will be skipped
    }
  });

  it("should provide valid session viewer URL", async () => {
    if (!client) {
      throw new Error(MISSING_API_KEY_MESSAGE);
    }

    const session = await client.sessions.create({});
    const url = session.sessionViewerUrl;

    // URL should be valid HTTPS
    expect(url.startsWith("https://")).toBe(true);

    // URL should contain steel or session reference
    expect(url.toLowerCase()).toMatch(/(steel|session)/);

    // URL should be longer than base URL
    expect(url.length).toBeGreaterThan("https://steel.dev/".length);

    // Cleanup
    await client.sessions.release(session.id);
  });

  it("should generate unique session IDs", async () => {
    if (!client) {
      throw new Error(MISSING_API_KEY_MESSAGE);
    }

    const session1 = await client.sessions.create({});
    const session2 = await client.sessions.create({});

    expect(session1.id).not.toBe(session2.id);

    // Cleanup
    await client.sessions.release(session1.id);
    await client.sessions.release(session2.id);
  });
});

describe("Steel Client Configuration", () => {
  it("should initialize client with API key", async () => {
    try {
      const apiKey = getApiKey();
      const client = new Steel({ steelAPIKey: apiKey });

      expect(client).toBeDefined();
      expect(client.sessions).toBeDefined();
    } catch (error) {
      // Test will be skipped if no API key
    }
  });

  it("should have sessions interface", async () => {
    try {
      const apiKey = getApiKey();
      const client = new Steel({ steelAPIKey: apiKey });

      // Should have create method
      expect(typeof client.sessions.create).toBe("function");

      // Should have release method
      expect(typeof client.sessions.release).toBe("function");
    } catch (error) {
      // Test will be skipped if no API key
    }
  });
});
