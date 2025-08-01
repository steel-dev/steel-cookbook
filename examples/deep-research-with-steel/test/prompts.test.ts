import { describe, it, expect } from "vitest";
import {
  planningPrompt,
  queryExtractPrompt,
  summaryPrompt,
  buildSummaryPrompt,
  evaluationPrompt,
  rankAndRefinePrompt,
  reportPrompt,
  answerPrompt,
  validatePromptInputs,
  truncateContent,
  formatRefinedContent,
  formatSources,
  formatLearningsByType,
  prompts,
} from "../src/prompts/prompts";

describe("Prompts Module", () => {
  // Mock RefinedContent objects
  const mockRefinedContent = [
    {
      title: "AI Healthcare Applications",
      url: "https://example.com/ai-healthcare",
      summary:
        "AI is revolutionizing healthcare through improved diagnostics and personalized treatment plans.",
      rawLength: 5000,
      scrapedAt: new Date("2023-01-01"),
    },
    {
      title: "Machine Learning in Medicine",
      url: "https://example.com/ml-medicine",
      summary:
        "Machine learning algorithms are being used to predict patient outcomes and optimize treatment.",
      rawLength: 3500,
      scrapedAt: new Date("2023-01-02"),
    },
  ];

  describe("planningPrompt", () => {
    it("should generate a planning prompt with required placeholders", () => {
      const prompt = planningPrompt("AI in healthcare", 3, 5);

      expect(prompt).toContain("AI in healthcare");
      expect(prompt).toContain("Maximum depth: 3");
      expect(prompt).toContain("Target breadth: 5");
      expect(prompt).toContain("strategic research planner");
      expect(prompt).toContain("comprehensive strategic research plan");
    });
  });

  describe("queryExtractPrompt", () => {
    it("should generate a query extraction prompt with required placeholders", () => {
      const freeFormPlan = {
        originalQuery: "AI in healthcare",
        strategicPlan: "Plan to research AI applications in healthcare",
        approach: "Multi-faceted approach",
        estimatedSteps: 5,
      };

      const prompt = queryExtractPrompt(freeFormPlan, 3);

      expect(prompt).toContain("AI in healthcare");
      expect(prompt).toContain(
        "Plan to research AI applications in healthcare"
      );
      expect(prompt).toContain("Multi-faceted approach");
      expect(prompt).toContain("extract 3 specific");
      expect(prompt).toContain('estimatedSteps": 5');
    });
  });

  describe("summaryPrompt", () => {
    it("should generate a summary prompt with required placeholders", () => {
      const prompt = summaryPrompt(
        "Content to summarize",
        "AI in healthcare",
        500
      );

      expect(prompt).toContain("Content to summarize");
      expect(prompt).toContain("AI in healthcare");
      expect(prompt).toContain("500 tokens");
      expect(prompt).toContain("Summarize the following");
      expect(prompt).toContain("research query");
    });
  });

  describe("buildSummaryPrompt", () => {
    it("should build a summary prompt with content truncation", () => {
      const longContent = "x".repeat(30000);
      const prompt = buildSummaryPrompt(longContent, "test query", 500, 25000);

      expect(prompt).toContain("test query");
      expect(prompt).toContain("500 tokens");
      expect(prompt).toContain("...");
    });
  });

  describe("evaluationPrompt", () => {
    it("should generate an evaluation prompt with RefinedContent and termination decisions", () => {
      const mockPlan = {
        id: "test-plan",
        originalQuery: "AI in healthcare",
        subQueries: [
          { id: "sq1", query: "AI applications" },
          { id: "sq2", query: "Healthcare benefits" },
        ],
        searchStrategy: {
          maxDepth: 3,
          maxBreadth: 5,
          timeout: 30000,
          retryAttempts: 3,
        },
        estimatedSteps: 5,
        strategicPlan: "Test strategic plan",
      };

      const prompt = evaluationPrompt(
        "AI in healthcare",
        mockPlan,
        mockRefinedContent,
        1,
        3
      );

      expect(prompt).toContain("AI in healthcare");
      expect(prompt).toContain("Test strategic plan");
      expect(prompt).toContain("AI applications");
      expect(prompt).toContain("Healthcare benefits");
      expect(prompt).toContain("Research depth: 1/3");
      expect(prompt).toContain("AI Healthcare Applications");
      expect(prompt).toContain("Machine Learning in Medicine");
      expect(prompt).toContain("research evaluation brain");
      expect(prompt).toContain("termination decision");
      expect(prompt).toContain("generate specific search queries");
    });
  });

  describe("rankAndRefinePrompt", () => {
    it("should generate a ranking prompt with indices and scores", () => {
      const prompt = rankAndRefinePrompt(
        "AI in healthcare",
        mockRefinedContent,
        5
      );

      expect(prompt).toContain("AI in healthcare");
      expect(prompt).toContain("AI Healthcare Applications");
      expect(prompt).toContain("Machine Learning in Medicine");
      expect(prompt).toContain("top 5 most valuable");
      expect(prompt).toContain("selectedIndices");
      expect(prompt).toContain("rankings");
      expect(prompt).toContain("[0]"); // Should use 0-based indexing
      expect(prompt).toContain("[1]");
    });
  });

  describe("reportPrompt", () => {
    it("should generate a report prompt with filtered summaries", () => {
      const prompt = reportPrompt("AI in healthcare", mockRefinedContent);

      expect(prompt).toContain("AI in healthcare");
      expect(prompt).toContain("AI Healthcare Applications");
      expect(prompt).toContain("AI is revolutionizing healthcare");
      expect(prompt).toContain("Executive Summary");
      expect(prompt).toContain("inline citations");
      expect(prompt).toContain("thematically rather than source-by-source");
    });
  });

  describe("answerPrompt", () => {
    it("should generate an answer prompt with filtered summaries", () => {
      const prompt = answerPrompt("AI in healthcare", mockRefinedContent);

      expect(prompt).toContain("AI in healthcare");
      expect(prompt).toContain("AI is revolutionizing healthcare");
      expect(prompt).toContain("Maximum 140 characters");
      expect(prompt).toContain("https://example.com/ai-healthcare");
    });
  });

  describe("Helper Functions", () => {
    describe("validatePromptInputs", () => {
      it("should return true for valid inputs", () => {
        const inputs = { query: "test", depth: 3, breadth: 5 };
        expect(validatePromptInputs(inputs)).toBe(true);
      });

      it("should return false for invalid inputs", () => {
        const inputs = { query: "test", depth: null, breadth: 5 };
        expect(validatePromptInputs(inputs)).toBe(false);
      });
    });

    describe("truncateContent", () => {
      it("should truncate content longer than maxLength", () => {
        const content = "x".repeat(1000);
        const truncated = truncateContent(content, 500);
        expect(truncated).toHaveLength(503); // 500 + "..."
        expect(truncated.endsWith("...")).toBe(true);
      });

      it("should not truncate content shorter than maxLength", () => {
        const content = "short content";
        const truncated = truncateContent(content, 500);
        expect(truncated).toBe(content);
      });
    });

    describe("formatRefinedContent", () => {
      it("should format RefinedContent correctly", () => {
        const formatted = formatRefinedContent(mockRefinedContent);
        expect(formatted).toContain("[1] AI Healthcare Applications");
        expect(formatted).toContain("https://example.com/ai-healthcare");
        expect(formatted).toContain("AI is revolutionizing healthcare");
        expect(formatted).toContain("[2] Machine Learning in Medicine");
      });
    });

    describe("formatSources", () => {
      it("should format sources correctly", () => {
        const formatted = formatSources(mockRefinedContent);
        expect(formatted).toContain(
          "[1] https://example.com/ai-healthcare - AI Healthcare Applications"
        );
        expect(formatted).toContain(
          "[2] https://example.com/ml-medicine - Machine Learning in Medicine"
        );
      });
    });

    describe("formatLearningsByType", () => {
      it("should filter and format learnings by type", () => {
        const learnings = [
          {
            content: "Factual learning",
            type: "factual" as const,
            entities: [],
            confidence: 0.9,
            sourceUrl: "test.com",
          },
          {
            content: "Analytical learning",
            type: "analytical" as const,
            entities: [],
            confidence: 0.8,
            sourceUrl: "test.com",
          },
        ];

        const formatted = formatLearningsByType(learnings, "factual");
        expect(formatted).toContain("Factual learning");
        expect(formatted).not.toContain("Analytical learning");
      });
    });
  });

  describe("Exports", () => {
    it("should export prompts object with all required functions", () => {
      expect(prompts).toHaveProperty("planningPrompt");
      expect(prompts).toHaveProperty("queryExtractPrompt");
      expect(prompts).toHaveProperty("summaryPrompt");
      expect(prompts).toHaveProperty("buildSummaryPrompt");
      expect(prompts).toHaveProperty("evaluationPrompt");
      expect(prompts).toHaveProperty("rankAndRefinePrompt");
      expect(prompts).toHaveProperty("reportPrompt");
      expect(prompts).toHaveProperty("answerPrompt");
      expect(prompts).toHaveProperty("validatePromptInputs");
      expect(prompts).toHaveProperty("truncateContent");
      expect(prompts).toHaveProperty("formatRefinedContent");
      expect(prompts).toHaveProperty("formatSources");
      expect(prompts).toHaveProperty("formatLearningsByType");

      // Ensure removed functions are not present
      expect(prompts).not.toHaveProperty("refinedPlanningPrompt");
      expect(prompts).not.toHaveProperty("buildStrategicGuidancePrompt");
    });
  });
});
