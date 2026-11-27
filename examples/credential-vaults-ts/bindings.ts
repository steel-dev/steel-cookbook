// https://github.com/steel-dev/steel-cookbook/tree/main/examples/credential-vaults-ts
import assert from 'node:assert/strict';
import { connect, fixture, main, withSession } from './common.ts';

await main(async () => {
  const scope = await connect();
  const { client, projectId } = scope;
  const first = await client.vaults.create({ projectId, name: fixture().namespace });
  try {
    const second = await client.vaults.create({ projectId, name: fixture().namespace });
    try {
      await withSession(scope, { namespace: fixture().namespace, credentials: { autoSubmit: false } }, async session => {
        const bindings = client.sessions.credentials;
        const firstReference = `steel://vaults/${first.id}`;
        const secondReference = `steel://vaults/${second.id}`;
        // The first explicit binding switches the session out of namespace lookup.
        assert.equal((await bindings.list(session.id)).lookup, 'implicit');
        await bindings.attach(session.id, { bindings: [firstReference] });
        const attached = await bindings.list(session.id);
        assert.equal(attached.lookup, 'explicit');
        assert.deepEqual(attached.bindings, [firstReference]);

        await bindings.replace(session.id, { bindings: [secondReference] });
        assert.deepEqual((await bindings.list(session.id)).bindings, [secondReference]);
        await bindings.detachBinding(session.id, { reference: secondReference });
        // An empty explicit binding list does not restore implicit access.
        const detached = await bindings.list(session.id);
        assert.equal(detached.lookup, 'explicit');
        assert.deepEqual(detached.bindings, []);
        console.log('Attach, replace and detach passed; removing all bindings did not restore implicit lookup.');
      });
    } finally {
      if (scope.sessionReleased) await client.vaults.delete(second.id, { projectId });
    }
  } finally {
    if (scope.sessionReleased) await client.vaults.delete(first.id, { projectId });
  }
});
