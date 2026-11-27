// https://github.com/steel-dev/steel-cookbook/tree/main/examples/credential-profiles-ts
import { randomUUID } from 'node:crypto';
import Steel from 'steel-sdk';
import fetch from 'node-fetch';
import type { SessionCreateParams, Session } from 'steel-sdk/resources/sessions';

const apiURL = 'https://api.steel.dev';

class SetupError extends Error {}

export function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new SetupError(`Set ${name} before running this example.`);
  return value;
}

export async function connect() {
  const key = required('STEEL_API_KEY');
  const projectId = required('STEEL_PROJECT_ID');
  const client = new Steel({
    steelAPIKey: key,
    baseURL: apiURL,
    // Avoid retrying a write whose outcome may be unknown.
    maxRetries: 0,
    timeout: 30_000,
    fetch: async (url, init) => {
      if (!process.env.STEEL_EXAMPLE_TRACE) return fetch(url, { ...init, redirect: 'error' });
      // Log only the API path, status and a correlation ID, never payloads or headers.
      const traceId = randomUUID().replaceAll('-', '');
      const headers = new fetch.Headers(init?.headers);
      headers.set('traceparent', `00-${traceId}-${randomUUID().replaceAll('-', '').slice(0, 16)}-01`);
      const response = await fetch(url, { ...init, headers, redirect: 'error' });
      console.log(JSON.stringify({ method: init?.method, path: new URL(String(url)).pathname, status: response.status, traceId }));
      return response;
    },
  });

  const { projects } = await client.projects.list();
  if (!projects.some(project => project.id === projectId && project.isProduction === false)) {
    throw new SetupError('STEEL_PROJECT_ID must be an accessible non-production QA project.');
  }

  // Each example uses sessions sequentially. Keep fixtures if release fails.
  return { client, projectId, key, sessionReleased: true };
}

export type Scope = Awaited<ReturnType<typeof connect>>;

export function fixture() {
  const namespace = `example-${randomUUID()}`;
  return {
    namespace,
    origin: `https://${namespace}.example.test`,
    value: { username: 'synthetic@example.test', password: 'synthetic-example-only' },
  };
}

export async function withSession<T>(scope: Scope, params: SessionCreateParams, run: (session: Session) => Promise<T>) {
  const session = await scope.client.sessions.create({
    timeout: 120_000,
    useProxy: false,
    solveCaptcha: false,
    ...params,
    projectId: scope.projectId,
  });
  scope.sessionReleased = false;
  try {
    return await run(session);
  } finally {
    try {
      await scope.client.sessions.release(session.id);
      scope.sessionReleased = true;
    } catch (error) {
      console.error(`Could not release session ${session.id}; check it before deleting related fixtures.`);
      throw error;
    }
  }
}

export async function main(run: () => Promise<void>) {
  try {
    await run();
  } catch (error) {
    // Do not print raw SDK/CDP errors: they can contain URLs or provider payloads.
    if (error instanceof SetupError) console.error(error.message);
    else if (error instanceof Steel.APIError) console.error(`Steel API request failed: HTTP ${error.status ?? 'unknown'}.`);
    else console.error('Example failed. Check the setup and any cleanup messages.');
    process.exitCode = 1;
  }
}
