// ABOUTME: Test setup file for steel-cookbook TypeScript tests
// ABOUTME: Global test fixtures and mocks

import { beforeAll, afterEach } from "vitest";

// Store original environment variables
const originalEnv = { ...process.env };

afterEach(() => {
  // Reset environment variables after each test
  // This ensures tests don't affect each other
  Object.keys(process.env).forEach((key) => {
    if (!Object.prototype.hasOwnProperty.call(originalEnv, key)) {
      delete process.env[key];
    }
  });
  Object.assign(process.env, originalEnv);
});

// Global test utilities
export const testUtils = {
  getTestApiKey: (): string | undefined => {
    return process.env.STEEL_API_KEY;
  },

  isValidApiKey: (key: string): boolean => {
    return (
      key !== "your-steel-api-key-here" &&
      key !== "" &&
      key.length > 10
    );
  },

  skipIfNoApiKey: (): void => {
    const apiKey = process.env.STEEL_API_KEY;
    if (!apiKey || apiKey === "your-steel-api-key-here") {
      throw new Error("STEEL_API_KEY not set - skipping integration test");
    }
  },
};
