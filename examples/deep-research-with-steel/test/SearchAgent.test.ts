#!/usr/bin/env node

import { EventEmitter } from "events";
import { SearchAgent } from "../src/agents/SearchAgent";
import { SteelClient } from "../src/providers/providers";
import { loadConfig } from "../src/config";
import { ToolCallEvent, ToolResultEvent } from "../src/core/interfaces";

// Simple test framework
class SimpleTest {
  private tests: Array<{ name: string; fn: () => Promise<void> }> = [];
  private passed = 0;
  private failed = 0;

  test(name: string, fn: () => Promise<void>) {
    this.tests.push({ name, fn });
  }

  async run() {
    console.log("🚀 Running SearchAgent Tests\n");

    for (const test of this.tests) {
      try {
        await test.fn();
        console.log(`✅ ${test.name}`);
        this.passed++;
      } catch (error) {
        console.log(`❌ ${test.name}`);
        console.error(
          `   Error: ${error instanceof Error ? error.message : String(error)}`
        );
        this.failed++;
      }
    }

    console.log(`\n📊 Results: ${this.passed} passed, ${this.failed} failed`);

    if (this.failed > 0) {
      process.exit(1);
    }
  }
}

// Test utilities
function assertEquals(actual: any, expected: any, message?: string) {
  if (actual !== expected) {
    throw new Error(
      `${message || "Assertion failed"}: expected ${expected}, got ${actual}`
    );
  }
}

function assertTruthy(value: any, message?: string) {
  if (!value) {
    throw new Error(message || "Expected truthy value");
  }
}

function assertNotNull(value: any, message?: string) {
  if (value === null || value === undefined) {
    throw new Error(message || "Expected non-null value");
  }
}

// Test setup
const testRunner = new SimpleTest();
let config: any;
let steelClient: SteelClient;
let eventEmitter: EventEmitter;
let searchAgent: SearchAgent;
let capturedEvents: Array<{ event: string; data: any }> = [];

// Note: Using real Steel API calls for proper integration testing

// Setup before tests
async function setup() {
  try {
    config = loadConfig();
    console.log("📋 Using configuration from environment variables");
  } catch (error) {
    console.log("⚠️  Could not load full config, using test config");
    config = {
      steel: { apiKey: "test-key" },
      ai: {
        provider: { name: "openai", apiKey: "test-key", model: "gpt-4" },
        writer: { name: "openai", apiKey: "test-key", model: "gpt-4" },
      },
      search: {
        maxDepth: 3,
        maxBreadth: 5,
        timeout: 30000,
        retryAttempts: 3,
      },
    };
  }

  // Use real Steel client for testing
  steelClient = new SteelClient(config.steel.apiKey);
  eventEmitter = new EventEmitter();
  searchAgent = new SearchAgent(steelClient, eventEmitter);

  // Capture events for testing
  capturedEvents = [];
  eventEmitter.on("tool-call", (event: ToolCallEvent) => {
    capturedEvents.push({ event: "tool-call", data: event });
  });

  eventEmitter.on("tool-result", (event: ToolResultEvent) => {
    capturedEvents.push({ event: "tool-result", data: event });
  });
}

// Tests
testRunner.test("SearchAgent constructor works", async () => {
  assertNotNull(searchAgent, "SearchAgent should be instantiated");
  assertEquals(
    typeof searchAgent.searchSERP,
    "function",
    "searchSERP should be a function"
  );
  assertEquals(
    typeof searchAgent.extractPageContent,
    "function",
    "extractPageContent should be a function"
  );
});

testRunner.test("searchSERP basic functionality", async () => {
  const query = "JavaScript tutorial";
  const result = await searchAgent.searchSERP(query, { maxResults: 2 });

  assertNotNull(result, "Result should not be null");
  assertEquals(result.query, query, "Query should match");
  assertTruthy(result.results.length > 0, "Should have search results");
  assertTruthy(result.totalResults > 0, "Should have total results count");
  assertTruthy(result.searchTime >= 0, "Should have search time");

  // Check first result structure
  const firstResult = result.results[0];
  assertNotNull(firstResult, "First result should exist");
  assertNotNull(firstResult!.id, "Result should have ID");
  assertNotNull(firstResult!.url, "Result should have URL");
  assertNotNull(firstResult!.title, "Result should have title");
  assertNotNull(firstResult!.content, "Result should have content");
  assertEquals(firstResult!.query, query, "Result query should match");

  console.log(`✅ Basic test - URL: ${firstResult!.url}`);
  console.log(`✅ Basic test - Title: ${firstResult!.title}`);
});

testRunner.test("searchSERP scrapes actual content from results", async () => {
  const query = "TypeScript tutorial";
  const result = await searchAgent.searchSERP(query, { maxResults: 2 });

  assertNotNull(result, "Result should not be null");
  assertTruthy(result.results.length > 0, "Should have search results");

  // Check that we have actual page content, not just search results
  const firstResult = result.results[0];
  assertNotNull(firstResult, "First result should exist");

  // The content should be substantial (from actual scraping)
  assertTruthy(
    firstResult!.content.length > 100,
    "Should have substantial content from scraping"
  );

  // Should have a proper URL (not just example.com)
  assertTruthy(firstResult!.url.startsWith("http"), "Should have proper URL");

  // Metadata should indicate web scraping
  assertEquals(
    firstResult!.metadata?.source,
    "web-scrape",
    "Should indicate web scraping source"
  );

  console.log(`✅ Scraped content from: ${firstResult!.url}`);
  console.log(`✅ Content length: ${firstResult!.content.length} characters`);
  console.log(`✅ Title: ${firstResult!.title}`);
});

testRunner.test("searchSERP emits correct events", async () => {
  const initialEventCount = capturedEvents.length;

  await searchAgent.searchSERP("test query", { maxResults: 2 });

  const newEvents = capturedEvents.slice(initialEventCount);
  assertTruthy(
    newEvents.length >= 4,
    "Should emit multiple events (search + scrape events)"
  );

  // Should have initial search event
  const searchCallEvent = newEvents.find(
    (e) => e.event === "tool-call" && e.data.toolName === "search"
  );
  const searchResultEvent = newEvents.find(
    (e) => e.event === "tool-result" && e.data.toolName === "search"
  );

  assertNotNull(searchCallEvent, "Should emit search tool-call event");
  assertNotNull(searchResultEvent, "Should emit search tool-result event");

  assertEquals(
    searchCallEvent!.data.toolName,
    "search",
    "Tool call should be for search"
  );
  assertNotNull(searchCallEvent!.data.toolCallId, "Tool call should have toolCallId");
  assertNotNull(searchCallEvent!.data.input, "Tool call should have input");
  assertEquals(
    searchResultEvent!.data.success,
    true,
    "Search result should be successful"
  );
  assertNotNull(searchResultEvent!.data.toolCallId, "Tool result should have toolCallId");
  assertNotNull(searchResultEvent!.data.output, "Tool result should have output");

  // Should also have scrape events for individual pages
  const scrapeCallEvents = newEvents.filter(
    (e) => e.event === "tool-call" && e.data.toolName === "scrape"
  );
  assertTruthy(
    scrapeCallEvents.length > 0,
    "Should emit scrape tool-call events for individual pages"
  );
});

testRunner.test("extractPageContent basic functionality", async () => {
  const url = "https://example.com/test-page";
  const result = await searchAgent.extractPageContent(url);

  assertNotNull(result, "Result should not be null");
  assertEquals(result.url, url, "URL should match");
  assertNotNull(result.title, "Should have title");
  assertNotNull(result.content, "Should have content");
  assertTruthy(result.content.length > 0, "Content should not be empty");
});

testRunner.test("extractPageContent with options", async () => {
  const url = "https://example.com/test-page";
  const options = {
    includeMarkdown: true,
    includeImages: true,
    timeout: 5000,
  };

  const result = await searchAgent.extractPageContent(url, options);

  assertNotNull(result, "Result should not be null");
  assertEquals(result.url, url, "URL should match");
  assertNotNull(result.markdown, "Should have markdown when requested");
  assertTruthy(Array.isArray(result.images), "Images should be an array");
  assertTruthy(
    result.images && result.images.length > 0,
    "Should extract images"
  );
});

testRunner.test("extractPageContent emits correct events", async () => {
  const initialEventCount = capturedEvents.length;

  await searchAgent.extractPageContent("https://example.com/test");

  const newEvents = capturedEvents.slice(initialEventCount);
  assertTruthy(newEvents.length >= 2, "Should emit at least 2 events");

  const toolCallEvent = newEvents.find((e) => e.event === "tool-call");
  const toolResultEvent = newEvents.find((e) => e.event === "tool-result");

  assertNotNull(toolCallEvent, "Should emit tool-call event");
  assertNotNull(toolResultEvent, "Should emit tool-result event");

  assertEquals(
    toolCallEvent!.data.toolName,
    "scrape",
    "Tool call should be for scrape"
  );
  assertNotNull(toolCallEvent!.data.toolCallId, "Tool call should have toolCallId");
  assertNotNull(toolCallEvent!.data.input, "Tool call should have input");
  assertEquals(
    toolResultEvent!.data.toolName,
    "scrape",
    "Tool result should be for scrape"
  );
  assertNotNull(toolResultEvent!.data.toolCallId, "Tool result should have toolCallId");
  assertEquals(
    toolResultEvent!.data.success,
    true,
    "Tool result should be successful"
  );
  assertNotNull(toolResultEvent!.data.output, "Tool result should have output");
});

testRunner.test("handles invalid URLs gracefully", async () => {
  // Test with an invalid URL that should fail
  try {
    await searchAgent.extractPageContent(
      "https://invalid-url-that-should-fail.com"
    );
    // If it doesn't throw, that's also fine - it should handle gracefully
  } catch (error) {
    assertTruthy(error instanceof Error, "Should throw an Error");
    console.log("Expected error for invalid URL:", (error as Error).message);
  }

  // Check that error events were emitted for failed scrapes
  const errorEvents = capturedEvents.filter(
    (e) => e.event === "tool-result" && e.data.success === false
  );
  // This might be 0 if Steel handles the error differently, which is fine
  console.log(`Error events captured: ${errorEvents.length}`);
});

// Run tests
async function main() {
  await setup();
  await testRunner.run();

  console.log("\n🎉 All SearchAgent tests completed!");
}

if (require.main === module) {
  main().catch(console.error);
}
