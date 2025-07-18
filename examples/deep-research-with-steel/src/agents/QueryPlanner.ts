/**
 * QueryPlanner Agent - Two-Step Research Planning and Query Generation
 *
 * OVERVIEW:
 * The QueryPlanner is the first agent in the Deep Research flow, following a two-step approach
 * inspired by Together AI's Open Deep Research methodology:
 * 1. Generate free-form strategic research plan (strategic thinking)
 * 2. Extract structured, executable queries from the strategic plan
 *
 * INPUTS:
 * - query: String - The original research question/topic
 * - depth: Number - Maximum research depth (1-10)
 * - breadth: Number - Maximum number of sub-queries to generate (1-10)
 * - evaluation: ResearchEvaluation - (for refinement) Previous research findings
 * - currentPlan: ResearchPlan - (for refinement) Current research plan
 *
 * OUTPUTS:
 * - ResearchPlan: Contains organized sub-queries and strategic plan
 * - FreeFormResearchPlan: Strategic thinking document
 * - QueriesFromPlan: Structured queries extracted from strategic plan
 *
 * POSITION IN RESEARCH FLOW:
 * 1. **INITIAL PLANNING** (Start of research):
 *    - Step 1: Generate comprehensive strategic research plan
 *    - Step 2: Extract specific, actionable search queries
 *    - Categorize queries for organization
 *
 * 2. **ITERATIVE REFINEMENT** (During research loop):
 *    - Incorporates learnings and identified gaps
 *    - Generates new strategic plan with accumulated knowledge
 *    - Extracts targeted follow-up queries
 *
 * KEY FEATURES:
 * - Two-step planning process for transparency and modularity
 * - Strategic thinking captured in free-form text
 * - Query categorization (statistical, historical, current, etc.)
 * - Validation and duplicate detection
 * - Consistent refinement process using same two-step approach
 * - Unified prompt system for query generation
 * - Real-time event emission for UI feedback
 *
 * ALGORITHMS:
 * - Strategic plan generation with comprehensive research thinking
 * - Query extraction from strategic context
 * - Gap-filling query generation for refinement
 * - Redundancy detection and elimination
 *
 * USAGE EXAMPLE:
 * ```typescript
 * const planner = new QueryPlanner(aiProvider);
 * planner.on('tool-call', (event) => console.log(`Planning: ${event.metadata.action}`));
 * planner.on('tool-result', (event) => console.log(`Generated ${event.metadata.queryCount} queries`));
 * const plan = await planner.planResearch("AI impact on healthcare", 3, 5);
 * // Returns: ResearchPlan with strategic thinking and extracted queries
 * ```
 */

import { EventEmitter } from "events";
import {
  generateStructuredOutput,
  streamTextOutput,
  ProviderManager,
} from "../providers/providers";
import { z } from "zod";
import {
  ResearchPlan,
  SubQuery,
  SearchStrategy,
  DEFAULT_SEARCH_STRATEGY,
  ResearchEvaluation,
  FreeFormResearchPlan,
  QueriesFromPlan,
  FreeFormResearchPlanSchema,
  QueriesFromPlanSchema,
  ToolCallEvent,
  ToolResultEvent,
  ResearchDirection,
} from "../core/interfaces";
import { EventFactory } from "../core/events";
import { BaseAgent } from "../core/BaseAgent";
import {
  buildStrategicPlanTextPrompt,
  buildStrategicPlanningPrompt,
  buildRefinedStrategicPlanTextPrompt,
  buildRefinedStrategicPlanningPrompt,
  buildQueryGenerationPrompt,
  buildPlanningPrompt,
  buildStrategicPlanFromGuidanceTextPrompt,
} from "../prompts/queryPlannerPrompts";

// QueryPlanner now shares utilities via BaseAgent

export class QueryPlanner extends BaseAgent {
  private provider: any;

  constructor(providerManager: ProviderManager, parentEmitter: EventEmitter) {
    super(providerManager, parentEmitter);
    this.provider = providerManager.getAIProvider();
  }

  /**
   * Generate a research plan from the original query
   *
   * This is the main entry point for initial research planning. It follows a two-step process:
   * 1. Generate free-form strategic research plan (strategic thinking)
   * 2. Extract structured queries from the plan
   *
   * The method considers:
   * - Multiple angles (factual, analytical, current, historical)
   * - Different information types (quantitative, qualitative)
   * - Source diversity (primary, secondary sources)
   * - Logical flow and dependencies between queries
   */
  async planResearch(
    query: string,
    depth: number = 3,
    breadth: number = 5
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
        metadata: { depth, breadth },
      }
    );
    this.emit("tool-call", toolCallEvent);
    const toolCallId = toolCallEvent.toolCallId;

    try {
      // Step 1: Generate free-form strategic research plan
      const freeFormPlan = await this.generateFreeFormResearchPlan(
        query,
        depth,
        breadth
      );

      // Step 2: Extract structured queries from the plan
      const queriesFromPlan = await this.generateQueriesFromPlan(
        freeFormPlan,
        breadth
      );

      // Convert to our internal format with enhanced metadata
      const subQueries: SubQuery[] = queriesFromPlan.queries.map(
        (queryText, index) => ({
          id: `sq_${Date.now()}_${index}`,
          query: queryText,
          category: this.categorizeQuery(queryText),
        })
      );

      const searchStrategy: SearchStrategy = {
        ...DEFAULT_SEARCH_STRATEGY,
        maxDepth: depth,
        maxBreadth: breadth,
      };

      const plan: ResearchPlan = {
        id: `plan_${Date.now()}`,
        originalQuery: query,
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
            categories: subQueries.map((sq) => sq.category),
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
   * Generate a free-form strategic research plan
   *
   * This method generates a comprehensive strategic thinking document that outlines
   * the research approach, key areas to explore, and overall strategy for addressing
   * the research question.
   */
  async generateFreeFormResearchPlan(
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
      // First, stream the strategic plan generation
      this.emit("text", `\n📋 Strategic Research Plan:\n`);

      const strategicPlanPrompt = this.buildStrategicPlanTextPrompt(
        query,
        depth,
        breadth
      );
      let strategicPlanText = "";

      for await (const delta of streamTextOutput(
        this.provider,
        strategicPlanPrompt
      )) {
        strategicPlanText += delta;
        this.emit("text", delta);
      }

      this.emit("text", `\n\n`);

      // Then generate the structured metadata
      const approach = `Multi-faceted research approach for: ${query}`;
      const estimatedSteps = depth * breadth;

      const freeFormPlan: FreeFormResearchPlan = {
        id: `freeform_plan_${Date.now()}`,
        originalQuery: query,
        strategicPlan: strategicPlanText,
        approach,
        estimatedSteps,
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
  async generateQueriesFromPlan(
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
      const prompt = this.buildQueryGenerationPrompt(freeFormPlan, maxQueries);

      const result = await generateStructuredOutput(
        this.provider,
        prompt,
        QueriesFromPlanSchema
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
   * Generate a refined strategic plan incorporating research findings and gaps
   *
   * This method creates a new strategic plan that builds upon previous learnings
   * and addresses identified knowledge gaps.
   */
  async generateRefinedStrategicPlan(
    originalQuery: string,
    findings: any[],
    gaps: string[],
    previousStrategicPlan: string
  ): Promise<FreeFormResearchPlan> {
    const sessionId = this.getCurrentSessionId();
    const toolCallEvent = EventFactory.createToolCallStart(
      sessionId,
      "analyze",
      {
        action: "refined_strategic_planning",
        query: originalQuery,
        metadata: {
          findingsCount: findings.length,
          gapsCount: gaps.length,
        },
      }
    );
    this.emit("tool-call", toolCallEvent);
    const toolCallId = toolCallEvent.toolCallId;

    try {
      // First, stream the refined strategic plan generation
      this.emit("text", `\n🔄 Refined Strategic Plan:\n`);

      const refinedPlanPrompt = this.buildRefinedStrategicPlanTextPrompt(
        originalQuery,
        findings,
        gaps,
        previousStrategicPlan
      );
      let strategicPlanText = "";

      for await (const delta of streamTextOutput(
        this.provider,
        refinedPlanPrompt
      )) {
        strategicPlanText += delta;
        this.emit("text", delta);
      }

      this.emit("text", `\n\n`);

      // Then generate the structured metadata
      const approach = `Refined research approach incorporating ${findings.length} findings and ${gaps.length} gaps`;
      const estimatedSteps = Math.max(gaps.length, 3);

      const refinedPlan: FreeFormResearchPlan = {
        id: `refined_plan_${Date.now()}`,
        originalQuery,
        strategicPlan: strategicPlanText,
        approach,
        estimatedSteps,
        createdAt: new Date(),
      };

      const toolResultEvent = EventFactory.createToolCallEnd(
        sessionId,
        toolCallId,
        "analyze",
        true,
        {
          data: refinedPlan,
          metadata: {
            planId: refinedPlan.id,
            approach: refinedPlan.approach,
            estimatedSteps: refinedPlan.estimatedSteps,
          },
        }
      );
      this.emit("tool-result", toolResultEvent);

      return refinedPlan;
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
   * Refine an existing research plan based on findings
   *
   * Uses the same two-step approach: creates a new strategic plan incorporating
   * learnings and gaps, then extracts queries from the updated plan.
   */
  async refinePlan(
    originalPlan: ResearchPlan,
    findings: any[],
    gaps: string[]
  ): Promise<ResearchPlan> {
    const sessionId = this.getCurrentSessionId();
    const toolCallEvent = EventFactory.createToolCallStart(
      sessionId,
      "analyze",
      {
        action: "plan_refinement",
        metadata: {
          planId: originalPlan.id,
          findingsCount: findings.length,
          gapsCount: gaps.length,
        },
      }
    );
    this.emit("tool-call", toolCallEvent);
    const toolCallId = toolCallEvent.toolCallId;

    try {
      // Step 1: Generate new strategic plan with accumulated knowledge
      const refinedStrategicPlan = await this.generateRefinedStrategicPlan(
        originalPlan.originalQuery,
        findings,
        gaps,
        originalPlan.strategicPlan || ""
      );

      // Step 2: Extract queries from the refined strategic plan
      const queriesFromPlan = await this.generateQueriesFromPlan(
        refinedStrategicPlan,
        originalPlan.searchStrategy.maxBreadth
      );

      // Convert to our internal format
      const refinedSubQueries: SubQuery[] = queriesFromPlan.queries.map(
        (queryText, index) => ({
          id: `refined_sq_${Date.now()}_${index}`,
          query: queryText,
          category: this.categorizeQuery(queryText),
        })
      );

      const refinedPlan: ResearchPlan = {
        ...originalPlan,
        subQueries: refinedSubQueries,
        estimatedSteps: queriesFromPlan.estimatedSteps,
        strategicPlan: refinedStrategicPlan.strategicPlan,
      };

      const toolResultEvent = EventFactory.createToolCallEnd(
        sessionId,
        toolCallId,
        "analyze",
        true,
        {
          data: refinedPlan,
          metadata: {
            planId: refinedPlan.id,
            queryCount: refinedSubQueries.length,
            action: "plan_refinement",
          },
        }
      );
      this.emit("tool-result", toolResultEvent);

      return refinedPlan;
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
   * Build the strategic planning text prompt for streaming
   *
   * Creates a prompt that generates just the strategic plan text without JSON structure
   */
  private buildStrategicPlanTextPrompt(
    query: string,
    depth: number,
    breadth: number
  ): string {
    return buildStrategicPlanTextPrompt(query, depth, breadth);
  }

  /**
   * Build the strategic planning prompt for free-form research plan generation
   *
   * Creates a comprehensive prompt that guides the AI to generate strategic thinking
   * about the research approach, key areas to explore, and overall methodology.
   */
  private buildStrategicPlanningPrompt(
    query: string,
    depth: number,
    breadth: number
  ): string {
    return buildStrategicPlanningPrompt(query, depth, breadth);
  }

  /**
   * Build the refined strategic planning text prompt for streaming
   *
   * Creates a prompt that generates just the refined strategic plan text without JSON structure
   */
  private buildRefinedStrategicPlanTextPrompt(
    originalQuery: string,
    findings: any[],
    gaps: string[],
    previousStrategicPlan: string
  ): string {
    return buildRefinedStrategicPlanTextPrompt(
      originalQuery,
      findings,
      gaps,
      previousStrategicPlan
    );
  }

  /**
   * Build the refined strategic planning prompt for incorporating research findings
   *
   * Creates a prompt that guides the AI to generate an updated strategic plan
   * incorporating previous learnings and addressing identified gaps.
   */
  private buildRefinedStrategicPlanningPrompt(
    originalQuery: string,
    findings: any[],
    gaps: string[],
    previousStrategicPlan: string
  ): string {
    return buildRefinedStrategicPlanningPrompt(
      originalQuery,
      findings,
      gaps,
      previousStrategicPlan
    );
  }

  /**
   * Build the unified query generation prompt for extracting structured queries from plan
   *
   * Creates a prompt that guides the AI to extract specific, actionable search queries
   * from the strategic research plan.
   */
  private buildQueryGenerationPrompt(
    freeFormPlan: FreeFormResearchPlan,
    maxQueries: number
  ): string {
    return buildQueryGenerationPrompt(freeFormPlan, maxQueries);
  }

  /**
   * Build the initial planning prompt (legacy method, kept for backward compatibility)
   *
   * Creates a comprehensive prompt that guides the AI to generate well-structured
   * sub-questions covering different aspects of the research topic.
   */
  private buildPlanningPrompt(
    query: string,
    depth: number,
    breadth: number
  ): string {
    return buildPlanningPrompt(query, depth, breadth);
  }

  // Old refinement prompt removed - now using two-step approach

  // Priority system removed - all queries treated equally

  /**
   * Categorize a query for better organization
   *
   * Automatically categorizes queries to help with organization and execution
   * strategy. Different categories may require different search approaches.
   */
  private categorizeQuery(query: string): string {
    const lowerQuery = query.toLowerCase();

    if (
      lowerQuery.includes("data") ||
      lowerQuery.includes("statistic") ||
      lowerQuery.includes("number")
    ) {
      return "statistical";
    } else if (
      lowerQuery.includes("history") ||
      lowerQuery.includes("past") ||
      lowerQuery.includes("evolution")
    ) {
      return "historical";
    } else if (
      lowerQuery.includes("current") ||
      lowerQuery.includes("recent") ||
      lowerQuery.includes("latest")
    ) {
      return "current";
    } else if (
      lowerQuery.includes("compare") ||
      lowerQuery.includes("difference") ||
      lowerQuery.includes("vs")
    ) {
      return "comparative";
    } else if (
      lowerQuery.includes("how") ||
      lowerQuery.includes("process") ||
      lowerQuery.includes("method")
    ) {
      return "procedural";
    } else {
      return "general";
    }
  }

  // Priority assignment removed - simplified approach

  /**
   * Plan next iteration based on strategic guidance from ContentRefiner
   *
   * This method has been updated to take strategic direction from ContentRefiner
   * instead of making independent research decisions. It focuses on execution
   * rather than strategy, implementing query deduplication and building upon
   * accumulated knowledge.
   */
  async planNextIteration(
    originalQuery: string,
    researchDirections: ResearchDirection[], // NEW: From ContentRefiner
    strategicGuidance: string, // NEW: From ContentRefiner
    allQueries: string[], // NEW: To avoid duplicates
    currentPlan: ResearchPlan
  ): Promise<ResearchPlan> {
    const sessionId = this.getCurrentSessionId();
    const toolCallEvent = EventFactory.createToolCallStart(
      sessionId,
      "analyze",
      {
        action: "next_iteration_planning",
        metadata: {
          researchDirectionsCount: researchDirections.length,
          strategicGuidance: strategicGuidance.substring(0, 100) + "...",
          previousQueriesCount: allQueries.length,
        },
      }
    );
    this.emit("tool-call", toolCallEvent);
    const toolCallId = toolCallEvent.toolCallId;

    try {
      // Generate refined strategic plan based on ContentRefiner's guidance
      const refinedStrategicPlan = await this.generateStrategicPlanFromGuidance(
        originalQuery,
        researchDirections,
        strategicGuidance,
        allQueries
      );

      // Extract queries from the refined strategic plan
      const queriesFromPlan = await this.generateQueriesFromPlan(
        refinedStrategicPlan,
        currentPlan.searchStrategy.maxBreadth
      );

      // Filter out queries that are too similar to existing ones
      const deduplicatedQueries = this.deduplicateQueries(
        queriesFromPlan.queries,
        allQueries
      );

      // Convert to our internal format
      const refinedSubQueries: SubQuery[] = deduplicatedQueries.map(
        (queryText, index) => ({
          id: `strategic_sq_${Date.now()}_${index}`,
          query: queryText,
          category: this.categorizeQuery(queryText),
        })
      );

      const refinedPlan: ResearchPlan = {
        ...currentPlan,
        subQueries: refinedSubQueries,
        estimatedSteps: refinedSubQueries.length,
        strategicPlan: refinedStrategicPlan.strategicPlan,
      };

      const toolResultEvent = EventFactory.createToolCallEnd(
        sessionId,
        toolCallId,
        "analyze",
        true,
        {
          data: refinedPlan,
          metadata: {
            planId: refinedPlan.id,
            queryCount: refinedSubQueries.length,
            deduplicatedFromCount: queriesFromPlan.queries.length,
            action: "strategic_iteration_planning",
          },
        }
      );
      this.emit("tool-result", toolResultEvent);

      return refinedPlan;
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
   * Generate strategic plan based on ContentRefiner's guidance
   *
   * This method creates a focused strategic plan that implements the strategic
   * guidance provided by ContentRefiner, building upon accumulated knowledge.
   */
  private async generateStrategicPlanFromGuidance(
    originalQuery: string,
    researchDirections: ResearchDirection[],
    strategicGuidance: string,
    allQueries: string[]
  ): Promise<FreeFormResearchPlan> {
    const sessionId = this.getCurrentSessionId();
    const toolCallEvent = EventFactory.createToolCallStart(
      sessionId,
      "analyze",
      {
        action: "strategic_plan_from_guidance",
        metadata: {
          directionsCount: researchDirections.length,
          guidance: strategicGuidance.substring(0, 100) + "...",
        },
      }
    );
    this.emit("tool-call", toolCallEvent);
    const toolCallId = toolCallEvent.toolCallId;

    try {
      // Stream the strategic plan generation
      this.emit("text", `\n🎯 Strategic Plan (Based on Guidance):\n`);

      const strategicPlanPrompt = this.buildStrategicPlanFromGuidanceTextPrompt(
        originalQuery,
        researchDirections,
        strategicGuidance,
        allQueries
      );
      let strategicPlanText = "";

      for await (const delta of streamTextOutput(
        this.provider,
        strategicPlanPrompt
      )) {
        strategicPlanText += delta;
        this.emit("text", delta);
      }

      this.emit("text", `\n\n`);

      const approach = `Strategic approach based on ContentRefiner guidance`;
      const estimatedSteps = Math.max(researchDirections.length, 2);

      const strategicPlan: FreeFormResearchPlan = {
        id: `strategic_plan_${Date.now()}`,
        originalQuery,
        strategicPlan: strategicPlanText,
        approach,
        estimatedSteps,
        createdAt: new Date(),
      };

      const toolResultEvent = EventFactory.createToolCallEnd(
        sessionId,
        toolCallId,
        "analyze",
        true,
        {
          data: strategicPlan,
          metadata: {
            planId: strategicPlan.id,
            approach: strategicPlan.approach,
            estimatedSteps: strategicPlan.estimatedSteps,
          },
        }
      );
      this.emit("tool-result", toolResultEvent);

      return strategicPlan;
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
   * Deduplicate queries by removing those too similar to existing ones
   *
   * This method implements query deduplication to avoid redundant searches
   * across research iterations.
   */
  private deduplicateQueries(
    newQueries: string[],
    existingQueries: string[]
  ): string[] {
    return newQueries.filter((newQuery) => {
      // Check if this query is too similar to any existing query
      return !existingQueries.some((existingQuery) => {
        return this.isQuerySimilar(newQuery, existingQuery);
      });
    });
  }

  /**
   * Check if two queries are similar based on semantic overlap
   *
   * This method implements a simple similarity check based on keyword
   * overlap and intent recognition.
   */
  private isQuerySimilar(query1: string, query2: string): boolean {
    const words1 = query1.toLowerCase().split(/\s+/);
    const words2 = query2.toLowerCase().split(/\s+/);

    // Calculate word overlap
    const commonWords = words1.filter((word) => words2.includes(word));
    const overlapRatio =
      commonWords.length / Math.max(words1.length, words2.length);

    // Consider similar if >70% word overlap
    return overlapRatio > 0.7;
  }

  /**
   * Build strategic plan text prompt based on ContentRefiner guidance
   *
   * This method creates a prompt that generates a strategic plan implementing
   * the specific guidance provided by ContentRefiner.
   */
  private buildStrategicPlanFromGuidanceTextPrompt(
    originalQuery: string,
    researchDirections: ResearchDirection[],
    strategicGuidance: string,
    allQueries: string[]
  ): string {
    return buildStrategicPlanFromGuidanceTextPrompt(
      originalQuery,
      researchDirections,
      strategicGuidance,
      allQueries
    );
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

    if (plan.subQueries && plan.subQueries.length > 10) {
      errors.push("Too many sub-queries (maximum 10)");
    }

    // Check for duplicate queries to avoid redundant work
    const queryTexts = plan.subQueries.map((sq) => sq.query.toLowerCase());
    const duplicates = queryTexts.filter((q, i) => queryTexts.indexOf(q) !== i);
    if (duplicates.length > 0) {
      errors.push("Duplicate sub-queries detected");
    }

    // All queries are treated equally - no priority validation needed

    return {
      isValid: errors.length === 0,
      errors,
    };
  }
}
