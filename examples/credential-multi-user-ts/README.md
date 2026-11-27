# Route sessions to a Vault per user (TypeScript)

When your product signs in to the same website for many of your users, every user has a different login for one origin. The session has to get the right one, and must not be able to reach anyone else's. A Vault per user solves both: each session is bound to exactly one Vault.

`createUsers` in `users.ts` sets up two users, Alice and Bob. Each gets a Vault holding their own login for the same site. `credentialsFor` turns a user into session options:

```typescript
export function credentialsFor(user: User, origin: string) {
  return { bindings: [`steel://vaults/${user.vaultId}`], origins: [origin], autoSubmit: false };
}
```

`bindings` is what the session can use. `origins` is where it may fill. `index.ts` then opens a new session for Alice, then Bob, then Alice again, and asks Steel to fill the sign-in form each time:

```typescript
await withSession({ credentials: credentialsFor(user, origin) }, async session => {
  const { browser, page, steel } = await openLoginForm(session, origin);
  await steel.fill({ origin, submit: false });
  // ...
});
```

The `fill` call names no credential. It doesn't need to: only one login for this site is in reach of the session. Bind both Vaults instead and Steel fills nothing, because it does not pick between two credentials that match the same page.

If Vaults and bindings are new to you, start with the [Vaults](../credential-vaults-ts) recipe.

## Run it

```bash
cd examples/credential-multi-user-ts
cp .env.example .env          # set STEEL_API_KEY
npm install
npm start
```

Get a key at [app.steel.dev/settings/api-keys](https://app.steel.dev/settings/api-keys). `STEEL_PROJECT_ID` is only for organization-scoped keys.

Your output varies. Structure looks like this:

```text
Created a Vault for each of: alice, bob
Session viewer: https://app.steel.dev/sessions/ab12cd34...
Session for alice filled: alice@example.test
Session released.
Session viewer: https://app.steel.dev/sessions/ef56ab78...
Session for bob filled: bob@example.test
Session released.
Session viewer: https://app.steel.dev/sessions/cd90ef12...
Session for alice filled: alice@example.test
Session released.
Vaults deleted.
```

Three sessions run one after another. The logins and the site are made up. `openLoginForm` in `browser.ts` has Playwright serve the sign-in page on a `.example.test` origin from inside the session, and the form is never submitted.

## Make it yours

- **Map users on your server.** Store each user's Vault ID next to your own user record, and look it up from the signed-in user. Never accept a Vault ID from a request body, or one user can ask for another's Vault.
- **Create the Vault at signup.** `createUsers` builds and `deleteUsers` removes everything in one run so the recipe leaves nothing behind. In an app, the Vault lives as long as the user does.
- **Hold several sites per user.** A Vault can hold logins for many sites. One binding covers all of them, each filling only on its own origin. Add those origins to `origins`.
- **Skip the login next time.** Pair each user's Vault with a saved browser profile, as [profiles with credentials](../credential-profiles-ts) does, and the session starts already signed in.

## Related

[Vaults](../credential-vaults-ts) (create a Vault and bind it) · [Profiles with credentials](../credential-profiles-ts) · [Credentials](../credentials-ts) (the basics) · [Playwright docs](https://playwright.dev)
