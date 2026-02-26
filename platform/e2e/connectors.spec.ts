/**
 * Connectors E2E Tests
 *
 * Tests the connector health endpoints and basic UI rendering
 * on the /connectors page.
 *
 * Uses authenticated session from setup.
 */
import { test, expect } from "@playwright/test";

test.describe("Connector Health Endpoints", () => {
  test("GET /api/connectors/health returns array (may be empty, not 500)", async ({ page }) => {
    await page.goto("/connectors");

    const response = await page.evaluate(async () => {
      const res = await fetch("/api/connectors/health");
      return {
        status: res.status,
        body: await res.json(),
      };
    });

    expect(response.status).toBe(200);
    expect(Array.isArray(response.body)).toBe(true);
  });

  test("GET /api/connectors/health items have expected shape when non-empty", async ({ page }) => {
    await page.goto("/connectors");

    const response = await page.evaluate(async () => {
      const res = await fetch("/api/connectors/health");
      return {
        status: res.status,
        body: await res.json(),
      };
    });

    expect(response.status).toBe(200);
    const connectors = response.body as any[];

    // If there are connectors, verify the shape of each item
    for (const connector of connectors) {
      expect(connector).toHaveProperty("id");
      expect(connector).toHaveProperty("type");
      expect(connector).toHaveProperty("status");
      expect(connector).toHaveProperty("lastSyncAt");
      expect(connector).toHaveProperty("signalsCount");
    }
  });

  test("GET /api/connectors/github/status returns 200 or 404 (not 500)", async ({ page }) => {
    // GitHub connector may not be configured in all environments.
    // Both 200 (configured) and a 200 with connected:false (not configured) are valid.
    // The endpoint should NEVER return 500.
    await page.goto("/connectors");

    const response = await page.evaluate(async () => {
      const res = await fetch("/api/connectors/github/status");
      return {
        status: res.status,
        body: await res.json().catch(() => null),
      };
    });

    // Must not be a server error
    expect(response.status).toBeLessThan(500);
    // Must return a body with at least a boolean `connected` field
    if (response.status === 200) {
      expect(response.body).toHaveProperty("connected");
      expect(typeof response.body.connected).toBe("boolean");
    }
  });

  test("GET /api/connectors/instances returns 200 (array or object)", async ({ page }) => {
    await page.goto("/connectors");

    const response = await page.evaluate(async () => {
      const res = await fetch("/api/connectors/instances");
      return {
        status: res.status,
        body: await res.json().catch(() => null),
      };
    });

    expect(response.status).toBe(200);
    expect(response.body).not.toBeNull();
  });
});

test.describe("Connectors Page UI", () => {
  test('/connectors page loads with "Connectors" heading visible', async ({ page }) => {
    await page.goto("/connectors");
    await page.waitForLoadState("domcontentloaded");

    // Should not redirect to login
    await expect(page).not.toHaveURL(/\/login/);

    // Main "Connectors" heading should be visible
    const heading = page.locator("h1");
    await expect(heading).toContainText("Connectors", { timeout: 15_000 });
  });

  test('/connectors page shows "Install App" button for at least one connector', async ({ page }) => {
    await page.goto("/connectors");
    await page.waitForLoadState("domcontentloaded");

    await expect(page).not.toHaveURL(/\/login/);

    // The connectors page lists all available connectors with "Install App" buttons
    const installBtn = page.locator("button", { hasText: "Install App" });
    await expect(installBtn.first()).toBeVisible({ timeout: 15_000 });
  });

  test("/connectors page renders connector cards without 500", async ({ page }) => {
    // Intercept the connectors/health API to confirm it returns 200
    let healthStatus = 0;
    page.on("response", (response) => {
      if (response.url().includes("/api/connectors/health")) {
        healthStatus = response.status();
      }
    });

    await page.goto("/connectors");
    await page.waitForLoadState("domcontentloaded");

    await expect(page).not.toHaveURL(/\/login/);

    // Wait for the page to settle (connector data may load async)
    await page.waitForTimeout(2000);

    // Verify the API didn't 500
    if (healthStatus > 0) {
      expect(healthStatus).toBeLessThan(500);
    }

    // The page should show content (connector count stat, list section, etc.)
    const content = page.locator("main, h1, h2, [role='main'], section");
    await expect(content.first()).toBeVisible({ timeout: 10_000 });
  });
});
