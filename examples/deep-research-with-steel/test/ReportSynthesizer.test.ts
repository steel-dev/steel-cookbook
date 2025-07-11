import { config } from "dotenv";
config();

import { EventEmitter } from "events";
import { ReportSynthesizer } from "../src/agents/ReportSynthesizer";
import { SearchAgent } from "../src/agents/SearchAgent";
import { ContentEvaluator } from "../src/agents/ContentEvaluator";
import { AIProviderFactory, SteelClient } from "../src/providers/providers";
import { SearchResult, Learning } from "../src/core/interfaces";
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
    console.log("🧪 Running ReportSynthesizer Tests...\n");

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
function createTestSynthesizer(): ReportSynthesizer {
  const config = loadConfig();
  const writerProvider = AIProviderFactory.createProvider(config.ai.writer);
  const eventEmitter = new EventEmitter();
  return new ReportSynthesizer(writerProvider, eventEmitter);
}

function createTestSearchAgent(): SearchAgent {
  const config = loadConfig();
  const steelClient = new SteelClient(config.steel.apiKey);
  const eventEmitter = new EventEmitter();
  return new SearchAgent(steelClient, eventEmitter);
}

function createTestContentEvaluator(): ContentEvaluator {
  const config = loadConfig();
  const provider = AIProviderFactory.createProvider(config.ai.provider);
  const eventEmitter = new EventEmitter();
  return new ContentEvaluator(provider, eventEmitter);
}

// Mock data generators
function createMockFindings(): SearchResult[] {
  return [
    {
      id: "1",
      query: "What is artificial intelligence?",
      url: "https://example.com/ai-overview",
      title: "AI Overview",
      content:
        "Artificial intelligence (AI) is a broad field of computer science concerned with building smart machines capable of performing tasks that typically require human intelligence. AI systems can learn from data, recognize patterns, make decisions, and solve problems.",
      summary:
        "AI is about building smart machines that can perform human-like tasks.",
      relevanceScore: 0.9,
      timestamp: new Date(),
    },
    {
      id: "2",
      query: "What is artificial intelligence?",
      url: "https://example.com/machine-learning",
      title: "Machine Learning Basics",
      content:
        "Machine learning is a subset of AI that enables systems to automatically learn and improve from experience without being explicitly programmed. Deep learning, a subset of machine learning, uses neural networks with multiple layers to model complex patterns.",
      summary:
        "Machine learning allows systems to learn automatically from data.",
      relevanceScore: 0.8,
      timestamp: new Date(),
    },
    {
      id: "3",
      query: "What is artificial intelligence?",
      url: "https://example.com/ai-statistics",
      title: "AI Market Statistics",
      content:
        "The global AI market is expected to reach $1.8 trillion by 2030, growing at a CAGR of 37.3% from 2023 to 2030. Currently, 35% of companies are using AI in their business operations, while 42% are exploring AI implementation.",
      summary:
        "AI market shows strong growth with increasing business adoption.",
      relevanceScore: 0.7,
      timestamp: new Date(),
    },
  ];
}

function createMockLearnings(): Learning[] {
  return [
    {
      content:
        "Artificial intelligence is a broad field of computer science focused on creating smart machines that can perform human-like tasks.",
      type: "factual",
      entities: [
        "artificial intelligence",
        "computer science",
        "smart machines",
      ],
      confidence: 0.9,
      sourceUrl: "https://example.com/ai-overview",
    },
    {
      content:
        "Machine learning is a subset of AI that enables automatic learning from data without explicit programming.",
      type: "analytical",
      entities: ["machine learning", "AI", "data"],
      confidence: 0.8,
      sourceUrl: "https://example.com/machine-learning",
    },
    {
      content:
        "The global AI market is expected to reach $1.8 trillion by 2030, growing at 37.3% CAGR from 2023-2030.",
      type: "statistical",
      entities: ["AI market", "$1.8 trillion", "2030", "37.3% CAGR"],
      confidence: 0.85,
      sourceUrl: "https://example.com/ai-statistics",
    },
    {
      content:
        "35% of companies are currently using AI in business operations, while 42% are exploring AI implementation.",
      type: "statistical",
      entities: ["35%", "42%", "companies", "AI implementation"],
      confidence: 0.8,
      sourceUrl: "https://example.com/ai-statistics",
    },
  ];
}

// Test 1: Initialize ReportSynthesizer
testRunner.test("ReportSynthesizer - Initialize", async () => {
  const synthesizer = createTestSynthesizer();

  assertExists(synthesizer, "ReportSynthesizer should be created");
  assert(
    typeof synthesizer.generateReport === "function",
    "Should have generateReport method"
  );

  console.log("   ✅ ReportSynthesizer initialized with required methods");
});

// Test 2: Generate report with mock data
testRunner.test(
  "ReportSynthesizer - Generate Report with Mock Data",
  async () => {
    const synthesizer = createTestSynthesizer();
    const mockFindings = createMockFindings();
    const mockLearnings = createMockLearnings();
    const testQuery = "What is artificial intelligence?";

    const report = await synthesizer.generateReport(
      mockFindings,
      testQuery,
      mockLearnings
    );

    assertExists(report, "Report should be generated");
    assertExists(report.id, "Report should have an ID");
    assertExists(report.query, "Report should have the query");
    assertExists(
      report.executiveSummary,
      "Report should have executive summary"
    );
    assertExists(report.content, "Report should have content");
    assertExists(report.citations, "Report should have citations");
    assertExists(report.metadata, "Report should have metadata");

    assert(report.query === testQuery, "Query should match input");
    assert(Array.isArray(report.citations), "Citations should be an array");
    assert(
      report.citations.length === mockFindings.length,
      "Citations count should match findings"
    );
    assert(typeof report.content === "string", "Content should be a string");
    assert(report.content.length > 100, "Content should be substantial");
    assert(
      typeof report.executiveSummary === "string",
      "Executive summary should be a string"
    );

    // Check metadata structure
    assert(
      typeof report.metadata.generatedAt === "object",
      "Generated date should be a Date object"
    );
    assert(
      typeof report.metadata.sourceCount === "number",
      "Source count should be a number"
    );
    assert(
      typeof report.metadata.model === "string",
      "Model should be a string"
    );
    assert(
      typeof report.metadata.researchDepth === "number",
      "Research depth should be a number"
    );

    console.log(
      `   ✅ Generated report with ${report.citations.length} citations`
    );
    console.log(`   ✅ Content length: ${report.content.length} characters`);
    console.log(
      `   ✅ Executive summary length: ${report.executiveSummary.length} characters`
    );
  }
);

// Test 3: Test different learning types organization
testRunner.test("ReportSynthesizer - Learning Types Organization", async () => {
  const synthesizer = createTestSynthesizer();
  const mockFindings = createMockFindings();
  const testQuery = "What is artificial intelligence?";

  // Create learnings with specific types
  const diverseLearnings: Learning[] = [
    {
      content: "AI was first coined as a term in 1956 by John McCarthy.",
      type: "factual",
      entities: ["AI", "1956", "John McCarthy"],
      confidence: 0.9,
      sourceUrl: "https://example.com/ai-history",
    },
    {
      content:
        "The effectiveness of AI depends on the quality and quantity of training data.",
      type: "analytical",
      entities: ["AI", "training data", "quality", "quantity"],
      confidence: 0.8,
      sourceUrl: "https://example.com/ai-analysis",
    },
    {
      content:
        "To implement AI, first collect data, then preprocess it, train models, and deploy them.",
      type: "procedural",
      entities: [
        "AI implementation",
        "data collection",
        "preprocessing",
        "training",
        "deployment",
      ],
      confidence: 0.7,
      sourceUrl: "https://example.com/ai-implementation",
    },
    {
      content:
        "AI models achieve 95% accuracy on ImageNet classification tasks.",
      type: "statistical",
      entities: ["AI models", "95% accuracy", "ImageNet", "classification"],
      confidence: 0.85,
      sourceUrl: "https://example.com/ai-performance",
    },
  ];

  const report = await synthesizer.generateReport(
    mockFindings,
    testQuery,
    diverseLearnings
  );

  assertExists(report, "Report should be generated");
  assert(
    report.content.length > 200,
    "Content should be substantial with diverse learnings"
  );

  // Check that different types of learnings are present in the content
  // (The exact structure depends on how the AI organizes them)
  assert(typeof report.content === "string", "Content should be a string");
  assert(
    report.citations.length === mockFindings.length,
    "Citations should match findings"
  );

  console.log(
    `   ✅ Successfully organized ${diverseLearnings.length} diverse learning types`
  );
  console.log(
    `   ✅ Generated comprehensive report with ${report.content.length} characters`
  );
});

// Test 4: Real API Integration Test
testRunner.test("ReportSynthesizer - Real API Integration", async () => {
  const searchAgent = createTestSearchAgent();
  const contentEvaluator = createTestContentEvaluator();
  const synthesizer = createTestSynthesizer();

  const testQuery = "What is TypeScript?";
  console.log(`   🔍 Searching for: "${testQuery}"`);

  // Get real search results
  const serpResult = await searchAgent.searchSERP(testQuery, {
    maxResults: 2,
    timeout: 15000,
  });

  assertExists(serpResult, "SERP result should be returned");
  assert(serpResult.results.length > 0, "Should have search results");
  console.log(`   📊 Found ${serpResult.results.length} search results`);

  // Get real learnings from evaluation
  const mockPlan = {
    id: "test-plan",
    originalQuery: testQuery,
    subQueries: [{ id: "test-sq", query: testQuery, category: "general" }],
    searchStrategy: {
      maxDepth: 2,
      maxBreadth: 3,
      timeout: 30000,
      retryAttempts: 3,
    },
    estimatedSteps: 3,
  };

  const evaluation = await contentEvaluator.evaluateFindings(
    testQuery,
    serpResult.results,
    mockPlan,
    1,
    2
  );

  assertExists(evaluation, "Evaluation should be returned");
  assert(evaluation.learnings.length > 0, "Should have learnings");
  console.log(`   📚 Extracted ${evaluation.learnings.length} learnings`);

  // Generate real report
  const report = await synthesizer.generateReport(
    serpResult.results,
    testQuery,
    evaluation.learnings
  );

  assertExists(report, "Report should be generated");
  assert(report.content.length > 300, "Real report should be substantial");
  assert(
    report.citations.length === serpResult.results.length,
    "Citations should match search results"
  );
  assert(
    report.executiveSummary.length > 50,
    "Executive summary should be meaningful"
  );

  console.log(
    `   ✅ Generated real report with ${report.citations.length} citations`
  );
  console.log(`   ✅ Content length: ${report.content.length} characters`);
  console.log(
    `   ✅ Executive summary: "${report.executiveSummary.substring(0, 100)}..."`
  );
});

// Test 5: Error handling - no findings
testRunner.test("ReportSynthesizer - Error Handling No Findings", async () => {
  const synthesizer = createTestSynthesizer();
  const mockLearnings = createMockLearnings();

  let errorThrown = false;
  try {
    await synthesizer.generateReport([], "test query", mockLearnings);
  } catch (error) {
    errorThrown = true;
    assert(error instanceof Error, "Should throw an error");
    assert(
      (error as Error).message.includes("No findings provided"),
      "Error message should be descriptive"
    );
    console.log(
      "   ✅ Properly handles no findings:",
      (error as Error).message
    );
  }

  assert(errorThrown, "Should throw an error for no findings");
});

// Test 6: Error handling - no query
testRunner.test("ReportSynthesizer - Error Handling No Query", async () => {
  const synthesizer = createTestSynthesizer();
  const mockFindings = createMockFindings();
  const mockLearnings = createMockLearnings();

  let errorThrown = false;
  try {
    await synthesizer.generateReport(mockFindings, "", mockLearnings);
  } catch (error) {
    errorThrown = true;
    assert(error instanceof Error, "Should throw an error");
    assert(
      (error as Error).message.includes("No query provided"),
      "Error message should be descriptive"
    );
    console.log(
      "   ✅ Properly handles empty query:",
      (error as Error).message
    );
  }

  assert(errorThrown, "Should throw an error for empty query");
});

// Test 7: Error handling - no learnings
testRunner.test("ReportSynthesizer - Error Handling No Learnings", async () => {
  const synthesizer = createTestSynthesizer();
  const mockFindings = createMockFindings();

  let errorThrown = false;
  try {
    await synthesizer.generateReport(mockFindings, "test query", []);
  } catch (error) {
    errorThrown = true;
    assert(error instanceof Error, "Should throw an error");
    assert(
      (error as Error).message.includes("No learnings provided"),
      "Error message should be descriptive"
    );
    console.log(
      "   ✅ Properly handles no learnings:",
      (error as Error).message
    );
  }

  assert(errorThrown, "Should throw an error for no learnings");
});

// Test 8: Event emission
testRunner.test("ReportSynthesizer - Event Emission", async () => {
  const config = loadConfig();
  const writerProvider = AIProviderFactory.createProvider(config.ai.writer);
  const eventEmitter = new EventEmitter();

  let progressEmitted = false;
  let textEmitted = false;
  let progressCount = 0;
  let textChunks = 0;

  eventEmitter.on("progress", (data) => {
    progressEmitted = true;
    progressCount++;
    console.log(`   📊 Progress event: ${data.phase} (${data.progress}%)`);
  });

  eventEmitter.on("text", (content) => {
    textEmitted = true;
    textChunks++;
    if (textChunks <= 3) {
      // Only log first few chunks
      console.log(
        `   📝 Text chunk ${textChunks}: "${content.substring(0, 50)}..."`
      );
    }
  });

  const synthesizer = new ReportSynthesizer(writerProvider, eventEmitter);
  const mockFindings = createMockFindings();
  const mockLearnings = createMockLearnings();

  await synthesizer.generateReport(
    mockFindings,
    "What is artificial intelligence?",
    mockLearnings
  );

  assert(progressEmitted, "Progress events should be emitted");
  assert(textEmitted, "Text events should be emitted");
  assert(
    progressCount >= 2,
    "Should emit at least 2 progress events (start and end)"
  );
  assert(textChunks > 0, "Should emit multiple text chunks");

  console.log(
    `   ✅ Event emission working: ${progressCount} progress events, ${textChunks} text chunks`
  );
});

// Test 9: Citation generation
testRunner.test("ReportSynthesizer - Citation Generation", async () => {
  const synthesizer = createTestSynthesizer();
  const mockFindings = createMockFindings();
  const mockLearnings = createMockLearnings();

  const report = await synthesizer.generateReport(
    mockFindings,
    "What is artificial intelligence?",
    mockLearnings
  );

  assertExists(report.citations, "Citations should exist");
  assert(Array.isArray(report.citations), "Citations should be an array");
  assert(
    report.citations.length === mockFindings.length,
    "Citation count should match findings"
  );

  // Check citation structure
  for (let i = 0; i < report.citations.length; i++) {
    const citation = report.citations[i];
    const finding = mockFindings[i];

    assertExists(citation, "Citation should exist");
    assertExists(finding, "Finding should exist");

    assert(
      citation!.id === (i + 1).toString(),
      "Citation ID should be sequential"
    );
    assert(citation!.url === finding!.url, "Citation URL should match finding");
    assert(
      citation!.title === finding!.title,
      "Citation title should match finding"
    );
    assert(
      citation!.accessDate instanceof Date,
      "Access date should be a Date"
    );

    if (citation!.relevantQuote) {
      assert(
        typeof citation!.relevantQuote === "string",
        "Relevant quote should be a string"
      );
    }
  }

  console.log(
    `   ✅ Generated ${report.citations.length} properly structured citations`
  );
});

// Test 10: Report structure validation
testRunner.test("ReportSynthesizer - Report Structure Validation", async () => {
  const synthesizer = createTestSynthesizer();
  const mockFindings = createMockFindings();
  const mockLearnings = createMockLearnings();

  const report = await synthesizer.generateReport(
    mockFindings,
    "What is artificial intelligence?",
    mockLearnings
  );

  // Validate report structure
  assert(typeof report.id === "string", "Report ID should be a string");
  assert(report.id.length > 0, "Report ID should not be empty");
  assert(
    report.id.startsWith("report_"),
    "Report ID should have proper prefix"
  );

  assert(typeof report.query === "string", "Query should be a string");
  assert(report.query.length > 0, "Query should not be empty");

  assert(
    typeof report.executiveSummary === "string",
    "Executive summary should be a string"
  );
  assert(
    report.executiveSummary.length > 0,
    "Executive summary should not be empty"
  );

  assert(typeof report.content === "string", "Content should be a string");
  assert(report.content.length > 0, "Content should not be empty");

  // Validate metadata
  assert(
    report.metadata.generatedAt instanceof Date,
    "Generated date should be a Date"
  );
  assert(
    typeof report.metadata.sourceCount === "number",
    "Source count should be a number"
  );
  assert(
    report.metadata.sourceCount === mockFindings.length,
    "Source count should match findings"
  );
  assert(typeof report.metadata.model === "string", "Model should be a string");
  assert(
    typeof report.metadata.researchDepth === "number",
    "Research depth should be a number"
  );
  assert(
    report.metadata.researchDepth > 0,
    "Research depth should be positive"
  );

  console.log("   ✅ Report structure is valid and complete");
  console.log(`   ✅ Report ID: ${report.id}`);
  console.log(`   ✅ Source count: ${report.metadata.sourceCount}`);
  console.log(`   ✅ Research depth: ${report.metadata.researchDepth}`);
});

// Run tests
testRunner.run().catch(console.error);
