import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  workers: 2,
  use: {
    baseURL: "http://127.0.0.1:3010",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npm run start:e2e",
    url: "http://127.0.0.1:3010",
    reuseExistingServer: false,
  },
  projects: [
    { name: "audit-desktop", testDir: "tests/audit", testMatch: "*.audit.ts", use: { viewport: { width: 1440, height: 900 } } },
    { name: "audit-mobile", testDir: "tests/audit", testMatch: "*.audit.ts", use: { ...devices["Pixel 7"] } },
    {
      name: "desktop",
      use: {
        viewport: { width: 1440, height: 900 },
      },
    },
    {
      name: "mobile",
      use: {
        ...devices["Pixel 7"],
      },
    },
  ],
});
