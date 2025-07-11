/**
 * ContentEvaluator Agent - Research Quality Assessment and Learning Extraction
 *
 * OVERVIEW:
 * The ContentEvaluator is a critical component that analyzes search results and extracted
 * content to determine research quality, completeness, and next steps. It extracts structured
 * learnings from unstructured content and provides intelligent guidance for research continuation.
 *
 * INPUTS:
 * - originalQuery: String - The main research question
 * - findings: SearchResult[] - Array of search results with content
 * - currentDepth: Number - Current iteration depth in research
 * - maxDepth: Number - Maximum allowed research depth
 *
 * OUTPUTS:
 * - ResearchEvaluation: Comprehensive assessment containing:
 *   - Learning[]: Structured knowledge extracted from content
 *   - ResearchDirection[]: Suggested follow-up research questions
 *   - CompletenessAssessment: Analysis of research completeness
 *   - confidenceLevel: Overall confidence score (0-1)
 *
 * POSITION IN RESEARCH FLOW:
 * 1. **POST-SEARCH ANALYSIS** (After SearchAgent):
 *    - Receives search results from SearchAgent
 *    - Extracts structured learnings from unstructured content
 *    - Classifies information by type (factual, analytical, statistical)
 *    - Identifies entities and key concepts
 *
 * 2. **RESEARCH GUIDANCE** (Feeds into ContentRefiner):
 *    - Assesses research completeness and quality
 *    - Identifies knowledge gaps and missing information
 *    - Suggests specific research directions for next iteration
 *    - Provides termination recommendations
 *
 * KEY FEATURES:
 * - Structured learning extraction with entity recognition
 * - Multi-type content classification (factual, analytical, statistical, procedural)
 * - Intelligent gap analysis and completeness assessment
 * - Research direction generation with priority scoring
 * - Confidence scoring based on source quality and coverage
 * - Adaptive evaluation based on research depth and findings
 *
 * EVALUATION CRITERIA:
 * - Content quality and relevance
 * - Source diversity and authority
 * - Coverage of different aspects of the topic
 * - Presence of quantitative vs qualitative information
 * - Currency and recency of information
 * - Logical gaps in understanding
 *
 * USAGE EXAMPLE:
 * ```typescript
 * const evaluator = new ContentEvaluator(aiProvider, eventEmitter);
 * const evaluation = await evaluator.evaluateFindings(
 *   "AI in healthcare", findings, 1, 3
 * );
 * // Returns: ResearchEvaluation with learnings, gaps, and next steps
 * ```
 */

import { EventEmitter } from "events";
import { generateObject } from "ai";
import { z } from "zod";
import {
  SearchResult,
  Learning,
  ResearchDirection,
  CompletenessAssessment,
  ResearchEvaluation,
  LearningSchema,
  ResearchDirectionSchema,
  CompletenessAssessmentSchema,
  ResearchPlan,
} from "../core/interfaces";

export class ContentEvaluator {
  private readonly MAX_CONTENT_LENGTH = 25000;

  constructor(private provider: any, private eventEmitter: EventEmitter) {}

  /**
   * Main evaluation method that analyzes search findings comprehensively
   *
   * This method orchestrates the entire evaluation process:
   * 1. Extracts structured learnings from unstructured content
   * 2. Identifies potential research directions for next iteration
   * 3. Assesses completeness and determines if research should continue
   * 4. Calculates overall confidence in the findings
   *
   * The evaluation considers both the quality and quantity of information,
   * as well as the current research depth and progress.
   */
  async evaluateFindings(
    originalQuery: string,
    findings: SearchResult[],
    currentPlan: ResearchPlan, // NEW: Current research plan context
    currentDepth: number,
    maxDepth: number
  ): Promise<ResearchEvaluation> {
    this.eventEmitter.emit("progress", { phase: "evaluating", progress: 75 });

    // Validate inputs
    if (!findings || findings.length === 0) {
      throw new Error("No findings provided for evaluation");
    }

    try {
      // Truncate content to fit within context window
      const truncatedFindings = findings.map((finding) => ({
        ...finding,
        content:
          finding.content.length > this.MAX_CONTENT_LENGTH
            ? finding.content.substring(0, this.MAX_CONTENT_LENGTH) + "..."
            : finding.content,
      }));

      // Use AI SDK's generateObject for structured evaluation
      const { object } = await generateObject({
        model: this.provider,
        prompt: `Evaluate these research findings for the query: "${originalQuery}"

Current research plan context:
Strategic Plan: ${currentPlan.strategicPlan || "No strategic plan provided"}
Sub-queries being researched: ${currentPlan.subQueries
          .map((sq) => `- ${sq.query}`)
          .join("\n")}

Current findings:
${truncatedFindings
  .map((f) => `Source: ${f.url}\nContent: ${f.content}`)
  .join("\n---\n")}

Research depth: ${currentDepth}/${maxDepth}

Provide a comprehensive evaluation:
1. Extract key learnings with high specificity (include entities, numbers, dates)
2. Assess how well findings address the current plan's sub-queries
3. Identify which planned research areas were well-covered vs. under-covered
4. Identify research directions that would add significant value
5. Assess completeness and recommend next action based on plan objectives`,

        schema: z.object({
          learnings: z.array(
            z.object({
              content: z
                .string()
                .describe(
                  "Specific, detailed learning with entities and facts"
                ),
              type: z.enum([
                "factual",
                "analytical",
                "procedural",
                "statistical",
              ]),
              entities: z
                .array(z.string())
                .describe("Key entities mentioned (people, places, companies)"),
              confidence: z.number().min(0).max(1),
              sourceUrl: z.string(),
            })
          ),
          researchDirections: z.array(
            z.object({
              question: z
                .string()
                .describe("Specific research question to pursue"),
              rationale: z
                .string()
                .describe("Why this direction would add value"),
              searchQueries: z
                .array(z.string())
                .describe("Specific queries to pursue this direction"),
            })
          ),
          completenessAssessment: z.object({
            coverage: z
              .number()
              .min(0)
              .max(1)
              .describe("How well we have covered the topic"),
            knowledgeGaps: z
              .array(z.string())
              .describe("Specific gaps identified"),
            hasEnoughInfo: z
              .boolean()
              .describe("Can we synthesize a good answer?"),
            recommendedAction: z.enum(["continue", "refine", "synthesize"]),
          }),
          // Confidence metric removed
        }),
      });

      const evaluation: ResearchEvaluation = {
        learnings: object.learnings,
        researchDirections: object.researchDirections,
        completenessAssessment: object.completenessAssessment,
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

  /**
   * Validate evaluation results for consistency and completeness
   *
   * This method ensures that the evaluation results are well-formed and
   * within expected ranges before returning to the caller.
   */
  private validateEvaluation(evaluation: ResearchEvaluation): void {
    if (!evaluation.learnings || evaluation.learnings.length === 0) {
      console.warn("No learnings extracted from findings");
    }

    // Confidence validation removed

    if (
      evaluation.completenessAssessment.coverage < 0 ||
      evaluation.completenessAssessment.coverage > 1
    ) {
      throw new Error("Coverage assessment must be between 0 and 1");
    }
  }

  // Simplified methods for testing and direct usage

  /**
   * Simple evaluation method for testing with minimal content
   */
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

    const mockPlan: ResearchPlan = {
      id: "test-plan",
      originalQuery: query,
      subQueries: [{ id: "test-sq", query, category: "general" }],
      searchStrategy: {
        maxDepth: 3,
        maxBreadth: 3,
        timeout: 30000,
        retryAttempts: 3,
      },
      estimatedSteps: 3,
    };

    return this.evaluateFindings(query, [mockFinding], mockPlan, 1, 3);
  }

  /**
   * Extract learnings from content directly using AI (for testing)
   */
  async extractLearnings(
    content: string,
    sourceUrl: string
  ): Promise<Learning[]> {
    const { object } = await generateObject({
      model: this.provider,
      prompt: `Extract key learnings from this content:

${content}

Source: ${sourceUrl}

Extract specific, detailed learnings with entities and classify by type.`,
      schema: z.object({
        learnings: z.array(LearningSchema),
      }),
    });

    return object.learnings;
  }

  /**
   * Assess completeness directly using AI (for testing)
   */
  async assessCompletenessAsync(
    originalQuery: string,
    findings: SearchResult[]
  ): Promise<CompletenessAssessment> {
    const { object } = await generateObject({
      model: this.provider,
      prompt: `Assess the completeness of these research findings for the query: "${originalQuery}"

Findings:
${findings
  .map((f) => `Source: ${f.url}\nContent: ${f.content.substring(0, 500)}...`)
  .join("\n---\n")}

Evaluate coverage, identify gaps, and recommend next action.`,
      schema: z.object({
        completenessAssessment: CompletenessAssessmentSchema,
      }),
    });

    return object.completenessAssessment;
  }
}
