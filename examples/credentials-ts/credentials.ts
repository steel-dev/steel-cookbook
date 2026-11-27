// https://github.com/steel-dev/steel-cookbook/tree/main/examples/credentials-ts
import { client, demoLogin, projectId } from './common.ts';

const { origin, namespace, value } = demoLogin();
// Steel finds a credential by its origin and namespace, so every call takes both.
const key = { origin, namespace, projectId };

await client.credentials.create({ ...key, value, label: 'Demo login' });
console.log(`Created a credential for ${origin}`);

try {
  // The list you send replaces the stored list. It does not add to it.
  const loginOrigin = `https://login.${new URL(origin).hostname}`;
  await client.credentials.update({ ...key, additionalOrigins: [loginOrigin] });
  console.log(`Updated it to also fill on ${loginOrigin}`);

  // The API never returns the stored username or password.
  const { credentials } = await client.credentials.list(key);
  for (const credential of credentials) {
    console.log('Listed:', { label: credential.label, origin: credential.origin, namespace: credential.namespace });
  }
} finally {
  await client.credentials.delete(key);
  console.log('Credential deleted.');
}
