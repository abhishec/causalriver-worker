/**
 * Playwright Auth Setup — runs ONCE before all E2E tests.
 *
 * Logs in via Supabase email/password, saves the session cookie
 * to .auth/user.json so subsequent tests skip the login page.
 *
 * Requires env vars: E2E_USER_EMAIL, E2E_USER_PASSWORD
 * (set in .env.local, never committed)
 */
import { test as setup, expect } from "@playwright/test";
import path from "path";

const authFile = path.join(__dirname, "../.auth/user.json");

setup("authenticate", async ({ page }) => {
  const email = process.env.E2E_USER_EMAIL;
  const password = process.env.E2E_USER_PASSWORD;

  if (!email || !password) {
    throw new Error(
      "E2E_USER_EMAIL and E2E_USER_PASSWORD must be set in .env.local"
    );
  }

  // Navigate to login page
  await page.goto("/login");

  // Wait for the login form to render
  await page.waitForSelector("#email", { timeout: 15_000 });

  // Fill in email and password using the specific IDs from the login form
  await page.fill("#email", email);
  await page.fill("#password", password);

  // Click the Sign In submit button
  await page.click('button[type="submit"]');

  // Wait for redirect to /copilot (or any non-login page)
  // The login form does `window.location.href = redirectTo` which triggers a full navigation
  await page.waitForURL((url) => !url.pathname.includes("/login"), {
    timeout: 30_000,
    waitUntil: "domcontentloaded",
  });

  // Verify we're on an authenticated page
  await expect(page).not.toHaveURL(/\/login/);

  // Save auth state for reuse in other tests
  await page.context().storageState({ path: authFile });
});
