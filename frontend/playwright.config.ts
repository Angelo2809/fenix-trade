import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests",
  timeout: 90_000,
  workers: 1,
  fullyParallel: false,
  use: {
    channel: process.env.E2E_BROWSER_CHANNEL || undefined,
    baseURL: process.env.E2E_BASE_URL || "http://localhost:3000",
    viewport: { width: 1672, height: 941 },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  reporter: "list",
});
