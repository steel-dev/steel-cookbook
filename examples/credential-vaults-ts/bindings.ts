// https://github.com/steel-dev/steel-cookbook/tree/main/examples/credential-vaults-ts
import type { Vault } from 'steel-sdk/resources/vaults';
import { client, demoLogin, projectId, withSession } from './common.ts';

const vaults: Vault[] = [];

try {
  for (let i = 0; i < 2; i++) {
    vaults.push(await client.vaults.create({ projectId, name: demoLogin().namespace }));
  }
  const [first, second] = vaults.map(vault => `steel://vaults/${vault.id}`);

  // The session must be created with `credentials`, even an empty one,
  // or its bindings cannot be changed later.
  await withSession({ credentials: {} }, async session => {
    const bindings = client.sessions.credentials;
    const show = async (step: string) => {
      const access = await bindings.list(session.id);
      console.log(`${step}: lookup=${access.lookup}, bindings=${access.bindings.length}`);
    };

    await show('New session');

    // The first binding switches the session from implicit to explicit lookup.
    await bindings.attach(session.id, { bindings: [first] });
    await show('After attach');

    // Replace swaps every binding for the ones you send.
    await bindings.replace(session.id, { bindings: [second] });
    await show('After replace');

    // Removing the last binding does not switch the session back to implicit.
    await bindings.detachBinding(session.id, { reference: second });
    await show('After detach');
  });
} finally {
  for (const vault of vaults) await client.vaults.delete(vault.id, { projectId });
  console.log('Vaults deleted.');
}
