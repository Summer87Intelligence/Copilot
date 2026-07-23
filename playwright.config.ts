import { defineConfig, devices } from "@playwright/test";

import { COPILOT_SESSION_TEST_SIGNING_SECRET } from "./lib/copilot-session-signing-secret";

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";
const skipWebServer = process.env.PLAYWRIGHT_SKIP_WEBSERVER === "1";

export default defineConfig({
  testDir: "e2e",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [["list"]],
  timeout: 60_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL,
    trace: "on-first-retry",
    video: "off",
    screenshot: "off",
  },
  webServer: skipWebServer
    ? undefined
    : {
        command: "npm run dev -- --port 3000",
        url: `${baseURL}/copilot`,
        reuseExistingServer: !process.env.CI,
        timeout: 180_000,
        stdout: "pipe",
        stderr: "pipe",
        // Alinea firma de cookie e2e con el middleware del servidor local.
        env: {
          ...process.env,
          COPILOT_SESSION_SIGNING_SECRET:
            process.env.COPILOT_SESSION_SIGNING_SECRET?.trim() ||
            COPILOT_SESSION_TEST_SIGNING_SECRET,
        },
      },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
