import { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";

import { config } from "../../config";
import logger from "../../logger";
import {
  searchTopRelevantUrls,
  scrapeUrlsToMarkdown,
  synthesizeWithCitations,
} from "../../clients";

const bodySchema = z.object({
  query: z.string().min(1, "query is required"),
  topK: z.number().int().min(1).max(10).optional(),
  // Optional: control scraper concurrency
  concurrency: z.number().int().min(1).max(5).optional(),
});

type SearchBody = z.infer<typeof bodySchema>;
type SearchResponse = {
  query: string;
  requestedTopK: number;
  urls: string[];
  materialsCount: number;
  answer: string;
  citations: Array<{ index: number; url: string }>;
  model: string;
  meta: {
    tookMs: number;
  };
};

const searchRoutes: FastifyPluginAsync = async (app) => {
  app.post(
    "/search",
    async (
      request: FastifyRequest<{ Body: SearchBody }>,
      reply: FastifyReply,
    ) => {
      const started = Date.now();

      // Validate input body
      const parsed = bodySchema.safeParse(request.body);
      if (!parsed.success) {
        const issues = parsed.error.issues.map(
          (i) => `${i.path.join(".")}: ${i.message}`,
        );
        // Uses @fastify/sensible if registered on the parent instance
        return reply.badRequest(
          `Invalid request body:\n- ${issues.join("\n- ")}`,
        );
      }

      const { query, topK, concurrency } = parsed.data;
      const requestedTopK = Math.min(
        topK ?? config.search.topK,
        config.search.topK,
      );

      logger.info("Search request received", {
        query,
        requestedTopK,
        concurrency: concurrency ?? 3,
      });

      // 1) Use OpenAI to get top relevant URLs
      const searchRes = await searchTopRelevantUrls(query, requestedTopK);
      const urls = (searchRes.urls || []).slice(0, requestedTopK);

      if (urls.length === 0) {
        return reply.badRequest("No URLs found for the given query.");
      }

      // 2) Scrape each URL into markdown using Steel.dev
      const materials = await scrapeUrlsToMarkdown(urls, concurrency ?? 3);

      if (materials.length === 0) {
        return reply.internalServerError(
          "Failed to scrape all URLs. Try again or refine your query.",
        );
      }

      // 3) Use OpenAI to synthesize an answer with inline citations
      const synthesis = await synthesizeWithCitations({
        query,
        materials,
      });

      const tookMs = Date.now() - started;

      const response: SearchResponse = {
        query,
        requestedTopK,
        urls,
        materialsCount: materials.length,
        answer: synthesis.answer,
        citations: synthesis.sources,
        model: config.openai.model,
        meta: { tookMs },
      };

      logger.info("Search request completed", {
        query,
        requestedTopK,
        urlsCount: urls.length,
        materialsCount: materials.length,
        tookMs,
      });

      return reply.send(response);
    },
  );
};

export default searchRoutes;
