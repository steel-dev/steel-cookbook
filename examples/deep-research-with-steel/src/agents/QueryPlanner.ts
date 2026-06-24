/**
 * QueryPlanner Agent - Strategic Research Planning (Called Once)
 *
 * OVERVIEW:
 * The QueryPlanner is the first agent in the Deep Research flow, called ONCE at the beginning
 * to generate the initial research strategy and queries. It follows a two-step approach:
 * 1. Generate free-form strategic research plan (strategic thinking)
 * 2. Extract structured, executable queries from the strategic plan
 *
 * INPUTS:
 * - query: String - The original research question/topic
 * - depth: Number - Maximum research depth (1-10)
 * - breadth: Number - Maximum number of sub-queries to generate (1-10)
 * - followUpDialogue?: Message[] - Optional AI SDK message list for clarification context
 *
 * OUTPUTS:
 * - ResearchPlan: Complete research plan with strategic thinking and structured queries
 *
 * POSITION IN RESEARCH FLOW:
 * 1. **INITIAL PLANNING** (Start of research - CALLED ONCE):
 *    - Step 1: Process optional follow-up dialogue for enhanced context
 *    - Step 2: Generate comprehensive strategic research plan
 *    - Step 3: Extract specific, actionable search queries
 *    - Step 4: Return complete ResearchPlan with all components
 *
 * ARCHITECTURE:
 * - Single responsibility: initial planning only
 * - No iterative refinement (handled by ContentEvaluator)
 * - Uses centralized prompts from prompts.ts
 * - AI SDK v5 integration with BaseAgent
 * - Optional follow-up dialogue support
 *
 * USAGE EXAMPLE:
 * ```typescript
 * const planner = new QueryPlanner(providerManager, eventEmitter);
 * const plan = await planner.planResearch("AI impact on healthcare", 3, 5, followUpMessages);
 * // Returns: Complete ResearchPlan with strategic plan and queries
 * ```
 */

import { EventEmitter } from "events";
import { CoreMessage } from "ai";
import { z } from "zod";
import {
  ResearchPlan,
  SubQuery,
  SearchStrategy,
  DEFAULT_SEARCH_STRATEGY,
  FreeFormResearchPlan,
  QueriesFromPlan,
  FreeFormResearchPlanSchema,
  QueriesFromPlanSchema,
} from "../core/interfaces";
import { EventFactory } from "../core/events";
import { BaseAgent } from "../core/BaseAgent";
import { prompts } from "../prompts/prompts";

export class QueryPlanner extends BaseAgent {
  constructor(providerManager: any, parentEmitter: EventEmitter) {
    super(providerManager, parentEmitter);
  }

  /**
   * Generate a complete research plan from the original query (CALLED ONCE)
   *
   * This is the main entry point for initial research planning. It follows a two-step process:
   * 1. Generate free-form strategic research plan (strategic thinking)
   * 2. Extract structured queries from the plan
   *
   * The method optionally incorporates follow-up dialogue for enhanced context.
   */
  async planResearch(
    query: string,
    depth: number = 3,
    breadth: number = 5,
    followUpDialogue?: CoreMessage[]
  ): Promise<ResearchPlan> {
    // Validate input parameters
    if (!query || query.trim().length === 0) {
      throw new Error("Query cannot be empty");
    }

    if (depth < 1 || depth > 10) {
      throw new Error("Depth must be between 1 and 10");
    }

    if (breadth < 1 || breadth > 10) {
      throw new Error("Breadth must be between 1 and 10");
    }

    // Generate unique tool call ID and emit planning start event
    const sessionId = this.getCurrentSessionId();
    const toolCallEvent = EventFactory.createToolCallStart(
      sessionId,
      "analyze",
      {
        action: "initial_planning",
        query,
        metadata: {
          depth,
          breadth,
          hasFollowUp: !!followUpDialogue?.length,
        },
      }
    );
    this.emit("tool-call", toolCallEvent);
    const toolCallId = toolCallEvent.toolCallId;

    try {
      // Step 1: Process follow-up dialogue for enhanced context
      const enhancedQuery = this.processFollowUpDialogue(
        query,
        followUpDialogue
      );

      // Step 2: Generate free-form strategic research plan
      const freeFormPlan = await this.generateFreeFormResearchPlan(
        enhancedQuery,
        depth,
        breadth
      );

      // Step 3: Extract structured queries from the plan
      const queriesFromPlan = await this.generateQueriesFromPlan(
        freeFormPlan,
        breadth
      );

      // Step 4: Build complete ResearchPlan
      const subQueries: SubQuery[] = queriesFromPlan.queries.map(
        (queryText, index) => ({
          id: `sq_${Date.now()}_${index}_${Math.random()
            .toString(36)
            .substr(2, 6)}`,
          query: queryText,
        })
      );

      const searchStrategy: SearchStrategy = {
        ...DEFAULT_SEARCH_STRATEGY,
        maxDepth: depth,
        maxBreadth: breadth,
      };

      const plan: ResearchPlan = {
        id: `plan_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        originalQuery: enhancedQuery,
        subQueries,
        searchStrategy,
        estimatedSteps: queriesFromPlan.estimatedSteps,
        strategicPlan: freeFormPlan.strategicPlan,
      };

      // Emit successful planning completion
      const toolResultEvent = EventFactory.createToolCallEnd(
        sessionId,
        toolCallId,
        "analyze",
        true,
        {
          data: plan,
          metadata: {
            planId: plan.id,
            queryCount: subQueries.length,
            estimatedSteps: plan.estimatedSteps,
            enhancedQuery: enhancedQuery !== query,
          },
        }
      );
      this.emit("tool-result", toolResultEvent);

      return plan;
    } catch (error) {
      // Emit planning error
      const toolErrorEvent = EventFactory.createToolCallEnd(
        sessionId,
        toolCallId,
        "analyze",
        false,
        undefined,
        error instanceof Error ? error.message : String(error)
      );
      this.emit("tool-result", toolErrorEvent);

      throw error;
    }
  }

  /**
   * Process optional follow-up dialogue to enhance the original query
   *
   * Takes an AI SDK message list and incorporates the context into the query
   * for more targeted research planning.
   */
  private processFollowUpDialogue(
    originalQuery: string,
    followUpDialogue?: CoreMessage[]
  ): string {
    if (!followUpDialogue || followUpDialogue.length === 0) {
      return originalQuery;
    }

    // Extract AI clarification questions and user clarifications
    const aiQuestions = followUpDialogue
      .filter((msg) => msg.role === "assistant" || msg.role === "system")
      .map((msg) => msg.content)
      .join("\n");

    const userMessages = followUpDialogue
      .filter((msg) => msg.role === "user")
      .map((msg) => msg.content)
      .join("\n");

    if (userMessages.trim().length === 0) {
      return originalQuery;
    }

    // Enhance the query with both the AI's clarification questions and the user's answers
    let result = originalQuery;
    if (aiQuestions.trim().length > 0) {
      result += `\n\nClarification questions:\n${aiQuestions}`;
    }
    result += `\n\nUser clarifications:\n${userMessages}`;
    return result;
  }

  /**
   * Generate a free-form strategic research plan
   *
   * This method generates a comprehensive strategic thinking document that outlines
   * the research approach, key areas to explore, and overall strategy for addressing
   * the research question.
   */
  private async generateFreeFormResearchPlan(
    query: string,
    depth: number,
    breadth: number
  ): Promise<FreeFormResearchPlan> {
    const sessionId = this.getCurrentSessionId();
    const toolCallEvent = EventFactory.createToolCallStart(
      sessionId,
      "analyze",
      {
        action: "strategic_planning",
        query,
        metadata: { depth, breadth },
      }
    );
    this.emit("tool-call", toolCallEvent);
    const toolCallId = toolCallEvent.toolCallId;

    try {
      // Get appropriate LLM provider for planning
      const llm = this.getLLM("planner");

      // Use centralized planning prompt
      const planningPrompt = prompts.planningPrompt(query, depth, breadth);

      // Stream the strategic plan generation for real-time feedback
      this.emit("text", `\n📋 Strategic Research Plan:\n`);

      const strategicPlanText = await this.streamTextHelper(
        "planner",
        planningPrompt,
        {
          temperature: 0.7, // Creative strategic thinking
          maxTokens: 1000,
          streaming: true, // Enable streaming for real-time display
          source: "planning", // Specify source for proper event routing
        }
      );

      // Create the free-form plan object
      const freeFormPlan: FreeFormResearchPlan = {
        id: `freeform_plan_${Date.now()}`,
        originalQuery: query,
        strategicPlan: strategicPlanText,
        approach: `Comprehensive research approach for: ${query}`,
        estimatedSteps: depth * breadth,
        createdAt: new Date(),
      };

      const toolResultEvent = EventFactory.createToolCallEnd(
        sessionId,
        toolCallId,
        "analyze",
        true,
        {
          data: freeFormPlan,
          metadata: {
            planId: freeFormPlan.id,
            approach: freeFormPlan.approach,
            estimatedSteps: freeFormPlan.estimatedSteps,
            planLength: strategicPlanText.length,
          },
        }
      );
      this.emit("tool-result", toolResultEvent);

      return freeFormPlan;
    } catch (error) {
      const toolErrorEvent = EventFactory.createToolCallEnd(
        sessionId,
        toolCallId,
        "analyze",
        false,
        undefined,
        error instanceof Error ? error.message : String(error)
      );
      this.emit("tool-result", toolErrorEvent);

      throw error;
    }
  }

  /**
   * Generate structured queries from a free-form research plan
   *
   * This method takes the strategic plan and extracts specific, actionable
   * search queries that can be executed to gather the needed information.
   */
  private async generateQueriesFromPlan(
    freeFormPlan: FreeFormResearchPlan,
    maxQueries: number
  ): Promise<QueriesFromPlan> {
    const sessionId = this.getCurrentSessionId();
    const toolCallEvent = EventFactory.createToolCallStart(
      sessionId,
      "analyze",
      {
        action: "query_extraction",
        metadata: { maxQueries, planId: freeFormPlan.id },
      }
    );
    this.emit("tool-call", toolCallEvent);
    const toolCallId = toolCallEvent.toolCallId;

    try {
      // Get appropriate LLM provider for structured generation
      const llm = this.getLLM("planner");

      // Use centralized query extraction prompt
      const queryPrompt = prompts.queryExtractPrompt(freeFormPlan, maxQueries);

      // Generate structured queries using AI SDK v5
      const result = await this.generateStructured<QueriesFromPlan>(
        queryPrompt,
        QueriesFromPlanSchema,
        "planner"
      );

      const queriesFromPlan: QueriesFromPlan = {
        queries: result.queries.slice(0, maxQueries), // Ensure we don't exceed the limit
        strategy: result.strategy,
        estimatedSteps: result.estimatedSteps,
      };

      const toolResultEvent = EventFactory.createToolCallEnd(
        sessionId,
        toolCallId,
        "analyze",
        true,
        {
          data: queriesFromPlan,
          metadata: {
            queryCount: queriesFromPlan.queries.length,
            strategy: queriesFromPlan.strategy.searchType,
            estimatedSteps: queriesFromPlan.estimatedSteps,
          },
        }
      );
      this.emit("tool-result", toolResultEvent);

      return queriesFromPlan;
    } catch (error) {
      const toolErrorEvent = EventFactory.createToolCallEnd(
        sessionId,
        toolCallId,
        "analyze",
        false,
        undefined,
        error instanceof Error ? error.message : String(error)
      );
      this.emit("tool-result", toolErrorEvent);

      throw error;
    }
  }

  /**
   * Validate a research plan for quality and completeness
   *
   * Performs comprehensive validation to ensure the research plan is well-formed
   * and likely to produce good results.
   */
  validatePlan(plan: ResearchPlan): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Check basic requirements
    if (!plan.originalQuery || plan.originalQuery.trim().length === 0) {
      errors.push("Original query is required");
    }

    if (!plan.subQueries || plan.subQueries.length === 0) {
      errors.push("At least one sub-query is required");
    }

    if (plan.subQueries && plan.subQueries.length > plan.searchStrategy.maxBreadth) {
      errors.push(`Too many sub-queries (maximum ${plan.searchStrategy.maxBreadth})`);
    }

    // Check for duplicate queries to avoid redundant work
    const queryTexts = plan.subQueries.map((sq) => sq.query.toLowerCase());
    const duplicates = queryTexts.filter((q, i) => queryTexts.indexOf(q) !== i);
    if (duplicates.length > 0) {
      errors.push("Duplicate sub-queries detected");
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }
}
