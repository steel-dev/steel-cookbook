// https://github.com/steel-dev/steel-cookbook/tree/main/examples/credentials-ts
import { randomUUID } from 'node:crypto';
import { chromium } from 'playwright';
import { client, projectId, withSession } from './common.ts';

// Steel's practice site shows this test login on its own sign-in page.
const origin = 'https://steel.dev';
const value = { username: 'tomsmith', password: 'SuperSecretPassword!' };

// A namespace keeps this run's credential apart from any others you have stored.
const namespace = `cookbook-${randomUUID()}`;

console.log('Storing the credential...');
await client.credentials.create({ origin, value, namespace, projectId });

try {
  // `credentials: {}` turns on credentials for the session.
  await withSession({ namespace, credentials: {} }, async session => {
    const browser = await chromium.connectOverCDP(session.websocketUrl);
    try {
      const context = browser.contexts()[0];
      const page = context.pages()[0] ?? await context.newPage();

      await page.goto(`${origin}/practice/login`);
      // Steel fills the form and submits it.
      await page.waitForURL(`${origin}/practice/secure`, { timeout: 30_000 });
      console.log(`Signed in. Now at ${page.url()}`);
    } finally {
      await browser.close();
    }
  });
} finally {
  await client.credentials.delete({ origin, namespace, projectId });
  console.log('Credential deleted.');
}
