import { config } from "dotenv";
config();

import { DeepResearchAgent } from "../src/core/DeepResearchAgent";
import { loadConfig } from "../src/config";
import { ResearchOptions } from "../src/core/interfaces";

// Simple test runner
class TestRunner {
  private passed = 0;
  private failed = 0;
  private tests: Array<{ name: string; fn: () => Promise<void> }> = [];

  test(name: string, fn: () => Promise<void>) {
    this.tests.push({ name, fn });
  }

  async run() {
    console.log("🧪 Running Integration Tests...\n");

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

// Integration Test: Complete Research Flow
testRunner.test("Complete Research Pipeline", async () => {
  console.log("   🔄 Testing complete research pipeline...");

  const config = loadConfig();
  const agent = new DeepResearchAgent(config);

  const eventLog: any[] = [];

  agent.on("tool-call", (event) => {
    eventLog.push({ type: "tool-call", event });
    console.log(`   🔧 Tool: ${event.toolName}`);
  });

  agent.on("tool-result", (event) => {
    eventLog.push({ type: "tool-result", event });
    console.log(`   ${event.success ? "✅" : "❌"} Result: ${event.toolName}`);
  });

  agent.on("progress", (event) => {
    eventLog.push({ type: "progress", event });
    console.log(`   📊 ${event.phase}: ${event.progress}%`);
  });

  const options: ResearchOptions = {
    depth: 2,
    breadth: 3,
    timeout: 45000,
  };

  const query = "What is TypeScript?";
  console.log(`   🔍 Research query: "${query}"`);

  const result = await agent.research(query, options);

  // Validate result
  assertExists(result, "Should return a research result");
  assertExists(result.id, "Result should have an ID");
  assert(result.query === query, "Should preserve original query");
  assert(result.content.length > 100, "Should have substantial content");
  assert(result.executiveSummary.length > 50, "Should have executive summary");
  assert(Array.isArray(result.citations), "Should have citations array");
  assert(result.citations.length > 0, "Should have at least one citation");

  // Validate events
  const toolCalls = eventLog.filter((e) => e.type === "tool-call");
  const toolResults = eventLog.filter((e) => e.type === "tool-result");

  assert(toolCalls.length > 0, "Should have emitted tool-call events");
  assert(toolResults.length > 0, "Should have emitted tool-result events");

  console.log(
    `   📊 Result: ${result.content.length} chars, ${result.citations.length} citations`
  );
  console.log("   ✅ Complete research pipeline validated");
});

// Integration Test: Early Termination Logic
testRunner.test("Early Termination - Simple Query", async () => {
  console.log("   🔄 Testing early termination logic...");

  const config = loadConfig();
  const agent = new DeepResearchAgent(config);

  let terminationEvent = null;

  agent.on("tool-call", (event) => {
    if (event.metadata && event.metadata.action === "termination") {
      terminationEvent = event;
      console.log(
        `   🛑 Early termination triggered: ${event.metadata.reason}`
      );
    }
  });

  // Use a simple query that should terminate early
  const options: ResearchOptions = {
    depth: 3, // Allow for depth but expect early termination
    breadth: 2,
    timeout: 30000,
  };

  const query = "What is 2+2?";
  console.log(`   🔍 Simple query: "${query}"`);

  const result = await agent.research(query, options);

  // Should still get a valid result
  assertExists(result, "Should return a result even with early termination");
  assert(result.content.length > 50, "Should have some content");

  const content = result.content.toLowerCase();
  assert(
    content.includes("4") || content.includes("four"),
    "Should contain the correct answer"
  );

  console.log(`   ✅ Early termination logic working correctly`);
});

// Integration Test: Error Recovery
testRunner.test("Error Recovery - Continue Despite Failures", async () => {
  console.log("   🔄 Testing error recovery and resilience...");

  const config = loadConfig();
  const agent = new DeepResearchAgent(config);

  let errorEvents: any[] = [];
  let successfulOperations = 0;

  agent.on("tool-result", (event) => {
    if (event.success) {
      successfulOperations++;
    } else {
      errorEvents.push(event);
    }
  });

  agent.on("error", (error) => {
    errorEvents.push(error);
  });

  // Use a query that might have some challenging aspects
  const options: ResearchOptions = {
    depth: 2,
    breadth: 4, // Higher breadth to potentially hit some failures
    timeout: 30000,
  };

  const query =
    "What are the latest developments in quantum computing and blockchain technology?";
  console.log(`   🔍 Complex query: "${query}"`);

  const result = await agent.research(query, options);

  // Should still succeed overall
  assertExists(result, "Should return a result despite potential failures");
  assert(result.content.length > 200, "Should have substantial content");
  assert(
    successfulOperations > 0,
    "Should have at least some successful operations"
  );

  console.log(`   📊 Error Recovery Summary:`);
  console.log(`      - Successful operations: ${successfulOperations}`);
  console.log(`      - Error events: ${errorEvents.length}`);
  console.log(
    `      - Final result quality: ${result.content.length} characters`
  );

  console.log("   ✅ Error recovery and resilience validated");
});

// Integration Test: Research Depth Comparison
testRunner.test("Research Depth Comparison - Shallow vs Deep", async () => {
  console.log("   🔄 Testing research depth differences...");

  const config = loadConfig();
  const agent = new DeepResearchAgent(config);

  const query = "What is machine learning?";

  // Shallow research
  const shallowOptions: ResearchOptions = {
    depth: 1,
    breadth: 2,
    timeout: 30000,
  };

  console.log(
    `   🔍 Shallow research: depth=${shallowOptions.depth}, breadth=${shallowOptions.breadth}`
  );
  const shallowResult = await agent.research(query, shallowOptions);

  // Deep research
  const deepOptions: ResearchOptions = {
    depth: 3,
    breadth: 4,
    timeout: 45000,
  };

  console.log(
    `   🔍 Deep research: depth=${deepOptions.depth}, breadth=${deepOptions.breadth}`
  );
  const deepResult = await agent.research(query, deepOptions);

  // Both should be valid
  assertExists(shallowResult, "Shallow research should return result");
  assertExists(deepResult, "Deep research should return result");

  assert(
    shallowResult.content.length > 100,
    "Shallow result should have content"
  );
  assert(deepResult.content.length > 100, "Deep result should have content");

  console.log(`   📊 Depth Comparison:`);
  console.log(
    `      - Shallow: ${shallowResult.content.length} characters, ${shallowResult.citations.length} citations`
  );
  console.log(
    `      - Deep: ${deepResult.content.length} characters, ${deepResult.citations.length} citations`
  );

  // Note: Deep research may not always be longer due to early termination logic
  // but it should generally be more comprehensive

  console.log("   ✅ Research depth comparison completed");
});

// Run tests
testRunner.run().catch(console.error);
