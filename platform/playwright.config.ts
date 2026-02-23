import { defineConfig, devices } from "@playwright/test";
import path from "path";
import dotenv from "dotenv";

// Load .env.local for E2E test credentials
dotenv.config({ path: path.resolve(__dirname, ".env.local") });

/**
 * Playwright E2E test configuration for BrainOS platform.
 *
 * Run all tests:       pnpm test:e2e
 * Run with UI mode:    pnpm test:e2e:ui
 */
export default defineConfig({
  testDir: "./e2e",

  /* Maximum time one test can run */
  timeout: 60_000,

  /* Expect assertions timeout */
  expect: {
    timeout: 10_000,
  },

  /* Fail the build on CI if test.only is left in source */
  forbidOnly: !!process.env.CI,

  /* Retry once on CI to reduce flakiness */
  retries: process.env.CI ? 1 : 0,

  /* Parallel workers — use half CPUs on CI for stability */
  workers: process.env.CI ? 2 : undefined,

  /* Reporter */
  reporter: process.env.CI ? "github" : "html",

  /* Shared settings for all projects */
  use: {
    baseURL: "http://localhost:3001",

    /* Capture screenshot only on failure */
    screenshot: "only-on-failure",

    /* Collect trace on first retry for debugging */
    trace: "on-first-retry",
  },

  projects: [
    // Auth setup — runs first, saves session to .auth/user.json
    {
      name: "setup",
      testMatch: /auth\.setup\.ts/,
    },

    // Main tests — use saved auth state (skip login)
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        storageState: path.join(__dirname, ".auth/user.json"),
      },
      dependencies: ["setup"],
    },
  ],

  /* Dev server — start automatically if not already running */
  webServer: {
    command: "pnpm dev",
    url: "http://localhost:3001",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
