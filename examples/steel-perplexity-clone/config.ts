import dotenv from "dotenv";
import { z } from "zod";

// Load environment variables from .env files into process.env as early as possible
dotenv.config();

const logLevels = [
  "fatal",
  "error",
  "warn",
  "info",
  "debug",
  "trace",
  "silent",
] as const;

const envSchema = z.object({
  // Runtime
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),

  // Server
  PORT: z.coerce.number().int().min(0).max(65535).default(3000),
  HOST: z.string().default("0.0.0.0"),
  LOG_LEVEL: z.enum(logLevels).default("info"),

  // OpenAI
  OPENAI_API_KEY: z.string().min(1, "OPENAI_API_KEY is required"),
  OPENAI_ORG_ID: z
    .string()
    .optional()
    .transform((v) => (v ? v : undefined)),
  // A cost-effective model with websearch capability enabled via tool usage at runtime
  OPENAI_MODEL: z.string().default("gpt-5-nano"),
  // Feature flag to enable web search where supported
  OPENAI_ENABLE_WEB_SEARCH: z.coerce.boolean().default(true),

  // Steel.dev
  STEEL_API_KEY: z.string().min(1, "STEEL_API_KEY is required"),
  STEEL_SCRAPE_ENDPOINT: z
    .string()
    .url()
    .default("https://api.steel.dev/v1/scrape"),

  // Brave Search
  BRAVE_API_KEY: z.string().min(1, "BRAVE_API_KEY is required"),
  BRAVE_SEARCH_ENDPOINT: z
    .string()
    .url()
    .default("https://api.search.brave.com/res/v1/web/search"),
  BRAVE_SEARCH_COUNTRY: z.string().default("US"),
  BRAVE_SEARCH_LANG: z.string().default("en"),
  BRAVE_SAFESEARCH: z.enum(["off", "moderate", "strict"]).default("moderate"),

  // Search behavior
  SEARCH_TOP_K: z.coerce.number().int().min(1).default(10),
  REQUEST_TIMEOUT_MS: z.coerce.number().int().min(1).default(30000),
  CONCURRENCY: z.coerce.number().int().min(1).default(2),
  QUERY: z
    .string()
    .default(
      "How do prediction markets provide hedging opportunities and potential liquidity against broader market positions?",
    ),

  // CORS
  CORS_ORIGINS: z.string().default("*"),
});

type Env = z.infer<typeof envSchema>;

function parseCorsOrigins(input: string): string[] {
  // If wildcard, keep as ['*'] for downstream consumers to handle properly.
  if (input.trim() === "*") return ["*"];
  return input
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  const formatted = parsed.error.issues
    .map((i) => `${i.path.join(".")}: ${i.message}`)
    .join("\n  - ");
  throw new Error(`Invalid environment configuration:\n  - ${formatted}`);
}

const env: Env = parsed.data;

export const config = {
  // Runtime
  env: env.NODE_ENV as Env["NODE_ENV"],
  isProduction: env.NODE_ENV === "production",
  isDevelopment: env.NODE_ENV === "development",
  isTest: env.NODE_ENV === "test",

  // Server
  server: {
    port: env.PORT,
    host: env.HOST,
    logLevel: env.LOG_LEVEL,
  },

  // OpenAI
  openai: {
    apiKey: env.OPENAI_API_KEY,
    orgId: env.OPENAI_ORG_ID,
    model: env.OPENAI_MODEL,
    enableWebSearch: env.OPENAI_ENABLE_WEB_SEARCH,
  },

  // Steel.dev
  steel: {
    apiKey: env.STEEL_API_KEY,
    scrapeEndpoint: env.STEEL_SCRAPE_ENDPOINT,
  },
  // Brave Search
  brave: {
    apiKey: env.BRAVE_API_KEY,
    endpoint: env.BRAVE_SEARCH_ENDPOINT,
    country: env.BRAVE_SEARCH_COUNTRY,
    lang: env.BRAVE_SEARCH_LANG,
    safesearch: env.BRAVE_SAFESEARCH,
  },

  // Search
  search: {
    topK: env.SEARCH_TOP_K,
  },

  // Networking
  requestTimeoutMs: env.REQUEST_TIMEOUT_MS,
  // Query
  query: env.QUERY,
  // Concurrency
  concurrency: env.CONCURRENCY,

  // CORS
  cors: {
    raw: env.CORS_ORIGINS,
    origins: parseCorsOrigins(env.CORS_ORIGINS),
  },
} as const;

export type AppConfig = typeof config;

/**
 * Returns a sanitized snapshot of config suitable for logging.
 * Secrets are masked to avoid accidental leakage in logs.
 */
export function getSanitizedConfig(): Record<string, unknown> {
  return {
    env: config.env,
    server: config.server,
    search: config.search,
    requestTimeoutMs: config.requestTimeoutMs,
    cors: config.cors,
  };
}
