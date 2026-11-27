# Implicit credential lookup (TypeScript)

An unassigned Steel credential belongs to a namespace and an origin. `index.ts` creates a credential, starts a credentials-enabled session in the same namespace, and checks that Steel fills both fields automatically. No Vault or explicit binding is required.

## Run it

Set `STEEL_API_KEY` and `STEEL_PROJECT_ID` using `.env.example` as a reference. Use an API key that can access the designated non-production QA project on `https://api.steel.dev`. The script reads exported variables, not a dotenv file. Run `npm install` and `npm start` in this folder.

Playwright serves the form at a unique `.example.test` origin. It blocks other page requests and never submits the form. The session is released before the test credential is deleted.

- `npm run crud` shows the origin-and-namespace API for create, update, list, and delete. Updating `additionalOrigins` replaces the list.
- `npm run fill` turns off autofill, detects the sign-in form, and targets it using the SDK's typed CDP helper.

For an explicit binding, see [Vault credentials](../credential-vaults-ts). For cookie reuse rather than re-filling a form, see [per-user profiles](../credential-profiles-ts).
