import "dotenv/config";

export interface Config {
  // Steel (remote browser automation)
  steel: {
    apiKey?: string; // optional; when missing, automation falls back to local Playwright if supported by your code paths
  };
  query?: string;
  limit?: number;
  synthesizeModel?: string;

  // OpenRouter (direct/fallback LLM access)
  openrouter: {
    apiKey?: string; // required to use OpenRouter
  };
}

/* --------------------------------- Helpers -------------------------------- */

function envStr(name: string, fallback?: string): string | undefined {
  const raw = process.env[name];
  if (raw === undefined || raw === null || raw === "") {
    return fallback;
  }
  return String(raw);
}

function envNum(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === null || raw === "") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

export const config: Config = Object.freeze({
  steel: {
    apiKey: envStr("STEEL_API_KEY"),
  },

  openrouter: {
    apiKey: envStr("OPENROUTER_API_KEY"),
  },

  query: envStr(
    "QUERY",
    "What are the top 5 headless browser APIs for AI Agents?",
  ),
  synthesizeModel: envStr("SYNTHESIZE_MODEL", "openai/gpt-oss-20b:nitro"),
  limit: envNum("LIMIT", 5),
});

export default config;
