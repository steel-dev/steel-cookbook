# Bind and fill a Vault credential (TypeScript)

`index.ts` creates a Vault, renames it, puts a synthetic login in it, and fills an intercepted form by item reference. The published SDK exposes Vault and binding methods; the example uses its HTTP client for `/v1/secrets`, which does not have a typed resource in this version.

## Run it

Export `STEEL_API_KEY` and `STEEL_PROJECT_ID` for a disposable QA project on `https://api.steel.dev`. See `.env.example` for the variables. Run `npm install` and `npm start` in this folder. The example checks both fields and never submits the form.

Run `npm run bindings` to attach a Vault to a running session, replace it, and detach the replacement. The first binding switches lookup from implicit to explicit. Removing the last binding does not switch it back.

## Inspect access

The session's `bindings` describes its explicit access. Its `credentials` array lists individually bound credentials, not every item in a bound Vault. Use `/v1/secrets?kind=credential&vaultId=…` for inventory and a fill check to verify delivery.

The session is released before the example removes the item and then the empty Vault. For per-user routing, see [one Vault per user](../credential-multi-user-ts).
