# Reuse a signed-in browser profile per user (TypeScript)

A profile is a saved copy of a browser's state: cookies, local storage, and the rest of its user data. A session that starts from a profile opens already signed in, with no login form at all. Credentials do the opposite job. They sign in from scratch every time. This recipe uses both for two users, Alice and Bob, who have different accounts on the same site.

It runs in two steps. Step 1 signs each user in once and saves the profile:

```typescript
await withSession({ persistProfile: true, credentials }, async session => {
  user.profileId = session.profileId;
  // sign in...
});
await waitForProfile(user.profileId!);
```

`persistProfile: true` tells Steel to save the browser's state when the session is released. The upload takes a few seconds, so `waitForProfile` polls until the profile's status is `READY`.

Step 2 starts new sessions from those profiles, for Alice, then Bob, then Alice again:

```typescript
await withSession({ profileId: user.profileId, credentials }, session =>
  visit(session, async (page, browser) => {
    console.log(`Opened ${id}'s profile. Signed in as: ${await accountOwner(page, origin)}`);
  }));
```

Each session opens the account page directly and lands on the right account. There is no `persistProfile` in step 2, so these sessions read the profile without changing it.

Each user's login sits in their own Vault, set up by `createUsers` in `users.ts`. See [one Vault per user](../credential-multi-user-ts) for that part on its own.

## Run it

```bash
cd examples/credential-profiles-ts
cp .env.example .env          # set STEEL_API_KEY
npm install
npm start
```

Get a key at [app.steel.dev/settings/api-keys](https://app.steel.dev/settings/api-keys). `STEEL_PROJECT_ID` is only for organization-scoped keys.

Your output varies. With the session viewer and release lines left out, the structure looks like this:

```text
Saved a signed-in profile for alice.
Saved a signed-in profile for bob.
Opened alice's profile. Signed in as: alice
Opened bob's profile. Signed in as: bob
Opened alice's profile. Signed in as: alice
Profiles and Vaults deleted.
```

Five sessions run one after another, and each profile takes a few seconds to save. The site is made up. `mockWebsite` in `site.ts` has Playwright act as a small website inside the session: it checks the login, sets a cookie, and shows an account page to whoever holds that cookie. No request reaches a real website.

## Sign in again when the site's session expires

A profile only helps while its cookies are valid. When the site signs the user out, you want credentials to take over. Run:

```bash
npm start -- --with-vault-fallback
```

In this mode step 2 binds the user's Vault to the session. After the profile opens the account, the script deletes the login cookie to act out an expired session, then has Steel fill the form from the Vault:

```text
Opened alice's profile. Signed in as: alice
Signed out, then back in from the Vault as: alice
```

There is one rule to know, and it is why the flag changes step 1 too. A profile saved by a session that uses `credentials` keeps its login, but later sessions that start from that profile cannot fill credentials. Their sign-in forms stay empty. So with the flag, step 1 creates its sessions without `credentials` and `signInByTyping` types the login with plain Playwright. Without the flag, step 1 uses `signInWithVault`, which is fine because step 2 never needs to fill.

The choice in one line: save the profile from a session without `credentials` whenever a later session needs both the profile and a fill.

## Make it yours

- **Keep the profiles.** The `finally` block deletes the profiles and Vaults so the recipe leaves nothing behind. In an app, store each user's `profileId` and Vault ID next to your own user record and reuse them.
- **Sign in by hand once.** For a site with a captcha or a second factor at login, replace `signInByTyping` with a pause, open the session viewer URL, and sign in yourself. The profile saves the result.
- **Refresh a profile.** Pass both `profileId` and `persistProfile: true` to save a session's changes back to the profile. Do that only in sessions without `credentials`.

## Related

[Profiles](../profiles-ts) (profiles on their own) · [One Vault per user](../credential-multi-user-ts) · [Vaults](../credential-vaults-ts) · [auth-context](../auth-context-ts) (cookies without a full profile) · [Playwright docs](https://playwright.dev)
