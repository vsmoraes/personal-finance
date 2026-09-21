import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: "list",
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
      name: "mobile-320",
      use: {
        ...devices["iPhone SE"],
        defaultBrowserType: "chromium",
        viewport: { width: 320, height: 640 },
      },
    },
    {
      name: "mobile-360",
      use: { ...devices["Pixel 5"], viewport: { width: 360, height: 740 } },
    },
    {
      name: "mobile-390",
      use: {
        ...devices["iPhone 13"],
        defaultBrowserType: "chromium",
        viewport: { width: 390, height: 844 },
      },
    },
    {
      name: "tablet",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 768, height: 1024 },
      },
    },
    {
      name: "landscape",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 844, height: 390 },
      },
    },
  ],
});
