// https://github.com/steel-dev/steel-cookbook/tree/main/examples/credentials-ts
import assert from 'node:assert/strict';
import { connect, fixture, main, withSession } from './common.ts';
import { syntheticForm } from './browser.ts';

await main(async () => {
  const scope = await connect();
  const { client, projectId, key } = scope;
  const { namespace, origin, value } = fixture();
  await client.credentials.create({ projectId, namespace, origin, value });
  try {
    // No explicit binding: the session looks up the credential in its namespace.
    await withSession(scope, { namespace, credentials: { autoSubmit: false, origins: [origin] } }, async session => {
      const { browser, page, cdp } = await syntheticForm(session, key, origin);
      try {
        const { frames } = await cdp.steel.detect({ origin, checkCredentials: true });
        const frame = frames.find(f => f.origin === origin && f.groups.length);
        assert(frame && frame.credentialAvailable, 'No matching credential or sign-in form');
        // Target the detected document and form, rather than whichever form is active later.
        const { filled, submitted } = await cdp.steel.fill({
          origin,
          frameId: frame.frameId,
          documentId: frame.documentId,
          groupId: frame.groups[0].groupId,
          submit: false,
        });
        assert.equal(await page.locator('#user').inputValue(), value.username);
        assert.equal(await page.locator('#pass').inputValue(), value.password);
        assert.equal(submitted, false);
        console.log({ filled, submitted });
      } finally {
        await browser.close();
      }
    });
  } finally {
    if (scope.sessionReleased) await client.credentials.delete({ projectId, namespace, origin });
  }
});
