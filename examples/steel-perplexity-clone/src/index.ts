import Fastify, { FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import sensible from "@fastify/sensible";
import searchRoutes from "./routes/search";

import { config, getSanitizedConfig } from "./config";
import logger from "./logger";

function toCorsOriginConfig(origins: string[] | ["*"]): boolean | string[] {
  // @fastify/cors accepts boolean | string | RegExp | (string|RegExp)[]
  // Using boolean true for wildcard, otherwise pass string[].
  if (origins.length === 1 && origins[0] === "*") return true;
  return origins as string[];
}

export async function buildServer(): Promise<FastifyInstance> {
  // We use our own logger; Fastify's internal logger is disabled here
  const app = Fastify({ logger: false });

  // Plugins
  await app.register(sensible);
  await app.register(cors, {
    origin: toCorsOriginConfig(config.cors.origins),
  });

  // Health endpoint
  app.get("/healthz", async (_req, reply) => {
    return reply.send({
      status: "ok",
      env: config.env,
      uptimeSec: Math.round(process.uptime()),
    });
  });

  // v1 routes
  await app.register(searchRoutes, { prefix: "/v1" });

  return app;
}

async function start() {
  const app = await buildServer();

  const { host, port } = config.server;

  // Log sanitized config at startup (masks secrets)
  logger.info("Starting server with configuration", getSanitizedConfig());

  await app.listen({ host, port });

  const address = `http://${host}:${port}`;
  logger.info(`Server listening at ${address}`);

  const close = async (signal: string) => {
    logger.info(`Received ${signal}, shutting down...`);
    try {
      await app.close();
      logger.info("Server closed cleanly");
      process.exit(0);
    } catch (err) {
      logger.error("Error during shutdown", undefined, err);
      process.exit(1);
    }
  };

  process.on("SIGINT", () => void close("SIGINT"));
  process.on("SIGTERM", () => void close("SIGTERM"));
}

start().catch((err) => {
  logger.fatal("Fatal error while starting server", undefined, err);
  // eslint-disable-next-line no-process-exit
  process.exit(1);
});
