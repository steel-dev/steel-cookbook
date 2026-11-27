// https://github.com/steel-dev/steel-cookbook/tree/main/examples/credentials-ts
import assert from 'node:assert/strict';
import { connect, fixture, main, withSession } from './common.ts';
import { syntheticForm } from './browser.ts';

await main(async () => {
  const scope = await connect();
  const { client, projectId, key } = scope;
  const { namespace, origin, value } = fixture();
  const credential = { projectId, namespace, origin };
  await client.credentials.create({ ...credential, value });
  try {
    // With no binding, the session matches the legacy credential by namespace and origin.
    await withSession(scope, { namespace, credentials: { autoSubmit: false } }, async session => {
      const { browser, page } = await syntheticForm(session, key, origin, { autofill: true });
      try {
        await page.waitForFunction(
          expected => document.querySelector<HTMLInputElement>('#user')?.value === expected.username &&
            document.querySelector<HTMLInputElement>('#pass')?.value === expected.password,
          value,
          { timeout: 15_000 },
        );
        assert.equal(page.url(), `${origin}/login`);
        console.log('Both fields autofilled using implicit credential lookup. No form was submitted.');
      } finally {
        await browser.close();
      }
    });
  } finally {
    if (scope.sessionReleased) await client.credentials.delete(credential);
  }
});
