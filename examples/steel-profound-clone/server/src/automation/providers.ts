/* eslint-disable @typescript-eslint/no-explicit-any */

import { runSiteQuery, DefaultSelectors } from "../lib/steel";
import { openrouterChat } from "../lib/openrouter";

/**
 * Providers that we can target.
 *
 * If `url` is null, we will always query via OpenRouter.
 * If `url` is present, we attempt Playwright automation first, then fall back to OpenRouter if automation fails.
 */
export type ProviderKey =
  | "chatgpt"
  | "qwen"
  | "perplexity"
  | "grok"
  | "meta"
  | "gemini"
  | "google_overview"
  | "claude";

export interface ProviderSpec {
  key: ProviderKey;
  name: string;
  url: string | null;
  openrouterModel: string;
  inputSelectors?: string[];
  outputSelectors?: string[];
}

export const PROVIDERS: Record<ProviderKey, ProviderSpec> = {
  chatgpt: {
    key: "chatgpt",
    name: "ChatGPT",
    url: "https://chatgpt.com",
    openrouterModel: "openai/gpt-5-nano",
    inputSelectors: [
      'textarea[placeholder*="Message"]',
      '[data-testid="composer"] textarea',
      "textarea",
      ...DefaultSelectors.input,
    ],
    outputSelectors: [
      '[data-testid*="conversation"] *',
      ".markdown",
      "article",
      "main",
      ...DefaultSelectors.output,
    ],
  },
  qwen: {
    key: "qwen",
    name: "Qwen",
    url: "https://chat.qwen.ai/",
    openrouterModel: "qwen/qwen-2.5-72b-instruct",
    inputSelectors: [
      "textarea",
      '[contenteditable="true"]',
      "textarea[placeholder]",
      ...DefaultSelectors.input,
    ],
    outputSelectors: [
      "main",
      "article",
      ".prose",
      '[data-testid*="markdown"]',
      ...DefaultSelectors.output,
    ],
  },
  perplexity: {
    key: "perplexity",
    name: "Perplexity",
    url: "https://www.perplexity.ai/",
    openrouterModel: "perplexity/llama-3.1-sonar-small-128k-online",
    inputSelectors: [
      "textarea",
      'input[placeholder*="Ask"]',
      'textarea[placeholder*="Ask"]',
      ...DefaultSelectors.input,
    ],
    outputSelectors: [
      '[data-testid*="result"]',
      "article",
      ".prose",
      "main",
      ...DefaultSelectors.output,
    ],
  },
  grok: {
    key: "grok",
    name: "Grok",
    url: "https://grok.com/",
    openrouterModel: "x-ai/grok-2-mini",
    inputSelectors: DefaultSelectors.input,
    outputSelectors: DefaultSelectors.output,
  },
  meta: {
    key: "meta",
    name: "Meta AI",
    url: "https://www.meta.ai/",
    openrouterModel: "meta-llama/llama-3.1-70b-instruct",
    inputSelectors: [
      "textarea",
      '[contenteditable="true"]',
      ...DefaultSelectors.input,
    ],
    outputSelectors: [
      "main",
      '[role="main"]',
      "article",
      ...DefaultSelectors.output,
    ],
  },
  gemini: {
    key: "gemini",
    name: "Gemini",
    url: "https://gemini.google.com/app",
    openrouterModel: "google/gemini-1.5-flash",
    inputSelectors: [
      'textarea[aria-label*="Message"]',
      "textarea",
      '[contenteditable="true"]',
      ...DefaultSelectors.input,
    ],
    outputSelectors: [
      "main",
      "article",
      ".prose",
      '[data-response="true"]',
      ...DefaultSelectors.output,
    ],
  },
  google_overview: {
    key: "google_overview",
    name: "Google AI Overview",
    url: "https://www.google.com",
    openrouterModel: "perplexity/llama-3.1-sonar-small-128k-online",
    inputSelectors: DefaultSelectors.input,
    outputSelectors: DefaultSelectors.output,
  },
  claude: {
    key: "claude",
    name: "Claude",
    url: null, // No link -> always OpenRouter
    openrouterModel: "anthropic/claude-3.5-sonnet",
    inputSelectors: DefaultSelectors.input,
    outputSelectors: DefaultSelectors.output,
  },
};

/**
 * Default set of providers to use for Playwright automations (limit to 5).
 */
export const DEFAULT_AUTOMATION_PROVIDERS: ProviderKey[] = [
  "chatgpt",
  "gemini",
  "qwen",
  "perplexity",
  "meta",
];

/**
 * Providers with no link (must be queried via OpenRouter).
 */
export const PROVIDERS_WITH_NO_LINK: ProviderKey[] = (
  Object.values(PROVIDERS) as ProviderSpec[]
)
  .filter((p) => !p.url)
  .map((p) => p.key);

/**
 * Result shape from a provider run.
 */
export interface ProviderResult {
  provider: ProviderKey | string;
  source: "playwright" | "openrouter" | "fallback";
  url?: string | null;
  response: string | null;
  success: boolean;
  durationMs: number;
  error?: string;
}

/**
 * Run a site automation for a provider using Playwright + Steel.dev.
 * Throws if the provider has no URL or the automation fails.
 */
export async function automateProvider(
  providerKey: ProviderKey,
  query: string,
): Promise<ProviderResult> {
  const spec = PROVIDERS[providerKey];
  if (!spec) {
    throw new Error(`Unknown provider: ${providerKey}`);
  }
  if (!spec.url) {
    throw new Error(
      `Provider ${providerKey} does not have a URL; cannot automate`,
    );
  }

  const result = await runSiteQuery({
    url: spec.url,
    query,
    inputSelectors: spec.inputSelectors ?? DefaultSelectors.input,
    outputSelectors: spec.outputSelectors ?? DefaultSelectors.output,
    navigationTimeoutMs: 45_000,
    responseTimeoutMs: 120_000,
  });

  if (!result.success) {
    throw new Error(result.error || "Automation failed");
  }

  return {
    provider: providerKey,
    source: "playwright",
    url: spec.url,
    response: result.responseText ?? "",
    success: true,
    durationMs: result.durationMs,
  };
}

/**
 * Use OpenRouter directly for a provider (used as fallback or for providers without links).
 */
export async function queryOpenRouter(
  providerKey: ProviderKey,
  query: string,
): Promise<ProviderResult> {
  const spec = PROVIDERS[providerKey];
  if (!spec) {
    throw new Error(`Unknown provider: ${providerKey}`);
  }

  const t0 = Date.now();
  try {
    const response = await openrouterChat(spec.openrouterModel, query);
    return {
      provider: providerKey,
      source: spec.url ? "fallback" : "openrouter",
      url: spec.url,
      response,
      success: true,
      durationMs: Date.now() - t0,
    };
  } catch (err: any) {
    return {
      provider: providerKey,
      source: spec.url ? "fallback" : "openrouter",
      url: spec.url,
      response: null,
      success: false,
      durationMs: Date.now() - t0,
      error: String(err?.message || err),
    };
  }
}

/**
 * Orchestrate a single provider:
 * - If provider has a link (url), try Playwright automation first, then fall back to OpenRouter on failure.
 * - If provider has no link, use OpenRouter directly.
 */
export async function runProviderWithFallback(
  providerKey: ProviderKey,
  query: string,
): Promise<ProviderResult> {
  const spec = PROVIDERS[providerKey];
  if (!spec) {
    return {
      provider: providerKey,
      source: "fallback",
      url: undefined,
      response: null,
      success: false,
      durationMs: 0,
      error: `Unknown provider: ${providerKey}`,
    };
  }

  const t0 = Date.now();

  if (!spec.url) {
    // No site link -> OpenRouter only
    return queryOpenRouter(providerKey, query);
  }

  try {
    // Attempt site automation first
    const autoRes = await automateProvider(providerKey, query);
    return autoRes;
  } catch (automationErr: any) {
    // Fallback to OpenRouter
    const fb = await queryOpenRouter(providerKey, query);
    if (!fb.success) {
      // Attach automation error context
      return {
        ...fb,
        durationMs: Date.now() - t0, // combined time
        error: `Automation error: ${String(automationErr?.message || automationErr)} | OpenRouter error: ${fb.error ?? "unknown"}`,
      };
    }
    // Success via fallback
    return {
      ...fb,
      durationMs: Date.now() - t0,
    };
  }
}

/**
 * Resolve which providers to run for automation (default to 5 common providers),
 * with an option to include all non-link providers (queried via OpenRouter).
 */
export function resolveAutomationProviders(
  requested: ProviderKey[] | null | undefined,
  limit = 5,
): ProviderKey[] {
  const base = (
    requested && requested.length ? requested : DEFAULT_AUTOMATION_PROVIDERS
  ).slice(0, limit);
  return base;
}

/**
 * Run a batch of providers in parallel:
 * - Selected automation providers (up to `limit`)
 * - Optionally include all non-link providers (queried via OpenRouter)
 */
export async function runBatchProviders(params: {
  query: string;
  providers?: ProviderKey[];
  limit?: number;
  includeNoLinkProviders?: boolean; // include e.g., claude
}): Promise<ProviderResult[]> {
  const { query } = params;
  const limit =
    Number.isFinite(params.limit) && (params.limit ?? 0) > 0
      ? Math.min(params.limit!, 5)
      : 5;

  const automation = resolveAutomationProviders(params.providers, limit);
  const noLink = params.includeNoLinkProviders ? PROVIDERS_WITH_NO_LINK : [];

  const uniqueKeys = dedupe([...automation, ...noLink]);

  const tasks = uniqueKeys.map((key) => runProviderWithFallback(key, query));
  const settled = await Promise.allSettled(tasks);

  const results: ProviderResult[] = [];
  for (const s of settled) {
    if (s.status === "fulfilled") {
      results.push(s.value);
    } else {
      results.push({
        provider: "unknown",
        source: "fallback",
        url: undefined,
        response: null,
        success: false,
        durationMs: 0,
        error: String(
          (s as any).reason?.message || (s as any).reason || "Unknown error",
        ),
      });
    }
  }
  return results;
}

/* --------------------------------- Helpers -------------------------------- */

function dedupe<T>(arr: T[]): T[] {
  return Array.from(new Set(arr));
}
