// https://github.com/steel-dev/steel-cookbook/tree/main/examples/credentials-ts
import assert from 'node:assert/strict';
import { connect, fixture, main } from './common.ts';

await main(async () => {
  const { client, projectId } = await connect();
  const { origin, namespace, value } = fixture();
  const scope = { origin, namespace, projectId };
  await client.credentials.create({ ...scope, value, label: 'Synthetic login' });
  try {
    // additionalOrigins replaces the previous list; it doesn't append to it.
    await client.credentials.update({ ...scope, additionalOrigins: [`https://login.${new URL(origin).hostname}`] });
    const { credentials } = await client.credentials.list(scope);
    assert.equal(credentials.length, 1);
    const { label, additionalOrigins } = credentials[0];
    console.log('Stored credential metadata:', { origin, namespace, label, additionalOrigins });
  } finally {
    await client.credentials.delete(scope);
  }
});
