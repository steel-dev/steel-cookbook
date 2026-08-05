import "dotenv/config";
import Fastify, { FastifyInstance } from "fastify";
import path from "node:path";
import fs from "node:fs";
import { pathToFileURL } from "node:url";

/**
 * Registers all Fastify route plugins found in ./routes.
 *
 * Conventions:
 * - Each route file should export a default Fastify plugin (e.g., export default async function (app) { ... }).
 * - Works in both dev (tsx running .ts) and prod (compiled .js in dist) by loading whichever extensions exist.
 */
async function registerAllRoutes(app: FastifyInstance) {
  const routesDir = path.join(__dirname, "routes");
  if (!fs.existsSync(routesDir)) {
    app.log.info({ routesDir }, "No routes directory found, continuing without registering routes");
    return;
  }

  // Prefer .ts in dev (tsx), .js in prod. Load both if present to reduce surprises.
  const exts = new Set([".ts", ".js"]);
  const files = fs
    .readdirSync(routesDir)
    .filter((f) => {
      // Ignore declaration files and dotfiles
      if (f.startsWith(".")) return false;
      if (f.endsWith(".d.ts")) return false;
      return exts.has(path.extname(f));
    })
    .sort(); // stable order

  for (const file of files) {
    const fullPath = path.join(routesDir, file);
    try {
      const modUrl = pathToFileURL(fullPath).href;
      const mod = await import(modUrl);

      const plugin = mod?.default ?? mod?.plugin ?? mod?.routes;
      if (typeof plugin === "function") {
        app.log.info({ file }, "Registering route plugin");
        // You can pass options if your route plugins expect them:
        await app.register(plugin as any);
      } else {
        app.log.warn({ file }, "No suitable route export found (expected default export of a Fastify plugin)");
      }
    } catch (err) {
      app.log.error({ err, file }, "Failed to load route module");
    }
  }
}

async function buildServer() {
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL || "info",
    },
    // Only API; no static content here
    disableRequestLogging: false,
    trustProxy: true,
  });

  // Basic health check
  app.get("/healthz", async () => ({ ok: true }));

  // Register routes from ./routes
  await registerAllRoutes(app);

  // Catch-all for unknown routes (optional)
  app.setNotFoundHandler((req, reply) => {
    reply.code(404).send({
      error: "Not Found",
      method: req.method,
      url: req.url,
    });
  });

  // Error handler (optional)
  app.setErrorHandler((err, _req, reply) => {
    app.log.error({ err }, "Request error");
    reply.code(err.statusCode || 500).send({
      error: err.message || "Internal Server Error",
    });
  });

  return app;
}

async function start() {
  const PORT = Number(process.env.PORT || 3000);
  const HOST = process.env.HOST || "0.0.0.0";

  const app = await buildServer();

  try {
    await app.listen({ port: PORT, host: HOST });
    app.log.info(`API server listening on http://${HOST === "0.0.0.0" ? "localhost" : HOST}:${PORT}`);
  } catch (err) {
    app.log.error({ err }, "Failed to start server");
    process.exit(1);
  }

  const shutdown = async (signal: string) => {
    app.log.info({ signal }, "Shutting down...");
    try {
      await app.close();
      process.exit(0);
    } catch (err) {
      app.log.error({ err }, "Error during shutdown");
      process.exit(1);
    }
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

start();
