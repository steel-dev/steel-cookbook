import { config } from "dotenv";
import { z } from "zod";
import {
  DeepResearchConfig,
  DEFAULT_RESEARCH_OPTIONS,
  DEFAULT_SEARCH_STRATEGY,
} from "./core/interfaces";

// Load environment variables
config();

// Environment variable validation schema
const EnvSchema = z.object({
  // Steel configuration
  STEEL_API_KEY: z.string().min(1, "Steel API key is required"),

  // AI provider configuration
  OPENAI_API_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  TOGETHER_API_KEY: z.string().optional(),

  // Optional configuration
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),

  // Search configuration
  MAX_DEPTH: z
    .string()
    .transform(Number)
    .pipe(z.number().min(1).max(5))
    .default("3"),
  MAX_BREADTH: z
    .string()
    .transform(Number)
    .pipe(z.number().min(1).max(10))
    .default("5"),
  TIMEOUT: z
    .string()
    .transform(Number)
    .pipe(z.number().min(1000))
    .default("30000"),
  RETRY_ATTEMPTS: z
    .string()
    .transform(Number)
    .pipe(z.number().min(1))
    .default("3"),
});

// Configuration validation and loading
export function loadConfig(): DeepResearchConfig {
  const env = EnvSchema.parse(process.env);

  // Determine which AI provider to use
  const aiProvider = getAIProviderConfig(env);
  const aiWriter = getAIWriterConfig(env);

  const config: DeepResearchConfig = {
    steel: {
      apiKey: env.STEEL_API_KEY,
    },
    ai: {
      provider: aiProvider,
      writer: aiWriter,
    },
    search: {
      maxDepth: env.MAX_DEPTH,
      maxBreadth: env.MAX_BREADTH,
      timeout: env.TIMEOUT,
      retryAttempts: env.RETRY_ATTEMPTS,
    },
  };

  // Validate the final configuration
  validateConfig(config);

  return config;
}

// Helper function to determine AI provider configuration
function getAIProviderConfig(env: z.infer<typeof EnvSchema>) {
  if (env.OPENAI_API_KEY) {
    return {
      name: "openai" as const,
      apiKey: env.OPENAI_API_KEY,
      model: "gpt-4o-mini", // Default model for reasoning
    };
  }

  if (env.ANTHROPIC_API_KEY) {
    return {
      name: "anthropic" as const,
      apiKey: env.ANTHROPIC_API_KEY,
      model: "claude-3-5-haiku-20241022", // Default model for reasoning
    };
  }

  if (env.TOGETHER_API_KEY) {
    return {
      name: "together" as const,
      apiKey: env.TOGETHER_API_KEY,
      model: "meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo", // Default model for reasoning
    };
  }

  throw new Error(
    "At least one AI provider API key is required (OPENAI_API_KEY, ANTHROPIC_API_KEY, or TOGETHER_API_KEY)"
  );
}

// Helper function to determine AI writer configuration
function getAIWriterConfig(env: z.infer<typeof EnvSchema>) {
  // Prefer higher-quality models for writing
  if (env.ANTHROPIC_API_KEY) {
    return {
      name: "anthropic" as const,
      apiKey: env.ANTHROPIC_API_KEY,
      model: "claude-3-5-sonnet-20241022", // High-quality model for writing
    };
  }

  if (env.OPENAI_API_KEY) {
    return {
      name: "openai" as const,
      apiKey: env.OPENAI_API_KEY,
      model: "gpt-4o", // High-quality model for writing
    };
  }

  if (env.TOGETHER_API_KEY) {
    return {
      name: "together" as const,
      apiKey: env.TOGETHER_API_KEY,
      model: "meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo", // Better model for writing
    };
  }

  throw new Error("At least one AI provider API key is required for writing");
}

// Configuration validation
function validateConfig(config: DeepResearchConfig): void {
  // Validate Steel API key
  if (!config.steel.apiKey) {
    throw new Error("Steel API key is required");
  }

  // Validate AI provider configurations
  if (!config.ai.provider.apiKey) {
    throw new Error("AI provider API key is required");
  }

  if (!config.ai.writer.apiKey) {
    throw new Error("AI writer API key is required");
  }

  // Validate search configuration
  if (config.search.maxDepth < 1 || config.search.maxDepth > 5) {
    throw new Error("Search depth must be between 1 and 5");
  }

  if (config.search.maxBreadth < 1 || config.search.maxBreadth > 10) {
    throw new Error("Search breadth must be between 1 and 10");
  }

  if (config.search.timeout < 1000) {
    throw new Error("Timeout must be at least 1000ms");
  }

  if (config.search.retryAttempts < 1) {
    throw new Error("Retry attempts must be at least 1");
  }
}

// Environment helpers
export function isDevelopment(): boolean {
  return process.env.NODE_ENV === "development";
}

export function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

export function isTest(): boolean {
  return process.env.NODE_ENV === "test";
}

export function getLogLevel(): string {
  return process.env.LOG_LEVEL || "info";
}

// Export default configuration for testing
export const DEFAULT_CONFIG: DeepResearchConfig = {
  steel: {
    apiKey: process.env.STEEL_API_KEY || "test-key",
  },
  ai: {
    provider: {
      name: "openai",
      apiKey: process.env.OPENAI_API_KEY || "test-key",
      model: "gpt-4o-mini",
    },
    writer: {
      name: "openai",
      apiKey: process.env.OPENAI_API_KEY || "test-key",
      model: "gpt-4o",
    },
  },
  search: DEFAULT_SEARCH_STRATEGY,
};
