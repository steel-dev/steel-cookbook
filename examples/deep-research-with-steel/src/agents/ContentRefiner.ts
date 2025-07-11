/**
 * ContentRefiner Agent - Research Strategy Refinement and Termination Control
 *
 * OVERVIEW:
 * The ContentRefiner is the decision-making hub of the research process, responsible for
 * determining whether to continue research, refine the strategy, or proceed to synthesis.
 * It analyzes evaluation results and makes intelligent decisions about research progression.
 *
 * INPUTS:
 * - originalQuery: String - The main research question
 * - evaluation: ResearchEvaluation - Comprehensive evaluation from ContentEvaluator
 * - currentPlan: ResearchPlan - Current research plan and strategy
 * - currentDepth: Number - Current iteration depth
 * - maxDepth: Number - Maximum allowed depth
 *
 * OUTPUTS:
 * - ResearchPlan | null - Refined research plan for next iteration, or null to terminate
 * - TerminationDecision - Decision about whether to continue or terminate research
 * - ResearchGapAnalysis - Analysis of research gaps and recommendations
 *
 * POSITION IN RESEARCH FLOW:
 * 1. **EVALUATION PROCESSING** (After ContentEvaluator):
 *    - Receives comprehensive evaluation results
 *    - Analyzes completeness and quality metrics
 *    - Identifies research gaps and opportunities
 *
 * 2. **DECISION MAKING** (Central control point):
 *    - Determines termination conditions
 *    - Evaluates research quality vs. effort trade-offs
 *    - Makes strategic decisions about research continuation
 *
 * 3. **STRATEGY REFINEMENT** (Feeds back to QueryPlanner):
 *    - Collaborates with QueryPlanner for next iteration
 *    - Generates targeted queries based on gaps
 *    - Adjusts research strategy based on findings
 *
 * KEY FEATURES:
 * - Intelligent termination decision making
 * - Multi-criteria evaluation for research continuation
 * - Gap analysis and strategic planning
 * - Early termination for efficiency
 * - Research quality assessment
 * - Strategic collaboration with QueryPlanner
 *
 * TERMINATION CONDITIONS:
 * - Explicit synthesis recommendation from evaluation
 * - High coverage achieved (>85%)
 * - Sufficient information available
 * - Maximum depth reached
 * - No research directions available
 * - High confidence with good coverage
 *
 * DECISION CRITERIA:
 * - Research completeness and coverage
 * - Confidence level in findings
 * - Available research directions
 * - Depth budget and resource constraints
 * - Quality vs. effort trade-offs
 *
 * USAGE EXAMPLE:
 * ```typescript
 * const refiner = new ContentRefiner(aiProvider, queryPlanner, eventEmitter);
 * const decision = await refiner.shouldTerminate(query, evaluation, 2, 3);
 * if (!decision.shouldTerminate) {
 *   const newPlan = await refiner.refineSearchStrategy(query, evaluation, currentPlan);
 * }
 * ```
 */

import { EventEmitter } from "events";
import { QueryPlanner } from "./QueryPlanner";
import { ProviderManager } from "../providers/providers";
import { BaseAgent } from "../core/BaseAgent";
import {
  ResearchEvaluation,
  ResearchPlan,
  ToolCallEvent,
  RefinementDecision,
  Learning,
  ResearchDirection,
} from "../core/interfaces";
import { EventFactory } from "../core/events";

export class ContentRefiner extends BaseAgent {
  private provider: any;
  private planner: QueryPlanner;

  constructor(
    providerManager: ProviderManager,
    planner: QueryPlanner,
    parentEmitter: EventEmitter
  ) {
    super(providerManager, parentEmitter);
    this.provider = providerManager.getAIProvider();
    this.planner = planner;
  }

  /**
   * Refine search strategy based on research evaluation with accumulated context
   *
   * This is the main strategic decision-making method that determines whether research should
   * continue and provides strategic guidance. It implements sophisticated logic to
   * balance research quality with efficiency using accumulated knowledge.
   *
   * Returns RefinementDecision with strategic guidance for next iteration
   *
   * DECISION LOGIC:
   * 1. Check explicit recommendations from evaluation
   * 2. Assess coverage and information sufficiency
   * 3. Evaluate availability of research directions
   * 4. Consider accumulated learnings and query history
   * 5. Provide strategic guidance if continuation is warranted
   */
  async refineSearchStrategy(
    originalQuery: string,
    evaluation: ResearchEvaluation,
    currentPlan: ResearchPlan,
    allLearnings: Learning[], // NEW: Accumulated learnings
    allQueries: string[] // NEW: All previous queries
  ): Promise<RefinementDecision> {
    this.emit("progress", { phase: "refining", progress: 60 });

    // Primary termination condition: Explicit synthesis recommendation
    if (evaluation.completenessAssessment.recommendedAction === "synthesize") {
      const toolCallEvent = EventFactory.createToolCallStart(
        this.getCurrentSessionId(),
        "analyze",
        {
          action: "early_termination",
          metadata: {
            decision: "early_termination",
            reason: "sufficient_information",
            coverage: evaluation.completenessAssessment.coverage,
            confidenceMetric: evaluation.completenessAssessment.coverage,
            totalLearnings: allLearnings.length,
            totalQueries: allQueries.length,
          },
        }
      );

      this.emit("tool-call", toolCallEvent);

      return {
        shouldContinue: false,
        reason: "evaluation_recommends_synthesis",
        researchDirections: [],
        strategicGuidance:
          "Sufficient information gathered. Proceed to synthesis.",
        confidence: evaluation.completenessAssessment.coverage,
        terminationMetadata: {
          coverageAchieved: evaluation.completenessAssessment.coverage,
          learningsCount: allLearnings.length,
          iterationsCompleted: Math.floor(
            allQueries.length / currentPlan.subQueries.length
          ),
        },
      };
    }

    // Secondary termination condition: High coverage achieved
    if (
      evaluation.completenessAssessment.hasEnoughInfo &&
      evaluation.completenessAssessment.coverage > 0.8
    ) {
      const toolCallEvent = EventFactory.createToolCallStart(
        this.getCurrentSessionId(),
        "analyze",
        {
          action: "early_termination",
          metadata: {
            decision: "early_termination",
            reason: "high_coverage_achieved",
            coverage: evaluation.completenessAssessment.coverage,
            confidenceMetric: evaluation.completenessAssessment.coverage,
            totalLearnings: allLearnings.length,
          },
        }
      );

      this.emit("tool-call", toolCallEvent);

      return {
        shouldContinue: false,
        reason: "high_coverage_achieved",
        researchDirections: [],
        strategicGuidance: "High coverage achieved. Ready for synthesis.",
        confidence: evaluation.completenessAssessment.coverage,
        terminationMetadata: {
          coverageAchieved: evaluation.completenessAssessment.coverage,
          learningsCount: allLearnings.length,
          iterationsCompleted: Math.floor(
            allQueries.length / currentPlan.subQueries.length
          ),
        },
      };
    }

    // Tertiary termination condition: No research directions available
    if (evaluation.researchDirections.length === 0) {
      const toolCallEvent = EventFactory.createToolCallStart(
        this.getCurrentSessionId(),
        "analyze",
        {
          action: "proceed_to_synthesis",
          metadata: {
            decision: "proceed_to_synthesis",
            reason: "no_directions_identified",
            coverage: evaluation.completenessAssessment.coverage,
            totalLearnings: allLearnings.length,
          },
        }
      );

      this.emit("tool-call", toolCallEvent);

      return {
        shouldContinue: false,
        reason: "no_research_directions_available",
        researchDirections: [],
        strategicGuidance:
          "No further research directions identified. Proceed to synthesis.",
        confidence: evaluation.completenessAssessment.coverage,
        terminationMetadata: {
          coverageAchieved: evaluation.completenessAssessment.coverage,
          learningsCount: allLearnings.length,
          iterationsCompleted: Math.floor(
            allQueries.length / currentPlan.subQueries.length
          ),
        },
      };
    }

    // Check for diminishing returns based on accumulated learnings
    const recentLearnings = evaluation.learnings;
    const isDiminishingReturns = this.assessDiminishingReturns(
      allLearnings,
      recentLearnings
    );

    if (
      isDiminishingReturns &&
      evaluation.completenessAssessment.coverage > 0.7
    ) {
      return {
        shouldContinue: false,
        reason: "diminishing_returns_detected",
        researchDirections: [],
        strategicGuidance:
          "Research showing diminishing returns with good coverage. Proceed to synthesis.",
        confidence: evaluation.completenessAssessment.coverage,
        terminationMetadata: {
          coverageAchieved: evaluation.completenessAssessment.coverage,
          learningsCount: allLearnings.length,
          iterationsCompleted: Math.floor(
            allQueries.length / currentPlan.subQueries.length
          ),
        },
      };
    }

    // Continue research: Generate strategic guidance for next iteration
    const strategicGuidance = this.generateStrategicGuidance(
      evaluation,
      allLearnings,
      allQueries
    );

    // Filter research directions to avoid duplicate queries
    const filteredDirections = this.filterDuplicateDirections(
      evaluation.researchDirections,
      allQueries
    );

    // Emit detailed information about the continuation decision
    const toolCallEvent = EventFactory.createToolCallStart(
      this.getCurrentSessionId(),
      "analyze",
      {
        action: "continue_research",
        metadata: {
          decision: "continue_research",
          knowledgeGaps: evaluation.completenessAssessment.knowledgeGaps,
          newLearnings: evaluation.learnings.length,
          totalLearnings: allLearnings.length,
          researchDirections: filteredDirections.map((d) => ({
            question: d.question,
          })),
          coverage: evaluation.completenessAssessment.coverage,
          confidenceMetric: evaluation.completenessAssessment.coverage,
        },
      }
    );

    this.emit("tool-call", toolCallEvent);

    return {
      shouldContinue: true,
      reason: "valuable_research_directions_identified",
      researchDirections: filteredDirections,
      strategicGuidance,
      confidence: evaluation.completenessAssessment.coverage,
    };
  }

  /**
   * Generate strategic guidance for the next research iteration
   *
   * This method analyzes the current state and provides specific guidance
   * for the QueryPlanner on how to approach the next iteration.
   */
  private generateStrategicGuidance(
    evaluation: ResearchEvaluation,
    allLearnings: Learning[],
    allQueries: string[]
  ): string {
    const coverage = evaluation.completenessAssessment.coverage;
    const gaps = evaluation.completenessAssessment.knowledgeGaps;
    // Priority system removed – treat all directions equally
    const highPriorityDirections: typeof evaluation.researchDirections = [];

    let guidance = "";

    if (coverage < 0.5) {
      guidance += "Focus on broadening coverage of fundamental aspects. ";
    } else if (coverage < 0.8) {
      guidance += "Target specific knowledge gaps while maintaining breadth. ";
    } else {
      guidance += "Conduct deep-dive research on remaining specific areas. ";
    }

    if (gaps.length > 0) {
      guidance += `Priority gaps to address: ${gaps.slice(0, 3).join(", ")}. `;
    }

    // Guidance previously prioritised high-priority directions – now skipped.

    // Analyze learning types to suggest focus areas
    const learningTypes = allLearnings.map((l) => l.type);
    const factualCount = learningTypes.filter((t) => t === "factual").length;
    const analyticalCount = learningTypes.filter(
      (t) => t === "analytical"
    ).length;
    const statisticalCount = learningTypes.filter(
      (t) => t === "statistical"
    ).length;

    if (factualCount > analyticalCount * 2) {
      guidance += "Seek more analytical and interpretive sources. ";
    } else if (statisticalCount === 0 && allLearnings.length > 5) {
      guidance += "Look for quantitative data and statistical evidence. ";
    }

    return guidance.trim();
  }

  /**
   * Filter out research directions that would generate duplicate queries
   *
   * This method checks if the suggested research directions would lead to
   * queries similar to those already executed.
   */
  private filterDuplicateDirections(
    directions: ResearchDirection[],
    allQueries: string[]
  ): ResearchDirection[] {
    return directions.filter((direction) => {
      // Check if any of the suggested queries are too similar to existing ones
      const hasNovelQueries = direction.searchQueries.some((query) => {
        return !this.isQuerySimilar(query, allQueries);
      });
      return hasNovelQueries;
    });
  }

  /**
   * Check if a query is similar to existing queries
   *
   * Simple similarity check based on keyword overlap and intent.
   */
  private isQuerySimilar(newQuery: string, existingQueries: string[]): boolean {
    const newQueryWords = newQuery.toLowerCase().split(/\s+/);

    for (const existingQuery of existingQueries) {
      const existingWords = existingQuery.toLowerCase().split(/\s+/);

      // Calculate word overlap
      const commonWords = newQueryWords.filter((word) =>
        existingWords.includes(word)
      );

      const overlapRatio =
        commonWords.length /
        Math.max(newQueryWords.length, existingWords.length);

      // Consider similar if >70% word overlap
      if (overlapRatio > 0.7) {
        return true;
      }
    }

    return false;
  }

  /**
   * Assess whether research is showing diminishing returns
   *
   * This method compares recent learnings to accumulated knowledge to
   * determine if new research is becoming less valuable.
   */
  private assessDiminishingReturns(
    allLearnings: Learning[],
    recentLearnings: Learning[]
  ): boolean {
    if (allLearnings.length < 10 || recentLearnings.length === 0) {
      return false; // Too early to assess diminishing returns
    }

    // Check if recent learnings are significantly different from existing ones
    const recentContent = recentLearnings.map((l) => l.content.toLowerCase());
    const existingContent = allLearnings
      .slice(0, -recentLearnings.length)
      .map((l) => l.content.toLowerCase());

    let novelLearnings = 0;
    for (const recentItem of recentContent) {
      const isNovel = !existingContent.some((existing) => {
        const words1 = recentItem.split(/\s+/);
        const words2 = existing.split(/\s+/);
        const commonWords = words1.filter((word: string) =>
          words2.includes(word)
        );
        return (
          commonWords.length / Math.max(words1.length, words2.length) > 0.6
        );
      });

      if (isNovel) {
        novelLearnings++;
      }
    }

    // Consider diminishing returns if <30% of recent learnings are novel
    return novelLearnings / recentLearnings.length < 0.3;
  }

  /**
   * Assess whether current research state warrants termination
   *
   * This method implements comprehensive termination logic considering multiple
   * factors including evaluation recommendations, coverage, confidence, and
   * resource constraints.
   *
   * TERMINATION CONDITIONS (in order of priority):
   * 1. Explicit synthesis recommendation
   * 2. Sufficient information available
   * 3. High coverage achieved (>85%)
   * 4. Maximum depth reached
   * 5. No research directions available
   * 6. High confidence with good coverage
   */
  async shouldTerminate(
    originalQuery: string,
    evaluation: ResearchEvaluation,
    currentDepth: number,
    maxDepth: number
  ): Promise<{ shouldTerminate: boolean; reason: string }> {
    // Primary check: Explicit recommendation from evaluation
    if (evaluation.completenessAssessment.recommendedAction === "synthesize") {
      return {
        shouldTerminate: true,
        reason: "evaluation_recommends_synthesis",
      };
    }

    // Secondary check: Sufficient information available
    if (evaluation.completenessAssessment.hasEnoughInfo) {
      return {
        shouldTerminate: true,
        reason: "sufficient_information_available",
      };
    }

    // Tertiary check: High coverage achieved
    if (evaluation.completenessAssessment.coverage > 0.85) {
      return {
        shouldTerminate: true,
        reason: "high_coverage_achieved",
      };
    }

    // Resource constraint check: Maximum depth reached
    if (currentDepth >= maxDepth) {
      return {
        shouldTerminate: true,
        reason: "max_depth_reached",
      };
    }

    // Strategy check: No research directions available
    if (evaluation.researchDirections.length === 0) {
      return {
        shouldTerminate: true,
        reason: "no_research_directions_available",
      };
    }

    // Quality check: High confidence with good coverage
    if (
      evaluation.completenessAssessment.coverage > 0.9 &&
      evaluation.completenessAssessment.coverage > 0.7
    ) {
      return {
        shouldTerminate: true,
        reason: "high_confidence_and_coverage",
      };
    }

    // Default: Continue research
    return {
      shouldTerminate: false,
      reason: "research_should_continue",
    };
  }

  /**
   * Analyze research gaps and provide recommendations
   *
   * This method provides detailed analysis of research gaps and strategic
   * recommendations for addressing them. It's useful for understanding
   * research quality and planning improvements.
   *
   * ANALYSIS DIMENSIONS:
   * - Critical gaps identification
   * - Strategic recommendations
   * - Priority assessment
   * - Resource allocation guidance
   */
  async analyzeResearchGaps(
    originalQuery: string,
    evaluation: ResearchEvaluation
  ): Promise<{
    criticalGaps: string[];
    recommendations: string[];
    priority: "high" | "medium" | "low";
  }> {
    const gaps = evaluation.completenessAssessment.knowledgeGaps;
    // Priority property removed – skip highPriorityDirections check

    // Determine priority based on gaps and coverage
    let priority: "high" | "medium" | "low" = "medium";
    if (gaps.length > 5 || evaluation.completenessAssessment.coverage < 0.5) {
      priority = "high";
    } else if (
      gaps.length < 2 &&
      evaluation.completenessAssessment.coverage > 0.7
    ) {
      priority = "low";
    }

    const recommendations = [];

    // Generate specific recommendations based on analysis
    if (gaps.length > 0) {
      recommendations.push(`Address ${gaps.length} identified knowledge gaps`);
    }

    // Recommendation related to high priority directions removed

    if (evaluation.completenessAssessment.coverage < 0.6) {
      recommendations.push("Increase research breadth to improve coverage");
    }

    const inferredConfidence = evaluation.completenessAssessment.coverage;
    if (inferredConfidence < 0.7) {
      recommendations.push(
        "Seek more authoritative sources to improve confidence"
      );
    }

    return {
      criticalGaps: gaps.slice(0, 3), // Top 3 most critical gaps
      recommendations,
      priority,
    };
  }

  /**
   * Simplified decision making for basic use cases
   *
   * This method provides a simplified decision tree for basic research scenarios.
   * It's useful for testing and simple applications that don't need the full
   * complexity of the main refinement logic.
   *
   * DECISION TREE:
   * 1. Check synthesis recommendation -> terminate
   * 2. Check information sufficiency -> terminate
   * 3. Check research directions availability -> terminate if none
   * 4. Check coverage level -> continue if low, refine if medium
   */
  async makeSimpleDecision(
    evaluation: ResearchEvaluation
  ): Promise<"continue" | "refine" | "terminate"> {
    // Simple decision tree based on evaluation
    if (evaluation.completenessAssessment.recommendedAction === "synthesize") {
      return "terminate";
    }

    if (evaluation.completenessAssessment.hasEnoughInfo) {
      return "terminate";
    }

    if (evaluation.researchDirections.length === 0) {
      return "terminate";
    }

    // Decision based on coverage level
    if (evaluation.completenessAssessment.coverage < 0.5) {
      return "continue";
    }

    return "refine";
  }
}
