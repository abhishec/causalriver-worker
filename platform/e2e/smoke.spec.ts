import { test, expect } from "@playwright/test";

test.describe("Smoke Tests", () => {
  test("homepage loads successfully", async ({ page }) => {
    const response = await page.goto("/");

    // Verify the page returned a successful HTTP status
    expect(response).not.toBeNull();
    expect(response!.status()).toBeLessThan(400);

    // Verify the page has a title (any non-empty title means the app rendered)
    await expect(page).toHaveTitle(/.+/);
  });

  test("login page renders", async ({ page }) => {
    const response = await page.goto("/login");

    // Verify the page returned a successful HTTP status
    expect(response).not.toBeNull();
    expect(response!.status()).toBeLessThan(400);

    // Verify core login UI elements are present
    // Look for a visible heading, input field, or button that indicates the login form rendered
    const loginIndicator = page.locator(
      'h1, h2, [role="heading"], input[type="email"], input[type="password"], button[type="submit"], form'
    );
    await expect(loginIndicator.first()).toBeVisible({ timeout: 10_000 });
  });
});
