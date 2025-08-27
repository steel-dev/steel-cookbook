import { config } from "dotenv";
config();

import { EventEmitter } from "events";
import { ReportSynthesizer } from "../src/agents/ReportSynthesizer";
import { RefinedContent } from "../src/core/interfaces";
import { openai } from "@ai-sdk/openai";

// Simple test for structured output generation
async function testStructuredReportGeneration() {
  console.log("🧪 Testing ReportSynthesizer Structured Output Generation...\n");

  try {
    // Create test synthesizer
    const models = {
      planner: process.env.OPENAI_API_KEY ? openai("gpt-4o-mini") : null,
      evaluator: process.env.OPENAI_API_KEY ? openai("gpt-4o-mini") : null,
      writer: process.env.OPENAI_API_KEY ? openai("gpt-4o-mini") : null,
      summary: process.env.OPENAI_API_KEY ? openai("gpt-4o-mini") : null,
    };
    const eventEmitter = new EventEmitter();
    const synthesizer = new ReportSynthesizer(models, eventEmitter);

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

    console.log("📝 Generating structured report...");

    // Generate report
    const report = await synthesizer.generateReport(
      mockFilteredContent,
      "What is artificial intelligence and how does it work?"
    );

    // Validate structure
    console.log("\n✅ VALIDATION RESULTS:");
    console.log(`Report ID: ${report.id}`);
    console.log(`Query: ${report.query}`);
    console.log(
      `Executive Summary Length: ${report.executiveSummary.length} chars`
    );
    console.log(`Report Content Length: ${report.content.length} chars`);
    console.log(`Citations Count: ${report.citations.length}`);
    console.log(`Source Count: ${report.metadata.sourceCount}`);
    console.log(`Research Depth: ${report.metadata.researchDepth}`);

    // Basic assertions
    if (!report.id) throw new Error("Report should have an ID");
    if (!report.executiveSummary || report.executiveSummary.length < 100) {
      throw new Error("Executive summary should be substantial");
    }
    if (!report.content || report.content.length < 500) {
      throw new Error("Report content should be substantial");
    }
    if (report.citations.length !== mockFilteredContent.length) {
      throw new Error("Citations count should match filtered content");
    }

    console.log("\n📊 EXECUTIVE SUMMARY PREVIEW:");
    console.log(report.executiveSummary.substring(0, 200) + "...");

    console.log("\n📄 REPORT CONTENT PREVIEW:");
    console.log(report.content.substring(0, 300) + "...");

    console.log("\n🔗 CITATIONS:");
    report.citations.forEach((citation, i) => {
      console.log(`[${citation.id}] ${citation.title} - ${citation.url}`);
    });

    console.log(
      "\n🎉 SUCCESS: Structured report generation working correctly!"
    );
  } catch (error) {
    console.error(
      "❌ FAILED:",
      error instanceof Error ? error.message : String(error)
    );
    process.exit(1);
  }
}

// Run the test
if (require.main === module) {
  testStructuredReportGeneration().catch((err) => {
    console.error("❌ Test failed:", err);
    process.exit(1);
  });
}
