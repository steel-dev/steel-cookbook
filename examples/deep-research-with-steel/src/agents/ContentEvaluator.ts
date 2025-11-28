/**
 * ContentEvaluator Agent - THE BRAIN: Research Control and Decision Making
 *
 * OVERVIEW:
 * The ContentEvaluator is the central decision-maker in the research system. It analyzes all accumulated research findings (RefinedContent), determines whether research should continue or terminate, and, if needed, generates new search queries to address remaining knowledge gaps.
 *
 * KEY RESPONSIBILITIES:
 * - Aggregates and analyzes all research findings across all iterations (knowledge accumulation)
 * - Assesses whether the research question has been sufficiently answered (completeness and gap analysis)
 * - Decides whether to terminate research or continue with new targeted queries
 * - Directly generates new search queries to fill identified gaps (no separate QueryPlanner loop)
 * - Enforces memory limits (configurable maxSources, default 60) to prevent unbounded accumulation
 * - Considers research depth and iteration context in its decisions
 *
 * INPUTS:
 * - originalQuery: string — The main research question
 * - allRefinedContent: RefinedContent[] — All accumulated summaries from all research iterations
 * - currentPlan: ResearchPlan — The current research plan context
 * - currentDepth: number — The current iteration/depth in the research process
 * - maxDepth: number — The maximum allowed research depth/iterations
 * - breadth: number — The number of new queries to generate if continuing
 *
 * OUTPUTS:
 * - ResearchEvaluation: An object containing:
 *   - Learning[]: Structured knowledge extracted from all content
 *   - CompletenessAssessment: Termination decision with detailed reasoning
 *   - ResearchDirection[]: New search queries to pursue if research should continue
 *
 * POSITION IN RESEARCH FLOW:
 * 1. QueryPlanner — called once at the beginning to generate initial queries
 * 2. SearchAgent — executes queries and returns RefinedContent[]
 * 3. ContentEvaluator (THE BRAIN) — analyzes all content, decides on termination, and generates new queries if needed
 * 4. Loop: SearchAgent ↔ ContentEvaluator until research is complete
 * 5. ContentRefiner — ranks and filters results for reporting
 * 6. ReportSynthesizer — generates the final report
 *
 * KNOWLEDGE ACCUMULATION & TERMINATION:
 * - Each iteration, ContentEvaluator considers all accumulated findings (not just the latest batch)
 * - Identifies remaining knowledge gaps and determines if further research is needed
 * - Triggers termination if:
 *   - The research question is sufficiently answered
 *   - Maximum depth is reached
 *   - Memory limit (maxSources) is exceeded
 *   - No meaningful gaps remain
 *   - High confidence and coverage are achieved
 *
 * USAGE EXAMPLE:
 * ```typescript
 * const evaluator = new ContentEvaluator(providerManager, eventEmitter);
 * const brainDecision = await evaluator.evaluateFindings(
 *   "AI in healthcare",
 *   allRefinedContent,  // All accumulated summaries
 *   initialPlan,
 *   2,  // currentDepth
 *   3,  // maxDepth
 *   5   // breadth for new queries
 * );
 * // Returns: ResearchEvaluation with termination decision and/or new queries
 * ```
 */

import { EventEmitter } from "events";
import { z } from "zod";
import {
  RefinedContent,
  Learning,
  ResearchDirection,
  CompletenessAssessment,
  ResearchEvaluation,
  ResearchPlan,
  LearningSchema,
  ResearchDirectionSchema,
  CompletenessAssessmentSchema,
} from "../core/interfaces";
import { BaseAgent } from "../core/BaseAgent";
// import { ProviderManager } from "../providers/providers"; // Removed - using BaseAgent now
import { EventFactory } from "../core/events";
import { prompts } from "../prompts/prompts";
import { logger } from "../utils/logger";

export class ContentEvaluator extends BaseAgent {
  private readonly MAX_CONTENT_LENGTH = 25000;
  private readonly DEFAULT_MAX_SOURCES = 60;

  constructor(
    models: {
      planner: any;
      evaluator: any;
      writer: any;
      summary: any;
    },
    parentEmitter: EventEmitter
  ) {
    super(models, parentEmitter);
  }

  /**
   * THE BRAIN: Main evaluation method that analyzes ALL accumulated findings
   *
   * This is THE BRAIN of the research system. It:
   * 1. Analyzes ALL accumulated RefinedContent[] across iterations
   * 2. Makes termination decisions based on completeness
   * 3. Generates new search queries directly if continuing
   * 4. Implements memory limits and knowledge accumulation
   * 5. Provides systematic gap analysis
   *
   * KNOWLEDGE ACCUMULATION:
   * - Processes ALL summaries from all previous iterations
   * - Builds comprehensive understanding over time
   * - Identifies gaps that remain after accumulated learning
   * - Makes informed termination decisions based on total knowledge
   *
   * THE BRAIN DECISION LOGIC:
   * - If maxSources exceeded → immediate termination
   * - If depth=0 → skip evaluation (no more iterations possible)
   * - If sufficient information → recommend synthesis
   * - If gaps remain + depth available → generate new queries
   * - If no meaningful directions → terminate research
   */
  async evaluateFindings(
    originalQuery: string,
    allRefinedContent: RefinedContent[], // ALL accumulated summaries
    currentPlan: ResearchPlan,
    currentDepth: number,
    maxDepth: number,
    breadth: number = 5, // Number of queries to generate if continuing
    maxSources: number = this.DEFAULT_MAX_SOURCES
  ): Promise<ResearchEvaluation> {
    console.log("🧠 [EVALUATOR] Starting evaluateFindings");
    console.log(
      `🧠 [EVALUATOR] Params: currentDepth=${currentDepth}, maxDepth=${maxDepth}, summaries=${allRefinedContent.length}, maxSources=${maxSources}`
    );

    const sessionId = this.getCurrentSessionId();
    const startTime = Date.now();

    // Emit brain analysis start
    const toolCallEvent = EventFactory.createToolCallStart(
      sessionId,
      "analyze",
      {
        action: "brain_evaluation",
        query: originalQuery,
        metadata: {
          totalSummaries: allRefinedContent.length,
          currentDepth,
          maxDepth,
          remainingIterations: maxDepth - currentDepth,
          breadth,
          maxSources,
        },
      }
    );

    this.emit("tool-call", toolCallEvent);
    const toolCallId = toolCallEvent.toolCallId;

    try {
      // MEMORY GUARD: Check if we've exceeded source limits
      console.log("🧠 [EVALUATOR] Checking memory limit...");
      if (allRefinedContent.length > maxSources) {
        console.log(
          `🧠 [EVALUATOR] Memory limit exceeded: ${allRefinedContent.length} > ${maxSources}. Terminating.`
        );
        logger.debug(
          `Memory limit exceeded: ${allRefinedContent.length} > ${maxSources} sources. Triggering immediate termination.`
        );

        const memoryLimitEvaluation: ResearchEvaluation = {
          learnings: [], // Skip learning extraction due to memory limit
          completenessAssessment: {
            coverage: 0.8, // Assume good coverage if we hit memory limit
            confidence: 0.7,
            knowledgeGaps: [], // Skip gap analysis due to memory limit
            hasEnoughInfo: true, // Assume enough info if memory limit hit
            recommendedAction: "synthesize",
            reasoning: `Memory limit exceeded (${allRefinedContent.length} > ${maxSources} sources). Terminating research to proceed with synthesis.`,
          },
          researchDirections: [], // No new directions - terminating
        };

        this.emit(
          "tool-result",
          EventFactory.createToolCallEnd(
            sessionId,
            toolCallId,
            "analyze",
            true,
            {
              decision: "memory_limit_termination",
              totalSummaries: allRefinedContent.length,
              maxSources,
            },
            undefined,
            new Date(startTime)
          )
        );

        return memoryLimitEvaluation;
      }

      // OPTIMIZATION: Skip evaluation at depth=0 (no more iterations possible)
      console.log("🧠 [EVALUATOR] Checking max depth...");
      if (currentDepth >= maxDepth) {
        console.log(
          `🧠 [EVALUATOR] Max depth reached: ${currentDepth} >= ${maxDepth}. Terminating.`
        );
        logger.debug(
          `Maximum depth reached (${currentDepth}/${maxDepth}). Terminating research.`
        );

        const maxDepthEvaluation: ResearchEvaluation = {
          learnings: this.extractQuickLearnings(allRefinedContent),
          completenessAssessment: {
            coverage: 0.8, // Assume reasonable coverage at max depth
            confidence: 0.7,
            knowledgeGaps: [], // Skip gap analysis at max depth
            hasEnoughInfo: true, // Assume enough info at max depth
            recommendedAction: "synthesize",
            reasoning: `Maximum research depth reached (${currentDepth}/${maxDepth}). Proceeding to synthesis with ${allRefinedContent.length} accumulated sources.`,
          },
          researchDirections: [], // No new directions - max depth reached
        };

        this.emit(
          "tool-result",
          EventFactory.createToolCallEnd(
            sessionId,
            toolCallId,
            "analyze",
            true,
            {
              decision: "max_depth_termination",
              currentDepth,
              maxDepth,
              totalSummaries: allRefinedContent.length,
            },
            undefined,
            new Date(startTime)
          )
        );

        return maxDepthEvaluation;
      }

      // Validate inputs
      console.log("🧠 [EVALUATOR] Validating inputs...");
      if (!allRefinedContent || allRefinedContent.length === 0) {
        console.log("🧠 [EVALUATOR] ERROR: No refined content provided!");
        throw new Error("No refined content provided for evaluation");
      }

      console.log(
        `🧠 [EVALUATOR] Processing ${allRefinedContent.length} content items...`
      );
      // Truncate content summaries to fit within context window
      const truncatedContent = allRefinedContent.map((content) => ({
        ...content,
        summary:
          content.summary.length > this.MAX_CONTENT_LENGTH
            ? content.summary.substring(0, this.MAX_CONTENT_LENGTH) + "..."
            : content.summary,
      }));

      console.log("🧠 [EVALUATOR] Building evaluation prompt...");
      // THE BRAIN: Use enhanced evaluation prompt with ALL context
      const evaluationPrompt = prompts.evaluationPrompt(
        originalQuery,
        currentPlan,
        truncatedContent,
        currentDepth,
        maxDepth
      );

      console.log(" =================================================");
      console.log(" =EVALUATOR PROMPT");
      console.log(evaluationPrompt);
      console.log(" =================================");

      // Get the appropriate LLM provider for evaluation
      const llm = this.getLLM("evaluator");
      console.log(
        "🧠 [EVALUATOR] Got LLM provider, starting structured generation..."
      );

      console.log(" =================================================");
      console.log(" =CALLING EVALUATOR");
      console.log(" =================================================");

      // Generate structured evaluation using BaseAgent helper
      const brainDecision = await this.generateStructured<{
        learnings: Learning[];
        completenessAssessment: {
          coverage: number;
          confidence: number;
          recommendedAction: "continue" | "synthesize";
          reasoning: string;
          knowledgeGaps: string[];
          hasEnoughInfo: boolean;
        };
        researchDirections: ResearchDirection[];
      }>(
        evaluationPrompt,
        z.object({
          learnings: z.array(LearningSchema),
          completenessAssessment: z.object({
            coverage: z
              .number()
              .min(0)
              .max(1)
              .describe("How well we have covered the topic (0-1)"),
            confidence: z
              .number()
              .min(0)
              .max(1)
              .describe("Confidence in findings quality (0-1)"),
            recommendedAction: z
              .enum(["continue", "synthesize"])
              .describe("Whether to continue research or synthesize results"),
            reasoning: z
              .string()
              .describe("Detailed reasoning for the recommendation."),
            knowledgeGaps: z
              .array(z.string())
              .describe("Specific gaps identified in current knowledge"),
            hasEnoughInfo: z
              .boolean()
              .describe("Whether we have sufficient info to answer the query"),
          }),
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
                .min(1)
                .max(breadth)
                .describe(
                  `Specific search queries (max ${breadth}) to pursue this direction`
                ),
            })
          ),
        }),
        "evaluator" // Add the required kind parameter
      );

      console.log(" =================================");
      console.log(" =EVALUATOR RETURNED");
      console.log(" =================================");
      console.log(" =COMPLETENESS ASSESSMENT");
      console.log(brainDecision.completenessAssessment);
      console.log(" =================================");
      console.log(" =RESEARCH DIRECTIONS");
      console.log(brainDecision.researchDirections);
      console.log(" =================================");
      console.log(" =================================================");
      console.log("🧠 [EVALUATOR] LLM call successful, processing response...");

      // THE BRAIN DECISION: Process LLM response into final evaluation
      const evaluation: ResearchEvaluation = {
        learnings: brainDecision.learnings,
        completenessAssessment: brainDecision.completenessAssessment,
        researchDirections: brainDecision.researchDirections,
      };

      console.log(
        `🧠 [EVALUATOR] Decision: ${evaluation.completenessAssessment.recommendedAction}`
      );
      console.log(
        `🧠 [EVALUATOR] Coverage: ${evaluation.completenessAssessment.coverage}`
      );
      console.log(
        `🧠 [EVALUATOR] Confidence: ${evaluation.completenessAssessment.confidence}`
      );
      console.log(
        `🧠 [EVALUATOR] New directions: ${evaluation.researchDirections.length}`
      );

      // Validate the brain decision
      this.validateBrainDecision(evaluation, breadth);

      // Emit successful brain analysis result
      const toolResultEvent = EventFactory.createToolCallEnd(
        sessionId,
        toolCallId,
        "analyze",
        true,
        {
          decision: evaluation.completenessAssessment.recommendedAction,
          coverage: evaluation.completenessAssessment.coverage,
          confidence: evaluation.completenessAssessment.confidence,
          learningsExtracted: evaluation.learnings.length,
          gapsIdentified:
            evaluation.completenessAssessment.knowledgeGaps.length,
          newQueriesGenerated: evaluation.researchDirections.reduce(
            (total, dir) => total + dir.searchQueries.length,
            0
          ),
          totalSummariesAnalyzed: allRefinedContent.length,
          remainingIterations: maxDepth - currentDepth,
        },
        undefined,
        new Date(startTime)
      );
      this.emit("tool-result", toolResultEvent);

      // Log brain decision for debugging
      logger.debug(
        `THE BRAIN Decision: ${
          evaluation.completenessAssessment.recommendedAction
        } 
         Coverage: ${evaluation.completenessAssessment.coverage} 
         Confidence: ${evaluation.completenessAssessment.confidence}
         Summaries analyzed: ${allRefinedContent.length}
         New queries: ${evaluation.researchDirections.reduce(
           (total, dir) => total + dir.searchQueries.length,
           0
         )}`
      );

      console.log("🧠 [EVALUATOR] Evaluation complete, returning result");
      return evaluation;
    } catch (error) {
      // Emit error result and implement fallback to termination
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      console.log(`🧠 [EVALUATOR] ERROR: ${errorMessage}`);
      console.log("🧠 [EVALUATOR] Falling back to termination decision");

      this.emit(
        "tool-result",
        EventFactory.createToolCallEnd(
          sessionId,
          toolCallId,
          "analyze",
          false,
          undefined,
          errorMessage,
          new Date(startTime)
        )
      );

      // FALLBACK: If evaluation fails, default to termination with basic assessment
      logger.warn(
        `Brain evaluation failed: ${errorMessage}. Falling back to termination decision.`
      );

      const fallbackEvaluation: ResearchEvaluation = {
        learnings: this.extractQuickLearnings(allRefinedContent),
        completenessAssessment: {
          coverage: 0.6, // Conservative coverage estimate
          confidence: 0.5, // Low confidence due to evaluation failure
          recommendedAction: "synthesize",
          reasoning: `Evaluation failed (${errorMessage}). Proceeding to synthesis with ${allRefinedContent.length} available sources.`,
          knowledgeGaps: ["Evaluation incomplete due to technical error"],
          hasEnoughInfo: allRefinedContent.length >= 5, // Basic heuristic
        },
        researchDirections: [], // No new directions due to failure
      };

      console.log("🧠 [EVALUATOR] Returning fallback evaluation");
      return fallbackEvaluation;
    }
  }

  /**
   * Validate the brain decision for consistency and constraints
   */
  private validateBrainDecision(
    evaluation: ResearchEvaluation,
    breadth: number
  ): void {
    // Validate coverage and confidence ranges
    if (
      evaluation.completenessAssessment.coverage < 0 ||
      evaluation.completenessAssessment.coverage > 1
    ) {
      throw new Error("Coverage assessment must be between 0 and 1");
    }

    if (
      evaluation.completenessAssessment.confidence < 0 ||
      evaluation.completenessAssessment.confidence > 1
    ) {
      throw new Error("Confidence assessment must be between 0 and 1");
    }

    // Validate research directions if continuing
    if (evaluation.completenessAssessment.recommendedAction === "continue") {
      if (evaluation.researchDirections.length === 0) {
        logger.warn(
          "Brain recommended continue but provided no research directions. Switching to synthesize."
        );
        evaluation.completenessAssessment.recommendedAction = "synthesize";
        evaluation.completenessAssessment.reasoning +=
          " (Modified: No research directions provided)";
      }

      // Validate query count doesn't exceed breadth
      const totalQueries = evaluation.researchDirections.reduce(
        (total, dir) => total + dir.searchQueries.length,
        0
      );

      if (totalQueries > breadth * 2) {
        // Allow some flexibility but cap at 2x breadth
        logger.warn(
          `Brain generated ${totalQueries} queries, exceeding expected breadth of ${breadth}. This may indicate over-generation.`
        );
      }
    }

    // Validate termination decisions have reasoning
    if (evaluation.completenessAssessment.recommendedAction === "synthesize") {
      if (!evaluation.completenessAssessment.reasoning) {
        throw new Error(
          "Termination decisions must include detailed reasoning"
        );
      }
    }
  }

  /**
   * Extract quick learnings for fallback scenarios
   */
  private extractQuickLearnings(
    allRefinedContent: RefinedContent[]
  ): Learning[] {
    return allRefinedContent.slice(0, 10).map((content, index) => ({
      content: content.summary.substring(0, 200) + "...", // Truncate for quick processing
      type: "factual" as const,
      entities: [], // Skip entity extraction for quick processing
      confidence: 0.7, // Default confidence
      sourceUrl: content.url,
    }));
  }

  /**
   * Test method for brain functionality validation
   */
  async testBrainDecision(
    query: string,
    summaries: RefinedContent[],
    shouldTerminate: boolean = false
  ): Promise<ResearchEvaluation> {
    const mockPlan: ResearchPlan = {
      id: "test-plan",
      originalQuery: query,
      subQueries: [{ id: "test-sq", query }],
      searchStrategy: {
        maxDepth: 3,
        maxBreadth: 3,
        timeout: 30000,
        retryAttempts: 3,
      },
      estimatedSteps: 3,
    };

    return this.evaluateFindings(
      query,
      summaries,
      mockPlan,
      shouldTerminate ? 3 : 1, // Force termination by setting currentDepth >= maxDepth
      3,
      5
    );
  }
}
