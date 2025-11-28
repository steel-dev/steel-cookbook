# Steel Perplexity API Clone

This template shows how to use a Search API service and Steel's `/v1/scrape` endpoint to search for answers to query and provide citations in markdown.


## Installation

1) Install dependencies
```bash
git clone https://github.com/steel-dev/steel-cookbook
cd steel-cookbook/examples/steel-perplexity-clone
# Install dependencies
npm install
```

2) Configure environment
- Copy .env.example to .env and fill in your secrets:
  - OPENAI_API_KEY
  - BRAVE_API_KEY
  - STEEL_API_KEY
  - QUERY: What you want to do research on

3) Run the script
- npm run start

## Environment Variables

- NODE_ENV: development | test | production (default: development)

- OPENAI_API_KEY: Your OpenAI API key (required)
- OPENAI_ORG_ID: Optional OpenAI org id
- OPENAI_MODEL: Model used for search + synthesis (default: gpt-5-nano)

- STEEL_API_KEY: Your Steel.dev API key (required)
- STEEL_SCRAPE_ENDPOINT: Steel.dev scrape endpoint (default: https://api.steel.dev/v1/scrape)
- STEEL_TIMEOUT: Tiemout in between scrape requests

- SEARCH_TOP_K: Maximum number of URLs to search/scrape (default: 3, min: 1, max: 10)
- REQUEST_TIMEOUT_MS: Timeout for outbound requests (default: 30000)

- QUERY: What you want to search for

- CORS_ORIGINS: Comma-separated list of allowed origins or * (default: *)

Example .env:
~~~env
NODE_ENV=development

OPENAI_API_KEY=sk-...
OPENAI_ORG_ID=
OPENAI_MODEL=gpt-5-nano

STEEL_API_KEY=steel_...

QUERY="How do prediction markets provide hedging oppurtunities and potential liquidity against broader market positions?"

SEARCH_TOP_K=3
REQUEST_TIMEOUT_MS=30000

CORS_ORIGINS=*
~~~

Request body:
QUERY: "What are the latest improvements in WebAssembly and their benefits?"

`npm run start`

- query: string (required)

Response:
~~~json
{
  "query": "What are the latest improvements in WebAssembly and their benefits?",
  "requestedTopK": 3,
  "urls": [
    "https://example.com/article-1",
    "https://example.com/article-2",
    "https://example.com/article-3"
  ],
  "materialsCount": 3,
  "answer": "Recent WebAssembly updates improved component model support and tooling, enabling easier interop and faster iterations [1][2]. The benefits include smaller bundles, better portability, and improved performance for non-JS languages targeting the web [2][3].",
  "citations": [
    { "index": 1, "url": "https://example.com/article-1" },
    { "index": 2, "url": "https://example.com/article-2" },
    { "index": 3, "url": "https://example.com/article-3" }
  ],
  "model": "gpt-5-nano",
  "meta": { "tookMs": 12345 }
}
~~~

## How it works

This service takes in a query and then searches for relevant articles via the Web Search API Provider. Then it scrapes the relevant articles and synthesizes the responses and articles with an LLM to provide a well sourced answer with citations.

## Support

- [Steel Documentation](https://docs.steel.dev)
- [API Reference](https://docs.steel.dev/api-reference)
- [Discord Community](https://discord.gg/steel-dev)
