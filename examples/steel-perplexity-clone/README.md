# Steel Perplexity API Clone

This template shows how to use a Search API service and Steel's `/v1/scrape` endpoint to search for answers to query and provide citations in markdown.


## Installation

1) Install dependencies
```bash
git clone https://github.com/steel-dev/steel-cookbook
cd steel-cookbook/examples/steel-perplexity-api
# Install dependencies
npm install
```

2) Configure environment
- Copy .env.example to .env and fill in your secrets:
  - OPENAI_API_KEY
  - BRAVE_API_KEY
  - STEEL_API_KEY

3) Run in development (hot reload)
- npm run dev

4) Or run in production
- npm run build
- npm start

The server defaults to http://0.0.0.0:3000. You can change this in .env.

## Environment Variables

- NODE_ENV: development | test | production (default: development)
- PORT: HTTP port (default: 3000)
- HOST: Bind address (default: 0.0.0.0)
- LOG_LEVEL: fatal | error | warn | info | debug | trace | silent (default: info)

- OPENAI_API_KEY: Your OpenAI API key (required)
- OPENAI_ORG_ID: Optional OpenAI org id
- OPENAI_MODEL: Model used for search + synthesis (default: gpt-4o-mini)
- OPENAI_ENABLE_WEB_SEARCH: Flag to conceptually allow web search features if supported (default: true)

- STEEL_API_KEY: Your Steel.dev API key (required)
- STEEL_SCRAPE_ENDPOINT: Steel.dev scrape endpoint (default: https://api.steel.dev/v1/scrape)

- SEARCH_TOP_K: Maximum number of URLs to search/scrape (default: 3, min: 1, max: 10)
- REQUEST_TIMEOUT_MS: Timeout for outbound requests (default: 30000)

- CORS_ORIGINS: Comma-separated list of allowed origins or * (default: *)

Example .env:
~~~env
NODE_ENV=development
PORT=3000
HOST=0.0.0.0
LOG_LEVEL=info

OPENAI_API_KEY=sk-...
OPENAI_ORG_ID=
OPENAI_MODEL=gpt-4o-mini
OPENAI_ENABLE_WEB_SEARCH=true

STEEL_API_KEY=steel_...

SEARCH_TOP_K=3
REQUEST_TIMEOUT_MS=30000

CORS_ORIGINS=*
~~~

## API

Endpoint: `POST /v1/search`

Description:
- Finds up to topK relevant URLs for a natural language query
- Scrapes each URL in Markdown via Steel.dev
- Synthesizes a concise answer with inline citations [n]

Request body:
~~~json
{
  "query": "What are the latest improvements in WebAssembly and their benefits?",
  "topK": 3,
  "concurrency": 3
}
~~~

- query: string (required)
- topK: number, optional; upper-bounded by SEARCH_TOP_K (min 1, max 10)
- concurrency: number, optional; scraper worker count (min 1, max 5; default 3)

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
  "model": "gpt-4o-mini",
  "meta": { "tookMs": 12345 }
}
~~~

Example curl:
~~~bash
curl -sS -X POST "http://localhost:3000/v1/search" \
  -H "Content-Type: application/json" \
  -d '{"query":"What are the latest improvements in WebAssembly and their benefits?"}' | jq .
~~~

## How it works

This service takes in a query and then searches for relevant articles via the Web Search API Provider. Then it scrapes the relevant articles and synthesizes the responses and articles with an LLM to provide a well sourced answer with citations.

## Support

- [Steel Documentation](https://docs.steel.dev)
- [API Reference](https://docs.steel.dev/api-reference)
- [Discord Community](https://discord.gg/steel-dev)
