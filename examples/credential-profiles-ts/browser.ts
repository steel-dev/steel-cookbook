// https://github.com/steel-dev/steel-cookbook/tree/main/examples/credential-profiles-ts
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import type { Session } from 'steel-sdk/resources/sessions';

const cdpHosts = new Set(['api.steel.dev', 'api.steel-edge.net', 'connect.steel.dev', 'connect.steel-edge.net', 'steel-api.fly.dev']);

export async function connectBrowser(session: Session, key: string) {
  const url = new URL(session.websocketUrl);
  // Validate the destination before attaching the API key to the CDP URL.
  assert(url.protocol === 'wss:' && cdpHosts.has(url.hostname) && !url.port && !url.username && !url.password,
    'Unexpected Steel CDP destination');
  url.searchParams.set('apiKey', key);
  url.searchParams.set('sessionId', session.id);
  return chromium.connectOverCDP(url.toString(), { timeout: 20_000 });
}
