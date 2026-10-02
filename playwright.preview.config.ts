import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/browser",
  testMatch: "preview.spec.ts",
  workers: 1,
  timeout: 60000,
  use: {
    baseURL: "http://127.0.0.1:4173/AI-app-consumer-focused/",
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
    command:
      "npm run serve --prefix preview -- --base /AI-app-consumer-focused/",
    url: "http://127.0.0.1:4173/AI-app-consumer-focused/",
    reuseExistingServer: !process.env.CI,
    timeout: 30000,
  },
});
