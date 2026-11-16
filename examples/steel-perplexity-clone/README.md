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

- SEARCH_TOP_K: Maximum number of URLs to search/scrape (default: 3, min: 1, max: 10)
- REQUEST_TIMEOUT_MS: Timeout for outbound requests (default: 30000)

- QUERY: What you want to search for

Example .env:
~~~env
NODE_ENV=development

OPENAI_API_KEY=sk-...
OPENAI_ORG_ID=
OPENAI_MODEL=gpt-5-nano

STEEL_API_KEY=steel_...

QUERY="How do prediction markets provide hedging oppurtunities and potential liquidity against broader market positions?"

SEARCH_TOP_K=3
REQUEST_TIMEOUT_MS=5000
~~~

Request body:
QUERY: "What are the latest improvements in WebAssembly and their benefits?"

`npm run start`

- query: string (required)

Response:
```bash
✔ Search complete
✔ Scraping complete
✔ Answer synthesized

Prediction markets offer a practical way to hedge specific risks and to add liquidity to broader market positions by turning uncertain outcomes into tradable, cash-settled contracts. Their price signals aggregate diverse information in real time, creating hedging tools and a more liquid trading environment than many traditional markets. [1]
...

## How it works

This service takes in a query and then searches for relevant articles via the Web Search API Provider. Then it scrapes the relevant articles and synthesizes the responses and articles with an LLM to provide a well sourced answer with citations.

## Support

- [Steel Documentation](https://docs.steel.dev)
- [API Reference](https://docs.steel.dev/api-reference)
- [Discord Community](https://discord.gg/steel-dev)
