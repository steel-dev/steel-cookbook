// https://github.com/steel-dev/steel-cookbook/tree/main/examples/credential-multi-user-ts
import { randomUUID } from 'node:crypto';
import { fixture, type Scope } from './common.ts';

export const demoUsers = ['alice', 'bob'] as const;
export const visitOrder = ['alice', 'bob', 'alice'] as const;
export type UserId = (typeof demoUsers)[number];

export async function withUsers(scope: Scope, run: (origin: string, users: ReadonlyMap<UserId, User>) => Promise<void>) {
  const { client, projectId } = scope;
  const { origin } = fixture(); // Both accounts use the exact same origin.
  const users = new Map<UserId, User>();
  const created: User[] = [];
  try {
    for (const id of demoUsers) {
      const { namespace } = fixture();
      const value = { username: `${id}@example.test`, password: randomUUID() };
      const vault = await client.vaults.create({ projectId, name: namespace });
      const user: User = { id, value, vaultId: vault.id };
      created.push(user);
      // The SDK has no typed Secrets resource; use its HTTP client for Vault items.
      const body = { projectId, kind: 'credential', vaultId: vault.id, name: 'login', namespace, origin, value };
      user.itemId = (await client.post<typeof body, { id: string }>('/v1/secrets', { body })).id;
      users.set(id, user);
    }
    await run(origin, users);
  } finally {
    if (scope.sessionReleased) {
      const errors: unknown[] = [];
      for (const user of created.reverse()) {
        // Never attempt to delete a Vault if deleting its member failed.
        try {
          if (user.itemId) await client.delete(`/v1/secrets/${encodeURIComponent(user.itemId)}`, { query: { projectId } });
          await client.vaults.delete(user.vaultId, { projectId });
        } catch (error) {
          console.error(`Check cleanup for synthetic Vault ${user.vaultId}.`);
          errors.push(error);
        }
      }
      if (errors.length) throw new Error('Vault cleanup incomplete');
    }
  }
}

export type User = {
  id: UserId;
  vaultId: string;
  itemId?: string;
  profileId?: string;
  value: { username: string; password: string };
};

export function credentialsFor(user: User, origin: string) {
  return { bindings: [`steel://vaults/${user.vaultId}`], origins: [origin], autoSubmit: false };
}
