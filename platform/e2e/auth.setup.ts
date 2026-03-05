/**
 * Playwright Auth Setup — runs ONCE before all E2E tests.
 *
 * Uses the actual login form (which calls supabase.auth.signInWithPassword
 * via the browser client, correctly setting document.cookie). The direct REST
 * API approach doesn't work because @supabase/ssr browser client sets cookies
 * client-side, not via server Set-Cookie headers.
 *
 * Requires env vars: E2E_USER_EMAIL, E2E_USER_PASSWORD
 * (set in .env.local, never committed)
 *
 * The test user must have email/password auth enabled. If the account was
 * created via Google OAuth, run the one-time setup script to set a password:
 *   curl -X PUT https://PROJECT.supabase.co/auth/v1/admin/users/USER_ID \
 *     -H "Authorization: Bearer SERVICE_ROLE_KEY" \
 *     -d '{"password":"YOUR_PASSWORD"}'
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

  // Fill credentials
  await page.fill("#email", email);
  await page.fill("#password", password);

  // Submit — triggers supabase.auth.signInWithPassword() which sets
  // session cookies via document.cookie, then redirects via window.location.href
  await page.click('button[type="submit"]');

  // Wait for redirect away from /login (up to 45s — Supabase auth can be slow)
  await page.waitForURL((url) => !url.pathname.includes("/login"), {
    timeout: 45_000,
    waitUntil: "domcontentloaded",
  });

  // Verify we landed on an authenticated page
  await expect(page).not.toHaveURL(/\/login/);

  // Save the full auth state (cookies + localStorage set by browser Supabase client)
  await page.context().storageState({ path: authFile });

  console.log(`Auth setup complete: ${email} → ${page.url()}`);
});
