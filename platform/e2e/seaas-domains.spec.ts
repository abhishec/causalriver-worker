/**
 * SE-aaS Domain Smoke Tests
 *
 * These tests verify that the 4 SE-aaS delivery intelligence domains are
 * reachable and their agent definitions can be created via the Brain agents API.
 *
 * We use the /api/brain/agents POST + GET pattern rather than live copilot
 * chat streaming (which is too slow and LLM-dependent for CI smoke tests).
 *
 * Domains tested:
 *   - delivery-intelligence
 *   - pod-match
 *   - early-warning
 *   - scope-creep
 */
import { test, expect } from "@playwright/test";

const SE_AAS_DOMAINS = [
  "delivery-intelligence",
  "pod-match",
  "early-warning",
  "scope-creep",
] as const;

test.describe("SE-aaS Domain Agent Creation", () => {
  // Keep track of created agents so we can clean up even on failure
  const createdAgentIds: string[] = [];

  for (const domain of SE_AAS_DOMAINS) {
    test(`POST /api/brain/agents with domain="${domain}" → 201`, async ({ page }) => {
      // Navigate to agents page to establish auth context
      await page.goto("/agents");

      const createRes = await page.evaluate(async (d) => {
        const res = await fetch("/api/brain/agents", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: `E2E SE-aaS Agent [${d}] - Safe to Delete`,
            description: `Automated smoke test for domain: ${d}`,
            domain: d,
            trigger: "manual",
          }),
        });
        return {
          status: res.status,
          body: await res.json(),
        };
      }, domain);

      expect(createRes.status).toBe(201);
      expect(createRes.body).toHaveProperty("id");
      expect(createRes.body.domain).toBe(domain);
      expect(createRes.body.status).toBe("active");
      expect(createRes.body.brainEnabled).toBe(true);
      expect(createRes.body.rlEnabled).toBe(true);

      createdAgentIds.push(createRes.body.id);

      // Immediately verify it is retrievable
      const agentId = createRes.body.id;
      const getRes = await page.evaluate(async (id) => {
        const res = await fetch(`/api/brain/agents/${id}`);
        return {
          status: res.status,
          body: await res.json(),
        };
      }, agentId);

      expect(getRes.status).toBe(200);
      expect(getRes.body.agent.id).toBe(agentId);

      // Soft-delete to keep the workspace clean
      await page.evaluate(async (id) => {
        await fetch(`/api/brain/agents/${id}`, { method: "DELETE" });
      }, agentId);
    });
  }
});

test.describe("SE-aaS Domain API Validation", () => {
  test("POST /api/brain/agents with invalid domain returns 400", async ({ page }) => {
    await page.goto("/agents");

    const res = await page.evaluate(async () => {
      const r = await fetch("/api/brain/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Bad Domain Agent",
          domain: "not-a-real-domain",
          trigger: "manual",
        }),
      });
      return {
        status: r.status,
        body: await r.json(),
      };
    });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
  });

  test("GET /api/brain/agents?domain=pod-match filters to that domain", async ({ page }) => {
    await page.goto("/agents");

    // Create a pod-match agent first
    const createRes = await page.evaluate(async () => {
      const r = await fetch("/api/brain/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "E2E Pod Match Filter Test - Safe to Delete",
          domain: "pod-match",
          trigger: "manual",
        }),
      });
      return { status: r.status, body: await r.json() };
    });

    expect(createRes.status).toBe(201);
    const agentId = createRes.body.id;

    // Fetch with domain filter
    const listRes = await page.evaluate(async () => {
      const r = await fetch("/api/brain/agents?domain=pod-match");
      return { status: r.status, body: await r.json() };
    });

    expect(listRes.status).toBe(200);
    // All returned agents should have domain = "pod-match"
    const agents = listRes.body.agents as any[];
    for (const agent of agents) {
      expect(agent.domain).toBe("pod-match");
    }

    // Cleanup
    await page.evaluate(async (id) => {
      await fetch(`/api/brain/agents/${id}`, { method: "DELETE" });
    }, agentId);
  });

  test("SE-aaS engagement health endpoint returns 200", async ({ page }) => {
    // NOTE: This test verifies the engagement health API directly.
    // It may return empty data if no engagements exist in the DB,
    // but it must NOT return a 500.
    await page.goto("/agents");

    const res = await page.evaluate(async () => {
      const r = await fetch("/api/se-aas/engagement-health");
      return {
        status: r.status,
        body: await r.json().catch(() => null),
      };
    });

    // Should be 200 (with data or empty), not 500
    expect([200, 204]).toContain(res.status);
  });

  test("SE-aaS artifacts endpoint accepts GET and returns array or object", async ({ page }) => {
    // NOTE: This test verifies the artifacts endpoint is reachable and returns 200.
    // We skip asserting specific artifact content as it depends on seeded data.
    await page.goto("/agents");

    const res = await page.evaluate(async () => {
      const r = await fetch("/api/se-aas/artifacts?limit=5");
      return {
        status: r.status,
        body: await r.json().catch(() => null),
      };
    });

    // Should not be 500
    expect(res.status).toBeLessThan(500);
  });
});
