# Steel Profiles Example

This example demonstrates how to maintain authenticated sessions across different Steel browser instances by using profiles.

For detailed information about profiles, see the [Steel Documentation](https://docs.steel.dev/overview/profiles-api/overview).

## Installation

Clone this repository, navigate to the example directory, and install dependencies:

```bash
git clone https://github.com/steel-dev/steel-cookbook
cd steel-cookbook/examples/steel-profiles-starter
npm install
```

## Quick Start

1. Set up your environment:

```bash
# Create .env file with your Steel API key
cat > .env <<EOF
STEEL_API_KEY=your_api_key_here
EMAIL=your_email
PASSWORD=your_email_password
EOF

```

Replace `your_api_key_here` with your Steel API key. Replace your_email and your_email_password with the Google email address/password you used to sign into https://app.steel.dev. Don't have a key or an account? Get a free key at [app.steel.dev/settings/api-keys](https://app.steel.dev/settings/api-keys)


2. Run the example:

```bash
npm start
```

## What This Example Does

The script in `index.ts` demonstrates:

1. Checks what profiles your account has
2. Lets you choose one or create a new profile
3. Reauthenticates with a new session after the profile is created
4. Verifying the profile authentication worked

## Key Concepts

- **Profiles**: Browser state data (cookies, local storage) that can be transferred between sessions via Profiles.
- **Profile Data**: Profiles persist the entire browser data directory alongside browser context, cookies, and local auth.
- **Security**: Treat profiles very safely, if you are trying something risky and don't want to mess up your existing profile, don't persist it.

## Code Structure

```typescript
// Create and authenticate initial session
session = await client.sessions.create({
  pesistProfile: true
});
// ... perform login ...

// Capture Profile ID
const profileId = session.profileId;

// Create new authenticated session
session = await client.sessions.create({ profileId });
```

For more examples and recipes, check out the [Steel Cookbook](https://github.com/steel-dev/steel-cookbook).
