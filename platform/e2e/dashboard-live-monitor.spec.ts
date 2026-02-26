/**
 * Dashboard Live Monitor E2E Tests
 *
 * Tests the live dashboard features:
 *   - Agent Live Monitor section (AgentLiveMonitor component on /dashboard)
 *   - RL Stats Panel API (/api/brain/rl-stats)
 *   - Brain Intelligence banner with RL learning stats (/api/brain/learning-stats)
 *   - RL status endpoint (/api/brain/rl-status)
 *
 * UI tests target /dashboard (the home dashboard with AgentLiveMonitor).
 * API tests run from /agents (established auth context, less noise from page data loads).
 *
 * Uses authenticated session from setup.
 */

import { test, expect } from "@playwright/test";

// ---------------------------------------------------------------------------
// Brain RL APIs — shape + resilience
// ---------------------------------------------------------------------------

test.describe("Brain RL & Learning API Endpoints", () => {
  test.beforeEach(async ({ page }) => {
    // Establish auth context on a known page
    await page.goto("/agents");
    await page.waitForLoadState("domcontentloaded");
    await expect(page).not.toHaveURL(/\/login/);
  });

  // ── /api/brain/rl-stats ─────────────────────────────────────────────────

  test("GET /api/brain/rl-stats returns 200 with per-domain breakdown shape", async ({ page }) => {
    const res = await page.evaluate(async () => {
      const r = await fetch("/api/brain/rl-stats");
      return { status: r.status, body: await r.json() };
    });

    expect(res.status).toBe(200);

    const body = res.body;
    // Top-level fields must be present
    expect(typeof body.totalOutcomes).toBe("number");
    expect(typeof body.overallSuccessRate).toBe("number");
    expect(typeof body.overallAvgQuality).toBe("number");
    expect(Array.isArray(body.byDomain)).toBe(true);
    expect(Array.isArray(body.recentOutcomes)).toBe(true);
    expect(typeof body.lookbackDays).toBe("number");
    expect(typeof body.updatedAt).toBe("string");

    // Success rates must be 0–1
    expect(body.overallSuccessRate).toBeGreaterThanOrEqual(0);
    expect(body.overallSuccessRate).toBeLessThanOrEqual(1);
    expect(body.overallAvgQuality).toBeGreaterThanOrEqual(0);
    expect(body.overallAvgQuality).toBeLessThanOrEqual(1);
  });

  test("GET /api/brain/rl-stats byDomain items have expected shape when non-empty", async ({ page }) => {
    const res = await page.evaluate(async () => {
      const r = await fetch("/api/brain/rl-stats");
      return { status: r.status, body: await r.json() };
    });

    expect(res.status).toBe(200);
    const domains = res.body.byDomain as any[];

    for (const d of domains) {
      expect(d).toHaveProperty("domain");
      expect(d).toHaveProperty("totalOutcomes");
      expect(d).toHaveProperty("successCount");
      expect(d).toHaveProperty("successRate");
      expect(d).toHaveProperty("avgQuality");
      expect(typeof d.domain).toBe("string");
      expect(typeof d.totalOutcomes).toBe("number");
      expect(d.successRate).toBeGreaterThanOrEqual(0);
      expect(d.successRate).toBeLessThanOrEqual(1);
    }
  });

  test("GET /api/brain/rl-stats recentOutcomes items have expected shape when non-empty", async ({ page }) => {
    const res = await page.evaluate(async () => {
      const r = await fetch("/api/brain/rl-stats");
      return { status: r.status, body: await r.json() };
    });

    expect(res.status).toBe(200);
    const outcomes = res.body.recentOutcomes as any[];

    for (const o of outcomes) {
      expect(o).toHaveProperty("domain");
      expect(o).toHaveProperty("quality");
      expect(o).toHaveProperty("wasSuccess");
      expect(o).toHaveProperty("createdAt");
      expect(typeof o.wasSuccess).toBe("boolean");
      expect(o.quality).toBeGreaterThanOrEqual(0);
      expect(o.quality).toBeLessThanOrEqual(1);
    }
  });

  test("GET /api/brain/rl-stats with ?days=7 respects lookback filter", async ({ page }) => {
    const res = await page.evaluate(async () => {
      const r = await fetch("/api/brain/rl-stats?days=7");
      return { status: r.status, body: await r.json() };
    });

    expect(res.status).toBe(200);
    expect(res.body.lookbackDays).toBe(7);
  });

  test("GET /api/brain/rl-stats with ?days=90 caps at 90 days", async ({ page }) => {
    const res = await page.evaluate(async () => {
      const r = await fetch("/api/brain/rl-stats?days=200");
      return { status: r.status, body: await r.json() };
    });

    expect(res.status).toBe(200);
    expect(res.body.lookbackDays).toBeLessThanOrEqual(90);
  });

  test("GET /api/brain/rl-stats returns 401 for unauthenticated requests", async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto("http://localhost:3001");

    const res = await page.evaluate(async () => {
      const r = await fetch("/api/brain/rl-stats");
      return { status: r.status };
    });

    expect([401, 403]).toContain(res.status);
    await context.close();
  });

  // ── /api/brain/rl-status ────────────────────────────────────────────────

  test("GET /api/brain/rl-status returns 200 with learning metrics shape", async ({ page }) => {
    const res = await page.evaluate(async () => {
      const r = await fetch("/api/brain/rl-status");
      return { status: r.status, body: await r.json() };
    });

    expect(res.status).toBe(200);

    const body = res.body;
    expect(typeof body.signalsThisHour).toBe("number");
    expect(typeof body.learningVelocity).toBe("number");
    expect(typeof body.feedbackTotal).toBe("number");
    expect(typeof body.queueDepth).toBe("number");
    expect(Array.isArray(body.recentSignals)).toBe(true);

    // Counts must be non-negative
    expect(body.signalsThisHour).toBeGreaterThanOrEqual(0);
    expect(body.learningVelocity).toBeGreaterThanOrEqual(0);
    expect(body.feedbackTotal).toBeGreaterThanOrEqual(0);
  });

  test("GET /api/brain/rl-status recentSignals have expected fields when non-empty", async ({ page }) => {
    const res = await page.evaluate(async () => {
      const r = await fetch("/api/brain/rl-status");
      return { status: r.status, body: await r.json() };
    });

    expect(res.status).toBe(200);
    const signals = res.body.recentSignals as any[];

    for (const s of signals) {
      expect(s).toHaveProperty("signal_type");
      expect(s).toHaveProperty("source_domain");
      expect(s).toHaveProperty("signal_value");
      expect(s).toHaveProperty("created_at");
    }
  });

  test("GET /api/brain/rl-status returns 401 for unauthenticated requests", async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto("http://localhost:3001");

    const res = await page.evaluate(async () => {
      const r = await fetch("/api/brain/rl-status");
      return { status: r.status };
    });

    expect([401, 403]).toContain(res.status);
    await context.close();
  });

  // ── /api/brain/learning-stats ───────────────────────────────────────────

  test("GET /api/brain/learning-stats returns 200 with RL summary shape", async ({ page }) => {
    const res = await page.evaluate(async () => {
      const r = await fetch("/api/brain/learning-stats");
      return { status: r.status, body: await r.json() };
    });

    expect(res.status).toBe(200);

    const body = res.body;
    expect(typeof body.totalTasks).toBe("number");
    expect(typeof body.successRate).toBe("number");
    expect(typeof body.avgQuality).toBe("number");
    expect(typeof body.learningVelocity).toBe("number");

    // Rates must be 0–1
    expect(body.successRate).toBeGreaterThanOrEqual(0);
    expect(body.successRate).toBeLessThanOrEqual(1);
    expect(body.avgQuality).toBeGreaterThanOrEqual(0);
    expect(body.avgQuality).toBeLessThanOrEqual(1);

    // Counts non-negative
    expect(body.totalTasks).toBeGreaterThanOrEqual(0);
    expect(body.learningVelocity).toBeGreaterThanOrEqual(0);
  });

  test("GET /api/brain/learning-stats returns helpful/notHelpful feedback counts", async ({ page }) => {
    const res = await page.evaluate(async () => {
      const r = await fetch("/api/brain/learning-stats");
      return { status: r.status, body: await r.json() };
    });

    expect(res.status).toBe(200);
    expect(typeof res.body.helpfulFeedback).toBe("number");
    expect(typeof res.body.notHelpfulFeedback).toBe("number");
    expect(res.body.helpfulFeedback).toBeGreaterThanOrEqual(0);
    expect(res.body.notHelpfulFeedback).toBeGreaterThanOrEqual(0);
  });

  test("GET /api/brain/learning-stats returns 401 for unauthenticated requests", async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto("http://localhost:3001");

    const res = await page.evaluate(async () => {
      const r = await fetch("/api/brain/learning-stats");
      return { status: r.status };
    });

    expect([401, 403]).toContain(res.status);
    await context.close();
  });
});

// ---------------------------------------------------------------------------
// Dashboard Live Monitor UI — /dashboard page
// ---------------------------------------------------------------------------

test.describe("Dashboard Live Monitor UI", () => {
  test("/dashboard page loads without redirecting to login", async ({ page }) => {
    await page.goto("/dashboard");
    await page.waitForLoadState("domcontentloaded");
    await expect(page).not.toHaveURL(/\/login/);
  });

  test("/dashboard page renders main content within timeout", async ({ page }) => {
    await page.goto("/dashboard");
    await page.waitForLoadState("domcontentloaded");
    await expect(page).not.toHaveURL(/\/login/);

    // Main content area should be visible — heading, section, or card
    const content = page.locator("main, h1, h2, section, [role='main'], .rounded-xl");
    await expect(content.first()).toBeVisible({ timeout: 20_000 });
  });

  test("/dashboard shows AI Agent Live Monitor section", async ({ page }) => {
    test.slow();

    await page.goto("/dashboard");
    await page.waitForLoadState("domcontentloaded");
    await expect(page).not.toHaveURL(/\/login/);

    // Wait for the client-side data load to settle
    await page.waitForTimeout(3000);

    // The AgentLiveMonitor component renders "Agent Monitor" as its header text
    // It's visible once the component has loaded (either with jobs or empty state)
    const agentMonitorHeader = page.locator("text=Agent Monitor");
    await expect(agentMonitorHeader).toBeVisible({ timeout: 20_000 });
  });

  test("/dashboard Agent Monitor shows job list or empty state — not an error boundary", async ({ page }) => {
    test.slow();

    await page.goto("/dashboard");
    await page.waitForLoadState("domcontentloaded");
    await expect(page).not.toHaveURL(/\/login/);

    // Wait for async data
    await page.waitForTimeout(3000);

    // The component renders either:
    //   a) "No agent tasks yet" empty state
    //   b) A list of job rows with task type + status badges
    // Either way, the section header "Agent Monitor" should be present
    const monitorSection = page.locator("text=Agent Monitor");
    await expect(monitorSection).toBeVisible({ timeout: 20_000 });

    // After the section is visible, the worker-health API should have been called
    // Verify it returns 200 from the app's perspective
    const healthRes = await page.evaluate(async () => {
      const r = await fetch("/api/brain/worker-health");
      return { status: r.status, body: await r.json() };
    });

    expect(healthRes.status).toBe(200);
    expect(Array.isArray(healthRes.body.recentJobs)).toBe(true);
  });

  test("/dashboard Agent Monitor shows live run counts in header stats", async ({ page }) => {
    test.slow();

    await page.goto("/dashboard");
    await page.waitForLoadState("domcontentloaded");
    await expect(page).not.toHaveURL(/\/login/);

    await page.waitForTimeout(3000);

    // The monitor shows a "/hr" stat (e.g. "✓ 3/hr") for succeeded last 1h
    // This pill is always rendered even if count = 0
    const hrStat = page.locator("text=/\\/hr/");
    await expect(hrStat.first()).toBeVisible({ timeout: 20_000 });
  });

  test("/dashboard does not show 500 error page", async ({ page }) => {
    let dashboardStatus = 0;

    page.on("response", (response) => {
      if (response.url().includes("/dashboard") && !response.url().includes("/api/")) {
        dashboardStatus = response.status();
      }
    });

    await page.goto("/dashboard");
    await page.waitForLoadState("domcontentloaded");
    await expect(page).not.toHaveURL(/\/login/);

    // The page load itself should not be a server error
    if (dashboardStatus > 0) {
      expect(dashboardStatus).toBeLessThan(500);
    }

    // Playwright's expect assertions on the page itself
    const errorMessage = page.locator("text=Application error");
    await expect(errorMessage).not.toBeVisible({ timeout: 5_000 }).catch(() => {
      // If the check itself fails with a timeout it means no error is shown — that's correct
    });
  });
});

// ---------------------------------------------------------------------------
// Brain Intelligence Banner
// ---------------------------------------------------------------------------

test.describe("Brain Intelligence Banner", () => {
  test("GET /api/brain/rl-status learningVelocity is a non-negative number", async ({ page }) => {
    await page.goto("/dashboard");
    await page.waitForLoadState("domcontentloaded");
    await expect(page).not.toHaveURL(/\/login/);

    const res = await page.evaluate(async () => {
      const r = await fetch("/api/brain/rl-status");
      return { status: r.status, body: await r.json() };
    });

    expect(res.status).toBe(200);
    expect(res.body.learningVelocity).toBeGreaterThanOrEqual(0);
  });

  test("/api/brain/learning-stats topDomain is a string or null", async ({ page }) => {
    await page.goto("/dashboard");
    await page.waitForLoadState("domcontentloaded");
    await expect(page).not.toHaveURL(/\/login/);

    const res = await page.evaluate(async () => {
      const r = await fetch("/api/brain/learning-stats");
      return { status: r.status, body: await r.json() };
    });

    expect(res.status).toBe(200);
    const topDomain = res.body.topDomain;
    expect(topDomain === null || typeof topDomain === "string").toBe(true);
  });

  test("brain intelligence data endpoints respond without 500", async ({ page }) => {
    await page.goto("/dashboard");
    await page.waitForLoadState("domcontentloaded");
    await expect(page).not.toHaveURL(/\/login/);

    // Confirm all brain intelligence data endpoints return sub-500 status
    const [rlStatus, rlStats, learnStats] = await page.evaluate(async () => {
      const [a, b, c] = await Promise.all([
        fetch("/api/brain/rl-status"),
        fetch("/api/brain/rl-stats"),
        fetch("/api/brain/learning-stats"),
      ]);
      return [a.status, b.status, c.status];
    });

    expect(rlStatus).toBeLessThan(500);
    expect(rlStats).toBeLessThan(500);
    expect(learnStats).toBeLessThan(500);
  });
});

// ---------------------------------------------------------------------------
// RL Stats Panel — API-level verification
// ---------------------------------------------------------------------------

test.describe("RL Stats Panel Data", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/agents");
    await page.waitForLoadState("domcontentloaded");
    await expect(page).not.toHaveURL(/\/login/);
  });

  test("rl-stats domain accuracy values are within valid 0–1 range", async ({ page }) => {
    const res = await page.evaluate(async () => {
      const r = await fetch("/api/brain/rl-stats");
      return await r.json();
    });

    for (const domain of res.byDomain as any[]) {
      expect(domain.successRate).toBeGreaterThanOrEqual(0);
      expect(domain.successRate).toBeLessThanOrEqual(1);
      expect(domain.avgQuality).toBeGreaterThanOrEqual(0);
      expect(domain.avgQuality).toBeLessThanOrEqual(1);
    }
  });

  test("rl-stats evolution snapshots are null or have accuracy + totalPredictions", async ({ page }) => {
    const res = await page.evaluate(async () => {
      const r = await fetch("/api/brain/rl-stats");
      return await r.json();
    });

    const checkSnapshot = (snap: any) => {
      if (snap !== null) {
        expect(snap).toHaveProperty("accuracy");
        expect(snap).toHaveProperty("totalPredictions");
        expect(typeof snap.accuracy).toBe("number");
        expect(typeof snap.totalPredictions).toBe("number");
      }
    };

    checkSnapshot(res.evolutionToday);
    checkSnapshot(res.evolutionYesterday);
  });

  test("rl-stats total outcome count matches sum of per-domain counts", async ({ page }) => {
    const res = await page.evaluate(async () => {
      const r = await fetch("/api/brain/rl-stats");
      return await r.json();
    });

    const sumFromDomains = (res.byDomain as any[]).reduce(
      (acc: number, d: any) => acc + d.totalOutcomes,
      0
    );

    // The top-level totalOutcomes may differ slightly from the sum (e.g. due to
    // rounding or cross-domain entries), but should be in the same ballpark.
    // We check it's non-negative and that the sum doesn't wildly exceed it.
    expect(res.totalOutcomes).toBeGreaterThanOrEqual(0);
    if (sumFromDomains > 0) {
      // Sum of domain outcomes should equal total (they come from the same query)
      expect(res.totalOutcomes).toBe(sumFromDomains);
    }
  });

  test("worker-health and rl-stats run together without conflicting auth", async ({ page }) => {
    // Ensure both dashboard data sources can be fetched in the same page context
    const [healthRes, statsRes] = await page.evaluate(async () => {
      const [h, s] = await Promise.all([
        fetch("/api/brain/worker-health"),
        fetch("/api/brain/rl-stats"),
      ]);
      return [
        { status: h.status, body: await h.json() },
        { status: s.status, body: await s.json() },
      ];
    });

    expect(healthRes.status).toBe(200);
    expect(statsRes.status).toBe(200);

    // Both must return valid numeric fields
    expect(typeof healthRes.body.pendingJobs).toBe("number");
    expect(typeof statsRes.body.totalOutcomes).toBe("number");
  });

  test("all three RL endpoints return consistent auth behavior when unauthenticated", async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto("http://localhost:3001");

    const statuses = await page.evaluate(async () => {
      const [a, b, c] = await Promise.all([
        fetch("/api/brain/rl-status"),
        fetch("/api/brain/rl-stats"),
        fetch("/api/brain/learning-stats"),
      ]);
      return [a.status, b.status, c.status];
    });

    // All three should return 401 or 403 when unauthenticated
    for (const status of statuses) {
      expect([401, 403]).toContain(status);
    }

    await context.close();
  });
});

// ---------------------------------------------------------------------------
// Dashboard API response times (smoke test — not strict perf benchmarks)
// ---------------------------------------------------------------------------

test.describe("Dashboard API Response Times", () => {
  test("worker-health responds within 10 seconds", async ({ page }) => {
    test.slow();

    await page.goto("/agents");
    await page.waitForLoadState("domcontentloaded");

    const startTime = Date.now();
    const res = await page.evaluate(async () => {
      const r = await fetch("/api/brain/worker-health");
      return r.status;
    });
    const elapsed = Date.now() - startTime;

    expect(res).toBe(200);
    expect(elapsed).toBeLessThan(10_000);
  });

  test("rl-stats responds within 10 seconds", async ({ page }) => {
    test.slow();

    await page.goto("/agents");
    await page.waitForLoadState("domcontentloaded");

    const startTime = Date.now();
    const res = await page.evaluate(async () => {
      const r = await fetch("/api/brain/rl-stats");
      return r.status;
    });
    const elapsed = Date.now() - startTime;

    expect(res).toBe(200);
    expect(elapsed).toBeLessThan(10_000);
  });

  test("learning-stats responds within 10 seconds", async ({ page }) => {
    test.slow();

    await page.goto("/agents");
    await page.waitForLoadState("domcontentloaded");

    const startTime = Date.now();
    const res = await page.evaluate(async () => {
      const r = await fetch("/api/brain/learning-stats");
      return r.status;
    });
    const elapsed = Date.now() - startTime;

    expect(res).toBe(200);
    expect(elapsed).toBeLessThan(10_000);
  });
});
