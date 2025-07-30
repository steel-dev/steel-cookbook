# Steel Authentication Context Example

This example demonstrates how to maintain authenticated sessions across different Steel browser instances by capturing and reusing session context (cookies and local storage).

For detailed information about context reuse, see the [Steel Documentation](https://docs.steel.dev/overview/guides/reusing-contexts-auth).

## Installation

Clone this repository, navigate to the example directory, and install dependencies:

```bash
git clone https://github.com/steel-dev/steel-cookbook
cd steel-cookbook/examples/reuse_auth_context_example
npm install
```

## Quick Start

1. Set up your environment:

```bash
# Create .env file with your Steel API key
echo "STEEL_API_KEY=your_api_key_here" > .env
```

Replace `your_api_key_here` with your Steel API key. Don't have one? Get a free key at [app.steel.dev/settings/api-keys](https://app.steel.dev/settings/api-keys)

2. Run the example:

```bash
npm start
```

## What This Example Does

The script in `index.ts` demonstrates:

1. Creating an initial Steel session and authenticating with a website
2. Capturing the authenticated session context
3. Creating a new session with the captured context
4. Verifying the authentication transfer worked

## Key Concepts

- **Session Context**: Browser state data (cookies, local storage) that can be transferred between sessions
- **Context Reuse**: Allows new sessions to inherit authentication without re-login
- **Security**: Treat captured contexts as sensitive data and refresh regularly
- **Limitations**: Works only with cookie-based authentication

## Code Structure

```typescript
// Create and authenticate initial session
session = await client.sessions.create();
// ... perform login ...

// Capture context
const sessionContext = await client.sessions.context(session.id);

// Create new authenticated session
session = await client.sessions.create({ sessionContext });
```

For more examples and recipes, check out the [Steel Cookbook](https://github.com/steel-dev/steel-cookbook).
