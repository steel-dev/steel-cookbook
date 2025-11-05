import OpenAI from "openai";
import { config } from "./config";
import logger from "./logger";

/**
 * Centralized OpenAI and Steel.dev clients and helpers.
 *
 * Responsibilities:
 * - searchTopRelevantUrls: Use an economical OpenAI model to produce top-K relevant URLs (JSON)
 * - scrapeUrlsToMarkdown: Use Steel.dev scrape API to get Markdown for each URL
 * - synthesizeWithCitations: Use OpenAI to synthesize an answer from scrapes with inline citations
 */

// ---------- OpenAI Client ----------

export const openai = new OpenAI({
  apiKey: config.openai.apiKey,
  organization: config.openai.orgId,
});

/**
 * Best-effort JSON parsing with validation.
 */
function safeJson<T>(text: string): T | null {
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

// ---------- HTTP Utilities ----------

async function fetchWithTimeout(
  input: string | URL,
  init?: RequestInit & { timeoutMs?: number },
): Promise<Response> {
  const timeoutMs = init?.timeoutMs ?? config.requestTimeoutMs;
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(new Error(`Request timed out after ${timeoutMs}ms`)),
    timeoutMs,
  );
  try {
    const res = await fetch(input, { ...init, signal: controller.signal });
    return res;
  } finally {
    clearTimeout(timeout);
  }
}

// ---------- Search (OpenAI) ----------

export interface UrlSearchResult {
  urls: string[];
  // Raw model output (for debugging or logging)
  _raw?: unknown;
}

/**
 * Attempts to have an OpenAI chat model return the top-K relevant URLs in strict JSON.
 *
 * Important:
 * - This does not guarantee true web browsing. Some models/vendors provide browsing tools,
 *   but the vanilla OpenAI API does not expose a generic "web search" tool.
 * - We strongly constrain the output to JSON so it’s easy to consume.
 */
export async function searchTopRelevantUrls(
  query: string,
  topK = config.search.topK,
): Promise<UrlSearchResult> {
  const childLogger = logger.child("searchTopRelevantUrls");

  // Build Brave Search request URL with query params
  const endpoint = new URL(config.brave.endpoint);
  endpoint.searchParams.set("q", query);
  endpoint.searchParams.set("country", config.brave.country);
  endpoint.searchParams.set("search_lang", config.brave.lang);
  endpoint.searchParams.set("safesearch", config.brave.safesearch);
  endpoint.searchParams.set(
    "count",
    String(Math.min(topK, config.search.topK)),
  );

  const res = await fetchWithTimeout(endpoint.toString(), {
    headers: {
      Accept: "application/json",
      "X-Subscription-Token": config.brave.apiKey,
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    childLogger.error("Brave search failed", {
      status: res.status,
      statusText: res.statusText,
      response: text?.slice(0, 1000),
    });
    throw new Error(`Brave search failed: ${res.status} ${res.statusText}`);
  }

  const data = (await res.json()) as any;

  // Extract URLs from Brave response
  const urls: string[] = [];
  if (data?.web?.results && Array.isArray(data.web.results)) {
    for (const r of data.web.results) {
      if (typeof r?.url === "string") urls.push(r.url);
    }
  } else if (Array.isArray(data?.results)) {
    for (const r of data.results) {
      if (typeof r?.url === "string") urls.push(r.url);
    }
  }

  if (urls.length === 0) {
    childLogger.warn(
      "No URLs returned from Brave, attempting salvage from raw",
      {
        raw: JSON.stringify(data).slice(0, 1000),
      },
    );
    const rawText = JSON.stringify(data);
    const regex = /\bhttps?:\/\/[^\s"'<>]+/gi;
    const salvaged = (rawText.match(regex) ?? []) as string[];
    urls.push(...salvaged);
  }

  // Normalize and dedupe
  const normalized = Array.from(new Set(urls.map((u) => u.trim())))
    .filter(Boolean)
    .slice(0, topK);

  childLogger.info("Collected URLs from Brave", { count: normalized.length });

  return {
    urls: normalized,
    _raw: data,
  };
}

// ---------- Steel.dev Scraper ----------

export interface ScrapeResult {
  url: string;
  markdown: string;
  links?: { url: string; text: string }[] | undefined;
}

export interface SteelScrapeRequest {
  url: string;
  // Many scraping APIs accept an output/format parameter for markdown.
  // Using a generic "format" to request markdown; if Steel requires a different key, adjust as needed.
  format?: Array<"markdown" | "html" | "text">;
  screenshot?: boolean;
  pdf?: boolean;
  delay?: number;
  useProxy?: boolean;
  region?: string;
  // Optional flags for future extension
  // [key: string]: unknown;
}

export interface SteelScrapeResponse {
  content: {
    html?: string;
    cleaned_html?: string;
    markdown?: string;
    readability?: {
      [key: string]: unknown;
    };
  };
  metadata: {
    title?: string;
    language?: string;
    urlSource?: string;
    timestamp: string;
    description?: string;
    keywords?: string;
    author?: string;
    ogTitle?: string;
    ogDescription?: string;
    ogImage?: string;
    ogUrl?: string;
    ogSiteName?: string;
    articleAuthor?: string;
    publishedTime?: string;
    modifiedTime?: string;
    canonical?: string;
    favicon?: string;
    jsonLd?: object;
    statusCode: number;
  };
  links?: [
    {
      url: string;
      text: string;
    },
  ];
  screenshot?: {
    url: string;
  };
  pdf?: {
    url: string;
  };
}

/**
 * Scrape a single URL into Markdown using Steel.dev.
 */
export async function scrapeUrlToMarkdown(url: string): Promise<ScrapeResult> {
  const childLogger = logger.child("scrapeUrlToMarkdown");
  const endpoint = config.steel.scrapeEndpoint;

  const body: SteelScrapeRequest = {
    url,
    format: ["markdown"],
  };

  const res = await fetchWithTimeout(endpoint, {
    method: "POST",
    headers: {
      "Steel-Api-Key": config.steel.apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    childLogger.error("Steel.dev scrape failed", {
      status: res.status,
      statusText: res.statusText,
      url,
      response: text?.slice(0, 1000),
    });
    throw new Error(
      `Steel.dev scrape failed for ${url}: ${res.status} ${res.statusText}`,
    );
  }

  const payload = (await res.json()) as SteelScrapeResponse;
  const markdown = payload?.content?.markdown;
  const links = payload?.links;

  if (!markdown) {
    childLogger.warn(
      "Steel.dev response did not include recognizable markdown",
      { url, payload: JSON.stringify(payload).slice(0, 1000) },
    );
    throw new Error(`Steel.dev response missing markdown content for ${url}`);
  }

  return { url, markdown, links };
}

/**
 * Scrape multiple URLs concurrently with a simple pool to avoid bursting.
 */
export async function scrapeUrlsToMarkdown(
  urls: string[],
  concurrency = 3,
): Promise<ScrapeResult[]> {
  const childLogger = logger.child("scrapeUrlsToMarkdown");
  const results: ScrapeResult[] = [];
  const queue = [...urls];

  async function worker() {
    while (queue.length > 0) {
      const next = queue.shift();
      if (!next) break;
      try {
        const scraped = await scrapeUrlToMarkdown(next);
        results.push(scraped);
      } catch (err) {
        childLogger.warn("Failed to scrape URL", {
          url: next,
          err: (err as Error)?.message,
        });
      }
    }
  }

  const workers = Array.from({
    length: Math.max(1, Math.min(concurrency, urls.length)),
  }).map(() => worker());
  await Promise.all(workers);

  // Preserve input order in output where possible
  const byUrl = new Map(results.map((r) => [r.url, r]));
  return urls
    .map((u) => byUrl.get(u))
    .filter((x): x is ScrapeResult => Boolean(x));
}

// ---------- Synthesis (OpenAI) ----------

export interface SynthesisInput {
  query: string;
  materials: Array<{ url: string; markdown: string }>;
}

export interface SynthesisOutput {
  answer: string;
  sources: Array<{ index: number; url: string }>;
  // raw model message for debugging
  _raw?: unknown;
}

/**
 * Synthesizes an answer from scraped materials with inline citations.
 *
 * Citations:
 * - Use [n] markers inline, where n corresponds to 1-based index in the provided materials order.
 * - Include a "sources" array listing index->url mappings.
 */
export async function synthesizeWithCitations(
  input: SynthesisInput,
): Promise<SynthesisOutput> {
  const childLogger = logger.child("synthesizeWithCitations");

  // Build context block
  const contextHeader =
    "Context materials (each item shows [index] and URL, followed by markdown content)";
  const contextLines: string[] = [contextHeader];
  input.materials.forEach((m, i) => {
    const idx = i + 1;
    contextLines.push(`\n[${idx}] ${m.url}\n---\n${m.markdown}\n`);
  });

  const system = [
    "You are a helpful researcher.",
    "Produce a concise, accurate answer to the user query using the provided context only.",
    "Use inline citations in the form [n] where n refers to the index of the source in the provided list.",
    "If multiple sources support a statement, you can include multiple citations like [1][3].",
    "If the answer cannot be determined from the context, say that explicitly.",
    "Return only the answer text (do not include an extra summary of sources at the end).",
  ].join("\n");

  const user = [`User query: ${input.query}`, "", contextLines.join("\n")].join(
    "\n",
  );

  const completion = await openai.chat.completions.create({
    model: config.openai.model,
    temperature: 1,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  });

  const answer = completion.choices?.[0]?.message?.content?.trim() ?? "";

  // Collect sources in index order for convenience
  const sources = input.materials.map((m, i) => ({ index: i + 1, url: m.url }));

  childLogger.info("Synthesis complete", {
    answerPreview: answer.slice(0, 160),
  });

  return {
    answer,
    sources,
    _raw: completion,
  };
}
