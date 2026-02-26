/**
 * API Health & Core Endpoint E2E Tests
 *
 * Verifies that critical API endpoints respond correctly.
 * Tests both authenticated and health-check endpoints.
 */
import { test, expect } from "@playwright/test";

test.describe("API Health Endpoints", () => {
  test("brain health endpoint returns valid response", async ({ page }) => {
    const response = await page.evaluate(async () => {
      const res = await fetch("/api/brain/health");
      return {
        status: res.status,
        body: await res.json(),
      };
    });

    // Health endpoint should return 200 (healthy) or 503 (degraded) — not 500
    expect([200, 503]).toContain(response.status);

    // Response should have a health structure
    expect(response.body).toHaveProperty("status");
  });

  test("brain health cron endpoint is accessible", async ({ page }) => {
    const response = await page.evaluate(async () => {
      const res = await fetch("/api/brain/health/cron", { method: "POST" });
      return { status: res.status };
    });

    // Cron should be callable (may return 200 or 401 if it requires auth header)
    expect(response.status).toBeLessThan(500);
  });

  test("notifications endpoint returns list", async ({ page }) => {
    const response = await page.evaluate(async () => {
      const res = await fetch("/api/notifications");
      return {
        status: res.status,
        body: await res.json(),
      };
    });

    expect(response.status).toBe(200);
    // Should return an array or an object with notifications
    expect(response.body).toBeDefined();
  });

  test("alerts config endpoint returns thresholds", async ({ page }) => {
    const response = await page.evaluate(async () => {
      const res = await fetch("/api/alerts/config");
      return {
        status: res.status,
        body: await res.json(),
      };
    });

    // Should return 200 with config or 401 if not admin
    expect([200, 401, 403]).toContain(response.status);
  });

  test("alerts list endpoint returns data", async ({ page }) => {
    const response = await page.evaluate(async () => {
      const res = await fetch("/api/alerts");
      return {
        status: res.status,
        body: await res.json(),
      };
    });

    expect([200, 401]).toContain(response.status);
    if (response.status === 200) {
      expect(response.body).toHaveProperty("alerts");
    }
  });
});

test.describe("Brain RL & Worker Endpoints", () => {
  test("worker-health returns job queue stats", async ({ page }) => {
    await page.goto("/dashboard");

    const response = await page.evaluate(async () => {
      const res = await fetch("/api/brain/worker-health");
      return {
        status: res.status,
        body: await res.json(),
      };
    });

    expect(response.status).toBe(200);
    expect(typeof response.body.pendingJobs).toBe("number");
    expect(typeof response.body.runningJobs).toBe("number");
  });

  test("rl-stats returns per-domain breakdown", async ({ page }) => {
    await page.goto("/dashboard");

    const response = await page.evaluate(async () => {
      const res = await fetch("/api/brain/rl-stats");
      return {
        status: res.status,
        body: await res.json(),
      };
    });

    expect(response.status).toBe(200);
    expect(typeof response.body.totalOutcomes).toBe("number");
    expect(Array.isArray(response.body.byDomain)).toBe(true);
  });

  test("rl-status returns learning metrics", async ({ page }) => {
    await page.goto("/dashboard");

    const response = await page.evaluate(async () => {
      const res = await fetch("/api/brain/rl-status");
      return {
        status: res.status,
        body: await res.json(),
      };
    });

    expect(response.status).toBe(200);
    expect(typeof response.body.signalsThisHour).toBe("number");
    expect(typeof response.body.learningVelocity).toBe("number");
  });

  test("learning-stats returns RL summary", async ({ page }) => {
    await page.goto("/dashboard");

    const response = await page.evaluate(async () => {
      const res = await fetch("/api/brain/learning-stats");
      return {
        status: res.status,
        body: await res.json(),
      };
    });

    expect(response.status).toBe(200);
    expect(typeof response.body.totalTasks).toBe("number");
  });

  test("connectors health returns array", async ({ page }) => {
    await page.goto("/dashboard");

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
});

test.describe("API Security", () => {
  test("CORS headers present on API responses", async ({ page }) => {
    const headers = await page.evaluate(async () => {
      const res = await fetch("/api/brain/health");
      return {
        csp: res.headers.get("content-security-policy"),
        xContentType: res.headers.get("x-content-type-options"),
        xFrame: res.headers.get("x-frame-options"),
      };
    });

    expect(headers.xContentType).toBe("nosniff");
    expect(headers.xFrame).toBe("DENY");
  });

  test("unauthenticated API calls return 401", async ({ browser }) => {
    // Create a fresh context without auth
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto("http://localhost:3001");

    const response = await page.evaluate(async () => {
      const res = await fetch("/api/copilot/conversations");
      return { status: res.status };
    });

    // Should reject unauthenticated requests
    expect([401, 403]).toContain(response.status);
    await context.close();
  });
});
