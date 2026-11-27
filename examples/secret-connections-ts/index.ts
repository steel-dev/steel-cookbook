// https://github.com/steel-dev/steel-cookbook/tree/main/examples/secret-connections-ts
import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import Steel from 'steel-sdk';
import type { SecretConnectionCreateParams } from 'steel-sdk/resources/secret-connections';

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) {
    console.error(`Set ${name} in .env before running this example.`);
    process.exit(1);
  }
  return value;
}

const provider = process.argv[2];
if (provider !== '1password' && provider !== 'hashicorp_vault') {
  console.error('Usage: npm start -- <1password|hashicorp_vault>');
  process.exit(1);
}

const client = new Steel({ steelAPIKey: required('STEEL_API_KEY') });
// Only needed with an organization-scoped API key.
const projectId = process.env.STEEL_PROJECT_ID || undefined;

const settings: Omit<SecretConnectionCreateParams, 'name'> = provider === '1password'
  ? { provider, auth: { serviceAccountToken: required('OP_SERVICE_ACCOUNT_TOKEN') } }
  : {
      provider,
      config: { address: required('VAULT_ADDR'), namespace: process.env.VAULT_NAMESPACE || undefined },
      auth: { type: 'token', token: required('VAULT_TOKEN') },
    };

const connection = await client.secretConnections.create({
  ...settings,
  projectId,
  name: `cookbook-${randomUUID()}`,
});
console.log(`Created connection ${connection.id}`);

try {
  // Throws if Steel cannot sign in to the provider.
  await client.secretConnections.test(connection.id, { projectId });
  console.log('Test passed: Steel can sign in to the provider.');

  const saved = await client.secretConnections.retrieve(connection.id, { projectId });
  console.log('Saved connection:', { name: saved.name, provider: saved.provider, enabled: saved.enabled });
} finally {
  await client.secretConnections.delete(connection.id, { projectId });
  console.log('Connection deleted.');
}
