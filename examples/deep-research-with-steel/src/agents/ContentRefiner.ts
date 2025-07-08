import { EventEmitter } from "events";
import { QueryPlanner } from "./QueryPlanner";
import {
  ResearchEvaluation,
  ResearchPlan,
  ToolCallEvent,
} from "../core/interfaces";

export class ContentRefiner {
  constructor(
    private provider: any,
    private planner: QueryPlanner,
    private eventEmitter: EventEmitter
  ) {}

  /**
   * Refine search strategy based on research evaluation
   * Returns null if research should terminate, otherwise returns refined plan
   */
  async refineSearchStrategy(
    originalQuery: string,
    evaluation: ResearchEvaluation,
    currentPlan: ResearchPlan
  ): Promise<ResearchPlan | null> {
    this.eventEmitter.emit("progress", { phase: "refining", progress: 60 });

    // Check if we should terminate based on evaluation
    if (evaluation.completenessAssessment.recommendedAction === "synthesize") {
      this.eventEmitter.emit("tool-call", {
        toolName: "analyze",
        metadata: {
          decision: "early_termination",
          reason: "sufficient_information",
          coverage: evaluation.completenessAssessment.coverage,
          confidenceLevel: evaluation.confidenceLevel,
        },
        timestamp: new Date(),
      } as ToolCallEvent);
      return null;
    }

    // Check if we have enough information even if not explicitly recommended
    if (
      evaluation.completenessAssessment.hasEnoughInfo &&
      evaluation.completenessAssessment.coverage > 0.8
    ) {
      this.eventEmitter.emit("tool-call", {
        toolName: "analyze",
        metadata: {
          decision: "early_termination",
          reason: "high_coverage_achieved",
          coverage: evaluation.completenessAssessment.coverage,
          confidenceLevel: evaluation.confidenceLevel,
        },
        timestamp: new Date(),
      } as ToolCallEvent);
      return null;
    }

    // Check if no research directions identified
    if (evaluation.researchDirections.length === 0) {
      this.eventEmitter.emit("tool-call", {
        toolName: "analyze",
        metadata: {
          decision: "proceed_to_synthesis",
          reason: "no_directions_identified",
          coverage: evaluation.completenessAssessment.coverage,
        },
        timestamp: new Date(),
      } as ToolCallEvent);
      return null;
    }

    // Generate refined plan based on research directions
    const refinedPlan = await this.planner.planNextIteration(
      originalQuery,
      evaluation,
      currentPlan
    );

    // Emit refined strategy with rich context
    this.eventEmitter.emit("tool-call", {
      toolName: "analyze",
      metadata: {
        decision: "continue_research",
        knowledgeGaps: evaluation.completenessAssessment.knowledgeGaps,
        newLearnings: evaluation.learnings.length,
        researchDirections: evaluation.researchDirections.map((d) => ({
          question: d.question,
          priority: d.priority,
        })),
        coverage: evaluation.completenessAssessment.coverage,
        confidenceLevel: evaluation.confidenceLevel,
      },
      timestamp: new Date(),
    } as ToolCallEvent);

    return refinedPlan;
  }

  /**
   * Assess whether current research state warrants termination
   */
  async shouldTerminate(
    originalQuery: string,
    evaluation: ResearchEvaluation,
    currentDepth: number,
    maxDepth: number
  ): Promise<{ shouldTerminate: boolean; reason: string }> {
    // Check explicit recommendation from evaluation
    if (evaluation.completenessAssessment.recommendedAction === "synthesize") {
      return {
        shouldTerminate: true,
        reason: "evaluation_recommends_synthesis",
      };
    }

    // Check if we have enough information
    if (evaluation.completenessAssessment.hasEnoughInfo) {
      return {
        shouldTerminate: true,
        reason: "sufficient_information_available",
      };
    }

    // Check if we've reached high coverage
    if (evaluation.completenessAssessment.coverage > 0.85) {
      return {
        shouldTerminate: true,
        reason: "high_coverage_achieved",
      };
    }

    // Check if we've reached max depth
    if (currentDepth >= maxDepth) {
      return {
        shouldTerminate: true,
        reason: "max_depth_reached",
      };
    }

    // Check if no research directions available
    if (evaluation.researchDirections.length === 0) {
      return {
        shouldTerminate: true,
        reason: "no_research_directions_available",
      };
    }

    // Check if confidence is high enough
    if (
      evaluation.confidenceLevel > 0.9 &&
      evaluation.completenessAssessment.coverage > 0.7
    ) {
      return {
        shouldTerminate: true,
        reason: "high_confidence_and_coverage",
      };
    }

    return {
      shouldTerminate: false,
      reason: "research_should_continue",
    };
  }

  /**
   * Analyze research gaps and provide recommendations
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
    const highPriorityDirections = evaluation.researchDirections.filter(
      (d) => d.priority === "high"
    );

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

    // Add specific recommendations based on gaps
    if (gaps.length > 0) {
      recommendations.push(`Address ${gaps.length} identified knowledge gaps`);
    }

    if (highPriorityDirections.length > 0) {
      recommendations.push(
        `Focus on ${highPriorityDirections.length} high-priority research directions`
      );
    }

    if (evaluation.completenessAssessment.coverage < 0.6) {
      recommendations.push("Increase research breadth to improve coverage");
    }

    if (evaluation.confidenceLevel < 0.7) {
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

    if (evaluation.completenessAssessment.coverage < 0.5) {
      return "continue";
    }

    return "refine";
  }
}
