// ABOUTME: Vitest configuration for steel-cookbook TypeScript tests
// ABOUTME: Configures test environment, coverage, and discovery

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    setupFiles: ["./test-setup.ts"],
    include: ["tests/**/*.test.ts"],
    testTimeout: 30000,
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      exclude: [
        "node_modules/",
        "tests/",
        "*.test.ts",
        "test-setup.ts",
      ],
    },
  },
});
