// https://github.com/steel-dev/steel-cookbook/tree/main/examples/credential-vaults-ts
import { client, demoLogin, projectId, withSession } from './common.ts';
import { openLoginForm } from './browser.ts';

const { namespace, origin, value } = demoLogin();

const vault = await client.vaults.create({ projectId, name: namespace, description: 'Cookbook example' });
console.log(`Created Vault ${vault.name}`);
let itemId: string | undefined;

try {
  // The SDK has no method for adding a credential to a Vault yet, so call the endpoint.
  const item = await client.post<unknown, { id: string }>('/v1/secrets', {
    body: { projectId, kind: 'credential', vaultId: vault.id, name: 'demo-login', namespace, origin, value },
  });
  itemId = item.id;
  console.log('Added a credential to the Vault.');

  // A binding gives the session everything in the Vault, and nothing else.
  const binding = `steel://vaults/${vault.id}`;
  await withSession({ credentials: { bindings: [binding], autoSubmit: false, origins: [origin] } }, async session => {
    const access = await client.sessions.credentials.list(session.id);
    console.log(`Lookup: ${access.lookup}. Bindings: ${access.bindings.join(', ')}`);

    const { browser, page, steel } = await openLoginForm(session, origin);
    try {
      // `reference` picks the item to fill.
      const result = await steel.fill({ origin, reference: `${binding}/${item.id}`, submit: false });
      console.log(`Filled: ${result.filled.join(', ')}. Submitted: ${result.submitted}`);
      console.log(`The email field now holds: ${await page.locator('#user').inputValue()}`);
    } finally {
      await browser.close();
    }
  });
} finally {
  // A Vault must be empty before you can delete it.
  if (itemId) await client.delete(`/v1/secrets/${itemId}`, { query: { projectId } });
  await client.vaults.delete(vault.id, { projectId });
  console.log('Vault deleted.');
}
