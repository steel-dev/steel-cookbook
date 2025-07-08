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
} from "./interfaces";
import { ProviderManager } from "../providers/providers";
import { QueryPlanner } from "../agents/QueryPlanner";
import { SearchAgent } from "../agents/SearchAgent";
import { ContentEvaluator } from "../agents/ContentEvaluator";
import { ContentRefiner } from "../agents/ContentRefiner";
import { ReportSynthesizer } from "../agents/ReportSynthesizer";

export class DeepResearchAgent extends EventEmitter {
  private providerManager: ProviderManager;
  private planner: QueryPlanner;
  private searcher: SearchAgent;
  private evaluator: ContentEvaluator;
  private refiner: ContentRefiner;
  private synthesizer: ReportSynthesizer;
  private config: DeepResearchConfig;

  constructor(config: DeepResearchConfig) {
    super();
    this.config = config;

    // Initialize provider manager
    this.providerManager = new ProviderManager(config);

    // Initialize components with providers
    this.planner = new QueryPlanner(this.providerManager.getAIProvider());
    this.searcher = new SearchAgent(
      this.providerManager.getSteelClient(),
      this
    );
    this.evaluator = new ContentEvaluator(
      this.providerManager.getAIProvider(),
      this
    );
    this.refiner = new ContentRefiner(
      this.providerManager.getAIProvider(),
      this.planner,
      this
    );
    this.synthesizer = new ReportSynthesizer(
      this.providerManager.getAIWriter(),
      this
    );

    // Set up event forwarding from components
    this.setupEventForwarding();
  }

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
      }
    });
  }

  async research(
    query: string,
    options: ResearchOptions = {}
  ): Promise<ResearchReport> {
    try {
      // Merge options with defaults
      const researchOptions = { ...DEFAULT_RESEARCH_OPTIONS, ...options };

      // Emit progress event
      this.emit("progress", {
        phase: "initialization",
        progress: 0,
        currentStep: "Starting research",
        totalSteps: 5,
      });

      // Step 1: Plan Research
      this.emit("tool-call", {
        toolName: "analyze",
        metadata: { action: "planning", query },
        timestamp: new Date(),
      });

      const plan = await this.planner.planResearch(
        query,
        researchOptions.depth,
        researchOptions.breadth
      );

      this.emit("tool-result", {
        toolName: "analyze",
        success: true,
        metadata: {
          planId: plan.id,
          subQueries: plan.subQueries.length,
          estimatedSteps: plan.estimatedSteps,
        },
        timestamp: new Date(),
      });

      // Step 2: Execute Research Loop
      const { findings, allLearnings } = await this.executeResearchLoop(
        query,
        plan,
        researchOptions
      );

      // Step 3: Synthesize Report
      this.emit("progress", {
        phase: "synthesizing",
        progress: 90,
        currentStep: "Generating final report",
        totalSteps: 5,
      });

      const report = await this.synthesizer.generateReport(
        findings,
        query,
        allLearnings
      );

      this.emit("progress", {
        phase: "complete",
        progress: 100,
        currentStep: "Research completed",
        totalSteps: 5,
      });

      this.emit("done", report);
      return report;
    } catch (error) {
      const errorObj =
        error instanceof Error ? error : new Error(String(error));
      this.emit("error", errorObj);
      throw errorObj;
    }
  }

  private async executeResearchLoop(
    originalQuery: string,
    initialPlan: ResearchPlan,
    options: Required<ResearchOptions>
  ): Promise<{ findings: SearchResult[]; allLearnings: Learning[] }> {
    let currentPlan = initialPlan;
    let findings: SearchResult[] = [];
    let allLearnings: Learning[] = [];
    let currentDepth = 0;

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
        currentDepth
      );
      findings.push(...iterationFindings);

      // Evaluate findings
      this.emit("progress", {
        phase: "evaluating",
        progress: 20 + (currentDepth / options.depth) * 50 + 10,
        currentStep: `Evaluating findings for iteration ${currentDepth + 1}`,
        totalSteps: 5,
      });

      const evaluation = await this.evaluator.evaluateFindings(
        originalQuery,
        findings,
        currentDepth,
        options.depth
      );

      // Accumulate learnings
      allLearnings.push(...evaluation.learnings);

      // Check if we should terminate
      const terminationCheck = await this.refiner.shouldTerminate(
        originalQuery,
        evaluation,
        currentDepth,
        options.depth
      );

      if (terminationCheck.shouldTerminate) {
        this.emit("tool-call", {
          toolName: "analyze",
          metadata: {
            action: "termination",
            reason: terminationCheck.reason,
            depth: currentDepth,
            findingsCount: findings.length,
            learningsCount: allLearnings.length,
          },
          timestamp: new Date(),
        });

        this.emit("tool-result", {
          toolName: "analyze",
          success: true,
          metadata: { terminationReason: terminationCheck.reason },
          timestamp: new Date(),
        });

        break;
      }

      // Refine strategy for next iteration
      const refinedPlan = await this.refiner.refineSearchStrategy(
        originalQuery,
        evaluation,
        currentPlan
      );

      if (refinedPlan) {
        currentPlan = refinedPlan;
        currentDepth++;
      } else {
        // No refined plan available, terminate
        break;
      }
    }

    return { findings, allLearnings };
  }

  private async executeSearches(
    plan: ResearchPlan,
    depth: number
  ): Promise<SearchResult[]> {
    const results: SearchResult[] = [];

    for (const subQuery of plan.subQueries) {
      try {
        this.emit("tool-call", {
          toolName: "search",
          query: subQuery.query,
          metadata: { depth, priority: subQuery.priority },
          timestamp: new Date(),
        });

        const serpResults = await this.searcher.searchSERP(subQuery.query, {
          maxResults: 5,
          timeout: this.config.search.timeout,
        });

        const searchResults = serpResults.results;

        results.push(...searchResults);

        this.emit("tool-result", {
          toolName: "search",
          success: true,
          resultCount: searchResults.length,
          timestamp: new Date(),
        });
      } catch (error) {
        this.emit("tool-result", {
          toolName: "search",
          success: false,
          error: error instanceof Error ? error.message : String(error),
          timestamp: new Date(),
        });

        // Continue with other queries even if one fails
        continue;
      }
    }

    return results;
  }

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
