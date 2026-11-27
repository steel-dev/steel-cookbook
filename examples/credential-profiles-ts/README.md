# Reuse a signed-in browser profile per user (TypeScript)

The example signs Alice and Bob in to a synthetic site, waits until each browser profile is ready, and starts new sessions with the corresponding `profileId`. It checks that Alice → Bob → Alice opens the correct account without another login.

## Run it

Export `STEEL_API_KEY` and `STEEL_PROJECT_ID` for a disposable QA project on `https://api.steel.dev`. Run `npm install` and `npm start` in this folder. Playwright handles the entire synthetic site, including the login POST and session cookie. No form data goes to an external website.

## Sign in again when a site session expires

Run `npm start -- --with-vault-fallback` to save each profile from a session **without** Steel credentials. In this mode, the script signs in with its own synthetic values, saves the profile, and later resumes it with that user's Vault bound. It clears the synthetic login cookie and verifies that the Vault can fill the form again.

A profile saved from a credentials-enabled session can restore an existing login, but later sessions from that profile cannot fill credentials. Use the separate bootstrap when you need Vault fallback. No resumption session updates the saved profile. The example deletes its profiles and Vaults after releasing the sessions; an application normally keeps them in its server-side user mapping.
