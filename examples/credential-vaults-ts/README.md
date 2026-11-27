# Bind and fill a Vault credential (TypeScript)

A Vault is a named group of credentials in a Steel project. A credential outside a Vault fills in any session that shares its namespace. A credential inside a Vault fills only in a session that holds a binding to it. That makes a Vault the unit of access: one customer's logins, one environment's logins, one agent's logins.

A binding is a reference you pass when you create the session:

```typescript
const binding = `steel://vaults/${vault.id}`;
await withSession({ credentials: { bindings: [binding], autoSubmit: false, origins: [origin] } }, async session => {
  // ...
});
```

`steel://vaults/<vault>` covers every credential in the Vault. Add an item to the end, `steel://vaults/<vault>/<item>`, and it covers one. A session with a binding uses `explicit` lookup: it fills what you bound and nothing else. A session without one uses `implicit` lookup, which matches by namespace and origin, as in the [credentials](../credentials-ts) recipe.

`index.ts` creates a Vault, puts one made-up login in it, binds the Vault to a session, and fills a sign-in form with that item:

```typescript
const result = await steel.fill({ origin, reference: `${binding}/${item.id}`, submit: false });
```

`reference` names the exact item to fill. With one credential per site you can leave it out. It matters when two bound credentials match the same page, because Steel then fills neither until you choose.

The SDK can create, rename, and delete Vaults, but has no typed method yet for putting a credential in one. The script calls `POST /v1/secrets` through `client.post`, the SDK's own HTTP client, so your API key and base URL still apply.

## Run it

```bash
cd examples/credential-vaults-ts
cp .env.example .env          # set STEEL_API_KEY
npm install
npm start
```

Get a key at [app.steel.dev/settings/api-keys](https://app.steel.dev/settings/api-keys). `STEEL_PROJECT_ID` is only for organization-scoped keys.

Your output varies. Structure looks like this:

```text
Created Vault cookbook-3f2a9c1e-...
Added a credential to the Vault.
Session viewer: https://app.steel.dev/sessions/ab12cd34...
Lookup: explicit. Bindings: steel://vaults/9d41...
Filled: username, password. Submitted: false
The email field now holds: demo@example.test
Session released.
Vault deleted.
```

The login is made up and so is the site. `openLoginForm` in `browser.ts` has Playwright serve a sign-in page on a `.example.test` origin from inside the session, so nothing is sent to a real website and the form is never submitted. Open the session viewer URL to watch the fields fill.

## Change bindings on a running session

```bash
npm run bindings
```

`bindings.ts` creates two empty Vaults and a session with `credentials: {}`, then attaches the first Vault, replaces it with the second, and detaches that one. It prints the session's access after each step:

```text
New session: lookup=implicit, bindings=0
After attach: lookup=explicit, bindings=1
After replace: lookup=explicit, bindings=1
After detach: lookup=explicit, bindings=0
```

The last line is the one to remember. The first binding makes a session explicit, and it stays explicit. With no bindings left it fills nothing, and it does not fall back to namespace matching.

The session must be created with `credentials`, even an empty object. Without it, every call to change bindings fails with `credentials_not_enabled`.

## Make it yours

- **Bind by name.** A reference accepts a Vault's name in place of its ID: `steel://vaults/acme-prod`. Names are 1 to 63 lowercase letters, digits, dots, underscores, or hyphens.
- **Bind one item.** Pass `steel://vaults/<vault>/<item>` in `bindings` when a session must reach a fixed set. A whole-Vault binding also covers items added while the session runs.
- **List what a Vault holds.** The session's access lists the Vault under `bindings`, not its items. For the items, call `GET /v1/secrets?kind=credential&vaultId=<id>`.
- **Clean up in order.** A Vault must be empty before you delete it. The `finally` block in `index.ts` removes the item first, then the Vault.

## Related

[Credentials](../credentials-ts) (store a login and fill by namespace) · [One Vault per user](../credential-multi-user-ts) · [Secret Connections](../secret-connections-ts) (logins that stay in 1Password or HashiCorp Vault) · [Playwright docs](https://playwright.dev)
