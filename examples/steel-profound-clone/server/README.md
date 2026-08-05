# steel-profound-clone — Server (Fastify + TypeScript)

This workspace runs the API that orchestrates Steel + Playwright automations across multiple LLM providers and persists results in DuckDB. Providers with a direct link are automated in a Steel cloud browser; providers without a link (e.g. Claude) are queried via OpenRouter. If an automation fails, the server falls back to OpenRouter for that provider.

## Prerequisites

- Node.js 18.18+ (or newer)
- API keys:
  - `STEEL_API_KEY` (required for Steel.dev)
  - `OPENROUTER_API_KEY` (required for OpenRouter fallback and providers without links)
- Playwright Chromium will be installed on `postinstall`

## Getting Started

From the monorepo app root:
1) Install dependencies (workspaces):
   - cd steel-cookbook/examples/steel-profound-clone/app
   - npm install
2) Copy example env and fill in secrets:
   - cp server/.env.example server/.env
   - Edit server/.env and set STEEL_API_KEY and OPENROUTER_API_KEY
3) Run in development:
   - npm run dev
   - The server listens on http://localhost:3000

Alternatively, from the server workspace:
- cd steel-cookbook/examples/steel-profound-clone/app/server
- npm install
- cp .env.example .env
- npm run dev

## Commands

- Development:
  - npm run dev
    - Starts Fastify with TS watch (tsx)
- Build:
  - npm run build
    - Emits compiled JavaScript to dist/
- Production start:
  - npm start
    - Runs the compiled server (NODE_ENV=production)
- Type-check:
  - npm run typecheck
- Playwright setup (auto-run on install):
  - npm run playwright:install

## Environment Variables (server/.env)

- HOST: 0.0.0.0 (default)
- PORT: 3000 (default)
- LOG_LEVEL: info (Fastify logger level)
- NODE_ENV: development | production
- DUCKDB_PATH: optional absolute/relative file path for DuckDB
- DATA_DIR: optional directory; will default to app/data if not set
- STEEL_API_KEY: Steel.dev API key (required for browser automations)
- OPENROUTER_API_KEY: OpenRouter API key (required for fallback/Claude)
- OPENROUTER_REFERER: optional site URL for OpenRouter attribution (default http://localhost)
- OPENROUTER_TITLE: optional site title for OpenRouter attribution (default steel-profound-clone)
- OPENROUTER_BASE_URL: optional base URL (default https://openrouter.ai/api/v1)

By default, responses are stored at:
- app/data/responses.duckdb
You can override with DUCKDB_PATH or DATA_DIR.

## API

Health
- GET /healthz
  - Returns { ok: true }

Run query across providers
- POST /query
  - Body (JSON):
    - query: string (required)
    - providers: ProviderKey[] (optional; default: ["chatgpt","gemini","qwen","perplexity","meta"])
    - limit: number (optional; max 5; default 5)
    - includeNoLinkProviders: boolean (optional; default true; includes providers with no link via OpenRouter)
  - Behavior:
    - For each provider with a link, tries Steel + Playwright automation.
    - If automation fails, falls back to OpenRouter for that provider’s mapped model.
    - For providers without links, uses OpenRouter directly.
    - Saves all results to DuckDB.

- Response (JSON):
  {
    "query": string,
    "startedAt": number,
    "durationMs": number,
    "count": number,
    "results": [
      {
        "provider": string,
        "source": "playwright" | "openrouter" | "fallback",
        "url": string | null,
        "response": string | null,
        "success": boolean,
        "durationMs": number,
        "error"?: string
      }
    ]
  }

Fetch recent results (for UI)
- GET /results?limit=200
  - Returns up to `limit` most recent rows from DuckDB (with response preview)

### Example cURL

POST /query
```
curl -X POST http://localhost:3000/query \
  -H "Content-Type: application/json" \
  -d '{
    "query": "Compare Rust vs Go for backend services.",
    "providers": ["chatgpt", "gemini", "qwen", "perplexity", "meta"],
    "limit": 5,
    "includeNoLinkProviders": true
  }'
```

GET /results
```
curl "http://localhost:3000/results?limit=100"
```

## Providers

Provider keys and behavior:
- chatgpt (link) -> attempts automation, fallback: openai/gpt-4o-mini
- gemini (link) -> attempts automation, fallback: google/gemini-1.5-flash
- qwen (link) -> attempts automation, fallback: qwen/qwen-2.5-72b-instruct
- perplexity (link) -> attempts automation, fallback: perplexity/llama-3.1-sonar-small-128k-online
- meta (link) -> attempts automation, fallback: meta-llama/llama-3.1-70b-instruct
- grok (link) -> attempts automation, fallback: x-ai/grok-2-mini
- google_overview (link) -> attempts automation, fallback: perplexity/llama-3.1-sonar-small-128k-online
- claude (no link) -> always OpenRouter: anthropic/claude-3.5-sonnet

Notes:
- Site UIs change often. Selectors are best-effort; failures are expected and will trigger OpenRouter fallback (when configured).
- Some providers may require authentication; for public trials this aims to use available free flows when possible.

## Data Schema (DuckDB)

Table: `responses`
- id: UUID (generated)
- provider: VARCHAR
- source: VARCHAR ("playwright" | "openrouter" | "fallback")
- query: VARCHAR
- response: TEXT
- url: VARCHAR
- success: BOOLEAN
- duration_ms: INTEGER
- created_at: TIMESTAMP (default now())

## Dev Notes

- This workspace serves the API only; the React/Vite app lives in `../web` and proxies requests to this server in development.
- Ensure `STEEL_API_KEY` and `OPENROUTER_API_KEY` are set; without them, automations/fallbacks will fail.
- Playwright runs in Steel’s cloud browser via CDP connection. Sessions are created and released per-provider run.
- If you change selector logic or add new providers, update the provider registry and input/output selectors.
