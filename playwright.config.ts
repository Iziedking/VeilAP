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
