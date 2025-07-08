import { EventEmitter } from "events";
import { generateTextOutput } from "../providers/providers";
import {
  SearchResult,
  Learning,
  ResearchDirection,
  CompletenessAssessment,
  ResearchEvaluation,
} from "../core/interfaces";

export class ContentEvaluator {
  private readonly MAX_CONTENT_LENGTH = 25000;

  constructor(private provider: any, private eventEmitter: EventEmitter) {}

  async evaluateFindings(
    originalQuery: string,
    findings: SearchResult[],
    currentDepth: number,
    maxDepth: number
  ): Promise<ResearchEvaluation> {
    this.eventEmitter.emit("progress", { phase: "evaluating", progress: 75 });

    if (!findings || findings.length === 0) {
      throw new Error("No findings provided for evaluation");
    }

    try {
      // Simplified evaluation approach - extract key information
      const learnings = await this.extractSimpleLearnings(
        originalQuery,
        findings
      );
      const researchDirections = await this.identifyResearchDirections(
        originalQuery,
        findings,
        currentDepth,
        maxDepth
      );
      const completenessAssessment = this.assessCompleteness(
        originalQuery,
        findings,
        currentDepth,
        maxDepth
      );

      const evaluation: ResearchEvaluation = {
        learnings,
        researchDirections,
        completenessAssessment,
        confidenceLevel: this.calculateConfidenceLevel(findings),
      };

      this.validateEvaluation(evaluation);
      return evaluation;
    } catch (error) {
      throw new Error(
        `Failed to evaluate findings: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  private async extractSimpleLearnings(
    originalQuery: string,
    findings: SearchResult[]
  ): Promise<Learning[]> {
    const learnings: Learning[] = [];

    // Create learnings from each finding
    for (const finding of findings.slice(0, 5)) {
      // Limit to first 5 findings
      const contentSnippet =
        finding.content.length > 500
          ? finding.content.substring(0, 500) + "..."
          : finding.content;

      // Extract simple learnings based on content analysis
      const entities = this.extractEntities(contentSnippet);

      learnings.push({
        content: finding.summary || contentSnippet,
        type: this.classifyLearningType(contentSnippet),
        entities,
        confidence: finding.relevanceScore || 0.7,
        sourceUrl: finding.url,
      });
    }

    return learnings;
  }

  private async identifyResearchDirections(
    originalQuery: string,
    findings: SearchResult[],
    currentDepth: number,
    maxDepth: number
  ): Promise<ResearchDirection[]> {
    const directions: ResearchDirection[] = [];

    // If we're at max depth, don't suggest more directions
    if (currentDepth >= maxDepth - 1) {
      return directions;
    }

    // Generate simple research directions based on query analysis
    const queryLower = originalQuery.toLowerCase();

    if (queryLower.includes("typescript")) {
      directions.push({
        question: "What are the latest TypeScript features and updates?",
        rationale: "Understanding recent developments provides current context",
        priority: "medium",
        searchQueries: [
          "TypeScript latest features",
          "TypeScript updates 2024",
        ],
      });
    } else if (
      queryLower.includes("ai") ||
      queryLower.includes("artificial intelligence")
    ) {
      directions.push({
        question: "What are the practical applications of AI in industry?",
        rationale: "Real-world applications demonstrate AI impact",
        priority: "high",
        searchQueries: [
          "AI applications industry",
          "artificial intelligence use cases",
        ],
      });
    } else {
      // Generic research direction
      directions.push({
        question: `What are the recent developments related to ${originalQuery}?`,
        rationale: "Recent developments provide current context",
        priority: "medium",
        searchQueries: [
          `${originalQuery} recent developments`,
          `${originalQuery} 2024`,
        ],
      });
    }

    return directions;
  }

  private assessCompleteness(
    originalQuery: string,
    findings: SearchResult[],
    currentDepth: number,
    maxDepth: number
  ): CompletenessAssessment {
    // Simple completeness assessment based on findings count and depth
    const coverageScore = Math.min(findings.length / 10, 1.0); // Assume 10 findings = 100% coverage
    const depthFactor = currentDepth / maxDepth;

    const knowledgeGaps: string[] = [];

    // Basic gap analysis
    if (findings.length < 3) {
      knowledgeGaps.push("Need more sources for comprehensive coverage");
    }

    if (currentDepth < 2) {
      knowledgeGaps.push("May need deeper investigation of key topics");
    }

    const hasEnoughInfo = coverageScore > 0.6 || findings.length >= 5;
    const recommendedAction = hasEnoughInfo ? "synthesize" : "continue";

    return {
      coverage: coverageScore,
      knowledgeGaps,
      hasEnoughInfo,
      recommendedAction: recommendedAction as
        | "continue"
        | "refine"
        | "synthesize",
    };
  }

  private calculateConfidenceLevel(findings: SearchResult[]): number {
    if (findings.length === 0) return 0;

    const avgRelevance =
      findings.reduce((sum, f) => sum + (f.relevanceScore || 0.5), 0) /
      findings.length;
    const countFactor = Math.min(findings.length / 5, 1.0); // 5 findings = max confidence from count

    return (avgRelevance + countFactor) / 2;
  }

  private extractEntities(content: string): string[] {
    const entities: string[] = [];

    // Simple entity extraction using patterns
    const patterns = [
      /\b[A-Z][a-z]+ [A-Z][a-z]+\b/g, // Person names
      /\b[A-Z][a-zA-Z]+\s+(Inc|Corp|LLC|Ltd)\b/g, // Company names
      /\b(19|20)\d{2}\b/g, // Years
      /\b[A-Z][a-z]+Script\b/g, // Programming languages ending in Script
      /\b[A-Z][a-zA-Z]*\b/g, // Capitalized words (potential proper nouns)
    ];

    patterns.forEach((pattern) => {
      const matches = content.match(pattern);
      if (matches) {
        entities.push(...matches.slice(0, 3)); // Limit to 3 matches per pattern
      }
    });

    // Remove duplicates and limit total
    return [...new Set(entities)].slice(0, 5);
  }

  private classifyLearningType(
    content: string
  ): "factual" | "analytical" | "procedural" | "statistical" {
    const contentLower = content.toLowerCase();

    if (
      contentLower.includes("step") ||
      contentLower.includes("how to") ||
      contentLower.includes("process")
    ) {
      return "procedural";
    } else if (
      contentLower.includes("%") ||
      contentLower.includes("percent") ||
      /\d+/.test(content)
    ) {
      return "statistical";
    } else if (
      contentLower.includes("analysis") ||
      contentLower.includes("compare") ||
      contentLower.includes("advantage")
    ) {
      return "analytical";
    } else {
      return "factual";
    }
  }

  private validateEvaluation(evaluation: ResearchEvaluation): void {
    if (!evaluation.learnings || evaluation.learnings.length === 0) {
      console.warn("No learnings extracted from findings");
    }

    if (evaluation.confidenceLevel < 0 || evaluation.confidenceLevel > 1) {
      throw new Error("Confidence level must be between 0 and 1");
    }

    if (
      evaluation.completenessAssessment.coverage < 0 ||
      evaluation.completenessAssessment.coverage > 1
    ) {
      throw new Error("Coverage assessment must be between 0 and 1");
    }
  }

  // Simplified methods for testing
  async evaluateSimple(
    query: string,
    content: string,
    sourceUrl: string
  ): Promise<ResearchEvaluation> {
    const mockFinding: SearchResult = {
      id: "test-1",
      query,
      url: sourceUrl,
      title: "Test Content",
      content,
      summary: content.substring(0, 200) + "...",
      relevanceScore: 0.8,
      timestamp: new Date(),
    };

    return this.evaluateFindings(query, [mockFinding], 1, 3);
  }

  async extractLearnings(
    content: string,
    sourceUrl: string
  ): Promise<Learning[]> {
    const entities = this.extractEntities(content);

    return [
      {
        content: content.substring(0, 200) + "...",
        type: this.classifyLearningType(content),
        entities,
        confidence: 0.7,
        sourceUrl,
      },
    ];
  }

  async assessCompletenessAsync(
    originalQuery: string,
    findings: SearchResult[]
  ): Promise<CompletenessAssessment> {
    return this.assessCompleteness(originalQuery, findings, 1, 3);
  }
}
