import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/browser",
  workers: 1,
  timeout: 120000,
  use: {
    baseURL: "http://localhost:3000",
    browserName: "chromium",
    launchOptions: {
      executablePath: process.env.CI
        ? undefined
        : process.env.CHROMIUM_PATH || "/usr/bin/chromium",
      args: ["--no-sandbox"],
    },
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "AI_ENABLED=false npm run local:dev",
    url: "http://localhost:3000/api/health",
    reuseExistingServer: true,
    timeout: 120000,
  },
});
