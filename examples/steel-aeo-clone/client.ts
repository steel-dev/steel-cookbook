import { runSiteQuery, DefaultSelectors } from "./steel";
import { OpenRouter } from "@openrouter/sdk";
import config from "./config";
import { AnalyzerResponse } from "./schema";
import ProgressBar from "ora-progress-bar";

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
  openrouterModel?: string;
  inputSelectors?: string[];
  outputSelectors?: string[];
}

export const PROVIDERS: Record<ProviderKey, ProviderSpec> = {
  chatgpt: {
    key: "chatgpt",
    name: "ChatGPT",
    url: "https://chatgpt.com",
    openrouterModel: "openai/gpt-5-nano",
    inputSelectors: ['div[id="prompt-textarea"]', ...DefaultSelectors.input],
    outputSelectors: [
      'div[class="text-base"]',
      // ...DefaultSelectors.output,
    ],
  },
  qwen: {
    key: "qwen",
    name: "Qwen",
    url: "https://chat.qwen.ai/",
    openrouterModel: "qwen/qwen3-vl-8b-instruct",
    inputSelectors: ['textarea[id="chat-input"]', ...DefaultSelectors.input],
    outputSelectors: [
      'div[class="response-message-content"]',
      // ...DefaultSelectors.output,
    ],
  },
  perplexity: {
    key: "perplexity",
    name: "Perplexity",
    url: "https://www.perplexity.ai/",
    inputSelectors: ['div[id="ask-input"]', ...DefaultSelectors.input],
    outputSelectors: [
      'div[id="markdown-content-0"]',
      // ...DefaultSelectors.output,
    ],
  },
  grok: {
    key: "grok",
    name: "Grok",
    url: "https://grok.com/",
    openrouterModel: "x-ai/grok-4.1-fast",
    inputSelectors: [
      'div[class*="tiptap ProseMirror"]',
      ...DefaultSelectors.input,
    ],
    outputSelectors: [
      'div[id*="response"]',
      // ...DefaultSelectors.output
    ],
  },
  meta: {
    key: "meta",
    name: "Meta AI",
    url: "https://www.meta.ai/",
    openrouterModel: "meta-llama/llama-4-scout",
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
    openrouterModel: "google/gemini-2.5-flash-preview-09-2025",
    inputSelectors: [
      "rich-textarea[class*=text-input-field]",
      ...DefaultSelectors.input,
    ],
    outputSelectors: [
      'div[id*="model-response-message-content"]',
      // ...DefaultSelectors.output,
    ],
  },
  google_overview: {
    key: "google_overview",
    name: "Google AI Overview",
    url: "https://www.google.com",
    inputSelectors: [...DefaultSelectors.input],
    outputSelectors: [...DefaultSelectors.output],
  },
  claude: {
    key: "claude",
    name: "Claude",
    url: null, // No link -> always OpenRouter
    openrouterModel: "anthropic/claude-haiku-4.5",
    inputSelectors: [...DefaultSelectors.input],
    outputSelectors: [...DefaultSelectors.output],
  },
};

/**
 * Default set of providers to use for Playwright automations (limit to 5).
 */
export const DEFAULT_AUTOMATION_PROVIDERS: ProviderKey[] = [
  "chatgpt",
  "gemini",
  "qwen",
  "grok",
  "claude",
  "perplexity",
  // "meta",
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
  source: "steel" | "openrouter";
  url?: string | null;
  response: string | null;
  success: boolean;
  durationMs: number;
  error?: string;
}

const openRouter = new OpenRouter({
  apiKey: config.openrouter.apiKey,
});

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
    inputSelectors: [...(spec.inputSelectors ?? DefaultSelectors.input)],
    outputSelectors: [...(spec.outputSelectors ?? DefaultSelectors.output)],
  });

  if (!result.success) {
    throw new Error(result.error || "Automation failed");
  }

  return {
    provider: providerKey,
    source: "steel",
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
    const completion = await openRouter.chat.send({
      model: spec.openrouterModel,
      messages: [{ role: "user", content: query }],
      stream: false,
    });
    return {
      provider: providerKey,
      source: "openrouter",
      url: spec.url,
      response: (completion?.choices[0]?.message?.content as string) ?? null,
      success: true,
      durationMs: Date.now() - t0,
    };
  } catch (err: any) {
    return {
      provider: providerKey,
      source: "openrouter",
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
  progressBar: any,
): Promise<ProviderResult | undefined> {
  const spec = PROVIDERS[providerKey];
  if (!spec) {
    progressBar.progress();
    return {
      provider: providerKey,
      source: "openrouter",
      url: undefined,
      response: null,
      success: false,
      durationMs: 0,
      error: `Unknown provider: ${providerKey}`,
    };
  }

  const t0 = Date.now();

  if (!spec.url && spec.openrouterModel) {
    const response = await queryOpenRouter(providerKey, query);
    progressBar.progress();
    return response;
  }

  try {
    // Attempt site automation first
    const response = await automateProvider(providerKey, query);
    progressBar.progress();
    return response;
  } catch (automationErr: any) {
    // Fallback to OpenRouter
    progressBar.progress();
    if (spec.openrouterModel) {
      const response = await queryOpenRouter(providerKey, query);
      if (!response.success) {
        // Attach automation error context
        return {
          ...response,
          durationMs: Date.now() - t0, // combined time
          error: `Automation error: ${String(automationErr?.message || automationErr)} | OpenRouter error: ${response.error ?? "unknown"}`,
        };
      } else {
        // Success via fallback
        return {
          ...response,
          durationMs: Date.now() - t0,
        };
      }
    }
  }
}

export async function extractRankings(
  text: string,
): Promise<AnalyzerResponse | null> {
  const completion = await openRouter.chat.send({
    model: "openai/gpt-oss-20b:nitro",
    messages: [
      {
        role: "user",
        content: `
        You are an AI response analyzer. Your job is to extract brand mentions and rankings from LLM responses.

        TASK:
        Analyze the provided response and extract all brand mentions with detailed metadata. Return your analysis as valid JSON matching the specified schema.

        EXTRACTION RULES:

        1. RANKING TYPE - Classify the response as one of:
           - "explicit_numbered": Uses numbers (1., 2., 3.) or (#1, #2)
           - "explicit_ordered": Uses order words (First, Second, Third, Finally)
           - "implicit_ordered": Clear sequential order but no explicit markers
           - "unordered_list": Brands listed (bullets, commas) but no ranking
           - "prose_only": Brands mentioned only in paragraph form
           - "no_brands_mentioned": No relevant brands found

        2. EXPLICIT RANKING - If ranking_type is explicit_numbered, explicit_ordered, or implicit_ordered:
           - Extract up to 5 brands in order
           - Assign position numbers 1-5
           - If fewer than 5, only include what's present

        3. BRAND MENTIONS - For EVERY brand mentioned anywhere:

           a) Count total mentions (even if same brand repeated)

           b) Calculate RELEVANCE SCORE (0.0 to 1.0) based on:
              - Position in response: First paragraph = 1.0, middle = 0.6, end = 0.3
              - Elaboration: Detailed explanation = +0.2, brief mention = 0.0
              - Frequency: Multiple mentions = +0.1 per additional mention (max +0.3)
              - Emphasis: Strong language = +0.2, neutral = 0.0
              Final score capped at 1.0

           c) Classify CONTEXT:
              - "primary_recommendation": Main answer, emphasized, first mentioned
              - "top_tier": Among the best, highly praised
              - "alternative_option": Also good, secondary choice
              - "conditional_recommendation": Good if/when X (e.g., "for beginners")
              - "comparison_mention": Used to compare or contrast
              - "negative_mention": Warned against or criticized
              - "neutral_reference": Factually mentioned without judgment

           d) Assess RECOMMENDATION STRENGTH:
              - "highly_recommended": "best", "top", "excellent", "highly recommend", "definitely"
              - "recommended": "good", "great", "solid", "recommend", "popular"
              - "suggested": "consider", "could try", "might like", "worth checking"
              - "mentioned": Just named, no qualitative language
              - "cautioned": "avoid", "not ideal", "be careful", "problematic"

           e) Record FIRST MENTION POSITION (sentence number, starting from 1)

           f) Determine HAS ELABORATION: true if 15+ words explain the brand, false otherwise

           g) If has_elaboration=true, count ELABORATION LENGTH in words

        4. CONFIDENCE LEVEL:
           - "high": Clear structure, explicit rankings or strong signals
           - "medium": Some ambiguity but main points clear
           - "low": Vague, contradictory, or very brief response

        5. NOTES: Include any parsing challenges, ambiguities, or relevant observations

        RESPONSE FORMAT:
        Return valid JSON only, no markdown, no explanations. Match this exact schema:

        {
          "ranking_type": string,
          "has_explicit_top_5": boolean,
          "explicit_ranking": Array<{brand: string, position: number}> | null,
          "all_brand_mentions": Array<{
            brand: string,
            position?: number,
            mention_count: number,
            relevance_score: number,
            context: string,
            recommendation_strength: string,
            first_mention_position: number,
            has_elaboration: boolean,
            elaboration_length?: number
          }>,
          "total_brands_mentioned": number,
          "response_confidence": string,
          "notes?: string
        }

        RESPONSE TO ANALYZE:
        ${text}

        Return your analysis as JSON:`,
      },
    ],
    stream: false,
    responseFormat: {
      type: "json_schema",
      jsonSchema: {
        name: "rankings",
        strict: true,
        schema: {
          type: "object",
          properties: {
            ranking_type: { type: "string" },
            has_explicit_top_5: { type: "boolean" },
            explicit_ranking: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  brand: { type: "string" },
                  position: { type: "number" },
                },
                required: ["brand", "position"],
              },
            },
            all_brand_mentions: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  brand: { type: "string" },
                  position: { type: "number" },
                  mention_count: { type: "number" },
                  relevance_score: { type: "number" },
                  context: { type: "string" },
                  recommendation_strength: { type: "string" },
                  first_mention_position: { type: "number" },
                  has_elaboration: { type: "boolean" },
                  elaboration_length: { type: "number" },
                },
                required: [
                  "brand",
                  "position",
                  "mention_count",
                  "relevance_score",
                  "context",
                  "recommendation_strength",
                  "first_mention_position",
                  "has_elaboration",
                ],
              },
            },
            total_brands_mentioned: { type: "number" },
            response_confidence: { type: "string" },
            notes: { type: "string" },
          },
          required: [
            "ranking_type",
            "has_explicit_top_5",
            "explicit_ranking",
            "all_brand_mentions",
            "total_brands_mentioned",
            "response_confidence",
          ],
        },
      },
    },
  });
  if (completion.choices[0].message.content) {
    try {
      const response =
        JSON.parse(completion?.choices[0]?.message?.content as string) ?? null;
      return response;
    } catch (error) {
      console.error("Error parsing response:", error);
      return null;
    }
  } else return null;
}

/**
 * Resolve which providers to run for automation (default to 5 common providers),
 * with an option to include all non-link providers (queried via OpenRouter).
 */
export function resolveAutomationProviders(
  requested: ProviderKey[] | null | undefined,
): ProviderKey[] {
  const base =
    requested && requested.length ? requested : DEFAULT_AUTOMATION_PROVIDERS;
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
}): Promise<
  ({ synthesis: AnalyzerResponse | null; provider: ProviderResult } | null)[]
> {
  const { query } = params;
  const limit =
    Number.isFinite(params.limit) && (params.limit ?? 0) > 0
      ? Math.min(params.limit!, 5)
      : 5;

  const automation = resolveAutomationProviders(params.providers);
  if (!automation.length) {
    return [];
  }

  const progressBar = new ProgressBar(
    "Running Steel Automations",
    automation.length,
  );

  const concurrency = Math.max(1, Math.min(limit, automation.length));
  const results: ({
    synthesis: AnalyzerResponse | null;
    provider: ProviderResult;
  } | null)[] = new Array(automation.length);
  let nextIndex = 0;

  // Phase 1: Run providers concurrently
  const worker = async () => {
    while (true) {
      const currentIndex = nextIndex++;
      if (currentIndex >= automation.length) {
        break;
      }

      const key = automation[currentIndex];
      try {
        const result = await runProviderWithFallback(key, query, progressBar);
        results[currentIndex] = result
          ? { synthesis: null, provider: result }
          : null; // Placeholder for synthesis
      } catch (err) {
        results[currentIndex] = null;
      }
    }
  };

  await Promise.all(Array.from({ length: concurrency }, () => worker()));

  // Phase 2: Extract/synthesize answers concurrently
  const synthesisProgressBar = new ProgressBar(
    "Finding Brands Mentioned",
    automation.length,
  );
  let synthesisIndex = 0;

  const synthesisWorker = async () => {
    while (true) {
      const currentIndex = synthesisIndex++;
      if (currentIndex >= results.length) {
        break;
      }

      const item = results[currentIndex];
      if (item?.provider?.response) {
        try {
          const synthesis = await extractRankings(item.provider.response);
          item.synthesis = synthesis;
        } catch (err) {
          item.synthesis = null;
        }
      }
      synthesisProgressBar.progress(); // Progress after each synthesis attempt
    }
  };

  await Promise.all(
    Array.from({ length: concurrency }, () => synthesisWorker()),
  );

  return results;
}
