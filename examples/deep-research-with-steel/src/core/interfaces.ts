/**
 * Deep Research Agent Core Interfaces
 *
 * OVERVIEW:
 * This file defines all the TypeScript interfaces, types, and data structures used
 * throughout the Deep Research system. It provides type safety and clear contracts
 * between different components of the system.
 *
 * KEY INTERFACE CATEGORIES:
 *
 * 1. CONFIGURATION INTERFACES:
 *    - DeepResearchConfig: Main configuration for providers and search settings
 *    - ResearchOptions: User-configurable research parameters
 *    - Various provider and search options
 *
 * 2. RESEARCH PLANNING INTERFACES:
 *    - ResearchPlan: Contains sub-queries and search strategy
 *    - SubQuery: Individual search query with priority and metadata
 *    - SearchStrategy: Configuration for search execution
 *
 * 3. SEARCH RESULT INTERFACES:
 *    - SearchResult: Individual search result with content and metadata
 *    - SERPResult: Search engine results page response
 *    - PageContent: Extracted content from web pages
 *
 * 4. EVALUATION INTERFACES:
 *    - ResearchEvaluation: Comprehensive evaluation of research findings
 *    - Learning: Individual knowledge extracted from content
 *    - ResearchDirection: Suggested follow-up research questions
 *    - CompletenessAssessment: Analysis of research completeness
 *    - RefinementDecision: Strategic decision making for research continuation
 *
 * 5. REPORT INTERFACES:
 *    - ResearchReport: Final generated report with citations
 *    - Citation: Individual source citation information
 *
 * 6. EVENT INTERFACES:
 *    - Event types for real-time system feedback
 *    - Progress tracking and tool call events
 *
 * 7. VALIDATION SCHEMAS:
 *    - Zod schemas for runtime validation
 *    - Type guards for type checking
 *
 * The interfaces follow a consistent pattern:
 * - Clear naming conventions
 * - Comprehensive metadata fields
 * - Flexible configuration options
 * - Strong typing with optional fields where appropriate
 * - Built-in validation and defaults
 */

import { z } from "zod";
import type { LanguageModel } from "ai";

// Configuration interfaces
export interface DeepResearchConfig {
  /**
   * 🔧 REQUIRED: Direct AI provider to be used for all LLM calls when
   * individual task-specific models are not supplied.
   */
  aiProvider: LanguageModel;

  /**
   * 🎛️  ADVANCED: Task-specific models.  Any model left undefined will fall
   * back to `aiProvider` above.
   */
  models?: {
    planner?: LanguageModel;
    evaluator?: LanguageModel; // THE BRAIN
    writer?: LanguageModel;
    summary?: LanguageModel;
  };

  /** 🔑 REQUIRED – Steel scraping API key */
  steelApiKey: string;

  /** ✅ PRESERVED – Step 8 research configuration  */
  research?: {
    maxSources?: number; // Default 60 – memory limit
    summaryTokens?: number; // Default 500 – tokens per summary
    timeout?: number; // Default 30000ms – Steel/network timeout
    retryAttempts?: number; // Default 3 – Steel retry attempts
  };
}

// Research plan interfaces
export interface SubQuery {
  id: string;
  query: string;
}

// Free-form research plan (strategic thinking step)
export interface FreeFormResearchPlan {
  id: string;
  originalQuery: string;
  strategicPlan: string; // Free-form strategic thinking text
  approach: string; // Overall approach description
  estimatedSteps: number;
  createdAt: Date;
}

// Structured queries generated from the plan
export interface QueriesFromPlan {
  queries: string[];
  strategy: {
    searchType: "comprehensive" | "focused";
    approach: string;
  };
  estimatedSteps: number;
}

export interface ResearchPlan {
  id: string;
  originalQuery: string;
  subQueries: SubQuery[];
  searchStrategy: SearchStrategy;
  estimatedSteps: number;
  strategicPlan?: string; // Optional free-form plan text
}

export interface SearchStrategy {
  maxDepth: number;
  maxBreadth: number;
  timeout: number;
  retryAttempts: number;
}

// Search result interfaces
export interface SearchResult {
  id: string;
  query: string;
  url: string;
  title: string;
  content: string;
  summary: string;
  relevanceScore: number;
  timestamp: Date;
  metadata?: Record<string, any>;
}

// NEW: RefinedContent interface as per PRD Component E
export interface RefinedContent {
  title: string;
  url: string;
  summary: string; // ≤ summaryTokens (default 500)
  rawLength: number; // Original content length before summarization
  scrapedAt: Date;
}

export interface SERPResult {
  results: SearchResult[];
  totalResults: number;
  searchTime: number;
  query: string;
}

export interface PageContent {
  url: string;
  title: string;
  content: string;
  markdown?: string;
  images?: string[];
  metadata?: Record<string, any>;
}

// Evaluation interfaces
export interface EvaluationResult {
  completeness: number; // 0-1 score
  quality: number; // 0-1 score
  hasEnoughInfo: boolean; // Can terminate early
  gaps: string[]; // Missing information
  recommendedActions: string[]; // Next steps
}

// Enhanced evaluation interfaces for ContentEvaluator
export interface Learning {
  content: string;
  type: "factual" | "analytical" | "procedural" | "statistical";
  entities: string[];
  confidence: number;
  sourceUrl: string;
}

export interface ResearchDirection {
  question: string;
  rationale: string;
  searchQueries: string[];
  buildsUpon?: string[]; // NEW: Which existing learnings this builds on
  expectedLearningType?:
    | "factual"
    | "analytical"
    | "statistical"
    | "procedural"; // NEW: Expected type of learning
}

export interface CompletenessAssessment {
  coverage: number;
  confidence: number; // NEW: Confidence in findings quality (0-1)
  knowledgeGaps: string[];
  hasEnoughInfo: boolean;
  recommendedAction: "continue" | "synthesize"; // Simplified for THE BRAIN architecture
  reasoning: string; // NEW: Detailed reasoning for the recommendation
}

export interface ResearchEvaluation {
  learnings: Learning[];
  researchDirections: ResearchDirection[];
  completenessAssessment: CompletenessAssessment;
}

// NEW: RefinementDecision interface for strategic decision making
export interface RefinementDecision {
  shouldContinue: boolean;
  reason: string; // Why continue/terminate
  researchDirections: ResearchDirection[]; // What to research next
  strategicGuidance: string; // How to approach next iteration
  confidence: number; // Confidence in decision (0-1)
  terminationMetadata?: {
    // Additional context for decisions
    coverageAchieved: number;
    learningsCount: number;
    iterationsCompleted: number;
  };
}

// Report interfaces
export interface Citation {
  id: string;
  url: string;
  title: string;
  accessDate: Date;
  relevantQuote?: string;
}

export interface ResearchReport {
  id: string;
  query: string;
  executiveSummary: string;
  content: string;
  citations: Citation[];
  metadata: {
    generatedAt: Date;
    sourceCount: number;
    model: string;
    researchDepth: number;
  };
}

// Options interfaces
export interface ResearchOptions {
  depth?: number;
  breadth?: number;
  timeout?: number;
  includeImages?: boolean;
  humanInTheLoop?: boolean;
  followUpDialogue?: import("ai").CoreMessage[]; // Optional AI SDK message list for query clarification
  maxSources?: number; // Maximum accumulated sources before termination (default 60)
  summaryTokens?: number; // Maximum tokens per summary (default 500)
}

export interface SERPOptions {
  timeout?: number;
  maxResults?: number;
  includeSnippets?: boolean;
  summaryTokens?: number; // Default 500 - max tokens for LLM summarization
  streaming?: boolean; // Enable streaming for real-time summarization updates
  scrapedUrls?: Set<string>; // NEW: URLs already scraped across research iterations (for deduplication)
}

export interface ExtractionOptions {
  timeout?: number;
  includeImages?: boolean;
  includeMarkdown?: boolean;
  summaryTokens?: number; // Default 500 - max tokens for LLM summarization
  streaming?: boolean; // Enable streaming for real-time summarization updates
}

// Event interfaces
export type ResearchEvent =
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

// Progress events for research phases
export interface ResearchProgressEvent extends BaseEvent {
  type: "research-progress";
  phase:
    | "initialization"
    | "planning"
    | "searching"
    | "evaluating"
    | "refining"
    | "synthesizing"
    | "complete";
  progress: number; // 0-100
  currentStep?: string;
  totalSteps?: number;
  stepProgress?: number; // Progress within current step
}

// Text streaming events for real-time content generation
export interface TextStreamEvent extends BaseEvent {
  type: "text-stream";
  content: string;
  source: "synthesis" | "analysis" | "planning";
  isComplete: boolean;
  chunkIndex?: number;
}

// Research milestone events
export interface ResearchMilestoneEvent extends BaseEvent {
  type: "research-milestone";
  milestone:
    | "plan-created"
    | "search-completed"
    | "evaluation-completed"
    | "refinement-completed"
    | "report-generated";
  data: any;
  summary?: string;
}

// Error events
export interface ResearchErrorEvent extends BaseEvent {
  type: "research-error";
  error: string;
  code?: string;
  phase?: string;
  recoverable: boolean;
  context?: Record<string, any>;
}

// Session events
export interface ResearchSessionEvent extends BaseEvent {
  type: "research-session-start" | "research-session-end";
  query: string;
  options?: Record<string, any>;
  result?: any;
}

// Legacy interface for backward compatibility
export interface ResearchProgress {
  phase: string;
  progress: number; // 0-100
  currentStep?: string;
  totalSteps?: number;
}

// AI SDK v5 compliant event interfaces for clean hook consumption
export interface BaseEvent {
  id: string;
  sessionId: string;
  timestamp: Date;
  type: string;
  metadata?: Record<string, any>;
}

// Tool lifecycle events following AI SDK v5 patterns
export interface ToolCallStartEvent extends BaseEvent {
  type: "tool-call-start";
  toolCallId: string;
  toolName: "search" | "scrape" | "screenshot" | "analyze";
  input: {
    query?: string;
    url?: string;
    action?: string;
    metadata?: Record<string, any>;
  };
}

export interface ToolCallProgressEvent extends BaseEvent {
  type: "tool-call-progress";
  toolCallId: string;
  toolName: string;
  progress: number;
  status: string;
}

export interface ToolCallEndEvent extends BaseEvent {
  type: "tool-call-end";
  toolCallId: string;
  toolName: string;
  success: boolean;
  output?: {
    resultCount?: number;
    contentLength?: number;
    data?: any;
    metadata?: Record<string, any>;
  };
  error?: string;
  duration: number;
}

// Legacy interfaces for backward compatibility
export interface ToolCallEvent extends ToolCallStartEvent {}
export interface ToolResultEvent extends ToolCallEndEvent {}

// Union type for all events for type-safe event handling
export type DeepResearchEvent =
  | ToolCallStartEvent
  | ToolCallProgressEvent
  | ToolCallEndEvent
  | ResearchProgressEvent
  | TextStreamEvent
  | ResearchMilestoneEvent
  | ResearchErrorEvent
  | ResearchSessionEvent;

// EventFactory has been extracted to "events.ts" to keep this file leaner.

// Legacy interface for backward compatibility
export interface ResearchUpdate {
  event: ResearchEvent;
  phase: string;
  progress: number;
  data?: any;
}

// Zod schemas for validation
export const SubQuerySchema = z.object({
  id: z.string(),
  query: z.string(),
});

export const FreeFormResearchPlanSchema = z.object({
  strategicPlan: z.string().describe("Free-form strategic thinking text"),
  approach: z.string().describe("Overall approach description"),
  estimatedSteps: z.number().describe("Estimated number of steps needed"),
});

export const QueriesFromPlanSchema = z.object({
  queries: z
    .array(z.string())
    .describe("List of search queries extracted from the plan"),
  strategy: z.object({
    searchType: z
      .enum(["comprehensive", "focused"])
      .describe("Type of search strategy"),
    approach: z.string().describe("Overall approach for the research"),
  }),
  estimatedSteps: z.number().describe("Estimated number of steps needed"),
});

export const ResearchPlanSchema = z.object({
  id: z.string(),
  originalQuery: z.string(),
  subQueries: z.array(SubQuerySchema),
  searchStrategy: z.object({
    maxDepth: z.number(),
    maxBreadth: z.number(),
    timeout: z.number(),
    retryAttempts: z.number(),
  }),
  estimatedSteps: z.number(),
  strategicPlan: z.string().optional().describe("Optional free-form plan text"),
});

export const SearchResultSchema = z.object({
  id: z.string(),
  query: z.string(),
  url: z.string(),
  title: z.string(),
  content: z.string(),
  summary: z.string(),
  relevanceScore: z.number().min(0).max(1),
  timestamp: z.date(),
  metadata: z.record(z.any()).optional(),
});

// NEW: RefinedContent schema
export const RefinedContentSchema = z.object({
  title: z.string(),
  url: z.string(),
  summary: z.string(),
  rawLength: z.number(),
  scrapedAt: z.date(),
});

export const ResearchOptionsSchema = z.object({
  depth: z.number().min(1).max(5).optional(),
  breadth: z.number().min(1).max(10).optional(),
  timeout: z.number().optional(),
  includeImages: z.boolean().optional(),
  humanInTheLoop: z.boolean().optional(),
});

// Enhanced evaluation schemas
export const LearningSchema = z.object({
  content: z.string(),
  type: z.enum(["factual", "analytical", "procedural", "statistical"]),
  entities: z.array(z.string()),
  confidence: z.number().min(0).max(1),
  sourceUrl: z.string(),
});

export const ResearchDirectionSchema = z.object({
  question: z.string(),
  rationale: z.string(),
  searchQueries: z.array(z.string()),
  buildsUpon: z
    .array(z.string())
    .optional()
    .describe("Which existing learnings this builds on"),
  expectedLearningType: z
    .enum(["factual", "analytical", "statistical", "procedural"])
    .optional()
    .describe("Expected type of learning"),
});

export const CompletenessAssessmentSchema = z.object({
  coverage: z.number().min(0).max(1),
  knowledgeGaps: z.array(z.string()),
  hasEnoughInfo: z.boolean(),
  recommendedAction: z.enum(["continue", "refine", "synthesize"]),
});

export const ResearchEvaluationSchema = z.object({
  learnings: z.array(LearningSchema),
  researchDirections: z.array(ResearchDirectionSchema),
  completenessAssessment: CompletenessAssessmentSchema,
});

// NEW: Schema for RefinementDecision
export const RefinementDecisionSchema = z.object({
  shouldContinue: z.boolean(),
  reason: z.string(),
  researchDirections: z.array(ResearchDirectionSchema),
  strategicGuidance: z.string(),
  confidence: z.number().min(0).max(1),
  terminationMetadata: z
    .object({
      coverageAchieved: z.number().min(0).max(1),
      learningsCount: z.number(),
      iterationsCompleted: z.number(),
    })
    .optional(),
});

// Type guards
export const isFreeFormResearchPlan = (
  obj: any
): obj is FreeFormResearchPlan => {
  return FreeFormResearchPlanSchema.safeParse(obj).success;
};

export const isQueriesFromPlan = (obj: any): obj is QueriesFromPlan => {
  return QueriesFromPlanSchema.safeParse(obj).success;
};

export const isResearchPlan = (obj: any): obj is ResearchPlan => {
  return ResearchPlanSchema.safeParse(obj).success;
};

export const isSearchResult = (obj: any): obj is SearchResult => {
  return SearchResultSchema.safeParse(obj).success;
};

export const isResearchOptions = (obj: any): obj is ResearchOptions => {
  return ResearchOptionsSchema.safeParse(obj).success;
};

export const isLearning = (obj: any): obj is Learning => {
  return LearningSchema.safeParse(obj).success;
};

export const isResearchDirection = (obj: any): obj is ResearchDirection => {
  return ResearchDirectionSchema.safeParse(obj).success;
};

export const isCompletenessAssessment = (
  obj: any
): obj is CompletenessAssessment => {
  return CompletenessAssessmentSchema.safeParse(obj).success;
};

export const isResearchEvaluation = (obj: any): obj is ResearchEvaluation => {
  return ResearchEvaluationSchema.safeParse(obj).success;
};

// NEW: Type guard for RefinementDecision
export const isRefinementDecision = (obj: any): obj is RefinementDecision => {
  return RefinementDecisionSchema.safeParse(obj).success;
};

// Default values
export const DEFAULT_SEARCH_STRATEGY: SearchStrategy = {
  maxDepth: 3,
  maxBreadth: 5,
  timeout: 30000,
  retryAttempts: 3,
};
