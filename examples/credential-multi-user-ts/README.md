# Route sessions to a Vault per user (TypeScript)

Alice and Bob use the same website origin, but have different logins. `withUsers` creates a Vault for each synthetic account. Each new session gets exactly one Vault binding and fills only its corresponding login.

## Run it

Export `STEEL_API_KEY` and `STEEL_PROJECT_ID` for a disposable QA project on `https://api.steel.dev`. Run `npm install` and `npm start` in this folder. The script switches Alice → Bob → Alice, verifies both fields in each fresh session, and never submits the intercepted form.

In an app, look up the Vault ID from your authenticated user ID on the server instead of accepting arbitrary Vault IDs from clients. Reuse that same mapping for [per-user profiles](../credential-profiles-ts).
