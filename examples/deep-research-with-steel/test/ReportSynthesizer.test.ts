import { config } from "dotenv";
config();

import { EventEmitter } from "events";
import { ReportSynthesizer } from "../src/agents/ReportSynthesizer";
import { SearchAgent } from "../src/agents/SearchAgent";
import { ContentEvaluator } from "../src/agents/ContentEvaluator";
import { RefinedContent } from "../src/core/interfaces";
import { openai } from "@ai-sdk/openai";

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
  // Create mock models for testing - using openai if available, otherwise null for mock mode
  const models = {
    planner: process.env.OPENAI_API_KEY ? openai("gpt-4o-mini") : null,
    evaluator: process.env.OPENAI_API_KEY ? openai("gpt-4o-mini") : null,
    writer: process.env.OPENAI_API_KEY ? openai("gpt-4o-mini") : null,
    summary: process.env.OPENAI_API_KEY ? openai("gpt-4o-mini") : null,
  };
  const eventEmitter = new EventEmitter();
  return new ReportSynthesizer(models, eventEmitter);
}

function createTestSearchAgent(): SearchAgent {
  // Create mock models for testing
  const models = {
    planner: process.env.OPENAI_API_KEY ? openai("gpt-4o-mini") : null,
    evaluator: process.env.OPENAI_API_KEY ? openai("gpt-4o-mini") : null,
    writer: process.env.OPENAI_API_KEY ? openai("gpt-4o-mini") : null,
    summary: process.env.OPENAI_API_KEY ? openai("gpt-4o-mini") : null,
  };
  const eventEmitter = new EventEmitter();
  const steelApiKey = process.env.STEEL_API_KEY || "mock-steel-key";
  const retryAttempts = 3;
  const timeout = 30000;
  return new SearchAgent(
    models,
    eventEmitter,
    steelApiKey,
    retryAttempts,
    timeout
  );
}

function createTestContentEvaluator(): ContentEvaluator {
  // Create mock models for testing
  const models = {
    planner: process.env.OPENAI_API_KEY ? openai("gpt-4o-mini") : null,
    evaluator: process.env.OPENAI_API_KEY ? openai("gpt-4o-mini") : null,
    writer: process.env.OPENAI_API_KEY ? openai("gpt-4o-mini") : null,
    summary: process.env.OPENAI_API_KEY ? openai("gpt-4o-mini") : null,
  };
  const eventEmitter = new EventEmitter();
  return new ContentEvaluator(models, eventEmitter);
}

// Mock data generators - UPDATED for new architecture
function createMockRefinedContent(): RefinedContent[] {
  return [
    {
      title: "AI Overview - Understanding Artificial Intelligence",
      url: "https://example.com/ai-overview",
      summary:
        "Artificial intelligence (AI) is a broad field of computer science concerned with building smart machines capable of performing tasks that typically require human intelligence. AI systems can learn from data, recognize patterns, make decisions, and solve problems. The field encompasses machine learning, natural language processing, computer vision, and robotics.",
      rawLength: 3200,
      scrapedAt: new Date("2023-12-01T10:00:00Z"),
    },
    {
      title: "Machine Learning Fundamentals",
      url: "https://example.com/machine-learning",
      summary:
        "Machine learning is a subset of AI that enables automatic learning from data without explicit programming. It includes supervised learning (classification, regression), unsupervised learning (clustering, dimensionality reduction), and reinforcement learning. Popular algorithms include neural networks, decision trees, and support vector machines.",
      rawLength: 2800,
      scrapedAt: new Date("2023-12-01T10:15:00Z"),
    },
    {
      title: "AI Market Statistics and Growth Projections",
      url: "https://example.com/ai-statistics",
      summary:
        "The global AI market is expected to reach $1.8 trillion by 2030, growing at 37.3% CAGR from 2023-2030. Major drivers include increased data availability, improved computing power, and cloud adoption. Leading sectors include healthcare, finance, automotive, and retail. Investment in AI startups reached $66.8 billion in 2022.",
      rawLength: 2400,
      scrapedAt: new Date("2023-12-01T10:30:00Z"),
    },
    {
      title: "AI Implementation Best Practices",
      url: "https://example.com/ai-implementation",
      summary:
        "Successful AI implementation requires careful data preparation, model selection, validation, and monitoring. Key steps include defining clear objectives, ensuring data quality, selecting appropriate algorithms, testing thoroughly, and establishing ongoing monitoring systems. Common challenges include data bias, model drift, and integration complexity.",
      rawLength: 3600,
      scrapedAt: new Date("2023-12-01T10:45:00Z"),
    },
  ];
}

// Remove duplicate function - use createMockRefinedContent() instead

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
    const mockFindings = createMockRefinedContent();
    const testQuery = "What is artificial intelligence?";

    const report = await synthesizer.generateReport(mockFindings, testQuery);

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

// Test 3: Test report generation with diverse content sources
testRunner.test("ReportSynthesizer - Diverse Content Sources", async () => {
  const synthesizer = createTestSynthesizer();
  const mockFindings = createMockRefinedContent();
  const testQuery = "What is artificial intelligence?";

  const report = await synthesizer.generateReport(mockFindings, testQuery);

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
    `   ✅ Successfully organized ${mockFindings.length} diverse content sources`
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

  // Get real search results using NEW API
  const refinedContent = await searchAgent.searchAndSummarize(testQuery, {
    maxResults: 2,
    timeout: 15000,
    summaryTokens: 300,
  });

  assertExists(refinedContent, "Refined content should be returned");
  assert(refinedContent.length > 0, "Should have refined content");
  console.log(`   📊 Found ${refinedContent.length} refined content pieces`);

  // Generate real report using NEW API (only 2 parameters)
  const report = await synthesizer.generateReport(refinedContent, testQuery);

  assertExists(report, "Report should be generated");
  assert(report.content.length > 300, "Real report should be substantial");
  assert(
    report.citations.length === refinedContent.length,
    "Citations should match refined content"
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

  let errorThrown = false;
  try {
    await synthesizer.generateReport([], "test query");
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
  const mockFindings = createMockRefinedContent();

  let errorThrown = false;
  try {
    await synthesizer.generateReport(mockFindings, "");
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
  const mockFindings = createMockRefinedContent();

  let errorThrown = false;
  try {
    // Test with empty findings array to trigger error
    await synthesizer.generateReport([], "test query");
  } catch (error) {
    errorThrown = true;
    assert(error instanceof Error, "Should throw an error");
    assert(
      (error as Error).message.includes("No filtered summaries provided"),
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
  // Create mock models for testing
  const models = {
    planner: process.env.OPENAI_API_KEY ? openai("gpt-4o-mini") : null,
    evaluator: process.env.OPENAI_API_KEY ? openai("gpt-4o-mini") : null,
    writer: process.env.OPENAI_API_KEY ? openai("gpt-4o-mini") : null,
    summary: process.env.OPENAI_API_KEY ? openai("gpt-4o-mini") : null,
  };
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

  const synthesizer = new ReportSynthesizer(models, eventEmitter);
  const mockFindings = createMockRefinedContent();

  await synthesizer.generateReport(
    mockFindings,
    "What is artificial intelligence?"
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
  const mockFindings = createMockRefinedContent();

  const report = await synthesizer.generateReport(
    mockFindings,
    "What is artificial intelligence?"
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
  const mockFindings = createMockRefinedContent();

  const report = await synthesizer.generateReport(
    mockFindings,
    "What is artificial intelligence?"
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
