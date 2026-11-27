// https://github.com/steel-dev/steel-cookbook/tree/main/examples/credentials-ts
import { client, demoLogin, projectId, withSession } from './common.ts';
import { openLoginForm } from './browser.ts';

const { namespace, origin, value } = demoLogin();
await client.credentials.create({ projectId, namespace, origin, value });

try {
  // `origins` limits this session to filling one site. `autoSubmit: false` leaves the click to you.
  await withSession({ namespace, credentials: { autoSubmit: false, origins: [origin] } }, async session => {
    const { browser, page, steel } = await openLoginForm(session, origin);
    try {
      // Ask Steel which sign-in forms it sees, and whether a stored credential matches.
      const { frames } = await steel.detect({ origin, checkCredentials: true });
      const frame = frames.find(f => f.origin === origin && f.groups.length > 0);
      if (!frame?.credentialAvailable) throw new Error('Steel found no sign-in form with a matching credential.');
      console.log(`Detected a sign-in form with fields: ${frame.groups[0].roles.join(', ')}`);

      // Fill that exact form, not whichever form happens to be on the page later.
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
