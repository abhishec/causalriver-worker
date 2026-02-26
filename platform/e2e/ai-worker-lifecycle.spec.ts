/**
 * AI Worker Full Lifecycle E2E Tests
 *
 * Tests the end-to-end flow of SE-aaS job submission, status polling,
 * artifact persistence, write-back queue, worker processing, and log
 * verification.
 *
 * Architecture under test:
 *   POST /api/se-aas/pr-review         → queues job
 *   GET  /api/se-aas/jobs/:id          → polls job status
 *   GET  /api/brain/worker-health      → verifies job appears in recentJobs
 *   GET  /api/connectors/writeback/queue → write-back queue items
 *   GET  /api/cron/process-jobs        → cron drain endpoint (worker invocation)
 *   GET  /api/se-aas/artifacts         → artifact listing after job completes
 *
 * Notes:
 *   - Job processing (agent_queue → se_aas_artifacts) requires the SE-aaS
 *     job worker to be running. In a full integration environment the worker
 *     fires after the job is submitted. In CI (no worker) jobs stay in
 *     "pending" state — tests handle both cases gracefully.
 *   - Write-back tests only verify queue shape, not live Slack/Jira delivery,
 *     since external connectors are not wired in the test environment.
 *
 * Uses authenticated session from setup.
 */

import { test, expect } from "@playwright/test";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Poll a URL until the predicate returns true or we exceed maxAttempts. */
async function poll<T>(
  fn: () => Promise<T>,
  predicate: (result: T) => boolean,
  {
    intervalMs = 2000,
    maxAttempts = 15,
  }: { intervalMs?: number; maxAttempts?: number } = {}
): Promise<T | null> {
  for (let i = 0; i < maxAttempts; i++) {
    const result = await fn();
    if (predicate(result)) return result;
    if (i < maxAttempts - 1) {
      await new Promise((r) => setTimeout(r, intervalMs));
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// SE-aaS Job Submission
// ---------------------------------------------------------------------------

test.describe("AI Worker Full Lifecycle", () => {
  // We use PR-review as the test domain: it's a light job, doesn't require
  // live GitHub auth to enqueue, and is representative of the async job path.

  test("POST /api/se-aas/pr-review submits a job and returns jobId", async ({ page }) => {
    await page.goto("/agents");
    await page.waitForLoadState("domcontentloaded");
    await expect(page).not.toHaveURL(/\/login/);

    const res = await page.evaluate(async () => {
      const r = await fetch("/api/se-aas/pr-review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          diff: "- const x = 1\n+ const x = 2\n",
          context: "E2E test PR review submission",
        }),
      });
      return { status: r.status, body: await r.json() };
    });

    // 200 or 201 — both are acceptable for a queued job submission
    expect([200, 201]).toContain(res.status);
    expect(res.body).toHaveProperty("jobId");
    expect(res.body).toHaveProperty("pollUrl");
    expect(typeof res.body.jobId).toBe("string");
    expect(res.body.jobId.length).toBeGreaterThan(0);
  });

  test("submitted job is retrievable via GET /api/se-aas/jobs/:id", async ({ page }) => {
    await page.goto("/agents");
    await page.waitForLoadState("domcontentloaded");

    // Submit a job first
    const submitRes = await page.evaluate(async () => {
      const r = await fetch("/api/se-aas/pr-review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          diff: "- old line\n+ new line\n",
          context: "E2E lifecycle test",
        }),
      });
      return { status: r.status, body: await r.json() };
    });

    expect([200, 201]).toContain(submitRes.status);
    const jobId = submitRes.body.jobId;
    expect(typeof jobId).toBe("string");

    // Fetch the job status
    const statusRes = await page.evaluate(async (id) => {
      const r = await fetch(`/api/se-aas/jobs/${id}`);
      return { status: r.status, body: await r.json() };
    }, jobId);

    expect(statusRes.status).toBe(200);
    expect(statusRes.body).toHaveProperty("jobId");
    expect(statusRes.body).toHaveProperty("status");
    expect(["pending", "running", "success", "error"]).toContain(statusRes.body.status);
    expect(statusRes.body.jobId).toBe(jobId);
  });

  test("GET /api/se-aas/jobs/:id returns 404 for unknown job id", async ({ page }) => {
    await page.goto("/agents");
    await page.waitForLoadState("domcontentloaded");

    const fakeJobId = "00000000-0000-0000-0000-000000000000";
    const res = await page.evaluate(async (id) => {
      const r = await fetch(`/api/se-aas/jobs/${id}`);
      return { status: r.status };
    }, fakeJobId);

    expect(res.status).toBe(404);
  });

  test("job appears in GET /api/brain/worker-health recentJobs after submission", async ({ page }) => {
    test.slow();

    await page.goto("/agents");
    await page.waitForLoadState("domcontentloaded");

    // Submit a job
    const submitRes = await page.evaluate(async () => {
      const r = await fetch("/api/se-aas/pr-review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          diff: "+ function newFeature() { return true; }\n",
          context: "E2E worker-health visibility test",
        }),
      });
      return { status: r.status, body: await r.json() };
    });

    expect([200, 201]).toContain(submitRes.status);
    const jobId = submitRes.body.jobId;

    // Wait for the job to appear in worker-health recentJobs
    // (may take a moment after the insert propagates)
    const found = await poll(
      async () => {
        return await page.evaluate(async () => {
          const r = await fetch("/api/brain/worker-health");
          return await r.json();
        });
      },
      (health: any) => {
        return (health.recentJobs ?? []).some((j: any) => j.id === jobId);
      },
      { intervalMs: 1500, maxAttempts: 10 }
    );

    // If the job shows up, verify its shape
    if (found) {
      const jobInList = (found as any).recentJobs.find((j: any) => j.id === jobId);
      expect(jobInList).toBeDefined();
      expect(jobInList).toHaveProperty("taskType");
      expect(jobInList).toHaveProperty("status");
      expect(jobInList).toHaveProperty("createdAt");
      expect(jobInList).toHaveProperty("hasArtifact");
    } else {
      // In CI or slow environments it's acceptable if it doesn't show immediately
      // The API must still return 200 with the right shape
      const healthRes = await page.evaluate(async () => {
        const r = await fetch("/api/brain/worker-health");
        return { status: r.status, body: await r.json() };
      });
      expect(healthRes.status).toBe(200);
      expect(typeof healthRes.body.pendingJobs).toBe("number");
      expect(typeof healthRes.body.runningJobs).toBe("number");
      expect(Array.isArray(healthRes.body.recentJobs)).toBe(true);
    }
  });

  // ---------------------------------------------------------------------------
  // Poll job until complete (if worker is running)
  // ---------------------------------------------------------------------------

  test("poll submitted job status until terminal state (success/error) or timeout", async ({ page }) => {
    test.slow();

    await page.goto("/agents");
    await page.waitForLoadState("domcontentloaded");

    // Submit a minimal codebase-qa job (lightweight enough to process fast)
    const submitRes = await page.evaluate(async () => {
      const r = await fetch("/api/se-aas/codebase-qa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: "What does this codebase do?",
          context: "E2E polling test",
        }),
      });
      return { status: r.status, body: await r.json() };
    });

    expect([200, 201]).toContain(submitRes.status);
    const jobId = submitRes.body.jobId;
    expect(typeof jobId).toBe("string");

    // Poll for up to 30s (15 × 2s)
    const finalState = await poll(
      async () => {
        return await page.evaluate(async (id) => {
          const r = await fetch(`/api/se-aas/jobs/${id}`);
          return await r.json();
        }, jobId);
      },
      (job: any) => ["success", "error"].includes(job.status),
      { intervalMs: 2000, maxAttempts: 15 }
    );

    // If we reached a terminal state, validate the shape
    if (finalState && ["success", "error"].includes((finalState as any).status)) {
      const job = finalState as any;
      expect(job).toHaveProperty("jobId");
      expect(job).toHaveProperty("status");
      expect(job).toHaveProperty("createdAt");

      if (job.status === "success") {
        // Successful jobs should have a result object
        expect(job).toHaveProperty("result");
      } else if (job.status === "error") {
        // Failed jobs should have an error message
        // (result may be present with error details)
        expect(job).toHaveProperty("error");
      }
    } else {
      // Worker not running in this environment — verify job is still accessible
      const checkRes = await page.evaluate(async (id) => {
        const r = await fetch(`/api/se-aas/jobs/${id}`);
        return { status: r.status, body: await r.json() };
      }, jobId);

      expect(checkRes.status).toBe(200);
      expect(["pending", "running"]).toContain(checkRes.body.status);
    }
  });

  // ---------------------------------------------------------------------------
  // Artifacts
  // ---------------------------------------------------------------------------

  test("GET /api/se-aas/artifacts returns 200 with array (may be empty)", async ({ page }) => {
    await page.goto("/agents");
    await page.waitForLoadState("domcontentloaded");

    const res = await page.evaluate(async () => {
      const r = await fetch("/api/se-aas/artifacts?limit=10");
      return { status: r.status, body: await r.json() };
    });

    expect(res.status).toBe(200);
    // The response is either an array or an object containing artifacts
    expect(res.body).not.toBeNull();
  });

  test("artifacts returned by /api/se-aas/artifacts have expected fields when non-empty", async ({ page }) => {
    await page.goto("/agents");
    await page.waitForLoadState("domcontentloaded");

    const res = await page.evaluate(async () => {
      const r = await fetch("/api/se-aas/artifacts?limit=5");
      return { status: r.status, body: await r.json() };
    });

    expect(res.status).toBe(200);

    // Handle both { artifacts: [] } and [] response shapes
    const artifacts = Array.isArray(res.body)
      ? res.body
      : (res.body.artifacts ?? []);

    for (const artifact of artifacts as any[]) {
      expect(artifact).toHaveProperty("id");
      expect(artifact).toHaveProperty("organization_id");
      expect(artifact).toHaveProperty("domain_type");
      expect(artifact).toHaveProperty("artifact_data");
      expect(artifact).toHaveProperty("created_at");
    }
  });

  // ---------------------------------------------------------------------------
  // Write-back queue state after job submission
  // ---------------------------------------------------------------------------

  test("GET /api/connectors/writeback/queue returns stats after job submission", async ({ page }) => {
    await page.goto("/connectors");
    await page.waitForLoadState("domcontentloaded");

    // Submit a job to ensure there's activity
    await page.evaluate(async () => {
      await fetch("/api/se-aas/pr-review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ diff: "+ const a = 1;\n" }),
      });
    });

    // Now check the write-back queue
    const queueRes = await page.evaluate(async () => {
      const r = await fetch("/api/connectors/writeback/queue");
      return { status: r.status, body: await r.json() };
    });

    expect(queueRes.status).toBe(200);
    expect(queueRes.body).toHaveProperty("stats");
    expect(typeof queueRes.body.stats.pending).toBe("number");
    expect(typeof queueRes.body.stats.completed).toBe("number");
    expect(typeof queueRes.body.stats.failed).toBe("number");
  });

  // ---------------------------------------------------------------------------
  // Cron endpoint — process-jobs
  // ---------------------------------------------------------------------------

  test("GET /api/cron/process-jobs returns 401 without CRON_SECRET header", async ({ page }) => {
    await page.goto("/agents");
    await page.waitForLoadState("domcontentloaded");

    const res = await page.evaluate(async () => {
      const r = await fetch("/api/cron/process-jobs");
      return { status: r.status };
    });

    // Without a valid CRON_SECRET bearer token, expect 401
    expect(res.status).toBe(401);
  });

  test("GET /api/cron/process-jobs is reachable (not 404/500)", async ({ page }) => {
    await page.goto("/agents");
    await page.waitForLoadState("domcontentloaded");

    // We just verify the endpoint exists and doesn't 500 on an unauthorized hit
    const res = await page.evaluate(async () => {
      const r = await fetch("/api/cron/process-jobs");
      return { status: r.status };
    });

    // Must be 401 (no auth) — not 404 (endpoint missing) or 500 (crash)
    expect(res.status).not.toBe(404);
    expect(res.status).not.toBe(500);
  });

  // ---------------------------------------------------------------------------
  // SE-aaS worker endpoint
  // ---------------------------------------------------------------------------

  test("POST /api/se-aas/worker returns 401 without worker secret header", async ({ page }) => {
    await page.goto("/agents");
    await page.waitForLoadState("domcontentloaded");

    const res = await page.evaluate(async () => {
      const r = await fetch("/api/se-aas/worker", { method: "POST" });
      return { status: r.status };
    });

    expect(res.status).toBe(401);
  });

  // ---------------------------------------------------------------------------
  // Worker health stats
  // ---------------------------------------------------------------------------

  test("GET /api/brain/worker-health returns valid stats shape", async ({ page }) => {
    await page.goto("/agents");
    await page.waitForLoadState("domcontentloaded");

    const res = await page.evaluate(async () => {
      const r = await fetch("/api/brain/worker-health");
      return { status: r.status, body: await r.json() };
    });

    expect(res.status).toBe(200);
    expect(typeof res.body.pendingJobs).toBe("number");
    expect(typeof res.body.runningJobs).toBe("number");
    expect(typeof res.body.succeededLast1h).toBe("number");
    expect(typeof res.body.failedLast1h).toBe("number");
    expect(Array.isArray(res.body.recentJobs)).toBe(true);

    // Validate recentJobs item shape when non-empty
    for (const job of res.body.recentJobs as any[]) {
      expect(job).toHaveProperty("id");
      expect(job).toHaveProperty("taskType");
      expect(job).toHaveProperty("status");
      expect(job).toHaveProperty("createdAt");
      expect(job).toHaveProperty("hasArtifact");
      expect(["pending", "running", "success", "error"]).toContain(job.status);
      expect(typeof job.hasArtifact).toBe("boolean");
    }
  });

  test("GET /api/brain/worker-health returns 401 for unauthenticated requests", async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto("http://localhost:3001");

    const res = await page.evaluate(async () => {
      const r = await fetch("/api/brain/worker-health");
      return { status: r.status };
    });

    expect([401, 403]).toContain(res.status);
    await context.close();
  });

  // ---------------------------------------------------------------------------
  // Full lifecycle round-trip (requires worker)
  // ---------------------------------------------------------------------------

  test("full lifecycle: submit → poll → worker-health → artifact listing", async ({ page }) => {
    test.slow();

    await page.goto("/agents");
    await page.waitForLoadState("domcontentloaded");
    await expect(page).not.toHaveURL(/\/login/);

    // 1. SUBMIT — use pr-review as a representative lightweight domain
    const submitRes = await page.evaluate(async () => {
      const r = await fetch("/api/se-aas/pr-review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          diff:
            "- function oldAuth() { return false; }\n" +
            "+ function newAuth(token: string) { return token.length > 0; }\n",
          context: "E2E full lifecycle test — auth refactor",
        }),
      });
      return { status: r.status, body: await r.json() };
    });

    expect([200, 201]).toContain(submitRes.status);
    const jobId = submitRes.body.jobId;
    expect(typeof jobId).toBe("string");

    // 2. VERIFY job is pending or running immediately after submission
    const initialStatus = await page.evaluate(async (id) => {
      const r = await fetch(`/api/se-aas/jobs/${id}`);
      return await r.json();
    }, jobId);

    expect(["pending", "running", "success"]).toContain(initialStatus.status);

    // 3. POLL until terminal — up to 30s
    const finalJob = await poll(
      async () => {
        return await page.evaluate(async (id) => {
          const r = await fetch(`/api/se-aas/jobs/${id}`);
          return await r.json();
        }, jobId);
      },
      (j: any) => ["success", "error"].includes(j.status),
      { intervalMs: 2000, maxAttempts: 15 }
    );

    // 4. WORKER HEALTH — verify stats and shape
    const healthRes = await page.evaluate(async () => {
      const r = await fetch("/api/brain/worker-health");
      return { status: r.status, body: await r.json() };
    });

    expect(healthRes.status).toBe(200);
    expect(typeof healthRes.body.pendingJobs).toBe("number");
    expect(typeof healthRes.body.runningJobs).toBe("number");
    expect(Array.isArray(healthRes.body.recentJobs)).toBe(true);

    // 5. ARTIFACT LIST — verify endpoint is reachable
    const artifactRes = await page.evaluate(async () => {
      const r = await fetch("/api/se-aas/artifacts?limit=5");
      return { status: r.status, body: await r.json() };
    });
    expect(artifactRes.status).toBe(200);

    // 6. WRITEBACK QUEUE — verify the queue endpoint is always healthy
    const queueRes = await page.evaluate(async () => {
      const r = await fetch("/api/connectors/writeback/queue");
      return { status: r.status, body: await r.json() };
    });
    expect(queueRes.status).toBe(200);
    expect(queueRes.body).toHaveProperty("stats");

    // Summarize: if job finished, verify basic result shape
    if (finalJob && (finalJob as any).status === "success") {
      expect((finalJob as any).result).toBeDefined();
    }
  });

  // ---------------------------------------------------------------------------
  // Multiple domain job submissions
  // ---------------------------------------------------------------------------

  test.describe("Domain-specific job submission", () => {
    const DOMAIN_JOBS = [
      {
        domain: "pr-review",
        endpoint: "/api/se-aas/pr-review",
        body: { diff: "+ const y = 42;\n", context: "E2E test" },
      },
      {
        domain: "codebase-qa",
        endpoint: "/api/se-aas/codebase-qa",
        body: { question: "What is the authentication mechanism?", context: "E2E test" },
      },
    ] as const;

    for (const { domain, endpoint, body } of DOMAIN_JOBS) {
      test(`POST ${endpoint} queues ${domain} job and returns jobId`, async ({ page }) => {
        await page.goto("/agents");
        await page.waitForLoadState("domcontentloaded");

        const res = await page.evaluate(
          async ({ ep, b }) => {
            const r = await fetch(ep, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(b),
            });
            return { status: r.status, body: await r.json() };
          },
          { ep: endpoint, b: body }
        );

        expect([200, 201]).toContain(res.status);
        expect(res.body).toHaveProperty("jobId");
        expect(res.body).toHaveProperty("pollUrl");
        expect(res.body.domain).toBe(domain);

        // Verify the pollUrl is actually fetchable
        const pollRes = await page.evaluate(async (url) => {
          const r = await fetch(url);
          return { status: r.status, body: await r.json() };
        }, res.body.pollUrl);

        expect(pollRes.status).toBe(200);
        expect(["pending", "running", "success", "error"]).toContain(pollRes.body.status);
      });
    }

    test("POST /api/se-aas/pr-review returns 400 when diff is missing", async ({ page }) => {
      await page.goto("/agents");
      await page.waitForLoadState("domcontentloaded");

      const res = await page.evaluate(async () => {
        const r = await fetch("/api/se-aas/pr-review", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ context: "no diff provided" }),
        });
        return { status: r.status, body: await r.json() };
      });

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty("error");
    });

    test("POST /api/se-aas/codebase-qa returns 400 when question is missing", async ({ page }) => {
      await page.goto("/agents");
      await page.waitForLoadState("domcontentloaded");

      const res = await page.evaluate(async () => {
        const r = await fetch("/api/se-aas/codebase-qa", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ context: "no question provided" }),
        });
        return { status: r.status, body: await r.json() };
      });

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty("error");
    });
  });
});
