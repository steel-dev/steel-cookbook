// https://github.com/steel-dev/steel-cookbook/tree/main/examples/credential-vaults-ts
import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import Steel from 'steel-sdk';
import type { Session, SessionCreateParams } from 'steel-sdk/resources/sessions';

if (!process.env.STEEL_API_KEY) {
  console.error('Set STEEL_API_KEY in .env. Get a key at https://app.steel.dev/settings/api-keys');
  process.exit(1);
}

export const client = new Steel({ steelAPIKey: process.env.STEEL_API_KEY });

// Only needed with an organization-scoped API key.
export const projectId = process.env.STEEL_PROJECT_ID || undefined;

// A made-up login for a made-up site, with a unique name for each run.
export function demoLogin() {
  const namespace = `cookbook-${randomUUID()}`;
  return {
    namespace,
    origin: `https://${namespace}.example.test`,
    value: { username: 'demo@example.test', password: 'not-a-real-password' },
  };
}

// Releases the session even if `run` throws.
export async function withSession<T>(params: SessionCreateParams, run: (session: Session) => Promise<T>) {
  const session = await client.sessions.create({ timeout: 120_000, ...params, projectId });
  console.log(`Session viewer: ${session.sessionViewerUrl}`);
  try {
    return await run(session);
  } finally {
    await client.sessions.release(session.id);
    console.log('Session released.');
  }
}
