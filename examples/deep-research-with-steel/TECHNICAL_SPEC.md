# Deep Research Agent with Steel - Technical Specification (Updated)

## 1. Overview and Goals

### Primary Goal

Build a production-ready Deep Research agent that leverages Steel's SDK for web scraping and AI SDK for LLM integration, implementing the core agentic loop architecture from Together AI's Open Deep Research.

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

### 3.1 Query Planner (with AI SDK)

```typescript
import { generateText } from "ai";

class QueryPlanner {
  constructor(private provider: Provider, private eventEmitter: EventEmitter) {}

  async planResearch(
    query: string,
    depth: number,
    breadth: number
  ): Promise<ResearchPlan> {
    this.eventEmitter.emit("progress", { phase: "planning", progress: 0 });

    const { text } = await generateText({
      model: this.provider,
      prompt: `Decompose this research query into ${breadth} specific sub-questions: "${query}"
      
      Consider:
      - Different angles and perspectives
      - Factual vs. analytical aspects
      - Current vs. historical context
      - Priority order for research
      
      Return a JSON array of sub-queries with priority scores.`,
    });

    const subQueries = this.parseSubQueries(text);

    return {
      id: crypto.randomUUID(),
      originalQuery: query,
      subQueries,
      searchStrategy: this.determineStrategy(query, depth, breadth),
      estimatedSteps: subQueries.length * depth,
    };
  }

  async refineQueries(
    currentPlan: ResearchPlan,
    findings: SearchResult[]
  ): Promise<ResearchPlan> {
    // Called by ContentRefiner to adjust search strategy
    this.eventEmitter.emit("progress", { phase: "refining", progress: 50 });

    const { text } = await generateText({
      model: this.provider,
      prompt: `Given these research findings, what additional queries should we explore?
      
      Original query: ${currentPlan.originalQuery}
      Current findings: ${findings.map((f) => f.summary).join("\n")}
      
      Suggest 2-3 new specific queries to fill knowledge gaps.`,
    });

    const newQueries = this.parseSubQueries(text);

    return {
      ...currentPlan,
      subQueries: [...currentPlan.subQueries, ...newQueries],
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

### 3.3 Content Evaluator (Enhanced Early Termination)

```typescript
class ContentEvaluator {
  constructor(private provider: Provider, private eventEmitter: EventEmitter) {}

  async evaluateCompleteness(
    plan: ResearchPlan,
    findings: SearchResult[],
    currentDepth: number
  ): Promise<EvaluationResult> {
    this.eventEmitter.emit("progress", { phase: "evaluating", progress: 75 });

    const { text } = await generateText({
      model: this.provider,
      prompt: `Evaluate if we have enough information to answer: "${
        plan.originalQuery
      }"
      
      Current findings: ${findings.map((f) => f.summary).join("\n")}
      Current depth: ${currentDepth}/${plan.searchStrategy.maxDepth}
      
      Consider:
      1. Coverage of main aspects
      2. Quality of sources
      3. Factual completeness
      4. Analytical depth
      
      Return JSON with:
      - completeness: 0-1 score
      - quality: 0-1 score  
      - hasEnoughInfo: boolean (true if we can proceed even with remaining depth)
      - gaps: array of missing information
      - recommendedActions: array of next steps`,
    });

    const evaluation = JSON.parse(text);

    return {
      completeness: evaluation.completeness,
      quality: evaluation.quality,
      hasEnoughInfo: evaluation.hasEnoughInfo, // KEY: Can terminate early
      gaps: evaluation.gaps,
      recommendedActions: evaluation.recommendedActions,
    };
  }
}
```

### 3.4 Content Refiner (NEW - Explanation Added)

```typescript
class ContentRefiner {
  constructor(
    private provider: Provider,
    private planner: QueryPlanner,
    private eventEmitter: EventEmitter
  ) {}

  async refineSearchStrategy(
    plan: ResearchPlan,
    findings: SearchResult[],
    evaluation: EvaluationResult
  ): Promise<ResearchPlan | null> {
    this.eventEmitter.emit("progress", { phase: "refining", progress: 60 });

    // The Refiner decides if we need more searches based on evaluation
    if (evaluation.hasEnoughInfo) {
      // Early termination - we have sufficient information
      return null;
    }

    if (evaluation.gaps.length === 0) {
      // No clear gaps identified, proceed to synthesis
      return null;
    }

    // Generate refined queries to fill specific gaps
    const refinedPlan = await this.planner.refineQueries(plan, findings);

    // Emit refined strategy
    this.eventEmitter.emit("tool-call", {
      toolName: "analyze",
      metadata: {
        gaps: evaluation.gaps,
        newQueries: refinedPlan.subQueries.length - plan.subQueries.length,
      },
      timestamp: new Date(),
    });

    return refinedPlan;
  }
}
```

**How the Refiner Works:**
The `ContentRefiner` is the decision-making component that determines whether to continue searching or move to synthesis. It:

1. Receives evaluation results from the `ContentEvaluator`
2. Checks if we have "enough info" even with remaining depth budget
3. Identifies specific knowledge gaps that need filling
4. Works with the `QueryPlanner` to generate targeted follow-up queries
5. Returns `null` when no more searching is needed (triggering synthesis)
6. Enables early termination when quality threshold is met

### 3.5 Report Synthesizer (AI SDK Integration)

```typescript
import { streamText } from "ai";

class ReportSynthesizer {
  constructor(
    private writerProvider: Provider, // Separate model for writing
    private eventEmitter: EventEmitter
  ) {}

  async generateReport(
    findings: SearchResult[],
    query: string
  ): Promise<ResearchReport> {
    this.eventEmitter.emit("progress", { phase: "synthesizing", progress: 90 });

    const stream = await streamText({
      model: this.writerProvider,
      prompt: `Write a comprehensive research report for: "${query}"
      
      Use these findings: ${findings
        .map((f) => `${f.summary} [${f.url}]`)
        .join("\n")}
      
      Format:
      - Executive Summary
      - Detailed Analysis with inline citations [1], [2], etc.
      - Conclusion
      - References section
      
      Use professional, analytical tone.`,
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
      citations: this.extractCitations(findings),
      metadata: {
        generatedAt: new Date(),
        sourceCount: findings.length,
        model: this.writerProvider.modelId,
      },
    };

    return report;
  }
}
```

## 4. Enhanced API Design

### 4.1 Main Entry Point with Provider Configuration

```typescript
class DeepResearchAgent extends EventEmitter {
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
    options?: ResearchOptions
  ): Promise<ResearchReport> {
    // Main research pipeline with early termination support
    const plan = await this.planner.planResearch(
      query,
      options.depth || 3,
      options.breadth || 5
    );
    let findings: SearchResult[] = [];
    let currentDepth = 0;

    while (currentDepth < options.depth) {
      // Execute searches for current depth
      const searchResults = await this.executeSearches(plan, currentDepth);
      findings.push(...searchResults);

      // Evaluate if we have enough information
      const evaluation = await this.evaluator.evaluateCompleteness(
        plan,
        findings,
        currentDepth
      );

      // Check if refiner says we can terminate early
      const refinedPlan = await this.refiner.refineSearchStrategy(
        plan,
        findings,
        evaluation
      );

      if (!refinedPlan) {
        // Early termination or no more gaps to fill
        break;
      }

      // Continue with refined plan
      plan = refinedPlan;
      currentDepth++;
    }

    // Generate final report
    const report = await this.synthesizer.generateReport(findings, query);
    this.emit("done", report);
    return report;
  }

  async *researchStream(
    query: string,
    options?: ResearchOptions
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
});

// Set up event listeners for real-time updates
agent.on("text", (content) => process.stdout.write(content)); // Stream text output
agent.on("tool-call", (toolCall) =>
  console.log(
    `Using tool: ${toolCall.toolName} with ${toolCall.query || toolCall.url}`
  )
);
agent.on("tool-result", (result) =>
  console.log(
    `Tool ${result.toolName} ${result.success ? "succeeded" : "failed"}`
  )
);
agent.on("error", (error) => console.error("Error:", error));
agent.on("done", (result) =>
  console.log("Task completed:", result.executiveSummary)
);
agent.on("progress", (progress) =>
  console.log(`Progress: ${progress.phase} (${progress.progress}%)`)
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

## 6. Implementation Plan

### Phase 1: Core Infrastructure (Week 1-2)

- [ ] Set up TypeScript project structure
- [ ] Implement basic Steel client
- [ ] Create core interfaces and types
- [ ] Set up logging and configuration

### Phase 2: Core Components (Week 3-4)

- [ ] Implement Query Planner
- [ ] Build Search Agent with Steel integration
- [ ] Create Content Evaluator
- [ ] Develop Report Synthesizer

### Phase 3: Integration & Testing (Week 5-6)

- [ ] Integrate all components into main agent
- [ ] Implement event system and streaming
- [ ] Add comprehensive error handling
- [ ] Create unit and integration tests

### Phase 4: Terminal UI & Demo (Week 7-8)

- [ ] Build terminal UI with inquirer
- [ ] Add progress indicators and streaming display
- [ ] Implement HITL confirmation
- [ ] Polish user experience

### Phase 5: Production Ready (Week 9-10)

- [ ] Add caching and rate limiting
- [ ] Implement health checks
- [ ] Add monitoring and metrics
- [ ] Create deployment documentation

## 7. Demo Terminal UI

### 7.1 Interactive CLI

```typescript
import { Command } from "commander";
import inquirer from "inquirer";
import ora from "ora";
import chalk from "chalk";

class TerminalUI {
  private agent: DeepResearchAgent;

  constructor(agent: DeepResearchAgent) {
    this.agent = agent;
  }

  async run(): Promise<void> {
    console.log(chalk.blue.bold("🔍 Deep Research Agent with Steel"));
    console.log(chalk.gray("Powered by Steel API for web scraping\n"));

    const answers = await inquirer.prompt([
      {
        type: "input",
        name: "query",
        message: "What would you like to research?",
        validate: (input: string) => input.trim().length > 0,
      },
      {
        type: "number",
        name: "depth",
        message: "Research depth (1-5):",
        default: 3,
        validate: (input: number) => input >= 1 && input <= 5,
      },
      {
        type: "number",
        name: "breadth",
        message: "Search breadth (1-10):",
        default: 5,
        validate: (input: number) => input >= 1 && input <= 10,
      },
      {
        type: "confirm",
        name: "includeImages",
        message: "Include images in analysis?",
        default: false,
      },
      {
        type: "confirm",
        name: "humanInTheLoop",
        message: "Enable human-in-the-loop confirmation?",
        default: false,
      },
    ]);

    await this.executeResearch(answers);
  }

  private async executeResearch(options: any): Promise<void> {
    const spinner = ora("Initializing research...").start();

    try {
      const researchStream = this.agent.researchStream(options.query, {
        depth: options.depth,
        breadth: options.breadth,
        includeImages: options.includeImages,
        humanInTheLoop: options.humanInTheLoop,
      });

      for await (const update of researchStream) {
        this.handleUpdate(update, spinner);
      }

      spinner.succeed("Research completed!");
    } catch (error) {
      spinner.fail(`Research failed: ${error.message}`);
    }
  }

  private handleUpdate(update: ResearchUpdate, spinner: ora.Ora): void {
    const { event, phase, progress, data } = update;

    switch (event) {
      case "planning":
        spinner.text = `Planning research strategy...`;
        break;
      case "searching":
        spinner.text = `Searching: ${data?.query || "unknown"}`;
        break;
      case "evaluating":
        spinner.text = `Evaluating sources (${progress}%)...`;
        break;
      case "synthesizing":
        spinner.text = `Generating report...`;
        break;
      case "complete":
        this.displayReport(data);
        break;
      case "error":
        spinner.fail(`Error in ${phase}: ${data?.message}`);
        break;
    }
  }

  private displayReport(report: ResearchReport): void {
    console.log("\n" + chalk.green.bold("📋 Research Report"));
    console.log(chalk.gray("─".repeat(50)));
    console.log(report.content);
    console.log("\n" + chalk.blue.bold("📚 Citations"));
    console.log(chalk.gray("─".repeat(50)));
    report.citations.forEach((citation, index) => {
      console.log(`${index + 1}. ${citation.title} - ${citation.url}`);
    });
  }
}
```

### 7.2 Command Line Interface

```typescript
const program = new Command();

program
  .name("deep-research")
  .description("Deep Research Agent with Steel integration")
  .version("1.0.0");

program
  .command("research")
  .description("Start interactive research session")
  .option("-q, --query <query>", "Research query")
  .option("-d, --depth <depth>", "Research depth", "3")
  .option("-b, --breadth <breadth>", "Search breadth", "5")
  .option("--config <config>", "Configuration file path")
  .action(async (options) => {
    const config = await loadConfig(options.config);
    const agent = new DeepResearchAgent(config);

    if (options.query) {
      await agent.research(options.query, {
        depth: parseInt(options.depth),
        breadth: parseInt(options.breadth),
      });
    } else {
      const ui = new TerminalUI(agent);
      await ui.run();
    }
  });

program.parse();
```

## 8. Human-in-the-Loop Integration

### 8.1 Report Confirmation

```typescript
interface HITLConfirmation {
  approved: boolean;
  feedback?: string;
  suggestedChanges?: string[];
}

class HITLManager {
  async confirmReport(report: ResearchReport): Promise<HITLConfirmation> {
    console.log("\n" + chalk.yellow.bold("👤 Human Review Required"));
    console.log(chalk.gray("─".repeat(50)));
    console.log(report.executiveSummary);

    const answers = await inquirer.prompt([
      {
        type: "confirm",
        name: "approved",
        message: "Approve this report?",
        default: true,
      },
      {
        type: "input",
        name: "feedback",
        message: "Any feedback for improvement?",
        when: (answers) => !answers.approved,
      },
    ]);

    return answers as HITLConfirmation;
  }
}
```

## 9. Testing Strategy

### 9.1 Unit Tests

```typescript
// tests/unit/QueryPlanner.test.ts
import { QueryPlanner } from "../../src/agents/QueryPlanner";

describe("QueryPlanner", () => {
  test("should decompose complex query into sub-queries", async () => {
    const planner = new QueryPlanner();
    const plan = await planner.planResearch(
      "What is the impact of AI on healthcare?",
      3,
      5
    );

    expect(plan.subQueries).toHaveLength(5);
    expect(plan.subQueries[0].query).toContain("AI healthcare");
  });
});
```

### 9.2 Integration Tests

```typescript
// tests/integration/SteelClient.test.ts
import { SteelClient } from "../../src/clients/SteelClient";

describe("SteelClient Integration", () => {
  test("should fetch SERP results", async () => {
    const client = new SteelClient(process.env.STEEL_API_KEY!);
    const result = await client.searchSERP("artificial intelligence");

    expect(result.results).toBeDefined();
    expect(result.results.length).toBeGreaterThan(0);
  });
});
```

### 9.3 End-to-End Tests

```typescript
// tests/e2e/DeepResearchAgent.test.ts
import { DeepResearchAgent } from "../../src/agents/DeepResearchAgent";

describe("DeepResearchAgent E2E", () => {
  test("should complete full research cycle", async () => {
    const agent = new DeepResearchAgent(testConfig);
    const report = await agent.research(
      "What are the benefits of TypeScript?",
      {
        depth: 2,
        breadth: 3,
      }
    );

    expect(report.content).toBeDefined();
    expect(report.citations.length).toBeGreaterThan(0);
  });
});
```

## 10. Performance and Optimization

### 10.1 Caching Strategy

```typescript
import NodeCache from "node-cache";

class CacheManager {
  private cache: NodeCache;

  constructor(ttl: number = 3600) {
    this.cache = new NodeCache({ stdTTL: ttl });
  }

  async get<T>(key: string): Promise<T | undefined> {
    return this.cache.get<T>(key);
  }

  async set<T>(key: string, value: T, ttl?: number): Promise<void> {
    this.cache.set(key, value, ttl);
  }

  generateKey(query: string, options: any): string {
    return `${query}:${JSON.stringify(options)}`;
  }
}
```

### 10.2 Rate Limiting

```typescript
class RateLimiter {
  private requests: Map<string, number[]> = new Map();

  async checkLimit(
    key: string,
    limit: number,
    window: number
  ): Promise<boolean> {
    const now = Date.now();
    const requests = this.requests.get(key) || [];

    // Remove old requests outside the window
    const validRequests = requests.filter((time) => now - time < window);

    if (validRequests.length >= limit) {
      return false;
    }

    validRequests.push(now);
    this.requests.set(key, validRequests);
    return true;
  }
}
```

## 11. Deployment and Production Considerations

### 11.1 Environment Configuration

```typescript
// .env.example
STEEL_API_KEY = your_steel_api_key;
OPENAI_API_KEY = your_openai_api_key;
LOG_LEVEL = info;
CACHE_TTL = 3600;
MAX_CONCURRENT_REQUESTS = 5;
```

### 11.2 Logging and Monitoring

```typescript
import winston from "winston";

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || "info",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: "deep-research.log" }),
  ],
});

export { logger };
```

### 11.3 Health Checks

```typescript
class HealthChecker {
  async checkHealth(): Promise<HealthStatus> {
    const checks = await Promise.allSettled([
      this.checkSteelAPI(),
      this.checkLLMAPI(),
      this.checkCache(),
    ]);

    return {
      status: checks.every((check) => check.status === "fulfilled")
        ? "healthy"
        : "unhealthy",
      checks: checks.map((check, index) => ({
        service: ["steel", "llm", "cache"][index],
        status: check.status,
        error: check.status === "rejected" ? check.reason : undefined,
      })),
    };
  }
}
```

## 12. Extensibility and Future Enhancements

### 12.1 Plugin System

```typescript
interface Plugin {
  name: string;
  version: string;
  hooks: {
    beforeSearch?: (query: string) => Promise<string>;
    afterSearch?: (results: SearchResult[]) => Promise<SearchResult[]>;
    beforeSynthesize?: (content: string) => Promise<string>;
    afterSynthesize?: (report: ResearchReport) => Promise<ResearchReport>;
  };
}

class PluginManager {
  private plugins: Plugin[] = [];

  register(plugin: Plugin): void {
    this.plugins.push(plugin);
  }

  async executeHook(hookName: string, data: any): Promise<any> {
    for (const plugin of this.plugins) {
      const hook = plugin.hooks[hookName];
      if (hook) {
        data = await hook(data);
      }
    }
    return data;
  }
}
```

### 12.2 Multi-Modal Support

```typescript
interface MultiModalContent {
  text: string;
  images: ImageContent[];
  audio?: AudioContent;
  video?: VideoContent;
}

class MultiModalProcessor {
  async processImage(imageUrl: string): Promise<ImageAnalysis> {
    // Integrate with vision models
  }

  async processAudio(audioUrl: string): Promise<AudioTranscription> {
    // Integrate with speech-to-text
  }
}
```

## 13. Success Metrics and KPIs

### 13.1 Quality Metrics

- **Citation Accuracy**: Percentage of valid, working citations
- **Content Relevance**: Semantic similarity to query intent
- **Completeness**: Coverage of query aspects
- **Freshness**: Recency of source material

### 13.2 Performance Metrics

- **Response Time**: End-to-end research completion time
- **Steel API Utilization**: Requests per minute, success rate
- **Cache Hit Rate**: Percentage of cached responses
- **Error Rate**: Failed requests per total requests

### 13.3 User Experience Metrics

- **User Satisfaction**: Ratings and feedback
- **Task Completion Rate**: Successful research sessions
- **Feature Adoption**: Usage of advanced features
- **Return Usage**: Repeat user sessions

## 14. Conclusion

This specification provides a comprehensive blueprint for building a production-ready Deep Research agent with Steel integration. The modular architecture ensures extensibility, while the TypeScript implementation provides type safety and maintainability. The terminal UI demo will showcase the agent's capabilities, and the robust testing strategy ensures reliability.

The agent will effectively demonstrate Steel's capabilities while providing a valuable tool for complex research tasks. The event-driven architecture enables real-time progress tracking and streaming capabilities, making it suitable for both programmatic use and interactive applications.

Key deliverables:

1. Core agent implementation with Steel integration
2. Terminal UI for demonstration
3. Comprehensive test suite
4. Documentation and examples
5. Performance optimization and monitoring
6. Extensible plugin system for future enhancements

This specification serves as the foundation for implementation and can be refined based on specific requirements and feedback during development.
