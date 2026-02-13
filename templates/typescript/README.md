# Steel + [Framework] Starter

<!-- ABOUTME: This is the TypeScript example README template for steel-cookbook. Each section is designed to be concise while maintaining consistency across examples. -->

[Brief 1-2 sentence description explaining what this example does]

![Difficulty](https://img.shields.io/badge/Difficulty-Beginner%2FIntermediate%2FAdvanced-green%2Cyellow%2Cred)
![Time](https://img.shields.io/badge/Time-5%20min%2F10%20min%2F30%20min-blue)
![Tech](https://img.shields.io/badge/TypeScript-blue)

---

## TL;DR

[TIME] minute read. [KEY_OUTCOME]

```bash
git clone https://github.com/steel-dev/steel-cookbook
cd examples/[EXAMPLE_SLUG]
npm install
cp .env.example .env
# Add your API keys to .env
npm start
```

---

## What You'll Learn

- **[Learning Point 1]**: Brief explanation
- **[Learning Point 2]**: Brief explanation
- **[Learning Point 3]**: Brief explanation

---

## Installation

```bash
git clone https://github.com/steel-dev/steel-cookbook
cd examples/[EXAMPLE_SLUG]
npm install
```

---

## Quick Start

The script will:

- [What happens 1]
- [What happens 2]
- [What happens 3]

### 1. Configure environment

Create `.env`:

```env
STEEL_API_KEY=your_steel_api_key_here
[OTHER_ENV_VARS]
```

Get your free API key: [app.steel.dev/settings/api-keys](https://app.steel.dev/settings/api-keys)

### 2. Run

```bash
npm start
```

---

## Configuration

Customize by editing `index.ts`:

```typescript
const session = await client.sessions.create({
  useProxy: true,        // Use Steel's proxy network
  solveCaptcha: true,     // Enable CAPTCHA solving
  sessionTimeout: 1800000, // 30 minute timeout (default: 5 mins)
  userAgent: "custom-ua",  // Custom User-Agent
});
```

---

## Error Handling

The template includes proper cleanup:

```typescript
try {
  // Your automation code
} finally {
  // Cleanup runs even if there's an error
  if (browser) await browser.close();
  if (session) await client.sessions.release(session.id);
}
```

---

## Testing

This template includes a comprehensive test suite to verify your automation code.

### Test Structure

```
tests/
├── main.test.ts          # Unit tests for index.ts logic
├── integration.test.ts   # Integration tests with Steel SDK
└── e2e.test.ts           # End-to-end browser automation tests
```

### Running Tests

```bash
# Run all tests
npm test

# Run tests once (CI mode)
npm run test:run

# Run with Vitest UI
npm run test:ui

# Run with coverage
npm run test:coverage
```

### Test Environment

For integration and E2E tests, create a `.env.test.local` file:

```bash
cp .env.test .env.test.local
# Add your STEEL_API_KEY to .env.test.local
```

The `.env.test.local` file is gitignored for security.

### Test Types

- **Unit tests** (`main.test.ts`): Test logic without external dependencies
  - Environment variable loading
  - API key validation
  - Session configuration options
  - Error handling patterns

- **Integration tests** (`integration.test.ts`): Test with real Steel API
  - Actual session creation
  - Session viewer URLs
  - Session cleanup
  - Client initialization

- **E2E tests** (`e2e.test.ts`): Full browser automation workflows
  - Complete session lifecycle
  - Error recovery
  - Multiple concurrent sessions

### Writing Your Own Tests

Add tests following the existing patterns:

```typescript
// tests/main.test.ts
import { describe, it, expect } from "vitest";

describe("My Feature", () => {
  it("should test my automation logic", () => {
    // Test your specific automation logic
    expect(true).toBe(true);
  });
});
```

```typescript
// tests/integration.test.ts
import { describe, it, expect } from "vitest";
import Steel from "steel-sdk";

describe("My Integration Tests", () => {
  it("should test with real Steel API", async () => {
    const apiKey = process.env.STEEL_API_KEY;
    if (!apiKey || apiKey === "your-steel-api-key-here") {
      throw new Error("STEEL_API_KEY not set");
    }

    const client = new Steel({ steelAPIKey: apiKey });
    const session = await client.sessions.create({});

    expect(session.id).toBeDefined();

    // Cleanup
    await client.sessions.release(session.id);
  });
});
```

---

## Support

- [Steel Documentation](https://docs.steel.dev)
- [API Reference](https://docs.steel.dev/api-reference)
- [Discord Community](https://discord.gg/steel-dev)
