// https://github.com/steel-dev/steel-cookbook/tree/main/examples/credential-multi-user-ts
import assert from 'node:assert/strict';
import { connect, main, withSession } from './common.ts';
import { syntheticForm } from './browser.ts';
import { credentialsFor, visitOrder, withUsers } from './users.ts';

await main(async () => {
  const scope = await connect();
  await withUsers(scope, async (origin, users) => {
    // In an app, derive this ID from your authenticated user, not a request body.
    for (const userId of visitOrder) {
      const user = users.get(userId);
      assert(user, 'Missing user fixture');
      // Create a fresh browser session with exactly one user's Vault bound.
      await withSession(scope, { credentials: credentialsFor(user, origin) }, async session => {
        const access = await scope.client.sessions.credentials.list(session.id);
        assert.deepEqual(access.bindings, [`steel://vaults/${user.vaultId}`]);
        const { browser, page, cdp } = await syntheticForm(session, scope.key, origin);
        try {
          const result = await cdp.steel.fill({ origin, submit: false });
          assert.equal(result.submitted, false);
          assert.equal(await page.locator('#user').inputValue(), user.value.username);
          assert.equal(await page.locator('#pass').inputValue(), user.value.password);
          console.log(`Filled the synthetic form for ${userId}.`);
        } finally {
          await browser.close();
        }
      });
    }
  });
});
