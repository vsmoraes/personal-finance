import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    testTimeout: 5000,
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    exclude: ["tests/e2e/**"],
    coverage: {
      provider: "v8",
      include: [
        "packages/domain/src/**/*.ts",
        "packages/application/src/**/*.ts",
        "packages/database/src/**/*.ts",
        "apps/api/src/**/*.ts",
        "apps/web/src/**/*.{ts,tsx}",
      ],
      exclude: [
        "apps/api/src/main.ts",
        "apps/web/src/main.tsx",
        "apps/web/src/i18n.ts",
      ],
      reporter: ["text", "json-summary", "html"],
      thresholds: {
        statements: 80,
        branches: 80,
        functions: 80,
        lines: 80,
        "packages/domain/src/**": { statements: 90, branches: 90 },
      },
    },
  },
});
