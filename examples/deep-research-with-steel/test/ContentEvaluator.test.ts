import { config } from "dotenv";
config();

import { EventEmitter } from "events";
import { ContentEvaluator } from "../src/agents/ContentEvaluator";
import { SearchAgent } from "../src/agents/SearchAgent";
import { AIProviderFactory, SteelClient } from "../src/providers/providers";
import { SearchResult } from "../src/core/interfaces";
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
    console.log("🧪 Running ContentEvaluator Tests...\n");

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
function createTestEvaluator(): ContentEvaluator {
  const config = loadConfig();
  const provider = AIProviderFactory.createProvider(config.ai.provider);
  const eventEmitter = new EventEmitter();
  return new ContentEvaluator(provider, eventEmitter);
}

function createTestSearchAgent(): SearchAgent {
  const config = loadConfig();
  const steelClient = new SteelClient(config.steel.apiKey);
  const eventEmitter = new EventEmitter();
  return new SearchAgent(steelClient, eventEmitter);
}

function createIntegratedTestAgents(): { searchAgent: SearchAgent; contentEvaluator: ContentEvaluator } {
  const config = loadConfig();
  const steelClient = new SteelClient(config.steel.apiKey);
  const provider = AIProviderFactory.createProvider(config.ai.provider);
  const eventEmitter = new EventEmitter();
  
  return {
    searchAgent: new SearchAgent(steelClient, eventEmitter),
    contentEvaluator: new ContentEvaluator(provider, eventEmitter),
  };
}

// Test 1: Initialize ContentEvaluator
testRunner.test("ContentEvaluator - Initialize", async () => {
  const evaluator = createTestEvaluator();

  assertExists(evaluator, "ContentEvaluator should be created");
  assert(
    typeof evaluator.evaluateFindings === "function",
    "Should have evaluateFindings method"
  );
  assert(
    typeof evaluator.evaluateSimple === "function",
    "Should have evaluateSimple method"
  );
  assert(
    typeof evaluator.extractLearnings === "function",
    "Should have extractLearnings method"
  );
  assert(
    typeof evaluator.assessCompleteness === "function",
    "Should have assessCompleteness method"
  );

  console.log("   ✅ ContentEvaluator initialized with all required methods");
});

// Test 2: Simple evaluation with real content
testRunner.test("ContentEvaluator - Simple Evaluation", async () => {
  const evaluator = createTestEvaluator();

  const testQuery = "What is artificial intelligence?";
  const testContent = `Artificial intelligence (AI) is a broad field of computer science concerned with building smart machines capable of performing tasks that typically require human intelligence. AI systems can learn from data, recognize patterns, make decisions, and solve problems. Machine learning is a subset of AI that enables systems to automatically learn and improve from experience without being explicitly programmed. Deep learning, a subset of machine learning, uses neural networks with multiple layers to model and understand complex patterns in data.`;
  const testUrl = "https://example.com/ai-overview";

  const evaluation = await evaluator.evaluateSimple(
    testQuery,
    testContent,
    testUrl
  );

  assertExists(evaluation, "Evaluation should be returned");
  assertExists(evaluation.learnings, "Should have learnings");
  assertExists(
    evaluation.researchDirections,
    "Should have research directions"
  );
  assertExists(
    evaluation.completenessAssessment,
    "Should have completeness assessment"
  );

  assert(Array.isArray(evaluation.learnings), "Learnings should be an array");
  assert(
    Array.isArray(evaluation.researchDirections),
    "Research directions should be an array"
  );
  assert(
    typeof evaluation.confidenceLevel === "number",
    "Confidence level should be a number"
  );
  assert(
    evaluation.confidenceLevel >= 0 && evaluation.confidenceLevel <= 1,
    "Confidence level should be between 0 and 1"
  );

  console.log(
    `   ✅ Generated ${evaluation.learnings.length} learnings and ${evaluation.researchDirections.length} research directions`
  );
});

// Test 3: Evaluate findings with multiple sources
testRunner.test("ContentEvaluator - Evaluate Multiple Findings", async () => {
  const evaluator = createTestEvaluator();

  const testQuery = "What are the benefits of renewable energy?";
  const testFindings: SearchResult[] = [
    {
      id: "1",
      query: testQuery,
      url: "https://example.com/renewable-benefits",
      title: "Benefits of Renewable Energy",
      content:
        "Renewable energy sources like solar and wind power offer numerous environmental and economic benefits. They reduce greenhouse gas emissions, create jobs in growing industries, and provide energy independence. Solar energy costs have decreased by 70% since 2010, making it increasingly competitive with fossil fuels.",
      summary: "Renewable energy provides environmental and economic benefits.",
      relevanceScore: 0.9,
      timestamp: new Date(),
    },
    {
      id: "2",
      query: testQuery,
      url: "https://example.com/clean-energy-economics",
      title: "Clean Energy Economics",
      content:
        "The International Energy Agency reports that renewable energy investments reached $1.8 trillion in 2023. Clean energy sectors employed 35 million people globally in 2022, with solar photovoltaic being the largest employer at 4.9 million jobs. Wind energy contributed 3.3 million jobs worldwide.",
      summary:
        "Renewable energy sector shows strong investment and job growth.",
      relevanceScore: 0.8,
      timestamp: new Date(),
    },
  ];

  const evaluation = await evaluator.evaluateFindings(
    testQuery,
    testFindings,
    1,
    3
  );

  assertExists(evaluation, "Evaluation should be returned");
  assert(
    evaluation.learnings.length > 0,
    "Should extract learnings from multiple sources"
  );
  assert(
    evaluation.researchDirections.length >= 0,
    "Should identify research directions"
  );
  assert(
    typeof evaluation.completenessAssessment.coverage === "number",
    "Coverage should be a number"
  );
  assert(
    evaluation.completenessAssessment.coverage >= 0 &&
      evaluation.completenessAssessment.coverage <= 1,
    "Coverage should be between 0 and 1"
  );

  // Validate learning structure
  for (const learning of evaluation.learnings) {
    assert(
      typeof learning.content === "string",
      "Learning content should be a string"
    );
    assert(
      ["factual", "analytical", "procedural", "statistical"].includes(
        learning.type
      ),
      "Learning type should be valid"
    );
    assert(Array.isArray(learning.entities), "Entities should be an array");
    assert(
      typeof learning.confidence === "number",
      "Confidence should be a number"
    );
    assert(
      learning.confidence >= 0 && learning.confidence <= 1,
      "Confidence should be between 0 and 1"
    );
    assert(
      typeof learning.sourceUrl === "string",
      "Source URL should be a string"
    );
  }

  console.log(`   ✅ Successfully evaluated ${testFindings.length} findings`);
  console.log(
    `   ✅ Extracted ${evaluation.learnings.length} learnings with proper structure`
  );
});

// Test 4: Real API Integration - SearchAgent + ContentEvaluator
testRunner.test("ContentEvaluator - Real API Integration with SearchAgent", async () => {
  const { searchAgent, contentEvaluator } = createIntegratedTestAgents();
  
  const testQuery = "What is Node.js?";
  console.log(`   🔍 Searching for: "${testQuery}"`);
  
  // Get real search results from SearchAgent
  const serpResult = await searchAgent.searchSERP(testQuery, {
    maxResults: 3,
    timeout: 15000,
  });
  
  assertExists(serpResult, "SERP result should be returned");
  assertExists(serpResult.results, "SERP results should have results array");
  assert(Array.isArray(serpResult.results), "Results should be an array");
  assert(serpResult.results.length > 0, "Should have at least one search result");
  
  console.log(`   📊 Found ${serpResult.results.length} search results`);
  
  // Evaluate the real search findings
  const evaluation = await contentEvaluator.evaluateFindings(
    testQuery,
    serpResult.results,
    1,
    3
  );
  
  assertExists(evaluation, "Evaluation should be returned");
  assert(evaluation.learnings.length > 0, "Should extract learnings from real search results");
  assert(evaluation.researchDirections.length >= 0, "Should identify research directions");
  assert(typeof evaluation.completenessAssessment.coverage === "number", "Coverage should be a number");
  assert(evaluation.completenessAssessment.coverage >= 0 && evaluation.completenessAssessment.coverage <= 1, "Coverage should be between 0 and 1");
  
  // Validate learning structure with real data
  for (const learning of evaluation.learnings) {
    assert(typeof learning.content === "string", "Learning content should be a string");
    assert(["factual", "analytical", "procedural", "statistical"].includes(learning.type), "Learning type should be valid");
    assert(Array.isArray(learning.entities), "Entities should be an array");
    assert(typeof learning.confidence === "number", "Confidence should be a number");
    assert(learning.confidence >= 0 && learning.confidence <= 1, "Confidence should be between 0 and 1");
    assert(typeof learning.sourceUrl === "string", "Source URL should be a string");
  }
  
  console.log(`   ✅ Successfully evaluated ${serpResult.results.length} real search results`);
  console.log(`   ✅ Extracted ${evaluation.learnings.length} learnings from real web content`);
  console.log(`   ✅ Coverage: ${evaluation.completenessAssessment.coverage.toFixed(2)}`);
  console.log(`   ✅ Confidence: ${evaluation.confidenceLevel.toFixed(2)}`);
  console.log(`   ✅ Research directions: ${evaluation.researchDirections.length}`);
  
  // Sample some learning content for verification
  if (evaluation.learnings.length > 0) {
    const firstLearning = evaluation.learnings[0];
    if (firstLearning) {
      console.log(`   📚 Sample learning: "${firstLearning.content.substring(0, 100)}..."`);
    }
  }
});

// Test 5: Extract learnings from content
testRunner.test("ContentEvaluator - Extract Learnings", async () => {
  const evaluator = createTestEvaluator();

  const testContent =
    "According to the World Health Organization, over 80% of the world's population lives in areas with poor air quality. Air pollution causes approximately 7 million premature deaths annually. The most affected regions include South Asia and East Asia, where PM2.5 levels regularly exceed WHO guidelines by 5-10 times.";
  const testUrl = "https://example.com/air-quality-report";

  const learnings = await evaluator.extractLearnings(testContent, testUrl);

  assertExists(learnings, "Learnings should be extracted");
  assert(Array.isArray(learnings), "Learnings should be an array");
  assert(learnings.length > 0, "Should extract at least one learning");

  // Check first learning has proper structure
  if (learnings.length > 0) {
    const firstLearning = learnings[0]!; // Non-null assertion since we checked length
    assert(
      typeof firstLearning.content === "string",
      "Learning content should be a string"
    );
    assert(
      ["factual", "analytical", "procedural", "statistical"].includes(
        firstLearning.type
      ),
      "Learning type should be valid"
    );
    assert(
      Array.isArray(firstLearning.entities),
      "Entities should be an array"
    );
    assert(
      typeof firstLearning.confidence === "number",
      "Confidence should be a number"
    );
    assert(
      firstLearning.confidence >= 0 && firstLearning.confidence <= 1,
      "Confidence should be between 0 and 1"
    );
    assert(
      typeof firstLearning.sourceUrl === "string",
      "Source URL should be a string"
    );
  }

  console.log(
    `   ✅ Extracted ${learnings.length} learnings from test content`
  );
});

// Test 6: Assess completeness
testRunner.test("ContentEvaluator - Assess Completeness", async () => {
  const evaluator = createTestEvaluator();

  const testQuery = "What is the capital of France?";
  const testFindings: SearchResult[] = [
    {
      id: "1",
      query: testQuery,
      url: "https://example.com/paris-info",
      title: "Paris, France",
      content:
        "Paris is the capital and largest city of France. It is located in northern France on the River Seine.",
      summary: "Paris is the capital of France.",
      relevanceScore: 1.0,
      timestamp: new Date(),
    },
  ];

  const completeness = await evaluator.assessCompleteness(
    testQuery,
    testFindings
  );

  assertExists(completeness, "Completeness assessment should be returned");
  assert(
    typeof completeness.coverage === "number",
    "Coverage should be a number"
  );
  assert(
    completeness.coverage >= 0 && completeness.coverage <= 1,
    "Coverage should be between 0 and 1"
  );
  assert(
    Array.isArray(completeness.knowledgeGaps),
    "Knowledge gaps should be an array"
  );
  assert(
    typeof completeness.hasEnoughInfo === "boolean",
    "hasEnoughInfo should be a boolean"
  );
  assert(
    ["continue", "refine", "synthesize"].includes(
      completeness.recommendedAction
    ),
    "Recommended action should be valid"
  );

  console.log(
    `   ✅ Coverage: ${completeness.coverage}, Has enough info: ${completeness.hasEnoughInfo}`
  );
  console.log(`   ✅ Recommended action: ${completeness.recommendedAction}`);
});

// Test 7: Error handling - empty findings
testRunner.test(
  "ContentEvaluator - Error Handling Empty Findings",
  async () => {
    const evaluator = createTestEvaluator();

    let errorThrown = false;
    try {
      await evaluator.evaluateFindings("test query", [], 1, 3);
    } catch (error) {
      errorThrown = true;
      assert(error instanceof Error, "Should throw an error");
      assert(
        (error as Error).message.includes("No findings provided"),
        "Error message should be descriptive"
      );
      console.log(
        "   ✅ Properly handles empty findings with error:",
        (error as Error).message
      );
    }

    assert(errorThrown, "Should throw an error for empty findings");
  }
);

// Test 8: Event emission
testRunner.test("ContentEvaluator - Event Emission", async () => {
  const config = loadConfig();
  const provider = AIProviderFactory.createProvider(config.ai.provider);
  const eventEmitter = new EventEmitter();

  let progressEmitted = false;
  eventEmitter.on("progress", (data) => {
    progressEmitted = true;
    console.log(
      `   ✅ Progress event emitted: ${data.phase} (${data.progress}%)`
    );
  });

  const evaluator = new ContentEvaluator(provider, eventEmitter);

  const testQuery = "What is TypeScript?";
  const testContent =
    "TypeScript is a programming language developed by Microsoft. It is a strict syntactical superset of JavaScript and adds optional static type definitions to the language.";
  const testUrl = "https://example.com/typescript";

  await evaluator.evaluateSimple(testQuery, testContent, testUrl);

  assert(progressEmitted, "Progress event should be emitted");
  console.log("   ✅ Event emission working correctly");
});

// Run tests
testRunner.run().catch(console.error);
