import { defineConfig, devices } from "@playwright/test";
const e2eBaseUrl = process.env["E2E_BASE_URL"] ?? "http://127.0.0.1:8083";
export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: process.env["CI"] ? [["github"], ["list"]] : "list",
  timeout: 30_000,
  expect: {
    timeout: 5_000,
  },
  use: {
    baseURL: e2eBaseUrl,
    extraHTTPHeaders: { origin: new URL(e2eBaseUrl).origin },
    trace: "retain-on-failure",
  },
  webServer: process.env["E2E_BASE_URL"]
    ? []
    : {
        command: "corepack pnpm exec tsx scripts/e2e-server.ts",
        url: "http://127.0.0.1:8083/readyz",
        reuseExistingServer: !process.env["CI"],
      },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    {
      name: "mobile",
      use: { ...devices["Pixel 5"] },
    },
  ],
});
