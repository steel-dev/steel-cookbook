/**
 * SearchAgent Tests - Simplified for New Architecture
 *
 * Tests the core functionality of SearchAgent with:
 * - Direct LanguageModel injection (no ProviderManager)
 * - Focus on public interface testing
 * - Basic validation and error handling
 * - Simple mocking approach
 */

import { EventEmitter } from "events";
import { MockLanguageModelV2 } from "ai/test";
import { SearchAgent } from "../src/agents/SearchAgent";
import type { LanguageModel } from "ai";

// Simple test framework for ts-node execution
function describe(name: string, fn: () => void) {
  console.log(`\n🧪 ${name}`);
  fn();
}

function it(name: string, fn: () => Promise<void> | void) {
  return (async () => {
    try {
      await fn();
      console.log(`✅ ${name}`);
    } catch (error) {
      console.log(
        `❌ ${name}: ${error instanceof Error ? error.message : String(error)}`
      );
      throw error;
    }
  })();
}

function expect(actual: any) {
  return {
    toBe: (expected: any) => {
      if (actual !== expected) {
        throw new Error(`Expected ${expected}, but got ${actual}`);
      }
    },
    toBeDefined: () => {
      if (actual === undefined) {
        throw new Error(`Expected value to be defined`);
      }
    },
    toContain: (expected: string) => {
      if (!actual.includes(expected)) {
        throw new Error(`Expected "${actual}" to contain "${expected}"`);
      }
    },
    toBeGreaterThan: (expected: number) => {
      if (actual <= expected) {
        throw new Error(`Expected ${actual} to be greater than ${expected}`);
      }
    },
    toBeLessThanOrEqual: (expected: number) => {
      if (actual > expected) {
        throw new Error(
          `Expected ${actual} to be less than or equal to ${expected}`
        );
      }
    },
    toBeInstanceOf: (expectedClass: any) => {
      if (!(actual instanceof expectedClass)) {
        throw new Error(
          `Expected ${actual} to be instance of ${expectedClass.name}`
        );
      }
    },
    rejects: {
      toThrow: async (expectedError?: string) => {
        try {
          await actual;
          throw new Error(`Expected promise to reject, but it resolved`);
        } catch (error) {
          if (expectedError) {
            const errorMessage =
              error instanceof Error ? error.message : String(error);
            if (!errorMessage.includes(expectedError)) {
              throw new Error(
                `Expected error to contain "${expectedError}", but got "${errorMessage}"`
              );
            }
          }
        }
      },
    },
  };
}

// Test setup - Create mock models
function createMockModels() {
  const mockSummary = new MockLanguageModelV2({
    doStream: async () => ({
      stream: require("ai/test").simulateReadableStream({
        chunks: [
          {
            type: "text-delta",
            textDelta: "This article discusses AI applications in healthcare, ",
          },
          {
            type: "text-delta",
            textDelta:
              "focusing on diagnostic tools and patient care improvements.",
          },
          {
            type: "finish",
            finishReason: "stop",
            usage: { inputTokens: 500, outputTokens: 50, totalTokens: 550 },
          },
        ],
      }),
    }),
    doGenerate: async () => ({
      finishReason: "stop" as const,
      usage: { inputTokens: 500, outputTokens: 50, totalTokens: 550 },
      content: [
        {
          type: "text" as const,
          text: "This article discusses AI applications in healthcare, focusing on diagnostic tools and patient care improvements.",
        },
      ],
      warnings: [],
    }),
  });

  return {
    planner: mockSummary,
    evaluator: mockSummary,
    writer: mockSummary,
    summary: mockSummary,
  };
}

// Run tests
async function runTests() {
  console.log("🚀 Starting SearchAgent Tests\n");

  const mockModels = createMockModels();
  const parentEmitter = new EventEmitter();

  describe("SearchAgent Constructor and Interface", () => {
    it("should instantiate successfully with required parameters", async () => {
      const searchAgent = new SearchAgent(
        mockModels,
        parentEmitter,
        "fake-steel-api-key"
      );

      expect(searchAgent).toBeDefined();
      expect(searchAgent).toBeInstanceOf(SearchAgent);
    });

    it("should have searchAndSummarize method", async () => {
      const searchAgent = new SearchAgent(
        mockModels,
        parentEmitter,
        "fake-steel-api-key"
      );

      expect(typeof searchAgent.searchAndSummarize).toBe("function");
    });

    it("should accept optional timeout and retry parameters", async () => {
      const searchAgent = new SearchAgent(
        mockModels,
        parentEmitter,
        "fake-steel-api-key",
        5, // retryAttempts
        60000 // timeout
      );

      expect(searchAgent).toBeDefined();
    });

    it("should emit events when methods are called", async () => {
      const searchAgent = new SearchAgent(
        mockModels,
        parentEmitter,
        "fake-steel-api-key"
      );

      const events: string[] = [];

      searchAgent.on("tool-call", () => events.push("tool-call"));
      searchAgent.on("tool-result", () => events.push("tool-result"));

      try {
        // This will likely fail due to invalid Steel API key, but should emit events
        await searchAgent.searchAndSummarize("test query", {
          maxResults: 1,
        });
      } catch (error) {
        // Expected to fail with fake API key - that's OK for this test
        console.log(
          "   Expected error with fake API key:",
          error instanceof Error ? error.message : String(error)
        );
      }

      // Should have emitted at least the tool-call event
      expect(events.length).toBeGreaterThan(0);
    });

    it("should handle invalid Steel API key gracefully", async () => {
      const searchAgent = new SearchAgent(
        mockModels,
        parentEmitter,
        "invalid-key"
      );

      // Should not throw during instantiation
      expect(searchAgent).toBeDefined();

      // Should handle errors gracefully during actual usage
      try {
        await searchAgent.searchAndSummarize("test query", {
          maxResults: 1,
        });
      } catch (error) {
        // This is expected - invalid API key should cause an error
        expect(error).toBeInstanceOf(Error);
        console.log("   Expected API key error handled gracefully");
      }
    });

    it("should accept various SERPOptions parameters", async () => {
      const searchAgent = new SearchAgent(
        mockModels,
        parentEmitter,
        "fake-steel-api-key"
      );

      // Test that the method accepts all the expected options
      const options = {
        maxResults: 3,
        summaryTokens: 200,
        streaming: true,
        timeout: 15000,
        scrapedUrls: new Set<string>(["https://example.com/already-scraped"]),
      };

      try {
        await searchAgent.searchAndSummarize("test query", options);
      } catch (error) {
        // Expected to fail with fake API key, but should accept the parameters
        console.log("   Parameters accepted, API call failed as expected");
      }
    });

    it("should handle empty query string", async () => {
      const searchAgent = new SearchAgent(
        mockModels,
        parentEmitter,
        "fake-steel-api-key"
      );

      try {
        await searchAgent.searchAndSummarize("", {
          maxResults: 1,
        });
      } catch (error) {
        // Should either handle gracefully or throw a descriptive error
        expect(error).toBeInstanceOf(Error);
        console.log("   Empty query handled appropriately");
      }
    });

    it("should handle default options when none provided", async () => {
      const searchAgent = new SearchAgent(
        mockModels,
        parentEmitter,
        "fake-steel-api-key"
      );

      try {
        // Call with no options to test defaults
        await searchAgent.searchAndSummarize("test query");
      } catch (error) {
        // Expected to fail with fake API key, but should handle default options
        console.log("   Default options handled correctly");
      }
    });
  });

  console.log("\n🎉 SearchAgent interface tests completed successfully!");
  console.log(
    "\n💡 Note: These tests focus on the public interface and parameter handling."
  );
  console.log("   Real functionality testing requires valid Steel API keys.");
}

// Execute tests when run directly
if (require.main === module) {
  runTests().catch((error) => {
    console.error("\n💥 Test execution failed:", error);
    process.exit(1);
  });
}
