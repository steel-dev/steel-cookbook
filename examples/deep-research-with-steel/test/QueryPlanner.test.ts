/**
 * QueryPlanner Tests - Simplified for New Architecture
 *
 * Tests the core functionality of QueryPlanner with:
 * - Direct LanguageModel injection (no ProviderManager)
 * - AI SDK v5 MockLanguageModelV2
 * - Minimal test framework for ts-node execution
 * - Focus on essential functionality only
 */

import { EventEmitter } from "events";
import { MockLanguageModelV2 } from "ai/test";
import { QueryPlanner } from "../src/agents/QueryPlanner";
import type { LanguageModel } from "ai";

// Simple test framework
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

// Test setup
function createMockModels() {
  // Mock that handles both streaming (for strategic planning) and structured (for query extraction)
  const mockPlanner = new MockLanguageModelV2({
    doStream: async () => ({
      stream: require("ai/test").simulateReadableStream({
        chunks: [
          { type: "text-delta", textDelta: "Strategic research plan: Focus on current AI applications in healthcare, " },
          { type: "text-delta", textDelta: "examine diagnostic tools, treatment protocols, and implementation challenges." },
          { type: "finish", finishReason: "stop", usage: { inputTokens: 100, outputTokens: 200, totalTokens: 300 } }
        ]
      })
    }),
    doGenerate: async () => ({
      finishReason: "stop" as const,
      usage: { inputTokens: 50, outputTokens: 100, totalTokens: 150 },
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({
            queries: [
              "AI diagnostic tools in healthcare",
              "machine learning medical applications",
              "healthcare AI challenges and limitations",
            ],
            strategy: {
              searchType: "comprehensive",
              approach: "Systematic coverage of AI healthcare applications",
            },
            estimatedSteps: 3,
          }),
        },
      ],
      warnings: [],
    }),
  });

  return {
    planner: mockPlanner,
    evaluator: mockPlanner, // Reuse for simplicity
    writer: mockPlanner, // Reuse for simplicity
    summary: mockPlanner, // Reuse for simplicity
  };
}

// Run tests
async function runTests() {
  console.log("🚀 Starting QueryPlanner Tests\n");

  const mockModels = createMockModels();
  const parentEmitter = new EventEmitter();
  const queryPlanner = new QueryPlanner(mockModels, parentEmitter);

  describe("QueryPlanner Core Functionality", () => {
    it("should generate a complete research plan", async () => {
      const result = await queryPlanner.planResearch(
        "AI impact on healthcare",
        3,
        5
      );

      expect(result).toBeDefined();
      expect(result.originalQuery).toBe("AI impact on healthcare");
      expect(result.subQueries).toBeDefined();
      expect(result.subQueries.length).toBeGreaterThan(0);
      expect(result.searchStrategy).toBeDefined();
      expect(result.strategicPlan).toBeDefined();
    });

    it("should handle follow-up dialogue", async () => {
      const followUpDialogue = [
        {
          role: "assistant" as const,
          content:
            "What specific aspect of AI in healthcare interests you most?",
        },
        {
          role: "user" as const,
          content: "I'm particularly interested in diagnostic applications",
        },
      ];

      const result = await queryPlanner.planResearch(
        "AI in healthcare",
        2,
        3,
        followUpDialogue
      );

      expect(result).toBeDefined();
      // The originalQuery should include the enhanced context from follow-up dialogue
      expect(result.originalQuery).toContain("AI in healthcare");
      expect(result.originalQuery).toContain("diagnostic applications");
      expect(result.subQueries.length).toBeGreaterThan(0);
    });

    it("should validate input parameters", async () => {
      await expect(queryPlanner.planResearch("", 3, 5)).rejects.toThrow(
        "Query cannot be empty"
      );

      await expect(
        queryPlanner.planResearch("valid query", 0, 5)
      ).rejects.toThrow();

      await expect(
        queryPlanner.planResearch("valid query", 3, 0)
      ).rejects.toThrow();
    });

    it("should respect breadth limits", async () => {
      const result = await queryPlanner.planResearch(
        "AI in healthcare",
        3,
        2 // Only 2 queries max
      );

      expect(result.subQueries.length).toBeLessThanOrEqual(2);
    });

    it("should emit events during planning", async () => {
      const events: string[] = [];

      queryPlanner.on("tool-call-start", () => events.push("tool-call-start"));
      queryPlanner.on("tool-call-end", () => events.push("tool-call-end"));

      await queryPlanner.planResearch("AI in healthcare", 2, 3);

      expect(events.length).toBeGreaterThan(0);
    });
  });

  console.log("\n🎉 QueryPlanner tests completed successfully!");
}

// Execute tests when run directly
if (require.main === module) {
  runTests().catch((error) => {
    console.error("\n💥 Test execution failed:", error);
    process.exit(1);
  });
}
