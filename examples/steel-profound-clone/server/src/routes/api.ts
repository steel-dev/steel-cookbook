import type { FastifyInstance } from "fastify";
import {
  runBatchProviders,
  type ProviderKey,
  PROVIDERS,
} from "../automation/providers";
import { insertResponse, getRecent } from "../lib/db";

type QueryBody = {
  query?: unknown;
  providers?: unknown;
  limit?: unknown;
  includeNoLinkProviders?: unknown;
};

function isProviderKeyArray(val: unknown): val is ProviderKey[] {
  if (!Array.isArray(val)) return false;
  return val.every((v) => typeof v === "string" && v in PROVIDERS);
}

function coerceLimit(val: unknown, def = 5): number {
  const n =
    typeof val === "string" ? Number(val) : typeof val === "number" ? val : NaN;
  if (!Number.isFinite(n) || n <= 0) return def;
  return Math.min(5, Math.floor(n));
}

export default async function apiRoutes(app: FastifyInstance) {
  // POST /query
  app.post<{
    Body: {
      query: string;
      providers?: ProviderKey[];
      limit?: number;
      includeNoLinkProviders?: boolean;
    };
    Reply:
      | {
          query: string;
          startedAt: number;
          durationMs: number;
          count: number;
          results: Array<{
            provider: string;
            source: "playwright" | "openrouter" | "fallback";
            url?: string | null;
            response: string | null;
            success: boolean;
            durationMs: number;
            error?: string;
          }>;
        }
      | { error: string };
  }>("/query", async (request, reply) => {
    const bodyRaw = (request.body ?? {}) as QueryBody;

    const query = typeof bodyRaw.query === "string" ? bodyRaw.query.trim() : "";
    if (!query) {
      return reply.code(400).send({ error: "Missing query" });
    }

    let providers: ProviderKey[] | undefined;
    if (isProviderKeyArray(bodyRaw.providers)) {
      // sanitize values against known providers map
      providers = bodyRaw.providers.filter((p) => p in PROVIDERS);
    }

    const limit = coerceLimit(bodyRaw.limit, 5);
    const includeNoLinkProviders =
      typeof bodyRaw.includeNoLinkProviders === "boolean"
        ? bodyRaw.includeNoLinkProviders
        : true;

    const startedAt = Date.now();

    const results = await runBatchProviders({
      query,
      providers,
      limit,
      includeNoLinkProviders,
    });

    // Persist to DuckDB (fire-and-wait; if any insert fails, continue)
    await Promise.allSettled(
      results.map((r) =>
        insertResponse({
          provider: r.provider,
          source: r.source,
          query,
          response: r.response ?? null,
          url: r.url ?? null,
          success: !!r.success,
          durationMs: r.durationMs ?? null,
        }),
      ),
    );

    const durationMs = Date.now() - startedAt;

    return {
      query,
      startedAt,
      durationMs,
      count: results.length,
      results,
    };
  });

  // GET /results?limit=200
  app.get<{
    Querystring: {
      limit?: number;
    };
  }>("/results", async (request) => {
    // Coerce limit from querystring (may arrive as string)
    const raw = (request.query as unknown as Record<string, unknown>)?.limit;
    const limit = coerceLimit(raw, 200);
    const rows = await getRecent(limit);
    return rows;
  });
}
