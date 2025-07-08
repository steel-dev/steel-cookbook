# Deep Research Agent with Steel - Technical Specification (Updated)

## 1. Overview and Goals

### Primary Goal

Build a production-ready Deep Research agent that leverages Steel's Node SDK for web scraping and AI SDK for LLM integration, implementing the core agentic loop architecture from Together AI's Open Deep Research.

### Key Requirements

- **Language**: TypeScript for type safety and maintainability
- **Architecture**: Modular design allowing extension as a tool or mode
- **Integration**: Steel Node SDK for web scraping and AI SDK for LLM providers
- **Output**: Markdown reports with inline citations and full citation lists
- **Demo**: Terminal UI for demonstration purposes
- **Event System**: Rich event streaming for tool calls and progress updates
- **Production-Ready**: Robust error handling, logging, and configuration

### Success Criteria

- Autonomously research complex queries through iterative planning and search
- Generate comprehensive, well-cited reports
- Demonstrate effective Steel integration with real-time tool feedback
- Provide extensible architecture for future enhancements
- Support multiple LLM providers with configurable roles

## 2. Architecture Design

### Core Agentic Loop

Following the proven Plan → Search → Evaluate → Refine → Synthesize pattern:

```
Input (Query + Config) → Planner → Search Agent → Evaluator → Synthesizer → Output
                           ↑                        ↓
                           └─────── Refiner ←──────┘
```

### Updated Component Architecture

#### 2.1 Modular Design with AI SDK Integration

```typescript
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { generateText, streamText } from "ai";
import Steel from "steel-sdk";

interface DeepResearchAgent {
  planner: QueryPlanner;
  searcher: SearchAgent;
  evaluator: ContentEvaluator;
  refiner: ContentRefiner;
  synthesizer: ReportSynthesizer;
  steelClient: Steel;
  aiProvider: Provider;
  aiWriter: Provider;
  eventEmitter: EventEmitter;
}

interface DeepResearchConfig {
  steel: {
    apiKey: string;
  };

  ai: {
    provider: {
      name: "openai" | "anthropic" | "together";
      apiKey: string;
      model: string;
    };
    writer: {
      name: "openai" | "anthropic" | "together";
      apiKey: string;
      model: string;
    };
  };

  search: {
    maxDepth: number;
    maxBreadth: number;
    timeout: number;
    retryAttempts: number;
  };
}
```

#### 2.2 Event-Driven Architecture with Tool Tracking

```typescript
// Enhanced event system for tool calls and streaming
type ResearchEvent =
  | "planning"
  | "searching"
  | "evaluating"
  | "refining"
  | "synthesizing"
  | "complete"
  | "error"
  | "progress"
  | "tool-call"
  | "tool-result"
  | "text"
  | "done";

interface ToolCallEvent {
  toolName: "search" | "scrape" | "screenshot" | "analyze";
  query?: string;
  url?: string;
  metadata?: Record<string, any>;
  timestamp: Date;
}

interface ToolResultEvent {
  toolName: string;
  success: boolean;
  resultCount?: number;
  contentLength?: number;
  error?: string;
  timestamp: Date;
}

// Event streaming similar to the beam example
class DeepResearchAgent extends EventEmitter {
  on(event: "text", listener: (content: string) => void): this;
  on(event: "tool-call", listener: (toolCall: ToolCallEvent) => void): this;
  on(event: "tool-result", listener: (result: ToolResultEvent) => void): this;
  on(event: "error", listener: (error: Error) => void): this;
  on(event: "done", listener: (result: ResearchReport) => void): this;
  on(event: "progress", listener: (progress: ResearchProgress) => void): this;
}
```

## 3. Updated Core Components

### 3.1 Enhanced Query Planner with Learning Context

```typescript
import { generateObject } from "ai";
import { z } from "zod";

interface SubQuery {
  query: string;
  researchGoal: string;
  priority: "high" | "medium" | "low";
  context?: string[];
}

interface ResearchPlan {
  id: string;
  originalQuery: string;
  subQueries: SubQuery[];
  searchStrategy: SearchStrategy;
  estimatedSteps: number;
  iteration: number;
  previousLearnings: Learning[];
}

class QueryPlanner {
  constructor(private provider: Provider, private eventEmitter: EventEmitter) {}

  async planResearch(
    query: string,
    depth: number,
    breadth: number
  ): Promise<ResearchPlan> {
    this.eventEmitter.emit("progress", { phase: "planning", progress: 0 });

    const { object } = await generateObject({
      model: this.provider,
      prompt: `Decompose this research query into ${breadth} specific sub-questions: "${query}"
      
      Consider:
      - Different angles and perspectives
      - Factual vs. analytical aspects
      - Current vs. historical context
      - Priority order for research
      
      Create specific search queries that will yield valuable information.`,
      schema: z.object({
        subQueries: z
          .array(
            z.object({
              query: z.string().describe("Specific search query"),
              researchGoal: z
                .string()
                .describe(
                  "Goal and approach for this query, including follow-up directions"
                ),
              priority: z.enum(["high", "medium", "low"]),
            })
          )
          .describe(`List of search queries, max of ${breadth}`),
      }),
    });

    return {
      id: crypto.randomUUID(),
      originalQuery: query,
      subQueries: object.subQueries,
      searchStrategy: this.determineStrategy(query, depth, breadth),
      estimatedSteps: object.subQueries.length * depth,
      iteration: 0,
      previousLearnings: [],
    };
  }

  async planNextIteration(
    originalQuery: string,
    evaluation: ResearchEvaluation,
    currentPlan: ResearchPlan
  ): Promise<ResearchPlan> {
    this.eventEmitter.emit("progress", { phase: "refining", progress: 50 });

    // Focus on high-priority research directions
    const prioritizedDirections = evaluation.researchDirections
      .filter((d) => d.priority === "high")
      .slice(0, 3); // Focus on top 3 high-priority directions

    const { object } = await generateObject({
      model: this.provider,
      prompt: `Based on the research evaluation, plan the next iteration of queries.
      
      Original query: ${originalQuery}
      Current learnings: ${evaluation.learnings
        .map((l) => l.content)
        .join("\n")}
      
      High-priority research directions:
      ${prioritizedDirections
        .map((d) => `- ${d.question}: ${d.rationale}`)
        .join("\n")}
      
      Knowledge gaps identified:
      ${evaluation.completenessAssessment.knowledgeGaps.join("\n")}
      
      Generate focused queries to address these gaps and directions.`,
      schema: z.object({
        refinedQueries: z
          .array(
            z.object({
              query: z.string().describe("Refined search query"),
              researchGoal: z.string().describe("Specific goal for this query"),
              priority: z.enum(["high", "medium", "low"]),
            })
          )
          .describe("List of refined queries based on evaluation"),
      }),
    });

    return {
      ...currentPlan,
      subQueries: object.refinedQueries,
      iteration: currentPlan.iteration + 1,
      previousLearnings: evaluation.learnings,
    };
  }

  private determineStrategy(
    query: string,
    depth: number,
    breadth: number
  ): SearchStrategy {
    return {
      maxDepth: depth,
      maxBreadth: breadth,
      searchType: "comprehensive",
      timeout: 30000,
    };
  }
}
```

### 3.2 Search Agent (Steel Node SDK Integration)

```typescript
import Steel from "steel-sdk";

class SearchAgent {
  constructor(private steel: Steel, private eventEmitter: EventEmitter) {}

  async searchSERP(
    query: string,
    options: SERPOptions = {}
  ): Promise<SERPResult> {
    // Emit tool call event
    this.eventEmitter.emit("tool-call", {
      toolName: "search",
      query,
      timestamp: new Date(),
    });

    try {
      const result = await this.steel.scrape({
        url: `https://www.google.com/search?q=${encodeURIComponent(query)}`,
        extractSchema: true,
        timeout: options.timeout || 10000,
        ...options,
      });

      // Emit successful result
      this.eventEmitter.emit("tool-result", {
        toolName: "search",
        success: true,
        resultCount: result.results?.length || 0,
        timestamp: new Date(),
      });

      return result;
    } catch (error) {
      // Emit error result
      this.eventEmitter.emit("tool-result", {
        toolName: "search",
        success: false,
        error: error.message,
        timestamp: new Date(),
      });
      throw error;
    }
  }

  async extractPageContent(
    url: string,
    options: ExtractionOptions = {}
  ): Promise<PageContent> {
    // Emit tool call event
    this.eventEmitter.emit("tool-call", {
      toolName: "scrape",
      url,
      timestamp: new Date(),
    });

    try {
      const result = await this.steel.scrape({
        url,
        includeMarkdown: true,
        includeImages: options.includeImages || false,
        timeout: options.timeout || 10000,
        ...options,
      });

      // Emit successful result
      this.eventEmitter.emit("tool-result", {
        toolName: "scrape",
        success: true,
        contentLength: result.content?.length || 0,
        timestamp: new Date(),
      });

      return result;
    } catch (error) {
      // Emit error result
      this.eventEmitter.emit("tool-result", {
        toolName: "scrape",
        success: false,
        error: error.message,
        timestamp: new Date(),
      });
      throw error;
    }
  }
}
```

### 3.3 Enhanced Content Evaluator with Learning Extraction

```typescript
import { generateObject } from "ai";
import { z } from "zod";

interface Learning {
  content: string;
  type: "factual" | "analytical" | "procedural" | "statistical";
  entities: string[];
  confidence: number;
  sourceUrl: string;
}

interface ResearchDirection {
  question: string;
  rationale: string;
  priority: "high" | "medium" | "low";
  searchQueries: string[];
}

interface CompletenessAssessment {
  coverage: number;
  knowledgeGaps: string[];
  hasEnoughInfo: boolean;
  recommendedAction: "continue" | "refine" | "synthesize";
}

interface ResearchEvaluation {
  learnings: Learning[];
  researchDirections: ResearchDirection[];
  completenessAssessment: CompletenessAssessment;
  confidenceLevel: number;
}

class ContentEvaluator {
  private readonly MAX_CONTENT_LENGTH = 25000; // TODO: Replace with text splitter/summarizer for large content

  constructor(private provider: Provider, private eventEmitter: EventEmitter) {}

  async evaluateFindings(
    originalQuery: string,
    findings: SearchResult[],
    currentDepth: number,
    maxDepth: number
  ): Promise<ResearchEvaluation> {
    this.eventEmitter.emit("progress", { phase: "evaluating", progress: 75 });

    // TODO: Implement hybrid content processing (text splitter for medium content, summarizer for large content)
    // For now, simple truncation to fit multiple articles in one prompt
    const truncatedFindings = findings.map((finding) => ({
      ...finding,
      content:
        finding.content.length > this.MAX_CONTENT_LENGTH
          ? finding.content.substring(0, this.MAX_CONTENT_LENGTH) + "..."
          : finding.content,
    }));

    const { object } = await generateObject({
      model: this.provider,
      prompt: `Evaluate these research findings for the query: "${originalQuery}"

Current findings:
${truncatedFindings
  .map((f) => `Source: ${f.url}\nContent: ${f.content}`)
  .join("\n---\n")}

Research depth: ${currentDepth}/${maxDepth}

Provide a comprehensive evaluation:
1. Extract key learnings with high specificity (include entities, numbers, dates)
2. Identify research directions that would add significant value
3. Assess completeness and recommend next action`,

      schema: z.object({
        learnings: z.array(
          z.object({
            content: z
              .string()
              .describe("Specific, detailed learning with entities and facts"),
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
            priority: z.enum(["high", "medium", "low"]),
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
        confidenceLevel: z
          .number()
          .min(0)
          .max(1)
          .describe("Overall confidence in findings"),
      }),
    });

    return object;
  }
}
```

### 3.4 Enhanced Content Refiner with Learning Context

```typescript
class ContentRefiner {
  constructor(
    private provider: Provider,
    private planner: QueryPlanner,
    private eventEmitter: EventEmitter
  ) {}

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
      });
      return null;
    }

    if (evaluation.researchDirections.length === 0) {
      // No clear directions identified, proceed to synthesis
      this.eventEmitter.emit("tool-call", {
        toolName: "analyze",
        metadata: {
          decision: "proceed_to_synthesis",
          reason: "no_directions_identified",
        },
        timestamp: new Date(),
      });
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
      },
      timestamp: new Date(),
    });

    return refinedPlan;
  }
}
```

**How the Refiner Works:**

The `ContentRefiner` is the critical decision-making component that determines whether to continue searching or move to synthesis. Here's how it operates:

1. **Input Analysis**: Receives the current research plan, accumulated findings, and evaluation results
2. **Early Termination Check**: Evaluates if we have "enough information" even with remaining depth budget
3. **Gap Analysis**: Identifies specific knowledge gaps that need to be filled
4. **Decision Making**:
   - If `hasEnoughInfo = true`: Returns `null` to trigger synthesis (early termination)
   - If no gaps found: Returns `null` to proceed to synthesis
   - If gaps exist: Works with QueryPlanner to generate targeted follow-up queries
5. **Strategy Refinement**: Creates new sub-queries focused on filling identified gaps
6. **Event Emission**: Broadcasts the decision and reasoning for transparency

This allows the agent to be both thorough and efficient - it won't waste time on unnecessary searches when it has sufficient information, but will dig deeper when knowledge gaps exist.

### 3.5 Enhanced Report Synthesizer with Learning Integration

```typescript
import { streamText } from "ai";

class ReportSynthesizer {
  constructor(
    private writerProvider: Provider, // Separate model for writing
    private eventEmitter: EventEmitter
  ) {}

  async generateReport(
    findings: SearchResult[],
    query: string,
    learnings: Learning[]
  ): Promise<ResearchReport> {
    this.eventEmitter.emit("progress", { phase: "synthesizing", progress: 90 });

    // Organize learnings by type for better report structure
    const factualLearnings = learnings.filter((l) => l.type === "factual");
    const analyticalLearnings = learnings.filter(
      (l) => l.type === "analytical"
    );
    const statisticalLearnings = learnings.filter(
      (l) => l.type === "statistical"
    );

    const stream = await streamText({
      model: this.writerProvider,
      prompt: `Write a comprehensive research report for: "${query}"
      
      Use these structured learnings from research:
      
      FACTUAL FINDINGS:
      ${factualLearnings
        .map((l, i) => `[${i + 1}] ${l.content} (Source: ${l.sourceUrl})`)
        .join("\n")}
      
      ANALYTICAL INSIGHTS:
      ${analyticalLearnings
        .map((l, i) => `[${i + 1}] ${l.content} (Source: ${l.sourceUrl})`)
        .join("\n")}
      
      STATISTICAL DATA:
      ${statisticalLearnings
        .map((l, i) => `[${i + 1}] ${l.content} (Source: ${l.sourceUrl})`)
        .join("\n")}
      
      ALL SOURCES:
      ${findings.map((f, i) => `[${i + 1}] ${f.url}`).join("\n")}
      
      Format:
      - Executive Summary
      - Key Findings (organized by theme)
      - Detailed Analysis with inline citations [1], [2], etc.
      - Statistical Summary (if applicable)
      - Conclusion
      - References section
      
      Use professional, analytical tone. Ensure all major learnings are included.`,
    });

    let content = "";
    for await (const delta of stream.textStream) {
      content += delta;
      // Stream text updates to listeners
      this.eventEmitter.emit("text", delta);
    }

    const report = {
      id: crypto.randomUUID(),
      query,
      executiveSummary: this.extractExecutiveSummary(content),
      content,
      learnings,
      citations: this.extractCitations(findings),
      metadata: {
        generatedAt: new Date(),
        sourceCount: findings.length,
        learningCount: learnings.length,
        model: this.writerProvider.modelId,
      },
    };

    return report;
  }

  private extractExecutiveSummary(content: string): string {
    // Extract the executive summary section
    const lines = content.split("\n");
    const summaryStart = lines.findIndex((line) =>
      line.toLowerCase().includes("executive summary")
    );
    const summaryEnd = lines.findIndex(
      (line, i) => i > summaryStart && line.startsWith("#")
    );

    if (summaryStart === -1) return "No executive summary found";

    return lines
      .slice(
        summaryStart + 1,
        summaryEnd === -1 ? summaryStart + 10 : summaryEnd
      )
      .join("\n")
      .trim();
  }

  private extractCitations(findings: SearchResult[]): Citation[] {
    return findings.map((finding, index) => ({
      id: index + 1,
      url: finding.url,
      title: finding.title || "Untitled",
      accessed: new Date(),
    }));
  }
}
```

## 4. Enhanced API Design

### 4.1 Main Entry Point with Provider Configuration

```typescript
class DeepResearchAgent extends EventEmitter {
  private steelClient: Steel;
  private aiProvider: Provider;
  private aiWriter: Provider;
  private planner: QueryPlanner;
  private searcher: SearchAgent;
  private evaluator: ContentEvaluator;
  private refiner: ContentRefiner;
  private synthesizer: ReportSynthesizer;

  constructor(config: DeepResearchConfig) {
    super();

    // Initialize Steel client
    this.steelClient = new Steel({ apiKey: config.steel.apiKey });

    // Initialize AI providers
    this.aiProvider = this.createProvider(config.ai.provider);
    this.aiWriter = this.createProvider(config.ai.writer);

    // Initialize components
    this.planner = new QueryPlanner(this.aiProvider, this);
    this.searcher = new SearchAgent(this.steelClient, this);
    this.evaluator = new ContentEvaluator(this.aiProvider, this);
    this.refiner = new ContentRefiner(this.aiProvider, this.planner, this);
    this.synthesizer = new ReportSynthesizer(this.aiWriter, this);
  }

  private createProvider(config: ProviderConfig): Provider {
    switch (config.name) {
      case "openai":
        return createOpenAI({ apiKey: config.apiKey })(config.model);
      case "anthropic":
        return createAnthropic({ apiKey: config.apiKey })(config.model);
      case "together":
        return createTogether({ apiKey: config.apiKey })(config.model);
      default:
        throw new Error(`Unsupported provider: ${config.name}`);
    }
  }

  async research(
    query: string,
    options: ResearchOptions = {}
  ): Promise<ResearchReport> {
    // Main research pipeline with enhanced evaluation and learning context
    const plan = await this.planner.planResearch(
      query,
      options.depth || 3,
      options.breadth || 5
    );
    let findings: SearchResult[] = [];
    let allLearnings: Learning[] = [];
    let currentDepth = 0;

    while (currentDepth < (options.depth || 3)) {
      // Execute searches for current depth
      const searchResults = await this.executeSearches(plan, currentDepth);
      findings.push(...searchResults);

      // Enhanced evaluation with learning extraction
      const evaluation = await this.evaluator.evaluateFindings(
        query,
        findings,
        currentDepth,
        options.depth || 3
      );

      // Accumulate learnings
      allLearnings.push(...evaluation.learnings);

      // Check if refiner says we can terminate early
      const refinedPlan = await this.refiner.refineSearchStrategy(
        query,
        evaluation,
        plan
      );

      if (!refinedPlan) {
        // Early termination or no more gaps to fill
        break;
      }

      // Continue with refined plan
      plan = refinedPlan;
      currentDepth++;
    }

    // TODO: Add source ranking here
    // const rankedSources = await this.rankSources(findings, allLearnings);

    // Generate final report with all learnings
    const report = await this.synthesizer.generateReport(
      findings,
      query,
      allLearnings
    );
    this.emit("done", report);
    return report;
  }

  async *researchStream(
    query: string,
    options: ResearchOptions = {}
  ): AsyncGenerator<ResearchUpdate> {
    // Streaming version that yields updates
    // Implementation similar to above but with yield statements
  }
}
```

### 4.2 Usage Example with Event Listeners

```typescript
// Usage example similar to the beam pattern
const agent = new DeepResearchAgent({
  steel: {
    apiKey: process.env.STEEL_API_KEY,
  },
  ai: {
    provider: {
      name: "openai",
      apiKey: process.env.OPENAI_API_KEY,
      model: "gpt-4o",
    },
    writer: {
      name: "anthropic",
      apiKey: process.env.ANTHROPIC_API_KEY,
      model: "claude-3-5-sonnet-20241022",
    },
  },
  search: {
    maxDepth: 3,
    maxBreadth: 5,
    timeout: 30000,
    retryAttempts: 3,
  },
});

// Set up event listeners for real-time updates
agent.on("text", (content) => process.stdout.write(content)); // Stream text output
agent.on("tool-call", (toolCall) => {
  console.log(`🔧 Using tool: ${toolCall.toolName}`);
  if (toolCall.query) console.log(`   Query: ${toolCall.query}`);
  if (toolCall.url) console.log(`   URL: ${toolCall.url}`);
});
agent.on("tool-result", (result) => {
  console.log(
    `✅ Tool ${result.toolName} ${result.success ? "succeeded" : "failed"}`
  );
  if (result.resultCount) console.log(`   Found ${result.resultCount} results`);
});
agent.on("error", (error) => console.error("❌ Error:", error));
agent.on("done", (result) =>
  console.log("✨ Task completed:", result.executiveSummary)
);
agent.on("progress", (progress) =>
  console.log(`📊 Progress: ${progress.phase} (${progress.progress}%)`)
);

// Execute research
const report = await agent.research(
  "What is the current state of AI in healthcare?",
  {
    depth: 3,
    breadth: 5,
  }
);
```

## 5. Updated Dependencies

```json
{
  "dependencies": {
    "@types/node": "^20.10.0",
    "steel-sdk": "^0.7.0",
    "ai": "^4.0.0",
    "@ai-sdk/openai": "^1.0.0",
    "@ai-sdk/anthropic": "^1.0.0",
    "@ai-sdk/together": "^1.0.0",
    "chalk": "^5.3.0",
    "commander": "^11.1.0",
    "dotenv": "^16.3.0",
    "eventemitter3": "^5.0.0",
    "inquirer": "^9.2.0",
    "marked": "^10.0.0",
    "node-cache": "^5.1.0",
    "ora": "^7.0.0",
    "winston": "^3.11.0",
    "zod": "^3.22.0"
  },
  "devDependencies": {
    "@types/inquirer": "^9.0.0",
    "jest": "^29.7.0",
    "ts-jest": "^29.1.0",
    "typescript": "^5.3.0"
  }
}
```

## 6. Enhanced Terminal UI with Tool Feedback

```typescript
class TerminalUI {
  private agent: DeepResearchAgent;
  private spinner: ora.Ora;

  constructor(agent: DeepResearchAgent) {
    this.agent = agent;
    this.setupEventListeners();
  }

  private setupEventListeners() {
    this.agent.on("text", (content) => {
      if (this.spinner) {
        this.spinner.stop();
      }
      process.stdout.write(content);
    });

    this.agent.on("tool-call", (toolCall) => {
      const message = this.formatToolCall(toolCall);
      this.spinner = ora(message).start();
    });

    this.agent.on("tool-result", (result) => {
      if (this.spinner) {
        if (result.success) {
          this.spinner.succeed(this.formatToolResult(result));
        } else {
          this.spinner.fail(`${result.toolName} failed: ${result.error}`);
        }
      }
    });

    this.agent.on("progress", (progress) => {
      if (this.spinner) {
        this.spinner.text = `${progress.phase} (${progress.progress}%)`;
      }
    });
  }

  private formatToolCall(toolCall: ToolCallEvent): string {
    switch (toolCall.toolName) {
      case "search":
        return `🔍 Searching: "${toolCall.query}"`;
      case "scrape":
        return `📄 Scraping: ${toolCall.url}`;
      case "analyze":
        return `🧠 Analyzing research progress`;
      default:
        return `🔧 Using ${toolCall.toolName}`;
    }
  }

  private formatToolResult(result: ToolResultEvent): string {
    switch (result.toolName) {
      case "search":
        return `Found ${result.resultCount} search results`;
      case "scrape":
        return `Extracted ${result.contentLength} characters`;
      case "analyze":
        return `Analysis complete`;
      default:
        return `${result.toolName} completed`;
    }
  }
}
```

## 7. Enhanced Interface Definitions

```typescript
interface ResearchReport {
  id: string;
  query: string;
  executiveSummary: string;
  content: string;
  learnings: Learning[];
  citations: Citation[];
  metadata: {
    generatedAt: Date;
    sourceCount: number;
    learningCount: number;
    model: string;
  };
}

interface Citation {
  id: number;
  url: string;
  title: string;
  accessed: Date;
}

interface SearchResult {
  url: string;
  title?: string;
  content: string;
  summary?: string;
}

interface SearchStrategy {
  maxDepth: number;
  maxBreadth: number;
  searchType: "comprehensive" | "focused";
  timeout: number;
}

interface ResearchOptions {
  depth?: number;
  breadth?: number;
  includeImages?: boolean;
  humanInTheLoop?: boolean;
}
```

## 8. Key Improvements Summary

### ✅ Major Enhancements from Analysis:

1. **Learning-Based Evaluation**: Extracts specific learnings with entities, confidence scores, and types instead of simple boolean decisions
2. **Research Direction Guidance**: Evaluator provides specific follow-up questions and research directions for the planner
3. **Content Management**: Simple text truncation with TODO for future text splitter/summarizer implementation
4. **Enhanced Planner Feedback**: Rich context including previous learnings and targeted research directions
5. **Structured Report Generation**: Organizes learnings by type (factual, analytical, statistical) for better reports

### ✅ Previously Addressed Feedback:

1. **Steel Node SDK Integration**: Using the official `steel-sdk` package with simple `.scrape()` calls
2. **AI SDK Integration**: Leveraging `ai` package for provider abstraction and streaming
3. **Configurable Providers**: Separate provider and writer models configurable at the high level
4. **Enhanced Event System**: Rich tool call events showing search queries, scraped URLs, and analysis decisions
5. **Beam-like Streaming**: Event pattern similar to the example with `text`, `tool-call`, `tool-result`, `error`, and `done` events

### 🔧 Technical Architecture:

- **Learning Accumulation**: Maintains context across iterations with typed learning objects
- **Smart Termination**: Multiple criteria including coverage assessment and research direction availability
- **Provider Flexibility**: Easy to swap between OpenAI, Anthropic, Together, etc.
- **Tool Transparency**: Frontend can show exactly what tools are being used and with what parameters
- **Streaming Text**: Real-time text generation output
- **Rich Metadata**: Comprehensive tool call and result metadata for debugging and UX

### 🚀 Future Enhancements (TODOs):

- **Hybrid Content Processing**: Text splitter for medium content, summarizer for large content
- **Source Quality Ranking**: Rank and filter sources based on relevance and credibility
- **Advanced Caching**: Cache search results for efficiency and cost control

This enhanced specification incorporates lessons from world-class research agents while maintaining simplicity for initial implementation. The learning-based evaluation system provides much richer feedback to guide the research process effectively.
