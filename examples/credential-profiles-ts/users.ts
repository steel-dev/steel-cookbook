// https://github.com/steel-dev/steel-cookbook/tree/main/examples/credential-profiles-ts
import { client, demoLogin, projectId } from './common.ts';

export type User = {
  id: string;
  vaultId: string;
  itemId?: string;
  profileId?: string;
  value: { username: string; password: string };
};

// Two users with different logins for the same site, one Vault each.
export async function createUsers() {
  const { origin } = demoLogin();
  const users: User[] = [];
  try {
    for (const id of ['alice', 'bob']) {
      const { namespace } = demoLogin();
      const value = { username: `${id}@example.test`, password: `${id}-not-a-real-password` };

      const vault = await client.vaults.create({ projectId, name: namespace });
      const user: User = { id, vaultId: vault.id, value };
      users.push(user);

      // The SDK has no method for adding a credential to a Vault yet, so call the endpoint.
      const item = await client.post<unknown, { id: string }>('/v1/secrets', {
        body: { projectId, kind: 'credential', vaultId: vault.id, name: 'login', namespace, origin, value },
      });
      user.itemId = item.id;
    }
    return { origin, users };
  } catch (error) {
    await deleteUsers(users);
    throw error;
  }
}

export async function deleteUsers(users: User[]) {
  for (const user of users) {
    // A Vault must be empty before you can delete it.
    if (user.itemId) await client.delete(`/v1/secrets/${user.itemId}`, { query: { projectId } });
    await client.vaults.delete(user.vaultId, { projectId });
  }
}

export function credentialsFor(user: User, origin: string) {
  return { bindings: [`steel://vaults/${user.vaultId}`], origins: [origin], autoSubmit: false };
}
