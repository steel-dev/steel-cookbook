import { config } from "dotenv";
config();

import {
  AIProviderFactory,
  SteelClient,
  ProviderManager,
} from "../src/providers/providers";
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
    console.log("🧪 Running Provider Tests...\n");

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

// Test 1: AI Provider Factory
testRunner.test(
  "AI Provider Factory - Create and Test OpenAI Provider",
  async () => {
    assertExists(process.env.OPENAI_API_KEY, "OPENAI_API_KEY required in .env");

    const config = {
      name: "openai" as const,
      apiKey: process.env.OPENAI_API_KEY!,
      model: "gpt-4o-mini",
    };

    const provider = AIProviderFactory.createProvider(config);
    assertExists(provider, "Provider should be created");
    assert(typeof provider === "object", "Provider should be an object");

    // Test that it actually works with a real API call
    const testResult = await AIProviderFactory.testProvider(provider);
    assert(testResult, "OpenAI provider should pass real API test");
    console.log("   ✅ OpenAI provider tested successfully with real API");
  }
);

testRunner.test(
  "AI Provider Factory - Create and Test Anthropic Provider",
  async () => {
    assertExists(
      process.env.ANTHROPIC_API_KEY,
      "ANTHROPIC_API_KEY required in .env"
    );

      const config = {
    name: "anthropic" as const,
    apiKey: process.env.ANTHROPIC_API_KEY!,
    model: "claude-3-5-haiku-20241022",
  };

    const provider = AIProviderFactory.createProvider(config);
    assertExists(provider, "Provider should be created");
    assert(typeof provider === "object", "Provider should be an object");

    // Test that it actually works with a real API call
    const testResult = await AIProviderFactory.testProvider(provider);
    assert(testResult, "Anthropic provider should pass real API test");
    console.log("   ✅ Anthropic provider tested successfully with real API");
  }
);

testRunner.test("AI Provider Factory - Unsupported Provider", async () => {
  const config = {
    name: "unsupported" as any,
    apiKey: "test-key",
    model: "test-model",
  };

  try {
    AIProviderFactory.createProvider(config);
    throw new Error("Should have thrown an error");
  } catch (error) {
    assert(error instanceof Error, "Should throw an error");
    assert(
      (error as Error).message.includes("Unsupported AI provider"),
      "Should mention unsupported provider"
    );
  }
});

// Test 2: Steel Client
testRunner.test("Steel Client - Initialize", async () => {
  const client = new SteelClient(process.env.STEEL_API_KEY || "test-key");
  assertExists(client, "Steel client should be created");
  assert(typeof client.scrape === "function", "Should have scrape method");
  assert(
    typeof client.testConnection === "function",
    "Should have testConnection method"
  );
});

testRunner.test("Steel Client - Test Real Connection", async () => {
  assertExists(
    process.env.STEEL_API_KEY,
    "STEEL_API_KEY must be set in .env file"
  );

  const client = new SteelClient(process.env.STEEL_API_KEY!);
  const isConnected = await client.testConnection();
  console.log(`   Steel connection test result: ${isConnected}`);

  // This should actually work with a real API key
  assert(
    isConnected,
    "Steel connection should succeed with valid API key from .env"
  );
});

// Test 3: Provider Manager
testRunner.test("Provider Manager - Initialize with Real Config", async () => {
  // These should all be available from .env
  assertExists(process.env.STEEL_API_KEY, "STEEL_API_KEY required in .env");
  assertExists(process.env.OPENAI_API_KEY, "OPENAI_API_KEY required in .env");
  assertExists(
    process.env.ANTHROPIC_API_KEY,
    "ANTHROPIC_API_KEY required in .env"
  );

  const config = loadConfig();
  const manager = new ProviderManager(config);

  assertExists(manager.getAIProvider(), "AI provider should be available");
  assertExists(manager.getAIWriter(), "AI writer should be available");
  assertExists(manager.getSteelClient(), "Steel client should be available");

  console.log(
    "   ✅ All providers initialized successfully with real API keys"
  );
});

testRunner.test("Provider Manager - Test All Real Providers", async () => {
  const config = loadConfig();
  const manager = new ProviderManager(config);

  const results = await manager.testAllProviders();
  console.log(`   Provider test results:`, results);

  // All should succeed with real API keys
  assert(results.ai, "AI provider test should succeed with real API key");
  assert(
    results.writer,
    "Writer provider test should succeed with real API key"
  );
  assert(results.steel, "Steel provider test should succeed with real API key");

  console.log("   ✅ All providers tested successfully with real API keys");
});

// Test 4: Error Handling
testRunner.test("Error Handling - Invalid Steel API Key", async () => {
  const client = new SteelClient("steel_invalid_test_key_should_fail");

  let errorThrown = false;
  try {
    await client.scrape("https://example.com");
  } catch (error) {
    errorThrown = true;
    assert(error instanceof Error, "Should throw an error");
    console.log(
      "   ✅ Properly handles invalid API key with error:",
      (error as Error).message
    );
  } finally {
    // Clean up to restore original API key
    client.cleanup();
  }

  // This MUST throw an error with an invalid API key
  assert(errorThrown, "Invalid API key should cause an error to be thrown");
});

// Run tests
testRunner.run().catch(console.error);
