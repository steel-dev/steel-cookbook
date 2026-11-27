// https://github.com/steel-dev/steel-cookbook/tree/main/examples/credential-profiles-ts
import { setTimeout as delay } from 'node:timers/promises';
import { chromium, type Browser, type Page } from 'playwright';
import { wrapCDPSession } from 'steel-sdk/cdp';
import type { Session } from 'steel-sdk/resources/sessions';
import { client, projectId, withSession } from './common.ts';
import { accountOwner, clickSignIn, mockWebsite, signOut } from './site.ts';
import { createUsers, credentialsFor, deleteUsers, type User } from './users.ts';

const withFallback = process.argv.includes('--with-vault-fallback');
const { origin, users } = await createUsers();

// Connects Playwright to a session and serves the demo website in it.
async function visit(session: Session, run: (page: Page, browser: Browser) => Promise<void>) {
  // websocketUrl already holds a token for this session, so it needs no API key.
  const browser = await chromium.connectOverCDP(session.websocketUrl);
  try {
    const context = browser.contexts()[0];
    await mockWebsite(context, origin, users);
    await run(context.pages()[0] ?? await context.newPage(), browser);
  } finally {
    await browser.close();
  }
}

// Steel fills the form from the user's Vault, then the script clicks the button.
async function signInWithVault(page: Page, browser: Browser) {
  const { steel } = wrapCDPSession(await browser.newBrowserCDPSession());
  await steel.setControls({ autofill: false, autoSubmit: false });
  await page.goto(`${origin}/login`);
  await page.bringToFront();
  await steel.fill({ origin, submit: false });
  await clickSignIn(page);
}

// The script types the login itself. No Steel credentials are involved.
async function signInByTyping(page: Page, user: User) {
  await page.goto(`${origin}/login`);
  await page.locator('#user').fill(user.value.username);
  await page.locator('#pass').fill(user.value.password);
  await clickSignIn(page);
}

// A profile uploads after its session is released. Wait until it is ready to use.
async function waitForProfile(profileId: string) {
  for (let attempt = 0; attempt < 30; attempt++) {
    const profile = await client.profiles.get(profileId, { projectId });
    if (profile.status === 'READY') return;
    if (profile.status !== 'UPLOADING') break;
    await delay(2_000);
  }
  throw new Error(`Profile ${profileId} did not become ready.`);
}

try {
  // Step 1: sign each user in once, and save the browser profile.
  for (const user of users) {
    // A profile saved by a session that uses credentials cannot fill credentials
    // later. So when the Vault must work afterwards, save the profile without it.
    const credentials = withFallback ? undefined : credentialsFor(user, origin);
    await withSession({ persistProfile: true, credentials }, async session => {
      if (!session.profileId) throw new Error('The session returned no profile ID.');
      user.profileId = session.profileId;
      await visit(session, (page, browser) =>
        withFallback ? signInByTyping(page, user) : signInWithVault(page, browser));
    });
    await waitForProfile(user.profileId!);
    console.log(`Saved a signed-in profile for ${user.id}.`);
  }

  // Step 2: start new sessions from the saved profiles. Nobody signs in again.
  for (const id of ['alice', 'bob', 'alice']) {
    const user = users.find(u => u.id === id)!;
    const credentials = withFallback ? credentialsFor(user, origin) : undefined;
    // No `persistProfile` here, so this session does not change the saved profile.
    await withSession({ profileId: user.profileId, credentials }, session =>
      visit(session, async (page, browser) => {
        console.log(`Opened ${id}'s profile. Signed in as: ${await accountOwner(page, origin)}`);
        if (!withFallback) return;

        await signOut(page);
        await signInWithVault(page, browser);
        console.log(`Signed out, then back in from the Vault as: ${await accountOwner(page, origin)}`);
      }));
  }
} finally {
  for (const user of users) {
    if (user.profileId) await client.profiles.delete(user.profileId, { projectId });
  }
  await deleteUsers(users);
  console.log('Profiles and Vaults deleted.');
}
