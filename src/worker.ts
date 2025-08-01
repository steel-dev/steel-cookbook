import type { worker } from "../alchemy.run.ts";

const MANIFEST_KEY = "manifest.json";
const VERSIONS_PREFIX = "versions/";
const SCHEMAS_PREFIX = "/schemas/";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
  "Access-Control-Allow-Headers": "*",
};

function getContentType(key: string): string {
  if (key.startsWith("schemas/") && key.endsWith(".json")) {
    return "application/schema+json";
  }
  if (key.endsWith(".json")) {
    return "application/json";
  }
  if (key.endsWith(".md")) {
    return "text/markdown; charset=utf-8";
  }
  if (key.endsWith(".gz")) {
    return "application/gzip";
  }
  if (key.endsWith(".png")) {
    return "image/png";
  }
  if (key.endsWith(".jpg") || key.endsWith(".jpeg")) {
    return "image/jpeg";
  }
  if (key.endsWith(".gif")) {
    return "image/gif";
  }
  if (key.endsWith(".svg")) {
    return "image/svg+xml";
  }
  if (key.endsWith(".webp")) {
    return "image/webp";
  }
  return "application/octet-stream";
}

async function handleRequest(
  request: Request,
  env: typeof worker.Env,
  ctx: ExecutionContext,
): Promise<Response> {
  const url = new URL(request.url);
  const pathname = url.pathname;
  const key = pathname.substring(1);
  const version = url.searchParams.get("v");

  // Default path, redirect to latest manifest
  if (key === MANIFEST_KEY && !version) {
    const rootManifestObject = await env.BUCKET.get(MANIFEST_KEY);
    if (rootManifestObject === null) {
      return new Response("Root manifest not found in R2", { status: 404 });
    }
    const manifestData: { version?: string } = await rootManifestObject.json();
    const latestVersion = manifestData.version;
    if (!latestVersion) {
      return new Response("Root manifest is missing a 'version' field", {
        status: 500,
      });
    }
    const redirectUrl = new URL(request.url);
    redirectUrl.searchParams.set("v", latestVersion);
    return Response.redirect(redirectUrl.toString(), 302);
  }

  // Stale manifest validation
  if (key === MANIFEST_KEY && version) {
    const rootManifestObject = await env.BUCKET.get(MANIFEST_KEY);
    if (rootManifestObject === null) {
      return new Response("Root manifest not found in R2", { status: 404 });
    }
    const manifestData: { version?: string } = await rootManifestObject.json();
    const currentVersion = manifestData.version;
    if (version !== currentVersion) {
      return new Response("Stale manifest version requested", { status: 410 });
    }
  }

  const cache = (caches as any).default;
  let response = await cache.match(request);
  if (response) {
    return response;
  }

  let r2ObjectKey: string;
  // If path starts with /schemas/, use the path as the key from the root.
  if (pathname.startsWith(SCHEMAS_PREFIX)) {
    r2ObjectKey = key;
  } else {
    // Otherwise, use the existing versioned file logic.
    r2ObjectKey = version ? `${VERSIONS_PREFIX}${version}/${key}` : key;
  }

  const object = await env.BUCKET.get(r2ObjectKey);
  if (object === null) {
    return new Response(`Object '${r2ObjectKey}' not found in R2`, {
      status: 404,
    });
  }

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  headers.set("Cache-Control", "public, max-age=31536000, immutable");
  headers.set("Content-Type", getContentType(r2ObjectKey));

  response = new Response(object.body, { headers });
  ctx.waitUntil(cache.put(request, response.clone()));
  return response;
}

export default {
  async fetch(
    request: Request,
    env: typeof worker.Env,
    ctx: ExecutionContext,
  ): Promise<Response> {
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders,
      });
    }

    const response = await handleRequest(request, env, ctx);

    // Apply CORS headers to all responses
    const newHeaders = new Headers(response.headers);
    Object.entries(corsHeaders).forEach(([key, value]) => {
      newHeaders.set(key, value);
    });

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: newHeaders,
    });
  },
};