import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: "list",
  timeout: 10_000,
  use: {
    baseURL: process.env["E2E_BASE_URL"] ?? "http://127.0.0.1:8081",
    trace: "retain-on-failure",
  },
  webServer: process.env["E2E_BASE_URL"]
    ? []
    : {
        command:
          "PORT=8081 DATABASE_URL=file:./data/e2e.db node dist/apps/api/src/main.js",
        url: "http://127.0.0.1:8081/readyz",
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
