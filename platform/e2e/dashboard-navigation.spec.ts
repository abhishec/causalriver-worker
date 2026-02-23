/**
 * Dashboard Navigation E2E Tests
 *
 * Verifies that all critical dashboard pages load correctly
 * for an authenticated user. Uses saved auth state from setup.
 */
import { test, expect } from "@playwright/test";

test.describe("Dashboard Navigation", () => {
  test("overview page loads with key sections", async ({ page }) => {
    await page.goto("/overview");
    await page.waitForLoadState("domcontentloaded");

    // Page should not redirect to login
    await expect(page).not.toHaveURL(/\/login/);

    // Should have some visible content (heading or cards)
    const content = page.locator("h1, h2, [data-testid], main");
    await expect(content.first()).toBeVisible({ timeout: 15_000 });
  });

  test("brain page loads", async ({ page }) => {
    await page.goto("/brain");
    await page.waitForLoadState("domcontentloaded");

    await expect(page).not.toHaveURL(/\/login/);

    const content = page.locator("h1, h2, main, [role='main']");
    await expect(content.first()).toBeVisible({ timeout: 15_000 });
  });

  test("copilot page loads", async ({ page }) => {
    await page.goto("/copilot");
    await page.waitForLoadState("domcontentloaded");

    await expect(page).not.toHaveURL(/\/login/);

    // Copilot should have a text input area
    const chatInput = page.locator("textarea, [contenteditable], input[type='text']");
    await expect(chatInput.first()).toBeVisible({ timeout: 15_000 });
  });

  test("settings page loads", async ({ page }) => {
    await page.goto("/settings");
    await page.waitForLoadState("domcontentloaded");

    await expect(page).not.toHaveURL(/\/login/);

    const content = page.locator("h1, h2, form, main");
    await expect(content.first()).toBeVisible({ timeout: 15_000 });
  });

  test("workflows page loads", async ({ page }) => {
    await page.goto("/workflows");
    await page.waitForLoadState("domcontentloaded");

    await expect(page).not.toHaveURL(/\/login/);

    const content = page.locator("h1, h2, main, button");
    await expect(content.first()).toBeVisible({ timeout: 15_000 });
  });

  test("agents page loads", async ({ page }) => {
    await page.goto("/agents");
    await page.waitForLoadState("domcontentloaded");

    await expect(page).not.toHaveURL(/\/login/);

    const content = page.locator("h1, h2, main");
    await expect(content.first()).toBeVisible({ timeout: 15_000 });
  });
});
