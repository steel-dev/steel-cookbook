import { z } from "zod";

// Configuration interfaces
export interface DeepResearchConfig {
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

// Research plan interfaces
export interface SubQuery {
  id: string;
  query: string;
  priority: number;
  category?: string;
}

export interface ResearchPlan {
  id: string;
  originalQuery: string;
  subQueries: SubQuery[];
  searchStrategy: SearchStrategy;
  estimatedSteps: number;
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
  priority: "high" | "medium" | "low";
  searchQueries: string[];
}

export interface CompletenessAssessment {
  coverage: number;
  knowledgeGaps: string[];
  hasEnoughInfo: boolean;
  recommendedAction: "continue" | "refine" | "synthesize";
}

export interface ResearchEvaluation {
  learnings: Learning[];
  researchDirections: ResearchDirection[];
  completenessAssessment: CompletenessAssessment;
  confidenceLevel: number;
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
}

export interface SERPOptions {
  timeout?: number;
  maxResults?: number;
  includeSnippets?: boolean;
}

export interface ExtractionOptions {
  timeout?: number;
  includeImages?: boolean;
  includeMarkdown?: boolean;
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

export interface ResearchProgress {
  phase: string;
  progress: number; // 0-100
  currentStep?: string;
  totalSteps?: number;
}

export interface ToolCallEvent {
  toolName: "search" | "scrape" | "screenshot" | "analyze";
  query?: string;
  url?: string;
  metadata?: Record<string, any>;
  timestamp: Date;
}

export interface ToolResultEvent {
  toolName: string;
  success: boolean;
  resultCount?: number;
  contentLength?: number;
  error?: string;
  timestamp: Date;
}

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
  priority: z.number().min(0).max(1),
  category: z.string().optional(),
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
  priority: z.enum(["high", "medium", "low"]),
  searchQueries: z.array(z.string()),
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
  confidenceLevel: z.number().min(0).max(1),
});

// Type guards
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

// Default values
export const DEFAULT_RESEARCH_OPTIONS: Required<ResearchOptions> = {
  depth: 2,
  breadth: 3,
  timeout: 30000,
  includeImages: false,
  humanInTheLoop: false,
};

export const DEFAULT_SEARCH_STRATEGY: SearchStrategy = {
  maxDepth: 3,
  maxBreadth: 5,
  timeout: 30000,
  retryAttempts: 3,
};
