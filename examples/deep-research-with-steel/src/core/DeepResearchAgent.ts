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
  RefinedContent,
  ResearchEvaluation,
  ToolCallEvent,
  ToolResultEvent,
  ResearchProgress,
  ResearchProgressEvent,
  TextStreamEvent,
  ResearchMilestoneEvent,
  ResearchErrorEvent,
  ResearchSessionEvent,
} from "./interfaces";

import { QueryPlanner } from "../agents/QueryPlanner";
import { SearchAgent } from "../agents/SearchAgent";
import { ContentEvaluator } from "../agents/ContentEvaluator";
import { ContentRefiner } from "../agents/ContentRefiner";
import { ReportSynthesizer } from "../agents/ReportSynthesizer";
import { EventFactory, DeepResearchEvent } from "./events";

export class DeepResearchAgent extends EventEmitter {
  private models: {
    planner: any;
    evaluator: any;
    writer: any;
    summary: any;
  };
  private planner: QueryPlanner;
  private searcher: SearchAgent;
  private evaluator: ContentEvaluator;
  private refiner: ContentRefiner;
  private synthesizer: ReportSynthesizer;
  private config: DeepResearchConfig;
  private currentSessionId: string | null = null;

  constructor(config: DeepResearchConfig) {
    super();
    // If a config is not provided, attempt to load it from environment / defaults
    this.config = config;

    // Setup models from config
    this.models = {
      planner: config.models?.planner ?? config.aiProvider,
      evaluator: config.models?.evaluator ?? config.aiProvider,
      writer: config.models?.writer ?? config.aiProvider,
      summary: config.models?.summary ?? config.aiProvider,
    };

    // Initialize specialized agents - each handles a specific part of the research process
    this.planner = new QueryPlanner(this.models, this);
    this.searcher = new SearchAgent(
      this.models,
      this,
      config.steelApiKey,
      config.research?.retryAttempts ?? 3,
      config.research?.timeout ?? 30000
    );
    this.evaluator = new ContentEvaluator(this.models, this);
    this.refiner = new ContentRefiner(this.models, this);
    this.synthesizer = new ReportSynthesizer(this.models, this);

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
        // Note: We no longer forward text-stream events as text events
        // The BaseAgent now handles incremental text extraction from structured streams
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
      const researchOptions = {
        depth: options.depth ?? 2,
        breadth: options.breadth ?? 3,
        timeout: options.timeout ?? 30000,
        includeImages: options.includeImages ?? false,
        humanInTheLoop: options.humanInTheLoop ?? false,
        followUpDialogue: options.followUpDialogue ?? [],
        maxSources:
          options.maxSources ?? this.config.research?.maxSources ?? 60,
        summaryTokens:
          options.summaryTokens ?? this.config.research?.summaryTokens ?? 500,
      };

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
        researchOptions.breadth,
        researchOptions.followUpDialogue
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
      const { findings, finalEvaluation } = await this.executeResearchLoop(
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

      // Use ContentRefiner to filter findings before report generation
      const filteredSummaries = await this.refiner.getFilteredContent(
        query,
        findings,
        researchOptions.maxSources || 10
      );

      const report = await this.synthesizer.generateReport(
        filteredSummaries,
        query
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
   * Core research loop implementing THE BRAIN architecture
   *
   * NEW ARCHITECTURE:
   * 1. QueryPlanner called ONCE at beginning
   * 2. Loop: SearchAgent.searchAndSummarize() → ContentEvaluator (THE BRAIN)
   * 3. THE BRAIN makes termination decision AND generates new queries directly
   * 4. Repeat until THE BRAIN says "synthesize" or max depth reached
   *
   * KNOWLEDGE ACCUMULATION:
   * - Accumulates all RefinedContent[] across iterations (25→50→75...)
   * - THE BRAIN analyzes ALL accumulated summaries for comprehensive decisions
   * - Memory limit protection (configurable maxSources, default 60)
   * - URL deduplication to avoid re-scraping same sources
   *
   * TERMINATION CONDITIONS:
   * - THE BRAIN recommends "synthesize" (sufficient information)
   * - Maximum depth reached (no more iterations possible)
   * - Memory limit exceeded (too many accumulated summaries)
   * - No meaningful research directions available
   */
  private async executeResearchLoop(
    originalQuery: string,
    initialPlan: ResearchPlan,
    options: Required<ResearchOptions>,
    sessionId: string
  ): Promise<{
    findings: RefinedContent[];
    finalEvaluation: ResearchEvaluation;
  }> {
    let currentDepth = 0;
    // Use config defaults with option overrides
    const maxSources =
      options.maxSources || this.config.research?.maxSources || 60; // Hardcoded default
    const summaryTokens =
      options.summaryTokens || this.config.research?.summaryTokens || 1000; // Hardcoded default

    // KNOWLEDGE ACCUMULATION: Variables for cross-iteration persistence
    let allRefinedContent: RefinedContent[] = []; // ALL summaries across iterations
    let scrapedUrls: Set<string> = new Set(); // URL deduplication
    let finalEvaluation: ResearchEvaluation | undefined; // THE BRAIN's final decision

    // Initial queries from QueryPlanner (called ONCE)
    let currentQueries = initialPlan.subQueries.map((sq) => sq.query);

    while (currentDepth < options.depth) {
      this.emit("progress", {
        phase: "searching",
        progress: 20 + (currentDepth / options.depth) * 50,
        currentStep: `Research iteration ${currentDepth + 1} - ${
          currentQueries.length
        } queries`,
        totalSteps: 5,
      });

      // Execute searches using SearchAgent.searchAndSummarize (NEW ARCHITECTURE)
      const iterationContent = await this.executeSearchesWithSummarization(
        currentQueries,
        currentDepth,
        sessionId,
        scrapedUrls,
        summaryTokens
      );

      // ACCUMULATE: Add new content to running total
      allRefinedContent.push(...iterationContent);

      // Update URL deduplication set
      iterationContent.forEach((content) => scrapedUrls.add(content.url));

      // MEMORY GUARD: Check if we've hit the source limit
      if (allRefinedContent.length >= maxSources) {
        // Trim to exact limit and terminate immediately
        allRefinedContent = allRefinedContent.slice(0, maxSources);

        // Create final evaluation for memory limit termination
        finalEvaluation = {
          learnings: [],
          completenessAssessment: {
            coverage: 0.8,
            confidence: 0.7,
            knowledgeGaps: [],
            hasEnoughInfo: true,
            recommendedAction: "synthesize",
            reasoning: `Research terminated due to memory limit (${maxSources} sources). Proceeding to synthesis.`,
          },
          researchDirections: [],
        };

        break;
      }

      // OPTIMIZATION: Skip evaluation at depth=0 (no more iterations possible)
      if (currentDepth === options.depth - 1) {
        // Last iteration - go straight to synthesis without evaluation
        finalEvaluation = {
          learnings: [],
          completenessAssessment: {
            coverage: 0.8,
            confidence: 0.7,
            knowledgeGaps: [],
            hasEnoughInfo: true,
            recommendedAction: "synthesize",
            reasoning: `Research completed at maximum depth (${options.depth}). Proceeding to synthesis.`,
          },
          researchDirections: [],
        };
        break;
      }

      this.emit("progress", {
        phase: "evaluating",
        progress: 20 + (currentDepth / options.depth) * 50 + 10,
        currentStep: `THE BRAIN analyzing ${allRefinedContent.length} accumulated summaries`,
        totalSteps: 5,
      });

      // THE BRAIN: ContentEvaluator analyzes ALL accumulated content
      const brainDecision = await this.evaluator.evaluateFindings(
        originalQuery,
        allRefinedContent, // ALL accumulated summaries across iterations
        initialPlan, // Initial research plan for context
        currentDepth,
        options.depth,
        options.breadth || 5, // Number of queries to generate if continuing
        maxSources // Memory limit
      );

      // THE BRAIN DECISION: Store final evaluation and check termination conditions
      finalEvaluation = brainDecision;

      if (
        brainDecision.completenessAssessment.recommendedAction === "synthesize"
      ) {
        const terminationToolEvent = EventFactory.createToolCallStart(
          sessionId,
          "analyze",
          {
            action: "brain_termination",
            reason: brainDecision.completenessAssessment.reasoning,
            depth: currentDepth,
            totalSummaries: allRefinedContent.length,
            totalLearnings: brainDecision.learnings.length, // Get from THE BRAIN directly
            coverage: brainDecision.completenessAssessment.coverage,
            confidence: brainDecision.completenessAssessment.confidence,
          }
        );
        this.emitStructuredEvent(terminationToolEvent);

        const terminationResultEvent = EventFactory.createToolCallEnd(
          sessionId,
          terminationToolEvent.toolCallId,
          "analyze",
          true,
          {
            terminationReason: brainDecision.completenessAssessment.reasoning,
            brainDecision: "synthesize",
          }
        );
        this.emitStructuredEvent(terminationResultEvent);

        break;
      }

      // CONTINUE: THE BRAIN generated new queries directly
      if (brainDecision.researchDirections.length > 0) {
        // Extract queries from research directions
        currentQueries = brainDecision.researchDirections.flatMap(
          (direction) => direction.searchQueries
        );

        const continueToolEvent = EventFactory.createToolCallStart(
          sessionId,
          "analyze",
          {
            action: "brain_continue",
            newQueriesGenerated: currentQueries.length,
            iterationsSoFar: currentDepth + 1,
            totalSummaries: allRefinedContent.length,
          }
        );
        this.emitStructuredEvent(continueToolEvent);

        const continueResultEvent = EventFactory.createToolCallEnd(
          sessionId,
          continueToolEvent.toolCallId,
          "analyze",
          true,
          {
            brainDecision: "continue",
            newQueries: currentQueries.length,
          }
        );
        this.emitStructuredEvent(continueResultEvent);
      } else {
        // No research directions - terminate even if recommended to continue
        finalEvaluation = brainDecision; // Ensure finalEvaluation is set
        break;
      }

      currentDepth++;
    }

    // Fallback: If no evaluation was set (shouldn't happen), create a basic one
    if (!finalEvaluation) {
      finalEvaluation = {
        learnings: [],
        completenessAssessment: {
          coverage: 0.7,
          confidence: 0.6,
          knowledgeGaps: [],
          hasEnoughInfo: true,
          recommendedAction: "synthesize",
          reasoning: `Research completed with ${allRefinedContent.length} sources. No evaluation performed.`,
        },
        researchDirections: [],
      };
    }

    return { findings: allRefinedContent, finalEvaluation };
  }

  /**
   * Execute searches with summarization using SearchAgent.searchAndSummarize
   *
   * This method implements the new architecture where SearchAgent returns RefinedContent[]
   * instead of SearchResult[]. It uses LLM summarization and URL deduplication.
   */
  private async executeSearchesWithSummarization(
    queries: string[],
    depth: number,
    sessionId: string,
    scrapedUrls: Set<string>,
    summaryTokens: number
  ): Promise<RefinedContent[]> {
    const results: RefinedContent[] = [];

    // Execute searches for each query with summarization
    for (const query of queries) {
      const searchToolEvent = EventFactory.createToolCallStart(
        sessionId,
        "search",
        {
          query,
          metadata: { depth, summaryTokens },
        }
      );
      this.emitStructuredEvent(searchToolEvent);

      try {
        const refinedContent = await this.searcher.searchAndSummarize(query, {
          maxResults: 5,
          timeout: this.config.research?.timeout ?? 30000, // Hardcoded default
          scrapedUrls, // URL deduplication
          summaryTokens,
        });

        results.push(...refinedContent);

        const searchResultEvent = EventFactory.createToolCallEnd(
          sessionId,
          searchToolEvent.toolCallId,
          "search",
          true,
          { resultCount: refinedContent.length }
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
      // For AI models, we can't easily test without making actual calls
      // So we just return true if models are defined
      return {
        ai: !!this.models.planner,
        writer: !!this.models.writer,
        steel: !!this.config.steelApiKey, // Check if Steel API key is configured
      };
    } catch (error) {
      this.emit(
        "error",
        error instanceof Error ? error : new Error(String(error))
      );
      throw error;
    }
  }
}
