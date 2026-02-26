/**
 * Agent Management E2E Tests
 *
 * Tests the full CRUD lifecycle for agent definitions via /api/brain/agents,
 * plus basic UI rendering on the /agents page.
 *
 * Uses authenticated session from setup.
 */
import { test, expect } from "@playwright/test";

test.describe("Agent Management API", () => {
  let createdAgentId: string | null = null;

  test("GET /api/brain/agents returns agents array", async ({ page }) => {
    await page.goto("/agents");

    const response = await page.evaluate(async () => {
      const res = await fetch("/api/brain/agents");
      return {
        status: res.status,
        body: await res.json(),
      };
    });

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty("agents");
    expect(Array.isArray(response.body.agents)).toBe(true);
    expect(response.body).toHaveProperty("validTaskTypes");
    expect(Array.isArray(response.body.validTaskTypes)).toBe(true);
  });

  test("POST /api/brain/agents creates agent and returns 201", async ({ page }) => {
    await page.goto("/agents");

    const createRes = await page.evaluate(async () => {
      const res = await fetch("/api/brain/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "E2E Test Agent - Safe to Delete",
          description: "Created by Playwright E2E tests",
          domain: "pod-match",
          trigger: "manual",
        }),
      });
      return {
        status: res.status,
        body: await res.json(),
      };
    });

    expect(createRes.status).toBe(201);
    expect(createRes.body).toHaveProperty("id");
    expect(createRes.body.status).toBe("active");
    expect(createRes.body.rlEnabled).toBe(true);
    expect(createRes.body.brainEnabled).toBe(true);
    expect(createRes.body.domain).toBe("pod-match");

    createdAgentId = createRes.body.id;
  });

  test("GET /api/brain/agents/[id] returns the agent", async ({ page }) => {
    // This test depends on createdAgentId from the previous test.
    // If that test didn't run or failed, we skip gracefully.
    // In Playwright, tests in a describe block share the outer scope variable.

    await page.goto("/agents");

    // First create an agent we can look up
    const createRes = await page.evaluate(async () => {
      const res = await fetch("/api/brain/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "E2E GET Test Agent - Safe to Delete",
          domain: "early-warning",
          trigger: "manual",
        }),
      });
      return {
        status: res.status,
        body: await res.json(),
      };
    });

    expect(createRes.status).toBe(201);
    const agentId = createRes.body.id;

    // Now fetch it by ID
    const getRes = await page.evaluate(async (id) => {
      const res = await fetch(`/api/brain/agents/${id}`);
      return {
        status: res.status,
        body: await res.json(),
      };
    }, agentId);

    expect(getRes.status).toBe(200);
    expect(getRes.body).toHaveProperty("agent");
    expect(getRes.body.agent.id).toBe(agentId);
    expect(getRes.body.agent.domain).toBe("early-warning");

    // Cleanup
    await page.evaluate(async (id) => {
      await fetch(`/api/brain/agents/${id}`, { method: "DELETE" });
    }, agentId);
  });

  test("PATCH /api/brain/agents/[id] updates agent status", async ({ page }) => {
    await page.goto("/agents");

    // Create agent to patch
    const createRes = await page.evaluate(async () => {
      const res = await fetch("/api/brain/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "E2E PATCH Test Agent - Safe to Delete",
          domain: "scope-creep",
          trigger: "manual",
        }),
      });
      return {
        status: res.status,
        body: await res.json(),
      };
    });

    expect(createRes.status).toBe(201);
    const agentId = createRes.body.id;

    // Patch the status to paused
    const patchRes = await page.evaluate(async (id) => {
      const res = await fetch(`/api/brain/agents/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "paused" }),
      });
      return {
        status: res.status,
        body: await res.json(),
      };
    }, agentId);

    expect(patchRes.status).toBe(200);
    expect(patchRes.body.success).toBe(true);
    expect(patchRes.body.agent.status).toBe("paused");

    // Cleanup
    await page.evaluate(async (id) => {
      await fetch(`/api/brain/agents/${id}`, { method: "DELETE" });
    }, agentId);
  });

  test("DELETE /api/brain/agents/[id] soft-archives agent and returns 200", async ({ page }) => {
    await page.goto("/agents");

    // Create agent to delete
    const createRes = await page.evaluate(async () => {
      const res = await fetch("/api/brain/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "E2E DELETE Test Agent - Safe to Delete",
          domain: "delivery-intelligence",
          trigger: "manual",
        }),
      });
      return {
        status: res.status,
        body: await res.json(),
      };
    });

    expect(createRes.status).toBe(201);
    const agentId = createRes.body.id;

    // Delete (soft-archive)
    const deleteRes = await page.evaluate(async (id) => {
      const res = await fetch(`/api/brain/agents/${id}`, {
        method: "DELETE",
      });
      return {
        status: res.status,
        body: await res.json(),
      };
    }, agentId);

    expect(deleteRes.status).toBe(200);
    expect(deleteRes.body.success).toBe(true);
  });

  test("created agent appears in GET /api/brain/agents list", async ({ page }) => {
    await page.goto("/agents");

    const uniqueName = `E2E List Test Agent ${Date.now()} - Safe to Delete`;

    const createRes = await page.evaluate(async (name) => {
      const res = await fetch("/api/brain/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          domain: "pod-match",
          trigger: "manual",
        }),
      });
      return {
        status: res.status,
        body: await res.json(),
      };
    }, uniqueName);

    expect(createRes.status).toBe(201);
    const agentId = createRes.body.id;

    // Verify it appears in the list
    const listRes = await page.evaluate(async () => {
      const res = await fetch("/api/brain/agents");
      return await res.json();
    });

    const found = (listRes.agents as any[]).find((a: any) => a.name === uniqueName);
    expect(found).toBeTruthy();
    expect(found.memoryTracking).toBe(true);
    expect(found.rlEnabled).toBe(true);

    // Cleanup
    await page.evaluate(async (id) => {
      await fetch(`/api/brain/agents/${id}`, { method: "DELETE" });
    }, agentId);
  });
});

test.describe("Agents Page UI", () => {
  test("/agents page loads with Agent Definitions tab visible", async ({ page }) => {
    await page.goto("/agents");
    await page.waitForLoadState("domcontentloaded");

    // Page should not redirect to login
    await expect(page).not.toHaveURL(/\/login/);

    // The h1 heading should say "Agents"
    const heading = page.locator("h1");
    await expect(heading).toContainText("Agents", { timeout: 15_000 });

    // The "Agent Definitions" tab button should be visible
    const definitionsTab = page.locator("button", { hasText: "Agent Definitions" });
    await expect(definitionsTab).toBeVisible({ timeout: 10_000 });
  });

  test("clicking Run History tab renders content without 500", async ({ page }) => {
    await page.goto("/agents");
    await page.waitForLoadState("domcontentloaded");

    await expect(page).not.toHaveURL(/\/login/);

    // Click the Run History tab
    const historyTab = page.locator("button", { hasText: "Run History" });
    await expect(historyTab).toBeVisible({ timeout: 10_000 });
    await historyTab.click();

    // Should render content (table, heading, or empty state) — not crash
    const content = page.locator("main, h1, h2, h3, p, table, [role='main']");
    await expect(content.first()).toBeVisible({ timeout: 15_000 });

    // Must not redirect to login (auth still valid)
    await expect(page).not.toHaveURL(/\/login/);
  });

  test("Create Agent button is visible in Agent Definitions tab", async ({ page }) => {
    await page.goto("/agents");
    await page.waitForLoadState("domcontentloaded");

    await expect(page).not.toHaveURL(/\/login/);

    // Definitions tab should be the default — no need to click it
    // Look for a "New Agent", "Create Agent", or "+" button
    const createBtn = page.locator("button").filter({ hasText: /new agent|create agent|\+/i });
    await expect(createBtn.first()).toBeVisible({ timeout: 15_000 });
  });
});
