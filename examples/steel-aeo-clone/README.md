# Profound Clone
Get your brand mentioned in
ChatGPT: https://chatgpt.com,
Claude,
<!--Qwen: https://chat.qwen.ai/,-->
Perplexity: https://www.perplexity.ai/,
Grok: https://grok.com/,
Meta AI: https://www.meta.ai/,
Gemini: https://gemini.google.com/app,
<!--Google AI Overiew: https://google.com-->

Use Steel to try the free versions of these and default to an API call via open-router.

Insert this data into DuckDB and be able to view it in a simple graph UI.

Running the Fastify app

- Requirements:
  - Node.js 18+ (or higher)
  - `STEEL_API_KEY` (for Steel.dev cloud browser sessions used by Playwright automations)
  - `OPENROUTER_API_KEY` (for providers without links and for fallback when site automation fails)

- Setup:
  1) Change directory to `steel-cookbook/examples/steel-profound-clone/app`
  2) Copy `.env.example` to `.env` and fill in `STEEL_API_KEY` and `OPENROUTER_API_KEY`
  3) Install dependencies: run `npm install`
  4) Run dev (server + web): `npm run dev` (server at `http://localhost:3000`, web at `http://localhost:5173`)

- Health check:
  - `GET /healthz` returns `{ ok: true }` when the server is up

API: POST /query

- URL: `http://localhost:3000/query`
- Body (JSON):
  - `query` (string, required): the prompt/question to send
  - `providers` (string[], optional): provider keys to target; recognized keys:
    - `chatgpt`, `gemini`, `qwen`, `perplexity`, `meta`, `grok`, `google_overview`, `claude`
    - If omitted, the server runs up to 5 automation providers by default: `chatgpt`, `gemini`, `qwen`, `perplexity`, `meta`
    - Providers without links in the list (e.g., `claude`) are queried via OpenRouter
  - `limit` (number, optional): maximum number of Playwright automations to run concurrently (default 5, max 5)

- Behavior:
  - For providers that have a link in this README (e.g., ChatGPT, Qwen, Perplexity, Grok, Meta AI, Gemini, Google), the server starts Playwright automation sessions in Steel.dev cloud browsers to run the query and collect the response
  - If a site automation fails, the server falls back to OpenRouter for that provider
  - For providers without a link (e.g., `claude`), the server queries via OpenRouter directly
  - All results are saved to DuckDB at `steel-cookbook/examples/steel-profound-clone/data/responses.duckdb`

- Response (JSON):
  - `query`: the submitted query
  - `startedAt`: timestamp when the request started
  - `durationMs`: total time to complete all runs
  - `count`: number of results returned
  - `results`: array of result objects:
    - `provider`: provider key (e.g., `chatgpt`, `gemini`, `qwen`, `perplexity`, `meta`, `claude`, etc.)
    - `source`: `playwright` (site automation), `openrouter` (direct), or `fallback` (automation failed, used OpenRouter)
    - `url`: target site URL when applicable
    - `response`: extracted/generated text
    - `success`: boolean
    - `durationMs`: time spent for that provider

Viewing stored results

- Quick view endpoint:
  - `GET /results` returns the most recent entries with a short preview
- Database:
  - Data is stored in DuckDB at `steel-cookbook/examples/steel-profound-clone/data/responses.duckdb`
  - Table name: `responses` with columns:
    - `provider`, `source`, `query`, `response`, `url`, `success`, `duration_ms`, `created_at`

Notes

Monorepo layout and commands

- Structure:
  - Server (Fastify + TypeScript + Steel + DuckDB): `steel-cookbook/examples/steel-profound-clone/app/server`
  - Web (Vite + React + shadcn/ui): `steel-cookbook/examples/steel-profound-clone/app/web`

- Install (from app root):
  1) `cd steel-cookbook/examples/steel-profound-clone/app`
  2) `npm install` (installs server and web workspaces)

- Run in development:
  - `npm run dev` (starts server on http://localhost:3000 and web on http://localhost:5173 with API proxy)

- Build:
  - `npm run build` (builds both server and web)

- Start server only (production):
  - `npm start` (runs Fastify at http://localhost:3000)

- Environment variables:
  - Create `.env` in `app/server` with:
    - `STEEL_API_KEY`
    - `OPENROUTER_API_KEY`
  - The web app uses Vite and proxies `/query`, `/results`, and `/healthz` to the server in dev.

- Server entry point:
  - `steel-cookbook/examples/steel-profound-clone/app/server/src/index.ts`
- `STEEL_API_KEY` enables Steel.dev browser sessions for Playwright; without it, automations will fail and rely on OpenRouter fallback
- `OPENROUTER_API_KEY` enables direct queries via OpenRouter; without it, providers without links (like `claude`) and fallbacks will fail
