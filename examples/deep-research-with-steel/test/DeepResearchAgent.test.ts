import { config } from "dotenv";
config();

import { DeepResearchAgent } from "../src/core/DeepResearchAgent";
import { loadConfig } from "../src/config";
import {
  ResearchOptions,
  ToolCallEvent,
  ToolResultEvent,
  ResearchProgress,
  ResearchReport,
} from "../src/core/interfaces";

// Simple test runner
class TestRunner {
  private passed = 0;
  private failed = 0;
  private tests: Array<{ name: string; fn: () => Promise<void> }> = [];

  test(name: string, fn: () => Promise<void>) {
    this.tests.push({ name, fn });
  }

  async run() {
    console.log("🧪 Running DeepResearchAgent Tests...\n");

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

// Test 1: Agent Initialization
testRunner.test("DeepResearchAgent - Initialize with Real Config", async () => {
  // Check that all required environment variables are present
  assertExists(process.env.STEEL_API_KEY, "STEEL_API_KEY required in .env");
  assertExists(process.env.OPENAI_API_KEY, "OPENAI_API_KEY required in .env");
  assertExists(
    process.env.ANTHROPIC_API_KEY,
    "ANTHROPIC_API_KEY required in .env"
  );

  const config = loadConfig();
  const agent = new DeepResearchAgent(config);

  assertExists(agent, "Agent should be created");
  assert(typeof agent.research === "function", "Should have research method");
  assert(
    typeof agent.testConnection === "function",
    "Should have testConnection method"
  );
  assert(
    typeof agent.researchStream === "function",
    "Should have researchStream method"
  );

  console.log(
    "   ✅ DeepResearchAgent initialized successfully with real config"
  );
});

// Test 2: Connection Tests
testRunner.test(
  "DeepResearchAgent - Test All Provider Connections",
  async () => {
    const config = loadConfig();
    const agent = new DeepResearchAgent(config);

    const connectionResults = await agent.testConnection();
    console.log(`   Connection test results:`, connectionResults);

    assert(connectionResults.ai, "AI provider connection should succeed");
    assert(
      connectionResults.writer,
      "Writer provider connection should succeed"
    );
    assert(connectionResults.steel, "Steel provider connection should succeed");

    console.log("   ✅ All provider connections tested successfully");
  }
);

// Test 3: Event Handling
testRunner.test("DeepResearchAgent - Event Handling", async () => {
  const config = loadConfig();
  const agent = new DeepResearchAgent(config);

  let toolCallEvents: ToolCallEvent[] = [];
  let toolResultEvents: ToolResultEvent[] = [];
  let progressEvents: ResearchProgress[] = [];
  let textEvents: string[] = [];
  let errorEvents: Error[] = [];
  let doneEvents: ResearchReport[] = [];

  // Set up event listeners
  agent.on("tool-call", (event: ToolCallEvent) => {
    toolCallEvents.push(event);
    console.log(
      `   🔧 Tool call: ${event.toolName} - ${
        event.query || event.url || "no query"
      }`
    );
  });

  agent.on("tool-result", (event: ToolResultEvent) => {
    toolResultEvents.push(event);
    console.log(
      `   ${event.success ? "✅" : "❌"} Tool result: ${event.toolName} - ${
        event.success ? "success" : event.error
      }`
    );
  });

  agent.on("progress", (event: ResearchProgress) => {
    progressEvents.push(event);
    console.log(`   📊 Progress: ${event.phase} - ${event.progress}%`);
  });

  agent.on("text", (text: string) => {
    textEvents.push(text);
    // Only log first few characters to avoid spam
    if (text.length > 50) {
      console.log(`   📝 Text: ${text.substring(0, 50)}...`);
    } else {
      console.log(`   📝 Text: ${text}`);
    }
  });

  agent.on("error", (error: Error) => {
    errorEvents.push(error);
    console.log(`   ❌ Error: ${error.message}`);
  });

  agent.on("done", (result: ResearchReport) => {
    doneEvents.push(result);
    console.log(`   ✨ Done: ${result.executiveSummary.substring(0, 100)}...`);
  });

  // Test with a simple research query
  const options: ResearchOptions = {
    depth: 1,
    breadth: 2,
    timeout: 30000,
  };

  const result = await agent.research("What is TypeScript?", options);

  // Verify events were emitted
  assert(toolCallEvents.length > 0, "Should have emitted tool-call events");
  assert(toolResultEvents.length > 0, "Should have emitted tool-result events");
  assert(progressEvents.length > 0, "Should have emitted progress events");
  assert(doneEvents.length === 1, "Should have emitted exactly one done event");
  assert(errorEvents.length === 0, "Should not have emitted any error events");

  console.log(
    `   Event counts - Tool calls: ${toolCallEvents.length}, Tool results: ${toolResultEvents.length}, Progress: ${progressEvents.length}, Done: ${doneEvents.length}`
  );

  // Verify result structure
  assertExists(result.id, "Result should have an ID");
  assertExists(result.query, "Result should have the original query");
  assertExists(result.content, "Result should have content");
  assertExists(result.executiveSummary, "Result should have executive summary");
  assert(Array.isArray(result.citations), "Result should have citations array");
  assertExists(result.metadata, "Result should have metadata");

  console.log(
    "   ✅ All events handled correctly and result structure validated"
  );
});

// Test 4: Small Research Test
testRunner.test("DeepResearchAgent - Small Research Task", async () => {
  const config = loadConfig();
  const agent = new DeepResearchAgent(config);

  const options: ResearchOptions = {
    depth: 1,
    breadth: 2,
    timeout: 30000,
  };

  const result = await agent.research(
    "What is the capital of France?",
    options
  );

  // Basic validation
  assertExists(result, "Should return a result");
  assert(
    result.query === "What is the capital of France?",
    "Should preserve original query"
  );
  assert(result.content.length > 100, "Should have substantial content");
  assert(result.executiveSummary.length > 50, "Should have executive summary");
  assert(result.citations.length > 0, "Should have at least one citation");

  // Check that the answer contains expected information
  const content = result.content.toLowerCase();
  assert(content.includes("paris"), "Should mention Paris as the capital");
  assert(content.includes("france"), "Should mention France");

  console.log(`   ✅ Research completed successfully`);
  console.log(`   Query: ${result.query}`);
  console.log(`   Content length: ${result.content.length} characters`);
  console.log(`   Citations: ${result.citations.length}`);
  console.log(
    `   Executive summary: ${result.executiveSummary.substring(0, 100)}...`
  );
});

// Test 5: Research with Different Options
testRunner.test(
  "DeepResearchAgent - Research with Different Depth",
  async () => {
    const config = loadConfig();
    const agent = new DeepResearchAgent(config);

    const shallowOptions: ResearchOptions = {
      depth: 1,
      breadth: 1,
      timeout: 30000,
    };

    const deeperOptions: ResearchOptions = {
      depth: 2,
      breadth: 3,
      timeout: 30000,
    };

    // Test shallow research
    const shallowResult = await agent.research(
      "What is Python programming?",
      shallowOptions
    );

    // Test deeper research
    const deeperResult = await agent.research(
      "What is Python programming?",
      deeperOptions
    );

    // Validate both results
    assertExists(shallowResult, "Shallow result should exist");
    assertExists(deeperResult, "Deeper result should exist");

    assert(
      shallowResult.content.length > 0,
      "Shallow result should have content"
    );
    assert(
      deeperResult.content.length > 0,
      "Deeper result should have content"
    );

    // Deeper research should generally have more content (though not guaranteed)
    console.log(
      `   Shallow content: ${shallowResult.content.length} characters`
    );
    console.log(`   Deeper content: ${deeperResult.content.length} characters`);
    console.log(`   Shallow citations: ${shallowResult.citations.length}`);
    console.log(`   Deeper citations: ${deeperResult.citations.length}`);

    console.log(
      "   ✅ Both shallow and deeper research completed successfully"
    );
  }
);

// Test 6: Error Handling
testRunner.test(
  "DeepResearchAgent - Error Handling with Invalid Query",
  async () => {
    const config = loadConfig();
    const agent = new DeepResearchAgent(config);

    let errorEmitted = false;

    agent.on("error", (error: Error) => {
      errorEmitted = true;
      console.log(`   Expected error caught: ${error.message}`);
    });

    try {
      // Test with empty query
      await agent.research("", { depth: 1, breadth: 1 });
      throw new Error("Should have thrown an error for empty query");
    } catch (error) {
          assert(error instanceof Error, "Should throw an error");
    assert(
      (error as Error).message.includes("Query cannot be empty"),
      "Should mention empty query"
    );
    console.log(`   ✅ Properly handled empty query error: ${(error as Error).message}`);
    }
  }
);

// Test 7: Research Streaming (if time permits)
testRunner.test("DeepResearchAgent - Research Streaming", async () => {
  const config = loadConfig();
  const agent = new DeepResearchAgent(config);

  const options: ResearchOptions = {
    depth: 1,
    breadth: 2,
    timeout: 30000,
  };

  let eventCount = 0;
  let finalResult: ResearchReport | null = null;

  // Test the async generator
  const stream = agent.researchStream("What is React?", options);

  for await (const event of stream) {
    eventCount++;

    if (typeof event === "object" && "id" in event && "query" in event) {
      // This is the final result
      finalResult = event as ResearchReport;
      console.log(
        `   🎯 Final result received: ${finalResult.executiveSummary.substring(
          0,
          50
        )}...`
      );
      break;
    } else {
      // This is a progress/tool event
      console.log(
        `   📡 Stream event ${eventCount}: ${
          typeof event === "string"
            ? event.substring(0, 30)
            : JSON.stringify(event).substring(0, 50)
        }...`
      );
    }

    // Limit to prevent infinite loop in test
    if (eventCount > 20) {
      console.log("   ⏰ Stopped streaming after 20 events to prevent timeout");
      break;
    }
  }

  assert(eventCount > 0, "Should have received at least one event");
  console.log(`   ✅ Streaming completed with ${eventCount} events`);

  if (finalResult) {
    assertExists(finalResult.id, "Final result should have an ID");
    assertExists(finalResult.content, "Final result should have content");
    console.log(`   ✅ Final result structure validated`);
  }
});

// Run tests
testRunner.run().catch(console.error);
