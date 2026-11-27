// https://github.com/steel-dev/steel-cookbook/tree/main/examples/credential-multi-user-ts
import { withSession } from './common.ts';
import { openLoginForm } from './browser.ts';
import { createUsers, credentialsFor, deleteUsers } from './users.ts';

const { origin, users } = await createUsers();
console.log(`Created a Vault for each of: ${users.map(user => user.id).join(', ')}`);

try {
  for (const id of ['alice', 'bob', 'alice']) {
    // In your app, look this up from your own signed-in user.
    const user = users.find(u => u.id === id)!;

    // Bind only this user's Vault.
    await withSession({ credentials: credentialsFor(user, origin) }, async session => {
      const { browser, page, steel } = await openLoginForm(session, origin);
      try {
        await steel.fill({ origin, submit: false });
        console.log(`Session for ${id} filled: ${await page.locator('#user').inputValue()}`);
      } finally {
        await browser.close();
      }
    });
  }
} finally {
  await deleteUsers(users);
  console.log('Vaults deleted.');
}
