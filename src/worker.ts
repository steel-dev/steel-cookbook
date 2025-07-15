import type { worker } from "../alchemy.run.ts";

const MANIFEST_KEY = "manifest.json";

export default {
  async fetch(
    request: Request,
    env: typeof worker.Env,
    ctx: ExecutionContext,
  ): Promise<Response> {
    const url = new URL(request.url);
    // Get the path and remove the leading slash to use as the R2 object key.
    const key = url.pathname.substring(1);

    // --- 1. Un-versioned Manifest Request -> Redirect using `version` field ---
    if (key === MANIFEST_KEY && !url.searchParams.has("v")) {
      const manifestObject = await env.BUCKET.get(MANIFEST_KEY);
      if (manifestObject === null) {
        return new Response("Manifest not found in R2", { status: 404 });
      }

      // Parse the manifest to read the version field directly.
      const manifestData: { version?: string } = await manifestObject.json();
      const version = manifestData.version;

      if (!version) {
        return new Response("Manifest in R2 is missing a 'version' field", {
          status: 500,
        });
      }

      // Create the redirect URL with the version from the manifest.
      const redirectUrl = new URL(request.url);
      redirectUrl.searchParams.set("v", version);
      return Response.redirect(redirectUrl.toString(), 302);
    }

    // --- 2. Stale Manifest Validation ---
    if (key === MANIFEST_KEY && url.searchParams.has("v")) {
      const requestedVersion = url.searchParams.get("v");
      const manifestObject = await env.BUCKET.get(MANIFEST_KEY);

      if (manifestObject === null) {
        return new Response("Manifest not found in R2", { status: 404 });
      }

      const manifestData: { version?: string } = await manifestObject.json();
      const currentVersion = manifestData.version;

      // If the requested version doesn't match the current one, it's stale.
      if (requestedVersion !== currentVersion) {
        return new Response("Stale manifest version", { status: 410 }); // 410 Gone
      }
    }

    // --- 3. General Cache & R2 Serving Logic for ALL files ---
    const cache = (caches as any).default;
    let response = await cache.match(request);

    if (response) {
      return response;
    }

    // Get the object from R2 using its key.
    const object = await env.BUCKET.get(key);
    if (object === null) {
      return new Response(`Object '${key}' not found`, { status: 404 });
    }

    // Set R2's metadata as headers and add our own cache-control.
    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set("etag", object.httpEtag);
    headers.set(
      "Cache-Control",
      "public, max-age=31536000, immutable",
    );

    response = new Response(object.body, { headers });

    // Cache the response without blocking the client.
    ctx.waitUntil(cache.put(request, response.clone()));

    return response;
  },
};