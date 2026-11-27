// https://github.com/steel-dev/steel-cookbook/tree/main/examples/credential-profiles-ts
import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import Steel from 'steel-sdk';
import type { Session, SessionCreateParams } from 'steel-sdk/resources/sessions';

if (!process.env.STEEL_API_KEY) {
  console.error('Set STEEL_API_KEY in .env. Get a key at https://app.steel.dev/settings/api-keys');
  process.exit(1);
}

export const client = new Steel({ steelAPIKey: process.env.STEEL_API_KEY });

// Only an organization-scoped API key needs a project ID. Leave it unset otherwise.
export const projectId = process.env.STEEL_PROJECT_ID || undefined;

// A made-up login for a made-up site. The unique name keeps each run separate
// from earlier runs and from anything else stored in your project.
export function demoLogin() {
  const namespace = `cookbook-${randomUUID()}`;
  return {
    namespace,
    origin: `https://${namespace}.example.test`,
    value: { username: 'demo@example.test', password: 'not-a-real-password' },
  };
}

// Creates a session, runs your code, and always releases the session afterwards.
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
