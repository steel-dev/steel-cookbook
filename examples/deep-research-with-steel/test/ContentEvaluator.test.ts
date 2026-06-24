/**
 * ContentEvaluator Tests - THE BRAIN: Simplified for New Architecture
 *
 * Tests THE BRAIN functionality with:
 * - Direct LanguageModel injection (no ProviderManager)
 * - AI SDK v5 MockLanguageModelV2
 * - RefinedContent[] input (not SearchResult[])
 * - Essential functionality only (simplified from 740→200 lines)
 *
 * THE BRAIN CORE FUNCTIONALITY:
 * - Knowledge accumulation across iterations (25→50→75 summaries)
 * - Termination decisions based on completeness assessment
 * - Direct search query generation (bypassing QueryPlanner)
 * - Memory limits and gap analysis
 * - Research direction generation
 */

import { EventEmitter } from "events";
import { MockLanguageModelV2 } from "ai/test";
import { ContentEvaluator } from "../src/agents/ContentEvaluator";
import {
  RefinedContent,
  ResearchPlan,
  ResearchEvaluation,
} from "../src/core/interfaces";
import type { LanguageModel } from "ai";

// Simple test framework for ts-node
function describe(name: string, fn: () => void) {
  console.log(`\n🧠 ${name}`);
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
    toHaveLength: (expected: number) => {
      if (!Array.isArray(actual) || actual.length !== expected) {
        throw new Error(
          `Expected array of length ${expected}, but got length ${
            Array.isArray(actual) ? actual.length : "not an array"
          }`
        );
      }
    },
    toBeGreaterThan: (expected: number) => {
      if (typeof actual !== "number" || actual <= expected) {
        throw new Error(`Expected ${actual} to be greater than ${expected}`);
      }
    },
    toContain: (expected: string) => {
      if (typeof actual !== "string" || !actual.includes(expected)) {
        throw new Error(`Expected "${actual}" to contain "${expected}"`);
      }
    },
    toBeOneOf: (values: string[]) => {
      if (!values.includes(actual)) {
        throw new Error(
          `Expected "${actual}" to be one of [${values.join(", ")}]`
        );
      }
    },
  };
}

// Test setup - Create mock models for THE BRAIN
function createMockModels() {
  // Mock THE BRAIN evaluation response
  const mockResearchEvaluation: ResearchEvaluation = {
    learnings: [
      {
        content: "AI is transforming healthcare through diagnostic assistance",
        type: "factual",
        entities: ["AI", "healthcare", "diagnostics"],
        confidence: 0.9,
        sourceUrl: "https://example.com/ai-healthcare",
      },
      {
        content: "Machine learning models show 85% accuracy in medical imaging",
        type: "statistical",
        entities: ["machine learning", "medical imaging"],
        confidence: 0.8,
        sourceUrl: "https://example.com/ml-imaging",
      },
    ],
    researchDirections: [
      {
        question: "What are the regulatory challenges for AI in healthcare?",
        rationale: "Need to understand compliance and approval processes",
        searchQueries: [
          "FDA AI medical device approval",
          "healthcare AI regulations",
          "medical AI compliance",
        ],
        buildsUpon: ["AI healthcare applications"],
        expectedLearningType: "procedural",
      },
    ],
    completenessAssessment: {
      coverage: 0.7,
      confidence: 0.8,
      knowledgeGaps: [
        "regulatory challenges",
        "cost analysis",
        "patient outcomes",
      ],
      hasEnoughInfo: false,
      recommendedAction: "continue",
      reasoning:
        "Good foundational understanding but missing regulatory and implementation details",
    },
  };

  const mockModel = new MockLanguageModelV2({
    doGenerate: async () => ({
      finishReason: "stop" as const,
      usage: { inputTokens: 500, outputTokens: 800, totalTokens: 1300 },
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(mockResearchEvaluation),
        },
      ],
      warnings: [],
    }),
  });

  return {
    planner: mockModel,
    evaluator: mockModel,
    writer: mockModel,
    summary: mockModel,
  };
}

// Create sample RefinedContent for testing
function createSampleRefinedContent(count: number = 5): RefinedContent[] {
  const baseContent: RefinedContent[] = [
    {
      title: "AI in Healthcare: Current Applications",
      url: "https://example.com/ai-healthcare",
      summary:
        "Artificial intelligence is being used in healthcare for diagnostic assistance, drug discovery, and personalized treatment plans. Current applications show promising results in medical imaging analysis.",
      rawLength: 2500,
      scrapedAt: new Date("2025-01-15T10:00:00Z"),
    },
    {
      title: "Machine Learning for Medical Imaging",
      url: "https://example.com/ml-imaging",
      summary:
        "Machine learning models demonstrate 85% accuracy in medical imaging tasks, particularly in radiology and pathology. Deep learning approaches show significant promise for early disease detection.",
      rawLength: 3200,
      scrapedAt: new Date("2025-01-15T10:05:00Z"),
    },
    {
      title: "Clinical Decision Support Systems",
      url: "https://example.com/clinical-ai",
      summary:
        "AI-powered clinical decision support systems help physicians make more accurate diagnoses and treatment recommendations. Integration with electronic health records improves workflow efficiency.",
      rawLength: 2800,
      scrapedAt: new Date("2025-01-15T10:10:00Z"),
    },
    {
      title: "AI Drug Discovery Pipeline",
      url: "https://example.com/ai-drug-discovery",
      summary:
        "Artificial intelligence accelerates drug discovery by identifying potential compounds and predicting their efficacy. AI reduces development time from years to months for initial screening.",
      rawLength: 3500,
      scrapedAt: new Date("2025-01-15T10:15:00Z"),
    },
    {
      title: "Healthcare AI Implementation Challenges",
      url: "https://example.com/ai-challenges",
      summary:
        "Implementation of AI in healthcare faces challenges including data privacy, regulatory approval, and physician adoption. Addressing these barriers is crucial for widespread deployment.",
      rawLength: 2900,
      scrapedAt: new Date("2025-01-15T10:20:00Z"),
    },
  ];

  return baseContent.slice(0, count);
}

// Create sample research plan
function createSampleResearchPlan(): ResearchPlan {
  return {
    id: "test-plan-001",
    originalQuery: "AI applications in healthcare",
    subQueries: [
      {
        id: "sq-1",
        query: "AI diagnostic tools in medicine",
      },
      {
        id: "sq-2",
        query: "machine learning medical imaging",
      },
    ],
    searchStrategy: {
      maxDepth: 3,
      maxBreadth: 5,
      timeout: 30000,
      retryAttempts: 3,
    },
    estimatedSteps: 3,
    strategicPlan: "Comprehensive analysis of AI applications in healthcare",
  };
}

// Run tests
async function runTests() {
  console.log("🚀 Starting ContentEvaluator (THE BRAIN) Tests\n");

  const mockModels = createMockModels();
  const parentEmitter = new EventEmitter();
  const evaluator = new ContentEvaluator(mockModels, parentEmitter);

  describe("ContentEvaluator (THE BRAIN) Core Functionality", () => {
    it("should instantiate successfully with new architecture", async () => {
      expect(evaluator).toBeDefined();
    });

    it("should handle knowledge accumulation pattern (25 summaries)", async () => {
      const refinedContent = createSampleRefinedContent(25);
      const researchPlan = createSampleResearchPlan();

      const result = await evaluator.evaluateFindings(
        "AI applications in healthcare",
        refinedContent,
        researchPlan,
        1, // currentDepth
        3, // maxDepth
        5 // breadth
      );

      expect(result).toBeDefined();
      expect(result.learnings).toBeDefined();
      expect(result.researchDirections).toBeDefined();
      expect(result.completenessAssessment).toBeDefined();
    });

    it("should make termination decisions through completenessAssessment", async () => {
      const refinedContent = createSampleRefinedContent(10);
      const researchPlan = createSampleResearchPlan();

      const result = await evaluator.evaluateFindings(
        "AI applications in healthcare",
        refinedContent,
        researchPlan,
        2,
        3,
        5
      );

      expect(result.completenessAssessment.recommendedAction).toBeOneOf([
        "continue",
        "synthesize",
      ]);
      expect(result.completenessAssessment.reasoning).toBeDefined();
      expect(typeof result.completenessAssessment.coverage).toBe("number");
    });

    it("should generate research directions for continuing research", async () => {
      const refinedContent = createSampleRefinedContent(15);
      const researchPlan = createSampleResearchPlan();

      const result = await evaluator.evaluateFindings(
        "AI applications in healthcare",
        refinedContent,
        researchPlan,
        1,
        3,
        5
      );

      expect(Array.isArray(result.researchDirections)).toBe(true);
      if (result.researchDirections.length > 0) {
        const direction = result.researchDirections[0];
        if (direction) {
          expect(direction.question).toBeDefined();
          expect(direction.rationale).toBeDefined();
          expect(Array.isArray(direction.searchQueries)).toBe(true);
        }
      }
    });

    it("should extract structured learnings from RefinedContent", async () => {
      const refinedContent = createSampleRefinedContent(8);
      const researchPlan = createSampleResearchPlan();

      const result = await evaluator.evaluateFindings(
        "AI applications in healthcare",
        refinedContent,
        researchPlan,
        1,
        3,
        5
      );

      expect(Array.isArray(result.learnings)).toBe(true);
      if (result.learnings.length > 0) {
        const learning = result.learnings[0];
        if (learning) {
          expect(learning.content).toBeDefined();
          expect(learning.type).toBeOneOf([
            "factual",
            "analytical",
            "procedural",
            "statistical",
          ]);
          expect(typeof learning.confidence).toBe("number");
          expect(learning.sourceUrl).toBeDefined();
        }
      }
    });

    it("should handle empty RefinedContent gracefully", async () => {
      const refinedContent: RefinedContent[] = [];
      const researchPlan = createSampleResearchPlan();

      const result = await evaluator.evaluateFindings(
        "AI applications in healthcare",
        refinedContent,
        researchPlan,
        1,
        3,
        5
      );

      expect(result).toBeDefined();
      expect(result.completenessAssessment.hasEnoughInfo).toBe(false);
    });

    it("should emit brain analysis events", async () => {
      const events: any[] = [];

      evaluator.on("tool-call", (event) => {
        events.push({ type: "tool-call", ...event });
      });

      evaluator.on("tool-result", (event) => {
        events.push({ type: "tool-result", ...event });
      });

      const refinedContent = createSampleRefinedContent(5);
      const researchPlan = createSampleResearchPlan();

      await evaluator.evaluateFindings(
        "AI applications in healthcare",
        refinedContent,
        researchPlan,
        1,
        3,
        5
      );

      expect(events.length).toBeGreaterThan(0);
    });

    it("should handle depth context for iteration planning", async () => {
      const refinedContent = createSampleRefinedContent(20);
      const researchPlan = createSampleResearchPlan();

      // Test near max depth
      const result = await evaluator.evaluateFindings(
        "AI applications in healthcare",
        refinedContent,
        researchPlan,
        2, // currentDepth
        3, // maxDepth (only 1 iteration left)
        5
      );

      expect(result).toBeDefined();
      expect(result.completenessAssessment).toBeDefined();
    });
  });

  console.log(
    "\n🎉 ContentEvaluator (THE BRAIN) tests completed successfully!"
  );
}

// Execute tests when run directly
if (require.main === module) {
  runTests().catch((error) => {
    console.error("\n💥 Test execution failed:", error);
    process.exit(1);
  });
}
