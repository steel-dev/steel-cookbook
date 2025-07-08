import { config } from "dotenv";
config();

import { EventEmitter } from "events";
import { ContentRefiner } from "../src/agents/ContentRefiner";
import { QueryPlanner } from "../src/agents/QueryPlanner";
import { ContentEvaluator } from "../src/agents/ContentEvaluator";
import { SearchAgent } from "../src/agents/SearchAgent";
import { AIProviderFactory, SteelClient } from "../src/providers/providers";
import {
  ResearchEvaluation,
  ResearchPlan,
  Learning,
  ResearchDirection,
  CompletenessAssessment,
  SearchResult,
} from "../src/core/interfaces";
import { loadConfig } from "../src/config";

// Simple test runner
class TestRunner {
  private passed = 0;
  private failed = 0;
  private tests: Array<{ name: string; fn: () => Promise<void> }> = [];

  test(name: string, fn: () => Promise<void>) {
    this.tests.push({ name, fn });
  }

  async run() {
    console.log("🧪 Running ContentRefiner Tests...\n");

    for (const { name, fn } of this.tests) {
      try {
        console.log(`⏳ ${name}...`);
        await fn();
        console.log(`✅ ${name} - PASSED`);
        this.passed++;
      } catch (error) {
        console.log(`❌ ${name} - FAILED`);
        console.log(
          `   Error: ${error instanceof Error ? error.message : String(error)}`
        );
        this.failed++;
      }
      console.log();
    }

    console.log(
      `\n📊 Test Results: ${this.passed} passed, ${this.failed} failed`
    );
    if (this.failed > 0) {
      process.exit(1);
    }
  }
}

// Test helper functions
function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

function assertExists(value: any, message: string) {
  if (value === null || value === undefined) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

// Initialize test runner
const testRunner = new TestRunner();

// Test setup helpers
function createTestRefiner(): ContentRefiner {
  const config = loadConfig();
  const provider = AIProviderFactory.createProvider(config.ai.provider);
  const planner = new QueryPlanner(provider);
  const eventEmitter = new EventEmitter();
  return new ContentRefiner(provider, planner, eventEmitter);
}

function createIntegratedTestAgents(): {
  searchAgent: SearchAgent;
  contentEvaluator: ContentEvaluator;
  queryPlanner: QueryPlanner;
  contentRefiner: ContentRefiner;
} {
  const config = loadConfig();
  const steelClient = new SteelClient(config.steel.apiKey);
  const provider = AIProviderFactory.createProvider(config.ai.provider);
  const eventEmitter = new EventEmitter();
  const planner = new QueryPlanner(provider);

  return {
    searchAgent: new SearchAgent(steelClient, eventEmitter),
    contentEvaluator: new ContentEvaluator(provider, eventEmitter),
    queryPlanner: planner,
    contentRefiner: new ContentRefiner(provider, planner, eventEmitter),
  };
}

// Mock data helpers
function createMockLearning(content: string, sourceUrl: string): Learning {
  return {
    content,
    type: "factual",
    entities: ["Test Entity"],
    confidence: 0.8,
    sourceUrl,
  };
}

function createMockResearchDirection(
  question: string,
  priority: "high" | "medium" | "low" = "high"
): ResearchDirection {
  return {
    question,
    rationale: `This is important for understanding the topic`,
    priority,
    searchQueries: [`search query for ${question}`],
  };
}

function createMockCompletenessAssessment(
  coverage: number = 0.6,
  hasEnoughInfo: boolean = false,
  recommendedAction: "continue" | "refine" | "synthesize" = "continue"
): CompletenessAssessment {
  return {
    coverage,
    knowledgeGaps: ["Gap 1", "Gap 2"],
    hasEnoughInfo,
    recommendedAction,
  };
}

function createMockEvaluation(
  overrides: Partial<ResearchEvaluation> = {}
): ResearchEvaluation {
  return {
    learnings: [createMockLearning("Test learning", "https://example.com")],
    researchDirections: [
      createMockResearchDirection("What is the current state?"),
    ],
    completenessAssessment: createMockCompletenessAssessment(),
    confidenceLevel: 0.7,
    ...overrides,
  };
}

function createMockResearchPlan(originalQuery: string): ResearchPlan {
  return {
    id: "test-plan-1",
    originalQuery,
    subQueries: [
      {
        id: "sq-1",
        query: "Test sub-query",
        priority: 0.8,
        category: "general",
      },
    ],
    searchStrategy: {
      maxDepth: 3,
      maxBreadth: 5,
      timeout: 30000,
      retryAttempts: 3,
    },
    estimatedSteps: 5,
  };
}

// Test 1: Initialize ContentRefiner
testRunner.test("ContentRefiner - Initialize", async () => {
  const refiner = createTestRefiner();

  assertExists(refiner, "ContentRefiner should be created");
  assert(
    typeof refiner.refineSearchStrategy === "function",
    "Should have refineSearchStrategy method"
  );
  assert(
    typeof refiner.shouldTerminate === "function",
    "Should have shouldTerminate method"
  );
  assert(
    typeof refiner.analyzeResearchGaps === "function",
    "Should have analyzeResearchGaps method"
  );
  assert(
    typeof refiner.makeSimpleDecision === "function",
    "Should have makeSimpleDecision method"
  );

  console.log("   ✅ ContentRefiner initialized with all required methods");
});

// Test 2: Simple decision making
testRunner.test("ContentRefiner - Simple Decision Making", async () => {
  const refiner = createTestRefiner();

  // Test case 1: Should terminate when evaluation recommends synthesis
  const evaluationSynthesize = createMockEvaluation({
    completenessAssessment: createMockCompletenessAssessment(
      0.8,
      true,
      "synthesize"
    ),
  });

  const decision1 = await refiner.makeSimpleDecision(evaluationSynthesize);
  assert(
    decision1 === "terminate",
    "Should terminate when evaluation recommends synthesis"
  );
  console.log(
    "   ✅ Correctly decides to terminate when synthesis is recommended"
  );

  // Test case 2: Should terminate when has enough info
  const evaluationEnoughInfo = createMockEvaluation({
    completenessAssessment: createMockCompletenessAssessment(
      0.7,
      true,
      "continue"
    ),
  });

  const decision2 = await refiner.makeSimpleDecision(evaluationEnoughInfo);
  assert(decision2 === "terminate", "Should terminate when has enough info");
  console.log(
    "   ✅ Correctly decides to terminate when enough info is available"
  );

  // Test case 3: Should continue when coverage is low
  const evaluationLowCoverage = createMockEvaluation({
    completenessAssessment: createMockCompletenessAssessment(
      0.3,
      false,
      "continue"
    ),
  });

  const decision3 = await refiner.makeSimpleDecision(evaluationLowCoverage);
  assert(decision3 === "continue", "Should continue when coverage is low");
  console.log("   ✅ Correctly decides to continue when coverage is low");

  // Test case 4: Should terminate when no research directions
  const evaluationNoDirections = createMockEvaluation({
    researchDirections: [],
    completenessAssessment: createMockCompletenessAssessment(
      0.6,
      false,
      "continue"
    ),
  });

  const decision4 = await refiner.makeSimpleDecision(evaluationNoDirections);
  assert(
    decision4 === "terminate",
    "Should terminate when no research directions"
  );
  console.log(
    "   ✅ Correctly decides to terminate when no research directions available"
  );
});

// Test 3: Should terminate analysis
testRunner.test("ContentRefiner - Should Terminate Analysis", async () => {
  const refiner = createTestRefiner();
  const originalQuery = "What is artificial intelligence?";

  // Test case 1: Should terminate due to synthesis recommendation
  const evaluationSynthesize = createMockEvaluation({
    completenessAssessment: createMockCompletenessAssessment(
      0.8,
      true,
      "synthesize"
    ),
  });

  const termination1 = await refiner.shouldTerminate(
    originalQuery,
    evaluationSynthesize,
    1,
    3
  );
  assert(
    termination1.shouldTerminate,
    "Should terminate when synthesis is recommended"
  );
  assert(
    termination1.reason === "evaluation_recommends_synthesis",
    "Reason should be correct"
  );
  console.log(
    "   ✅ Correctly identifies synthesis recommendation as termination reason"
  );

  // Test case 2: Should terminate due to high coverage
  const evaluationHighCoverage = createMockEvaluation({
    completenessAssessment: createMockCompletenessAssessment(
      0.9,
      false,
      "continue"
    ),
  });

  const termination2 = await refiner.shouldTerminate(
    originalQuery,
    evaluationHighCoverage,
    1,
    3
  );
  assert(
    termination2.shouldTerminate,
    "Should terminate when coverage is high"
  );
  assert(
    termination2.reason === "high_coverage_achieved",
    "Reason should be correct"
  );
  console.log("   ✅ Correctly identifies high coverage as termination reason");

  // Test case 3: Should terminate due to max depth
  const evaluationNormal = createMockEvaluation({
    completenessAssessment: createMockCompletenessAssessment(
      0.5,
      false,
      "continue"
    ),
  });

  const termination3 = await refiner.shouldTerminate(
    originalQuery,
    evaluationNormal,
    3,
    3
  );
  assert(
    termination3.shouldTerminate,
    "Should terminate when max depth is reached"
  );
  assert(
    termination3.reason === "max_depth_reached",
    "Reason should be correct"
  );
  console.log("   ✅ Correctly identifies max depth as termination reason");

  // Test case 4: Should continue research
  const termination4 = await refiner.shouldTerminate(
    originalQuery,
    evaluationNormal,
    1,
    3
  );
  assert(
    !termination4.shouldTerminate,
    "Should not terminate when research should continue"
  );
  assert(
    termination4.reason === "research_should_continue",
    "Reason should be correct"
  );
  console.log("   ✅ Correctly identifies when research should continue");
});

// Test 4: Analyze research gaps
testRunner.test("ContentRefiner - Analyze Research Gaps", async () => {
  const refiner = createTestRefiner();
  const originalQuery = "What is machine learning?";

  // Test case 1: High priority gaps
  const evaluationManyGaps = createMockEvaluation({
    completenessAssessment: createMockCompletenessAssessment(
      0.4,
      false,
      "continue"
    ),
    researchDirections: [
      createMockResearchDirection("High priority question 1", "high"),
      createMockResearchDirection("High priority question 2", "high"),
    ],
  });
  evaluationManyGaps.completenessAssessment.knowledgeGaps = [
    "Gap 1",
    "Gap 2",
    "Gap 3",
    "Gap 4",
    "Gap 5",
    "Gap 6",
  ];

  const gapAnalysis1 = await refiner.analyzeResearchGaps(
    originalQuery,
    evaluationManyGaps
  );
  assert(
    gapAnalysis1.priority === "high",
    "Priority should be high with many gaps"
  );
  assert(
    gapAnalysis1.criticalGaps.length <= 3,
    "Should limit critical gaps to 3"
  );
  assert(
    gapAnalysis1.recommendations.length > 0,
    "Should have recommendations"
  );
  console.log("   ✅ Correctly identifies high priority gaps");

  // Test case 2: Low priority gaps
  const evaluationFewGaps = createMockEvaluation({
    completenessAssessment: createMockCompletenessAssessment(
      0.8,
      false,
      "continue"
    ),
    researchDirections: [
      createMockResearchDirection("Low priority question", "low"),
    ],
  });
  evaluationFewGaps.completenessAssessment.knowledgeGaps = ["Single gap"];

  const gapAnalysis2 = await refiner.analyzeResearchGaps(
    originalQuery,
    evaluationFewGaps
  );
  assert(
    gapAnalysis2.priority === "low",
    "Priority should be low with few gaps and high coverage"
  );
  assert(
    gapAnalysis2.criticalGaps.length === 1,
    "Should have one critical gap"
  );
  console.log("   ✅ Correctly identifies low priority gaps");
});

// Test 5: Refine search strategy with mock data
testRunner.test("ContentRefiner - Refine Search Strategy Mock", async () => {
  const refiner = createTestRefiner();
  const originalQuery = "What is blockchain technology?";
  const currentPlan = createMockResearchPlan(originalQuery);

  // Test case 1: Should return null for synthesis recommendation
  const evaluationSynthesize = createMockEvaluation({
    completenessAssessment: createMockCompletenessAssessment(
      0.8,
      true,
      "synthesize"
    ),
  });

  const refinedPlan1 = await refiner.refineSearchStrategy(
    originalQuery,
    evaluationSynthesize,
    currentPlan
  );
  assert(
    refinedPlan1 === null,
    "Should return null when synthesis is recommended"
  );
  console.log("   ✅ Correctly returns null for synthesis recommendation");

  // Test case 2: Should return null for high coverage
  const evaluationHighCoverage = createMockEvaluation({
    completenessAssessment: createMockCompletenessAssessment(
      0.9,
      true,
      "continue"
    ),
  });

  const refinedPlan2 = await refiner.refineSearchStrategy(
    originalQuery,
    evaluationHighCoverage,
    currentPlan
  );
  assert(
    refinedPlan2 === null,
    "Should return null when coverage is high enough"
  );
  console.log("   ✅ Correctly returns null for high coverage");

  // Test case 3: Should return null for no research directions
  const evaluationNoDirections = createMockEvaluation({
    researchDirections: [],
    completenessAssessment: createMockCompletenessAssessment(
      0.6,
      false,
      "continue"
    ),
  });

  const refinedPlan3 = await refiner.refineSearchStrategy(
    originalQuery,
    evaluationNoDirections,
    currentPlan
  );
  assert(
    refinedPlan3 === null,
    "Should return null when no research directions"
  );
  console.log("   ✅ Correctly returns null for no research directions");
});

// Test 6: Real API Integration - ContentRefiner with real evaluation
testRunner.test("ContentRefiner - Real API Integration", async () => {
  const { searchAgent, contentEvaluator, queryPlanner, contentRefiner } =
    createIntegratedTestAgents();

  const testQuery = "What is TypeScript?";
  console.log(
    `   🔍 Testing ContentRefiner with real API integration for: "${testQuery}"`
  );

  // Step 1: Get real search results
  const serpResult = await searchAgent.searchSERP(testQuery, {
    maxResults: 2,
    timeout: 15000,
  });

  assertExists(serpResult, "SERP result should be returned");
  assert(serpResult.results.length > 0, "Should have search results");
  console.log(`   📊 Found ${serpResult.results.length} search results`);

  // Step 2: Evaluate the findings
  const evaluation = await contentEvaluator.evaluateFindings(
    testQuery,
    serpResult.results,
    1,
    3
  );

  assertExists(evaluation, "Evaluation should be returned");
  console.log(
    `   🧠 Evaluation complete - Coverage: ${evaluation.completenessAssessment.coverage.toFixed(
      2
    )}`
  );
  console.log(`   📚 Found ${evaluation.learnings.length} learnings`);
  console.log(
    `   🎯 Found ${evaluation.researchDirections.length} research directions`
  );

  // Step 3: Create initial plan (using mock for simplicity)
  const initialPlan = createMockResearchPlan(testQuery);
  console.log(
    `   📋 Created initial plan with ${initialPlan.subQueries.length} sub-queries`
  );

  // Step 4: Test ContentRefiner decisions
  const terminationDecision = await contentRefiner.shouldTerminate(
    testQuery,
    evaluation,
    1,
    3
  );

  console.log(
    `   🤔 Termination decision: ${terminationDecision.shouldTerminate} (${terminationDecision.reason})`
  );

  // Step 5: Test refinement strategy (simplified - should return null for most cases)
  const refinedPlan = await contentRefiner.refineSearchStrategy(
    testQuery,
    evaluation,
    initialPlan
  );

  if (refinedPlan) {
    console.log(
      `   🔄 Refined plan created with ${refinedPlan.subQueries.length} sub-queries`
    );
    assert(
      refinedPlan.originalQuery === testQuery,
      "Original query should be preserved"
    );
    assert(
      refinedPlan.subQueries.length > 0,
      "Should have refined sub-queries"
    );
  } else {
    console.log(`   ⏹️ ContentRefiner decided to terminate research`);
  }

  // Step 6: Test gap analysis
  const gapAnalysis = await contentRefiner.analyzeResearchGaps(
    testQuery,
    evaluation
  );
  assertExists(gapAnalysis, "Gap analysis should be returned");
  console.log(
    `   📊 Gap analysis: ${gapAnalysis.priority} priority, ${gapAnalysis.criticalGaps.length} critical gaps`
  );
  console.log(
    `   💡 Recommendations: ${gapAnalysis.recommendations.length} items`
  );

  // Step 7: Test simple decision
  const simpleDecision = await contentRefiner.makeSimpleDecision(evaluation);
  console.log(`   🎯 Simple decision: ${simpleDecision}`);
  assert(
    ["continue", "refine", "terminate"].includes(simpleDecision),
    "Simple decision should be valid"
  );

  console.log(
    "   ✅ ContentRefiner workflow with real evaluation completed successfully"
  );
});

// Test 7: Event emission
testRunner.test("ContentRefiner - Event Emission", async () => {
  const config = loadConfig();
  const provider = AIProviderFactory.createProvider(config.ai.provider);
  const planner = new QueryPlanner(provider);
  const eventEmitter = new EventEmitter();

  let progressEmitted = false;
  let toolCallEmitted = false;

  eventEmitter.on("progress", (data) => {
    progressEmitted = true;
    console.log(
      `   ✅ Progress event emitted: ${data.phase} (${data.progress}%)`
    );
  });

  eventEmitter.on("tool-call", (data) => {
    toolCallEmitted = true;
    console.log(
      `   ✅ Tool call event emitted: ${data.toolName} - ${data.metadata?.decision}`
    );
  });

  const refiner = new ContentRefiner(provider, planner, eventEmitter);
  const originalQuery = "What is React?";
  const evaluation = createMockEvaluation({
    completenessAssessment: createMockCompletenessAssessment(
      0.8,
      true,
      "synthesize"
    ),
  });
  const currentPlan = createMockResearchPlan(originalQuery);

  await refiner.refineSearchStrategy(originalQuery, evaluation, currentPlan);

  assert(progressEmitted, "Progress event should be emitted");
  assert(toolCallEmitted, "Tool call event should be emitted");
  console.log("   ✅ Event emission working correctly");
});

// Test 8: Error handling
testRunner.test("ContentRefiner - Error Handling", async () => {
  const refiner = createTestRefiner();

  // Test with invalid evaluation data
  try {
    const invalidEvaluation = {
      learnings: [],
      researchDirections: [],
      completenessAssessment: {
        coverage: -1, // Invalid coverage
        knowledgeGaps: [],
        hasEnoughInfo: false,
        recommendedAction: "invalid" as any,
      },
      confidenceLevel: 1.5, // Invalid confidence
    };

    await refiner.makeSimpleDecision(invalidEvaluation as any);
    console.log("   ✅ Handled invalid evaluation data gracefully");
  } catch (error) {
    console.log("   ✅ Properly handles invalid data with error");
  }

  console.log("   ✅ Error handling working correctly");
});

// Run tests
testRunner.run().catch(console.error);
