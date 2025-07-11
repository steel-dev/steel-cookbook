/**
 * DeepResearchAgent - Main Orchestrator for Deep Research System
 *
 * OVERVIEW:
 * This is the main entry point and orchestrator for the Deep Research system. It implements
 * the core agentic loop pattern: Plan → Search → Evaluate → Refine → Synthesize.
 *
 * INPUTS:
 * - query: String - The research question or topic to investigate
 * - options: ResearchOptions - Configuration for depth, breadth, timeout, etc.
 * - config: DeepResearchConfig - Provider configuration for AI, Steel, search settings
 *
 * OUTPUTS:
 * - ResearchReport - Final comprehensive report with citations, learnings, and structured content
 * - Event Stream - Real-time updates about tool calls, progress, and intermediate results
 *
 * POSITION IN RESEARCH FLOW:
 * Acts as the central coordinator that:
 * 1. Initializes all specialized agents (QueryPlanner, SearchAgent, etc.)
 * 2. Manages the iterative research loop
 * 3. Coordinates event emission for real-time feedback
 * 4. Handles error management and graceful failures
 * 5. Provides both synchronous and streaming interfaces
 *
 * KEY FEATURES:
 * - Event-driven architecture with real-time tool feedback
 * - Configurable AI providers (OpenAI, Anthropic, Together)
 * - Iterative research with early termination when sufficient information is found
 * - Streaming text generation for real-time report building
 * - Comprehensive error handling and recovery
 * - Test utilities for connection validation
 *
 * USAGE:
 * ```typescript
 * const agent = new DeepResearchAgent(config);
 * agent.on('progress', (progress) => console.log(progress));
 * agent.on('tool-call', (tool) => console.log(`Using ${tool.toolName}`));
 * const report = await agent.research("What is the future of AI?", { depth: 3 });
 * ```
 */

import { EventEmitter } from "events";
import {
  DeepResearchConfig,
  ResearchOptions,
  ResearchReport,
  ResearchPlan,
  SearchResult,
  ResearchEvaluation,
  ToolCallEvent,
  ToolResultEvent,
  ResearchProgress,
  Learning,
  DEFAULT_RESEARCH_OPTIONS,
  ResearchProgressEvent,
  TextStreamEvent,
  ResearchMilestoneEvent,
  ResearchErrorEvent,
  ResearchSessionEvent,
} from "./interfaces";
// Allow automatic config loading if none provided
import { loadConfig } from "../config";
import { ProviderManager } from "../providers/providers";
import { QueryPlanner } from "../agents/QueryPlanner";
import { SearchAgent } from "../agents/SearchAgent";
import { ContentEvaluator } from "../agents/ContentEvaluator";
import { ContentRefiner } from "../agents/ContentRefiner";
import { ReportSynthesizer } from "../agents/ReportSynthesizer";
import { EventFactory, DeepResearchEvent } from "./events";

export class DeepResearchAgent extends EventEmitter {
  private providerManager: ProviderManager;
  private planner: QueryPlanner;
  private searcher: SearchAgent;
  private evaluator: ContentEvaluator;
  private refiner: ContentRefiner;
  private synthesizer: ReportSynthesizer;
  private config: DeepResearchConfig;
  private currentSessionId: string | null = null;

  constructor(config?: DeepResearchConfig) {
    super();
    // If a config is not provided, attempt to load it from environment / defaults
    this.config = config ?? loadConfig();

    // Initialize provider manager for AI and Steel API management
    this.providerManager = new ProviderManager(this.config);

    // Initialize specialized agents - each handles a specific part of the research process
    this.planner = new QueryPlanner(this.providerManager, this);
    this.searcher = new SearchAgent(this.providerManager, this);
    this.evaluator = new ContentEvaluator(
      this.providerManager.getAIProvider(),
      this
    );
    this.refiner = new ContentRefiner(this.providerManager, this.planner, this);
    this.synthesizer = new ReportSynthesizer(
      this.providerManager.getAIWriter(),
      this
    );

    // Set up event forwarding from components
    this.setupEventForwarding();
  }

  /**
   * Generate a new session ID for tracking research sessions
   */
  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Emit a structured event using the EventFactory
   */
  private emitStructuredEvent(event: DeepResearchEvent): void {
    // Emit both the structured event and legacy events for backward compatibility
    this.emit(event.type, event);

    // Legacy event emissions for backward compatibility
    switch (event.type) {
      case "tool-call-start":
        this.emit("tool-call", event);
        break;
      case "tool-call-end":
        this.emit("tool-result", event);
        break;
      case "research-progress":
        this.emit("progress", event);
        break;
      case "text-stream":
        this.emit("text", event.content);
        break;
      case "research-error":
        this.emit("error", new Error(event.error));
        break;
      case "research-session-end":
        this.emit("done", event.result);
        break;
    }
  }

  /**
   * Sets up event forwarding from all agents to the main DeepResearchAgent
   * This enables unified event handling and real-time feedback from all components
   */
  private setupEventForwarding(): void {
    // Forward events from components to main agent
    [
      this.planner,
      this.searcher,
      this.evaluator,
      this.refiner,
      this.synthesizer,
    ].forEach((component) => {
      if (component instanceof EventEmitter) {
        component.on("tool-call", (event: ToolCallEvent) => {
          this.emit("tool-call", event);
        });
        component.on("tool-result", (event: ToolResultEvent) => {
          this.emit("tool-result", event);
        });
        component.on("progress", (event: ResearchProgress) => {
          this.emit("progress", event);
        });
        component.on("error", (error: Error) => {
          this.emit("error", error);
        });
        component.on("text", (text: string) => {
          this.emit("text", text);
        });
      }
    });
  }

  /**
   * Main research method - orchestrates the entire research process
   *
   * PROCESS FLOW:
   * 1. Planning: Break down the query into focused sub-questions
   * 2. Research Loop: Iteratively search, evaluate, and refine based on findings
   * 3. Synthesis: Generate final comprehensive report with citations
   *
   * The loop continues until:
   * - Maximum depth is reached
   * - Sufficient information is found (early termination)
   * - No more research directions are identified
   * - High confidence and coverage is achieved
   */
  async research(
    query: string,
    options: ResearchOptions = {}
  ): Promise<ResearchReport> {
    // Generate session ID for this research session
    this.currentSessionId = this.generateSessionId();
    const sessionId = this.currentSessionId;

    try {
      // Merge options with defaults
      const researchOptions = { ...DEFAULT_RESEARCH_OPTIONS, ...options };

      // Emit session start event
      this.emitStructuredEvent(
        EventFactory.createSessionStart(sessionId, query, researchOptions)
      );

      // Step 0: Initialize progress tracking
      this.emitStructuredEvent(
        EventFactory.createProgress(
          sessionId,
          "initialization",
          0,
          "Starting research",
          5
        )
      );

      // Step 1: Plan Research - Generate focused sub-queries
      const planningToolEvent = EventFactory.createToolCallStart(
        sessionId,
        "analyze",
        { action: "planning", query }
      );
      this.emitStructuredEvent(planningToolEvent);

      const plan = await this.planner.planResearch(
        query,
        researchOptions.depth,
        researchOptions.breadth
      );

      this.emitStructuredEvent(
        EventFactory.createToolCallEnd(
          sessionId,
          planningToolEvent.toolCallId,
          "analyze",
          true,
          {
            planId: plan.id,
            subQueries: plan.subQueries.length,
            estimatedSteps: plan.estimatedSteps,
          }
        )
      );

      // Emit milestone for plan creation
      this.emitStructuredEvent(
        EventFactory.createMilestone(
          sessionId,
          "plan-created",
          plan,
          `Created research plan with ${plan.subQueries.length} sub-queries`
        )
      );

      // Step 2: Execute Research Loop - Iterative search and evaluation
      const { findings, allLearnings } = await this.executeResearchLoop(
        query,
        plan,
        researchOptions,
        sessionId
      );

      // Step 3: Synthesize Report - Generate final comprehensive report
      this.emitStructuredEvent(
        EventFactory.createProgress(
          sessionId,
          "synthesizing",
          90,
          "Generating final report",
          5
        )
      );

      const report = await this.synthesizer.generateReport(
        findings,
        query,
        allLearnings
      );

      // Emit final progress
      this.emitStructuredEvent(
        EventFactory.createProgress(
          sessionId,
          "complete",
          100,
          "Research completed",
          5
        )
      );

      // Emit milestone and session end
      this.emitStructuredEvent(
        EventFactory.createMilestone(
          sessionId,
          "report-generated",
          report,
          `Generated comprehensive report with ${report.citations.length} citations`
        )
      );

      this.emitStructuredEvent(
        EventFactory.createSessionEnd(sessionId, query, report)
      );

      return report;
    } catch (error) {
      const errorObj =
        error instanceof Error ? error : new Error(String(error));

      // Emit structured error event
      this.emitStructuredEvent(
        EventFactory.createError(
          sessionId,
          errorObj.message,
          false,
          errorObj.name,
          "research"
        )
      );

      throw errorObj;
    } finally {
      this.currentSessionId = null;
    }
  }

  /**
   * Core research loop implementing the iterative research process
   *
   * LOOP LOGIC:
   * 1. Execute searches based on current plan
   * 2. Evaluate findings for quality and completeness
   * 3. Check termination conditions (sufficient info, max depth, etc.)
   * 4. Refine strategy and generate new queries if continuing
   * 5. Repeat until termination conditions are met
   *
   * TERMINATION CONDITIONS:
   * - Sufficient information available (early termination)
   * - Maximum depth reached
   * - High coverage achieved
   * - No more research directions available
   * - ContentRefiner recommends termination
   *
   * NEW: Knowledge accumulation between iterations
   * - Accumulates all findings across iterations
   * - Accumulates all learnings across iterations
   * - Tracks all queries used for deduplication
   */
  private async executeResearchLoop(
    originalQuery: string,
    initialPlan: ResearchPlan,
    options: Required<ResearchOptions>,
    sessionId: string
  ): Promise<{ findings: SearchResult[]; allLearnings: Learning[] }> {
    let currentPlan = initialPlan;
    let currentDepth = 0;

    // NEW: Accumulation variables for knowledge persistence
    let allFindings: SearchResult[] = []; // All search results across iterations
    let allLearnings: Learning[] = []; // All extracted learnings
    let allQueries: string[] = []; // All queries used (for deduplication)

    while (currentDepth < options.depth) {
      this.emit("progress", {
        phase: "searching",
        progress: 20 + (currentDepth / options.depth) * 50,
        currentStep: `Research iteration ${currentDepth + 1}`,
        totalSteps: 5,
      });

      // Execute searches for current plan
      const iterationFindings = await this.executeSearches(
        currentPlan,
        currentDepth,
        sessionId
      );

      // NEW: ACCUMULATE - Add to running totals
      allFindings.push(...iterationFindings);
      allQueries.push(...currentPlan.subQueries.map((sq) => sq.query));

      // Evaluate findings for quality and completeness
      this.emit("progress", {
        phase: "evaluating",
        progress: 20 + (currentDepth / options.depth) * 50 + 10,
        currentStep: `Evaluating findings for iteration ${currentDepth + 1}`,
        totalSteps: 5,
      });

      // ContentEvaluator: current iteration with plan context
      const evaluation = await this.evaluator.evaluateFindings(
        originalQuery,
        iterationFindings, // Current iteration results
        currentPlan, // Current research plan context
        currentDepth,
        options.depth
      );

      // NEW: ACCUMULATE - Add new learnings
      allLearnings.push(...evaluation.learnings);

      // ContentRefiner: strategic decisions with full context
      const refinementDecision = await this.refiner.refineSearchStrategy(
        originalQuery,
        evaluation,
        currentPlan,
        allLearnings, // Full accumulated knowledge
        allQueries // All queries used
      );

      if (!refinementDecision.shouldContinue) {
        const terminationToolEvent = EventFactory.createToolCallStart(
          sessionId,
          "analyze",
          {
            action: "termination",
            reason: refinementDecision.reason,
            depth: currentDepth,
            findingsCount: allFindings.length,
            learningsCount: allLearnings.length,
            terminationMetadata: refinementDecision.terminationMetadata,
          }
        );
        this.emitStructuredEvent(terminationToolEvent);

        const terminationResultEvent = EventFactory.createToolCallEnd(
          sessionId,
          terminationToolEvent.toolCallId,
          "analyze",
          true,
          { terminationReason: refinementDecision.reason }
        );
        this.emitStructuredEvent(terminationResultEvent);

        break;
      }

      // QueryPlanner: execution based on ContentRefiner's direction
      const nextPlan = await this.planner.planNextIteration(
        originalQuery,
        refinementDecision.researchDirections,
        refinementDecision.strategicGuidance,
        allQueries, // Avoid duplicate queries
        currentPlan
      );

      currentPlan = nextPlan;
      currentDepth++;
    }

    return { findings: allFindings, allLearnings };
  }

  /**
   * Execute searches for all sub-queries in the current plan
   * Uses parallel execution for efficiency while respecting rate limits
   */
  private async executeSearches(
    plan: ResearchPlan,
    depth: number,
    sessionId: string
  ): Promise<SearchResult[]> {
    const results: SearchResult[] = [];

    // Execute searches for each sub-query in the plan
    for (const subQuery of plan.subQueries) {
      const searchToolEvent = EventFactory.createToolCallStart(
        sessionId,
        "search",
        {
          query: subQuery.query,
          metadata: { depth },
        }
      );
      this.emitStructuredEvent(searchToolEvent);

      try {
        const serpResults = await this.searcher.searchSERP(subQuery.query, {
          maxResults: 5,
          timeout: this.config.search.timeout,
        });

        const searchResults = serpResults.results;

        results.push(...searchResults);

        const searchResultEvent = EventFactory.createToolCallEnd(
          sessionId,
          searchToolEvent.toolCallId,
          "search",
          true,
          { resultCount: searchResults.length }
        );
        this.emitStructuredEvent(searchResultEvent);
      } catch (error) {
        const searchErrorEvent = EventFactory.createToolCallEnd(
          sessionId,
          searchToolEvent.toolCallId,
          "search",
          false,
          undefined,
          error instanceof Error ? error.message : String(error)
        );
        this.emitStructuredEvent(searchErrorEvent);

        // Continue with other queries even if one fails
        continue;
      }
    }

    return results;
  }

  /**
   * Streaming version of research that yields real-time updates
   * Useful for building interactive UIs that show research progress
   */
  async *researchStream(
    query: string,
    options: ResearchOptions = {}
  ): AsyncGenerator<
    ResearchProgress | ToolCallEvent | ToolResultEvent | string | ResearchReport
  > {
    try {
      // Set up event listeners and yield events
      const eventPromises: Promise<any>[] = [];

      // Collect events during research
      this.on("progress", (progress) => {
        eventPromises.push(Promise.resolve(progress));
      });

      this.on("tool-call", (toolCall) => {
        eventPromises.push(Promise.resolve(toolCall));
      });

      this.on("tool-result", (toolResult) => {
        eventPromises.push(Promise.resolve(toolResult));
      });

      this.on("text", (text) => {
        eventPromises.push(Promise.resolve(text));
      });

      // Start research in background
      const researchPromise = this.research(query, options);

      // Yield events as they come
      let completed = false;

      while (!completed) {
        const race = (await Promise.race([
          researchPromise.then(() => ({ type: "complete" as const })),
          new Promise((resolve) =>
            setTimeout(() => resolve({ type: "timeout" as const }), 100)
          ),
        ])) as { type: "complete" } | { type: "timeout" };

        if (race.type === "complete") {
          completed = true;
        }

        // Yield any pending events
        const pendingEvents = await Promise.all(eventPromises.splice(0));
        for (const event of pendingEvents) {
          yield event;
        }
      }

      // Yield final result
      const result = await researchPromise;
      yield result;
    } catch (error) {
      const errorObj =
        error instanceof Error ? error : new Error(String(error));
      this.emit("error", errorObj);
      throw errorObj;
    }
  }

  /**
   * Test connections to all configured providers
   * Useful for debugging and system health checks
   */
  async testConnection(): Promise<{
    ai: boolean;
    writer: boolean;
    steel: boolean;
  }> {
    try {
      const results = await this.providerManager.testAllProviders();
      return results;
    } catch (error) {
      this.emit(
        "error",
        error instanceof Error ? error : new Error(String(error))
      );
      throw error;
    }
  }
}
