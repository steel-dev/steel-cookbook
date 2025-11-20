import { config } from "./config";
import {
  scrapeUrlsToMarkdown,
  synthesizeWithCitations,
  multiQueryBraveSearch,
} from "./clients";

type SearchResponse = {
  query: string;
  answer: string;
  citations: Array<{ index: number; url: string }>;
  model: string;
  meta: {
    tookMs: number;
  };
};

async function main() {
  const started = Date.now();

  const query = config.query;
  const topK = config.search.topK;
  const concurrency = config.concurrency;

  console.log("Searching for: ", query);

  // 1) Use Brave to get top relevant URLs (do double to get more relevant results to search)
  const { urls } = await multiQueryBraveSearch(query, topK * 2);
  // const searchRes = await searchTopRelevantUrls(query, requestedTopK * 2);
  // const urls = (searchRes.urls || []).slice(0, requestedTopK * 2);

  // console.log(urls, urls.length);

  if (urls.length === 0) {
    return console.error("No URLs found for the given query.");
  }

  // 2) Scrape each URL into markdown using Steel.dev
  const materials = await scrapeUrlsToMarkdown(urls, concurrency, topK);

  if (materials.length === 0) {
    console.error("Failed to scrape all URLs. Try again or refine your query.");
  }

  // 3) Use OpenAI to synthesize an answer with inline citations
  const synthesis = await synthesizeWithCitations({
    query,
    materials,
  });

  const tookMs = Date.now() - started;

  const response: SearchResponse = {
    query,
    answer: synthesis.answer,
    citations: synthesis.sources,
    model: config.openai.model,
    meta: { tookMs },
  };

  // console.log(response);
  return response;
}

// Execute the demo
main()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error("Task execution failed:", error);
    process.exit(1);
  });
