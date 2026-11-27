// https://github.com/steel-dev/steel-cookbook/tree/main/examples/credential-vaults-ts
import assert from 'node:assert/strict';
import { connect, fixture, main, withSession } from './common.ts';
import { syntheticForm } from './browser.ts';

await main(async () => {
  const scope = await connect();
  const { client, projectId, key } = scope;
  const { namespace, origin, value } = fixture();
  const vault = await client.vaults.create({ projectId, name: namespace, description: 'Disposable examples Vault' });
  let itemId: string | undefined;
  try {
    const renamed = await client.vaults.update(vault.id, { projectId, name: `${namespace}-renamed` });
    assert.equal(renamed.id, vault.id);

    // Assigning a credential to a Vault uses the HTTP endpoint in the Vaults guide.
    // The published SDK does not have a typed Secrets resource; use its HTTP client.
    const body = { projectId, kind: 'credential', vaultId: vault.id, name: 'fixture', namespace, origin, value };
    const item = await client.post<typeof body, { id: string }>('/v1/secrets', { body });
    itemId = item.id;
    const { secrets } = await client.get<{ projectId: string; kind: string; vaultId: string }, { secrets: { id: string }[] }>('/v1/secrets', {
      query: { projectId, kind: 'credential', vaultId: vault.id },
    });
    assert(secrets.some(s => s.id === item.id));

    const binding = `steel://vaults/${vault.id}`;
    await withSession(scope, { credentials: { bindings: [binding], autoSubmit: false, origins: [origin] } }, async session => {
      const access = await client.sessions.credentials.list(session.id);
      assert.equal(access.lookup, 'explicit');
      assert(access.bindings.includes(binding));
      // A whole-Vault binding need not expand its items into access.credentials.
      console.log({ lookup: access.lookup, bindings: access.bindings, individuallyBound: access.credentials.length });
      const { browser, page, cdp } = await syntheticForm(session, key, origin);
      try {
        const { submitted } = await cdp.steel.fill({ origin, reference: `${binding}/${item.id}`, submit: false });
        assert.equal(await page.locator('#user').inputValue(), value.username);
        assert.equal(await page.locator('#pass').inputValue(), value.password);
        assert.equal(submitted, false);
        console.log('Filled the Vault item without submitting.');
      } finally {
        await browser.close();
      }
    });
  } finally {
    if (scope.sessionReleased) {
      // Vaults must be empty before they can be deleted.
      if (itemId) await client.delete(`/v1/secrets/${encodeURIComponent(itemId)}`, { query: { projectId } });
      await client.vaults.delete(vault.id, { projectId });
    }
  }
});
