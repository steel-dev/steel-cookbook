# Test a disposable Secret Connection (TypeScript and CLI)

The SDK example creates a temporary connection to a disposable 1Password vault or HashiCorp Vault fixture, checks provider authentication, retrieves metadata, and deletes the connection. It does not open a browser or modify an existing connection.

## Run it

Export `STEEL_API_KEY` and `STEEL_PROJECT_ID` for a disposable QA project on `https://api.steel.dev`. Set the provider variables listed in `.env.example` for your disposable fixture only. Use a scoped service-account token for 1Password, or a short-lived scoped token for HashiCorp Vault, not an admin token. Set `VAULT_NAMESPACE` only when required by your fixture.

```bash
npm install
npm start -- 1password --disposable
# Or, with a separate disposable KV v2 fixture:
npm start -- hashicorp_vault --disposable
```

The connection test verifies authentication, not fill. The script does not revoke or delete the upstream fixture.

## Inspect resources with the CLI

The read-only examples use Steel CLI 0.5.1 or later. Leave `STEEL_API_URL` unset to use the CLI's built-in production URL. If you override it, include `/v1`.

```bash
EXAMPLE_NAMESPACE=your-qa-namespace bash cli.sh credentials
bash cli.sh vaults
bash cli.sh connections
EXAMPLE_SESSION_ID=your-qa-session-id bash cli.sh bindings
```
