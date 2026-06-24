#!/usr/bin/env node

import { EventEmitter } from "events";
import { z } from "zod";
import { BaseAgent, LLMKind } from "../src/core/BaseAgent";
import { ProviderManager } from "../src/providers/providers";
import {
  DeepResearchEvent,
  TextStreamEvent,
  ToolCallStartEvent,
  ToolCallEndEvent,
  ResearchErrorEvent,
} from "../src/core/interfaces";

// Simple test framework
class SimpleTest {
  private tests: Array<{ name: string; fn: () => Promise<void> }> = [];
  private passed = 0;
  private failed = 0;

  test(name: string, fn: () => Promise<void>) {
    this.tests.push({ name, fn });
  }

  async run() {
    console.log("🚀 Running BaseAgent Tests\n");

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

function assertTrue(condition: boolean, message?: string) {
  if (!condition) {
    throw new Error(message || "Assertion failed: expected true");
  }
}

function assertContains(actual: string, expected: string, message?: string) {
  if (!actual.includes(expected)) {
    throw new Error(
      `${
        message || "Assertion failed"
      }: expected "${actual}" to contain "${expected}"`
    );
  }
}

// Mock implementations
class MockLLM {
  constructor(public name: string) {}

  toString() {
    return `MockLLM(${this.name})`;
  }
}

class MockProviderManager {
  private aiProvider: MockLLM;
  private aiWriter: MockLLM;

  constructor() {
    this.aiProvider = new MockLLM("ai-provider");
    this.aiWriter = new MockLLM("ai-writer");
  }

  getAIProvider(): MockLLM {
    return this.aiProvider;
  }

  getAIWriter(): MockLLM {
    return this.aiWriter;
  }

  getSteelClient(): any {
    return { name: "steel-client" };
  }
}

// Test BaseAgent implementation
class TestBaseAgent extends BaseAgent {
  public testGetLLM(kind: LLMKind): any {
    return this.getLLM(kind);
  }

  public testEmitStructuredEvent(event: DeepResearchEvent): void {
    this.emitStructuredEvent(event);
  }

  public testGetCurrentSessionId(): string {
    return this.getCurrentSessionId();
  }
}

// Event collector for testing
class EventCollector extends EventEmitter {
  public currentSessionId?: string = "test-session-123";
  public events: DeepResearchEvent[] = [];

  constructor() {
    super();
    this.on("text-stream", (event) => this.events.push(event));
    this.on("tool-call-start", (event) => this.events.push(event));
    this.on("tool-call-end", (event) => this.events.push(event));
    this.on("research-error", (event) => this.events.push(event));
  }

  clearEvents() {
    this.events = [];
  }

  getEventsByType(type: string): DeepResearchEvent[] {
    return this.events.filter((e) => e.type === type);
  }
}

// Test suite
const runner = new SimpleTest();

// Test provider helper
runner.test(
  "getLLM should return correct provider for different kinds",
  async () => {
    const mockProviderManager = new MockProviderManager();
    const eventCollector = new EventCollector();
    const agent = new TestBaseAgent(mockProviderManager as any, eventCollector);

    const plannerLLM = agent.testGetLLM("planner");
    const evaluatorLLM = agent.testGetLLM("evaluator");
    const summaryLLM = agent.testGetLLM("summary");
    const writerLLM = agent.testGetLLM("writer");

    assertTrue(
      plannerLLM === mockProviderManager.getAIProvider(),
      "Planner should use AI provider"
    );
    assertTrue(
      evaluatorLLM === mockProviderManager.getAIProvider(),
      "Evaluator should use AI provider"
    );
    assertTrue(
      summaryLLM === mockProviderManager.getAIWriter(),
      "Summary should use AI writer"
    );
    assertTrue(
      writerLLM === mockProviderManager.getAIWriter(),
      "Writer should use AI writer"
    );
  }
);

// Test error handling for unknown LLM kind
runner.test("getLLM should throw error for unknown kind", async () => {
  const mockProviderManager = new MockProviderManager();
  const eventCollector = new EventCollector();
  const agent = new TestBaseAgent(mockProviderManager as any, eventCollector);

  try {
    agent.testGetLLM("unknown" as LLMKind);
    assertTrue(false, "Should have thrown error");
  } catch (error) {
    assertContains(
      (error as Error).message,
      "Unknown LLM kind",
      "Should throw unknown LLM kind error"
    );
  }
});

// Test static utilities
runner.test(
  "defaultPrepareStep should return proper step context",
  async () => {
    const stepContext = BaseAgent.defaultPrepareStep(1, "test-step", 5);

    assertEquals(stepContext.stepNo, 1, "Should return correct step number");
    assertEquals(
      stepContext.stepName,
      "test-step",
      "Should return correct step name"
    );
    assertEquals(
      stepContext.totalSteps,
      5,
      "Should return correct total steps"
    );
    assertTrue(
      stepContext.timestamp instanceof Date,
      "Should include timestamp"
    );
  }
);

runner.test(
  "defaultPrepareStep should handle optional totalSteps",
  async () => {
    const stepContext = BaseAgent.defaultPrepareStep(2, "test-step");

    assertEquals(stepContext.stepNo, 2, "Should return correct step number");
    assertEquals(
      stepContext.stepName,
      "test-step",
      "Should return correct step name"
    );
    assertEquals(
      stepContext.totalSteps,
      undefined,
      "Should handle undefined totalSteps"
    );
    assertTrue(
      stepContext.timestamp instanceof Date,
      "Should include timestamp"
    );
  }
);

runner.test(
  "defaultStopWhen should handle termination conditions",
  async () => {
    // Test max depth reached
    const depthResult = BaseAgent.defaultStopWhen(5, 5, 0.5);
    assertTrue(depthResult.shouldStop, "Should stop when max depth reached");
    assertEquals(
      depthResult.reason,
      "max-depth-reached",
      "Should provide correct reason"
    );

    // Test completeness threshold met
    const completenessResult = BaseAgent.defaultStopWhen(2, 5, 0.9);
    assertTrue(
      completenessResult.shouldStop,
      "Should stop when completeness threshold met"
    );
    assertEquals(
      completenessResult.reason,
      "completeness-threshold-met",
      "Should provide correct reason"
    );

    // Test continue condition
    const continueResult = BaseAgent.defaultStopWhen(2, 5, 0.5);
    assertTrue(
      !continueResult.shouldStop,
      "Should continue when conditions not met"
    );
  }
);

runner.test(
  "defaultTimeoutHandler should handle timeout conditions",
  async () => {
    const now = new Date();
    const pastTime = new Date(now.getTime() - 10000); // 10 seconds ago

    const timeoutResult = BaseAgent.defaultTimeoutHandler(pastTime, 5000); // 5 second timeout
    assertTrue(
      timeoutResult.shouldTimeout,
      "Should timeout when duration exceeded"
    );
    assertTrue(
      timeoutResult.elapsed >= 10000,
      "Should provide correct elapsed time"
    );

    const noTimeoutResult = BaseAgent.defaultTimeoutHandler(now, 10000); // 10 second timeout
    assertTrue(
      !noTimeoutResult.shouldTimeout,
      "Should not timeout when duration not exceeded"
    );
  }
);

// Test event bubbling
runner.test("emitStructuredEvent should bubble events correctly", async () => {
  const mockProviderManager = new MockProviderManager();
  const eventCollector = new EventCollector();
  const agent = new TestBaseAgent(mockProviderManager as any, eventCollector);

  const testEvent: TextStreamEvent = {
    id: "test-event",
    sessionId: "test-session",
    timestamp: new Date(),
    type: "text-stream",
    content: "test content",
    source: "analysis",
    isComplete: true,
    chunkIndex: 1,
  };

  let agentEventReceived = false;
  let parentEventReceived = false;

  agent.on("text-stream", () => {
    agentEventReceived = true;
  });

  eventCollector.on("text-stream", () => {
    parentEventReceived = true;
  });

  agent.testEmitStructuredEvent(testEvent);

  assertTrue(agentEventReceived, "Agent should receive event");
  assertTrue(parentEventReceived, "Parent should receive event");
});

// Test session ID handling
runner.test(
  "getCurrentSessionId should handle session IDs correctly",
  async () => {
    const mockProviderManager = new MockProviderManager();
    const eventCollector = new EventCollector();
    const agent = new TestBaseAgent(mockProviderManager as any, eventCollector);

    const sessionId = agent.testGetCurrentSessionId();
    assertEquals(sessionId, "test-session-123", "Should use parent session ID");

    // Test with no parent session ID
    const noSessionCollector = new EventCollector();
    (noSessionCollector as any).currentSessionId = undefined;
    const noSessionAgent = new TestBaseAgent(
      mockProviderManager as any,
      noSessionCollector
    );

    const generatedSessionId = noSessionAgent.testGetCurrentSessionId();
    assertTrue(
      generatedSessionId.startsWith("session_"),
      "Should generate session ID"
    );
  }
);

// Test LLMKind type validation
runner.test("LLMKind type should be properly exported", async () => {
  const mockProviderManager = new MockProviderManager();
  const eventCollector = new EventCollector();
  const agent = new TestBaseAgent(mockProviderManager as any, eventCollector);

  // Test that all expected LLMKind values work
  const validKinds: LLMKind[] = ["planner", "summary", "writer", "evaluator"];

  for (const kind of validKinds) {
    const llm = agent.testGetLLM(kind);
    assertTrue(llm !== undefined, `Should return LLM for kind: ${kind}`);
  }
});

// Test BaseAgent constructor and basic functionality
runner.test("BaseAgent should initialize correctly", async () => {
  const mockProviderManager = new MockProviderManager();
  const eventCollector = new EventCollector();
  const agent = new TestBaseAgent(mockProviderManager as any, eventCollector);

  assertTrue(agent instanceof BaseAgent, "Should be instance of BaseAgent");
  assertTrue(
    agent instanceof EventEmitter,
    "Should be instance of EventEmitter"
  );

  // Test that protected members are accessible through test methods
  const sessionId = agent.testGetCurrentSessionId();
  assertTrue(typeof sessionId === "string", "Should provide session ID");
  assertTrue(sessionId.length > 0, "Session ID should not be empty");
});

// Test event structure validation
runner.test("Event structure should be properly typed", async () => {
  const mockProviderManager = new MockProviderManager();
  const eventCollector = new EventCollector();
  const agent = new TestBaseAgent(mockProviderManager as any, eventCollector);

  const textEvent: TextStreamEvent = {
    id: "test-id",
    sessionId: "test-session",
    timestamp: new Date(),
    type: "text-stream",
    content: "test content",
    source: "analysis",
    isComplete: false,
    chunkIndex: 0,
  };

  // Test that the event structure is valid
  assertTrue(textEvent.id === "test-id", "Event should have correct ID");
  assertTrue(
    textEvent.type === "text-stream",
    "Event should have correct type"
  );
  assertTrue(
    textEvent.content === "test content",
    "Event should have correct content"
  );
  assertTrue(
    textEvent.source === "analysis",
    "Event should have correct source"
  );
  assertTrue(
    textEvent.isComplete === false,
    "Event should have correct completion status"
  );
  assertTrue(
    textEvent.chunkIndex === 0,
    "Event should have correct chunk index"
  );
});

// Run all tests
if (require.main === module) {
  runner.run().catch(console.error);
}

export { runner };
