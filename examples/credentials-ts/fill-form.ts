// https://github.com/steel-dev/steel-cookbook/tree/main/examples/credentials-ts
import { client, demoLogin, projectId, withSession } from './common.ts';
import { openLoginForm } from './browser.ts';

const { namespace, origin, value } = demoLogin();
await client.credentials.create({ projectId, namespace, origin, value });

try {
  // Fill on this site only, and leave the submit to the script.
  await withSession({ namespace, credentials: { autoSubmit: false, origins: [origin] } }, async session => {
    const { browser, page, steel } = await openLoginForm(session, origin);
    try {
      // Find the sign-in form and check that a stored credential matches it.
      const { frames } = await steel.detect({ origin, checkCredentials: true });
      const frame = frames.find(f => f.origin === origin && f.groups.length > 0);
      if (!frame?.credentialAvailable) throw new Error('Steel found no sign-in form with a matching credential.');
      console.log(`Detected a sign-in form with fields: ${frame.groups[0].roles.join(', ')}`);

      // Fill the form that detect found.
      const result = await steel.fill({
        origin,
        frameId: frame.frameId,
        documentId: frame.documentId,
        groupId: frame.groups[0].groupId,
        submit: false,
      });
      console.log(`Filled: ${result.filled.join(', ')}. Submitted: ${result.submitted}`);
      console.log(`The email field now holds: ${await page.locator('#user').inputValue()}`);
    } finally {
      await browser.close();
    }
  });
} finally {
  await client.credentials.delete({ projectId, namespace, origin });
  console.log('Credential deleted.');
}
