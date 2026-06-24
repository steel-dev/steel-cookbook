import { config } from "dotenv";
config();

import { EventEmitter } from "events";
import { ReportSynthesizer } from "../src/agents/ReportSynthesizer";
import { RefinedContent } from "../src/core/interfaces";
import { openai } from "@ai-sdk/openai";

// Test streaming functionality specifically
async function testStreamingEvents() {
  console.log("🌊 Testing ReportSynthesizer Streaming Functionality...\n");

  try {
    // Check if we have API keys for real streaming test
    if (!process.env.OPENAI_API_KEY) {
      console.log(
        "⚠️ No OPENAI_API_KEY found - streaming test requires real API"
      );
      return;
    }

    // Create test synthesizer with real models for streaming
    const models = {
      planner: openai("gpt-4o-mini"),
      evaluator: openai("gpt-4o-mini"),
      writer: openai("gpt-4o-mini"),
      summary: openai("gpt-4o-mini"),
    };
    const eventEmitter = new EventEmitter();
    const synthesizer = new ReportSynthesizer(models, eventEmitter);

    // Track streaming events
    const streamingEvents: any[] = [];
    let textChunksReceived = 0;
    let lastPartialObject: any = null;

    // Listen for various event types
    eventEmitter.on("text-stream", (event) => {
      streamingEvents.push({ type: "text-stream", event });
      console.log(
        `📡 Text-stream event ${streamingEvents.length}: isComplete=${
          event.isComplete
        }, length=${event.content?.length || 0}`
      );

      if (!event.isComplete) {
        textChunksReceived++;
        try {
          lastPartialObject = JSON.parse(event.content);
          console.log(
            `   └── Partial object keys: ${Object.keys(lastPartialObject).join(
              ", "
            )}`
          );
        } catch (e) {
          console.log(
            `   └── Could not parse as JSON: ${event.content.substring(
              0,
              50
            )}...`
          );
        }
      }
    });

    eventEmitter.on("text", (text) => {
      console.log(`📝 Text event: ${text.substring(0, 50)}...`);
    });

    eventEmitter.on("tool-call", (event) => {
      console.log(
        `🔧 Tool call: ${event.toolName} - ${event.input?.action || "unknown"}`
      );
    });

    eventEmitter.on("tool-result", (event) => {
      console.log(
        `✅ Tool result: ${event.toolName} - ${
          event.success ? "SUCCESS" : "FAILED"
        }`
      );
    });

    // Create mock filtered content
    const mockFilteredContent: RefinedContent[] = [
      {
        url: "https://example.com/ai-overview",
        title: "AI Overview - Understanding Artificial Intelligence",
        summary:
          "Artificial intelligence (AI) is a broad field of computer science concerned with building smart machines capable of performing tasks that typically require human intelligence. AI systems can learn from data, recognize patterns, make decisions, and solve problems.",
        rawLength: 1500,
        scrapedAt: new Date(),
      },
      {
        url: "https://example.com/machine-learning",
        title: "Machine Learning Fundamentals",
        summary:
          "Machine learning is a subset of AI that enables automatic learning from data without explicit programming. It includes supervised learning, unsupervised learning, and reinforcement learning algorithms.",
        rawLength: 1200,
        scrapedAt: new Date(),
      },
    ];

    console.log("🚀 Starting structured report generation with streaming...\n");

    const startTime = Date.now();

    // Generate report with streaming enabled
    const report = await synthesizer.generateReport(
      mockFilteredContent,
      "What is artificial intelligence and how does it work?"
    );

    const endTime = Date.now();
    const duration = endTime - startTime;

    console.log("\n📊 STREAMING ANALYSIS:");
    console.log(`⏱️ Total duration: ${duration}ms`);
    console.log(`📡 Total streaming events: ${streamingEvents.length}`);
    console.log(`📝 Text chunks received: ${textChunksReceived}`);
    console.log(`🎯 Final report generated: ${report.id}`);

    // Validate streaming behavior
    if (streamingEvents.length === 0) {
      throw new Error(
        "No streaming events were received - streaming appears broken!"
      );
    }

    if (textChunksReceived === 0) {
      throw new Error(
        "No text chunks received during streaming - partial updates not working!"
      );
    }

    // Check if we got partial objects during streaming
    if (lastPartialObject) {
      console.log(
        `📋 Last partial object had keys: ${Object.keys(lastPartialObject).join(
          ", "
        )}`
      );

      if (lastPartialObject.executiveSummary) {
        console.log(
          `   └── Executive summary preview: ${lastPartialObject.executiveSummary.substring(
            0,
            100
          )}...`
        );
      }
      if (lastPartialObject.reportContent) {
        console.log(
          `   └── Report content preview: ${lastPartialObject.reportContent.substring(
            0,
            100
          )}...`
        );
      }
    }

    // Check final results
    console.log("\n✅ FINAL VALIDATION:");
    console.log(
      `📄 Executive Summary: ${report.executiveSummary.length} chars`
    );
    console.log(`📄 Report Content: ${report.content.length} chars`);
    console.log(`🔗 Citations: ${report.citations.length}`);

    if (report.executiveSummary.length < 100) {
      throw new Error("Executive summary too short");
    }
    if (report.content.length < 500) {
      throw new Error("Report content too short");
    }

    console.log("\n🎉 SUCCESS: Streaming is working correctly!");
    console.log("   ✅ Events were emitted during generation");
    console.log("   ✅ Partial objects were received");
    console.log("   ✅ Final structured output is complete");
  } catch (error) {
    console.error(
      "❌ STREAMING TEST FAILED:",
      error instanceof Error ? error.message : String(error)
    );
    process.exit(1);
  }
}

// Run the streaming test
if (require.main === module) {
  testStreamingEvents().catch((err) => {
    console.error("❌ Test failed:", err);
    process.exit(1);
  });
}
