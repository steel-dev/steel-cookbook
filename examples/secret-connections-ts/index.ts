// https://github.com/steel-dev/steel-cookbook/tree/main/examples/secret-connections-ts
import assert from 'node:assert/strict';
import type { SecretConnectionCreateParams } from 'steel-sdk/resources/secret-connections';
import { connect, fixture, main, required } from './common.ts';

await main(async () => {
  const provider = process.argv[2];
  if (!process.argv.includes('--disposable') || (provider !== '1password' && provider !== 'hashicorp_vault')) {
    console.log('Usage: npm start -- <1password|hashicorp_vault> --disposable');
    process.exitCode = 1;
    return;
  }
  const { client, projectId } = await connect();
  const input: Omit<SecretConnectionCreateParams, 'name'> = provider === '1password'
    ? { provider, auth: { serviceAccountToken: required('OP_SERVICE_ACCOUNT_TOKEN') } }
    : {
        provider,
        config: { address: required('VAULT_ADDR'), namespace: process.env.VAULT_NAMESPACE || undefined },
        auth: { type: 'token', token: required('VAULT_TOKEN') },
      };
  // Always create a new fixture; never test or update a connection by user-supplied ID.
  const connection = await client.secretConnections.create({ ...input, projectId, name: fixture().namespace });
  try {
    // Test verifies provider authentication, not the ability to fill a form.
    await client.secretConnections.test(connection.id, { projectId });
    const metadata = await client.secretConnections.retrieve(connection.id, { projectId });
    assert.equal(metadata.enabled, true);
    console.log({ provider: metadata.provider, authenticated: true, browserFillTested: false });
  } finally {
    await client.secretConnections.delete(connection.id, { projectId });
  }
});
