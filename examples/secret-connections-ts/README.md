# Test a Secret Connection (TypeScript and CLI)

A Secret Connection gives a Steel project read access to a secret manager you already use: 1Password or HashiCorp Vault (KV version 2). A session can then fill a login that stays in that provider. Steel reads it when the session needs it and keeps no copy.

The first thing to get right is that Steel can sign in to the provider at all. `index.ts` does only that. It creates a connection, tests it, reads it back, and deletes it:

```typescript
const connection = await client.secretConnections.create({
  ...settings,
  projectId,
  name: `cookbook-${randomUUID()}`,
});

await client.secretConnections.test(connection.id, { projectId });
```

`settings` holds what the provider needs. For 1Password that is a service account token. For HashiCorp Vault it is the server address and a token. `test` throws if Steel cannot authenticate, so reaching the next line means the token works.

No browser opens in this recipe. A passing test shows that the connection can sign in, not that a session can fill a form with it. A connection on its own also gives no session access to anything. A session reaches the provider's logins through a binding that names the connection, the same way it reaches a [Vault](../credential-vaults-ts).

## Run it

```bash
cd examples/secret-connections-ts
cp .env.example .env
npm install
```

Set `STEEL_API_KEY` in `.env` (get one at [app.steel.dev/settings/api-keys](https://app.steel.dev/settings/api-keys)), plus the variables for your provider. `STEEL_PROJECT_ID` is only for organization-scoped keys.

| Provider | Set in `.env` | Run |
|---|---|---|
| 1Password | `OP_SERVICE_ACCOUNT_TOKEN` | `npm start -- 1password` |
| HashiCorp Vault | `VAULT_ADDR`, `VAULT_TOKEN`, and `VAULT_NAMESPACE` if you use namespaces | `npm start -- hashicorp_vault` |

Your output varies. Structure looks like this:

```text
Created connection 5b0e7c2a-...
Test passed: Steel can sign in to the provider.
Saved connection: { name: 'cookbook-3f2a9c1e-...', provider: '1password', enabled: true }
Connection deleted.
```

The saved connection has no token in it. The API never returns the authentication you send.

Use a token with as little access as you can. For 1Password, make a service account that can read one test vault. For HashiCorp Vault, use a short-lived token with a read-only policy, not a root token. The script deletes the Steel connection when it finishes. It does not revoke the provider token, so do that yourself if you made one for this test.

## Inspect resources with the CLI

`cli.sh` wraps four read-only [Steel CLI](https://github.com/steel-dev/cli) commands. Each lists what you have and changes nothing. It needs CLI 0.5.1 or later, and reads `STEEL_API_KEY` from your shell, not from `.env`:

```bash
export STEEL_API_KEY=your-key

bash cli.sh credentials      # credentials in the default namespace
bash cli.sh vaults           # Vaults in the project
bash cli.sh connections      # Secret Connections in the project
EXAMPLE_SESSION_ID=<session-id> bash cli.sh bindings
```

Set `EXAMPLE_NAMESPACE` to list credentials in another namespace. `bindings` shows what a running session can use, which is the quickest check when a form stays empty.

## Make it yours

- **Keep the connection.** Remove the `finally` block and save `connection.id`. You create a connection once per project, not once per run.
- **Test an existing one.** Call `client.secretConnections.list({ projectId })`, then `test` with an ID from the list. Testing does not change the saved connection.
- **Use AppRole.** HashiCorp Vault connections also accept an AppRole in `auth`. Each test can sign in again, and each sign-in takes one use of the secret ID.

## Related

[Vaults](../credential-vaults-ts) (bindings for logins stored in Steel) · [Credentials](../credentials-ts) (the basics) · [1Password service accounts](https://developer.1password.com/docs/service-accounts/) · [HashiCorp Vault tokens](https://developer.hashicorp.com/vault/docs/concepts/tokens)
