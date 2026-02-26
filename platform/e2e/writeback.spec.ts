/**
 * Connector Write-back Rules E2E Tests
 *
 * Tests the full CRUD lifecycle for connector_writeback_rules via the
 * /api/connectors/writeback/rules API, the write-back queue endpoint,
 * and the Connectors page UI.
 *
 * Endpoints covered:
 *   GET    /api/connectors/writeback/rules
 *   POST   /api/connectors/writeback/rules
 *   PATCH  /api/connectors/writeback/rules/:id
 *   DELETE /api/connectors/writeback/rules/:id
 *   GET    /api/connectors/writeback/queue
 *   GET    /api/connectors/writeback/queue?status=pending
 *
 * Uses authenticated session from setup.
 */

import { test, expect } from "@playwright/test";

// ---------------------------------------------------------------------------
// Shared state across describe block — tracks created rule IDs for cleanup
// ---------------------------------------------------------------------------

test.describe("Connector Write-back Rules", () => {
  let createdRuleId: string | null = null;

  // Navigate to /connectors before all API tests to establish auth context
  test.beforeEach(async ({ page }) => {
    await page.goto("/connectors");
    await page.waitForLoadState("domcontentloaded");
    await expect(page).not.toHaveURL(/\/login/);
  });

  // ---------------------------------------------------------------------------
  // GET — list rules (empty or existing)
  // ---------------------------------------------------------------------------

  test("GET /api/connectors/writeback/rules returns valid shape (rules array + total)", async ({ page }) => {
    const response = await page.evaluate(async () => {
      const res = await fetch("/api/connectors/writeback/rules");
      return {
        status: res.status,
        body: await res.json(),
      };
    });

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty("rules");
    expect(response.body).toHaveProperty("total");
    expect(Array.isArray(response.body.rules)).toBe(true);
    expect(typeof response.body.total).toBe("number");
    expect(response.body.total).toBe(response.body.rules.length);
  });

  test("GET /api/connectors/writeback/rules returns rule objects with expected fields when non-empty", async ({ page }) => {
    // Create a rule so we have at least one to inspect
    const createRes = await page.evaluate(async () => {
      const res = await fetch("/api/connectors/writeback/rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "E2E Field Shape Test - Safe to Delete",
          domain_type: "pod-match",
          connector_type: "slack",
          action_type: "post_message",
          action_config: { channel_id: "#e2e-test", message_template: "Test: {{top_recommendation}}" },
        }),
      });
      return { status: res.status, body: await res.json() };
    });

    expect(createRes.status).toBe(201);
    const ruleId = createRes.body.rule.id;

    // List and check the shape of the rule we just created
    const listRes = await page.evaluate(async () => {
      const res = await fetch("/api/connectors/writeback/rules");
      return { status: res.status, body: await res.json() };
    });

    expect(listRes.status).toBe(200);
    const rules = listRes.body.rules as any[];
    const found = rules.find((r: any) => r.id === ruleId);
    expect(found).toBeDefined();
    expect(found).toHaveProperty("id");
    expect(found).toHaveProperty("organization_id");
    expect(found).toHaveProperty("name");
    expect(found).toHaveProperty("domain_type");
    expect(found).toHaveProperty("connector_type");
    expect(found).toHaveProperty("action_type");
    expect(found).toHaveProperty("action_config");
    expect(found).toHaveProperty("enabled");
    expect(found).toHaveProperty("created_at");
    expect(found).toHaveProperty("updated_at");

    // Cleanup
    await page.evaluate(async (id) => {
      await fetch(`/api/connectors/writeback/rules/${id}`, { method: "DELETE" });
    }, ruleId);
  });

  // ---------------------------------------------------------------------------
  // POST — create a Slack rule
  // ---------------------------------------------------------------------------

  test("POST /api/connectors/writeback/rules creates a Slack rule and returns 201", async ({ page }) => {
    const createRes = await page.evaluate(async () => {
      const res = await fetch("/api/connectors/writeback/rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Pod Match → Slack",
          domain_type: "pod-match",
          connector_type: "slack",
          action_type: "post_message",
          action_config: {
            channel_id: "#general",
            message_template: "Pod: {{top_recommendation}}",
          },
        }),
      });
      return { status: res.status, body: await res.json() };
    });

    expect(createRes.status).toBe(201);
    expect(createRes.body).toHaveProperty("rule");

    const rule = createRes.body.rule;
    expect(rule).toHaveProperty("id");
    expect(rule.name).toBe("Pod Match → Slack");
    expect(rule.domain_type).toBe("pod-match");
    expect(rule.connector_type).toBe("slack");
    expect(rule.action_type).toBe("post_message");
    expect(rule.action_config).toMatchObject({
      channel_id: "#general",
      message_template: "Pod: {{top_recommendation}}",
    });
    // New rules default to enabled: true
    expect(rule.enabled).toBe(true);

    // Stash for subsequent tests in this describe block
    createdRuleId = rule.id;
  });

  test("POST /api/connectors/writeback/rules creates a Jira rule", async ({ page }) => {
    const createRes = await page.evaluate(async () => {
      const res = await fetch("/api/connectors/writeback/rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Scope Creep → Jira Ticket - E2E Safe to Delete",
          domain_type: "scope-creep",
          connector_type: "jira",
          action_type: "create_ticket",
          action_config: {
            project_key: "ENG",
            summary_template: "Scope creep alert: {{engagement_name}}",
            priority: "High",
          },
          description: "Auto-creates Jira ticket on scope creep detection",
        }),
      });
      return { status: res.status, body: await res.json() };
    });

    expect(createRes.status).toBe(201);
    const rule = createRes.body.rule;
    expect(rule.domain_type).toBe("scope-creep");
    expect(rule.connector_type).toBe("jira");
    expect(rule.action_type).toBe("create_ticket");
    expect(rule.description).toBe("Auto-creates Jira ticket on scope creep detection");

    // Cleanup
    await page.evaluate(async (id) => {
      await fetch(`/api/connectors/writeback/rules/${id}`, { method: "DELETE" });
    }, rule.id);
  });

  test("POST /api/connectors/writeback/rules creates a GitHub issue rule", async ({ page }) => {
    const createRes = await page.evaluate(async () => {
      const res = await fetch("/api/connectors/writeback/rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Early Warning → GitHub Issue - E2E Safe to Delete",
          domain_type: "early-warning",
          connector_type: "github",
          action_type: "create_issue",
          action_config: {
            repo: "org/repo",
            title_template: "Flight risk: {{engineer_name}}",
            labels: ["team-health", "automated"],
          },
          enabled: false,
        }),
      });
      return { status: res.status, body: await res.json() };
    });

    expect(createRes.status).toBe(201);
    const rule = createRes.body.rule;
    expect(rule.domain_type).toBe("early-warning");
    expect(rule.connector_type).toBe("github");
    // Respects explicit enabled: false
    expect(rule.enabled).toBe(false);

    // Cleanup
    await page.evaluate(async (id) => {
      await fetch(`/api/connectors/writeback/rules/${id}`, { method: "DELETE" });
    }, rule.id);
  });

  // ---------------------------------------------------------------------------
  // POST — validation errors
  // ---------------------------------------------------------------------------

  test("POST /api/connectors/writeback/rules returns 400 for missing required fields", async ({ page }) => {
    const badRes = await page.evaluate(async () => {
      const res = await fetch("/api/connectors/writeback/rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          // Missing: name, domain_type, connector_type, action_type, action_config
          description: "No required fields",
        }),
      });
      return { status: res.status, body: await res.json() };
    });

    expect(badRes.status).toBe(400);
    expect(badRes.body).toHaveProperty("error");
  });

  test("POST /api/connectors/writeback/rules returns 400 for invalid domain_type", async ({ page }) => {
    const badRes = await page.evaluate(async () => {
      const res = await fetch("/api/connectors/writeback/rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Bad Domain Rule",
          domain_type: "not-a-real-domain",
          connector_type: "slack",
          action_type: "post_message",
          action_config: { channel_id: "#test" },
        }),
      });
      return { status: res.status, body: await res.json() };
    });

    expect(badRes.status).toBe(400);
    expect(badRes.body).toHaveProperty("error");
    expect(badRes.body.error).toMatch(/domain_type/i);
  });

  test("POST /api/connectors/writeback/rules returns 400 for invalid connector_type", async ({ page }) => {
    const badRes = await page.evaluate(async () => {
      const res = await fetch("/api/connectors/writeback/rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Bad Connector Rule",
          domain_type: "pod-match",
          connector_type: "discord",  // not a valid connector type
          action_type: "post_message",
          action_config: { channel_id: "#test" },
        }),
      });
      return { status: res.status, body: await res.json() };
    });

    expect(badRes.status).toBe(400);
    expect(badRes.body).toHaveProperty("error");
    expect(badRes.body.error).toMatch(/connector_type/i);
  });

  test("POST /api/connectors/writeback/rules returns 400 for invalid action_type", async ({ page }) => {
    const badRes = await page.evaluate(async () => {
      const res = await fetch("/api/connectors/writeback/rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Bad Action Rule",
          domain_type: "pod-match",
          connector_type: "slack",
          action_type: "send_dm",  // not a valid action type
          action_config: { user_id: "U123" },
        }),
      });
      return { status: res.status, body: await res.json() };
    });

    expect(badRes.status).toBe(400);
    expect(badRes.body).toHaveProperty("error");
    expect(badRes.body.error).toMatch(/action_type/i);
  });

  // ---------------------------------------------------------------------------
  // GET — retrieve created rule appears in list
  // ---------------------------------------------------------------------------

  test("GET /api/connectors/writeback/rules returns the created Slack rule", async ({ page }) => {
    // Create a fresh rule so this test is self-contained
    const createRes = await page.evaluate(async () => {
      const res = await fetch("/api/connectors/writeback/rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: `E2E List Verify ${Date.now()} - Safe to Delete`,
          domain_type: "delivery-intelligence",
          connector_type: "slack",
          action_type: "post_message",
          action_config: { channel_id: "#deliveries", message_template: "Status: {{health_score}}" },
        }),
      });
      return { status: res.status, body: await res.json() };
    });

    expect(createRes.status).toBe(201);
    const ruleId = createRes.body.rule.id;
    const ruleName = createRes.body.rule.name;

    // Verify it appears in the list
    const listRes = await page.evaluate(async () => {
      const res = await fetch("/api/connectors/writeback/rules");
      return { status: res.status, body: await res.json() };
    });

    expect(listRes.status).toBe(200);
    const found = (listRes.body.rules as any[]).find((r: any) => r.id === ruleId);
    expect(found).toBeDefined();
    expect(found.name).toBe(ruleName);
    expect(found.domain_type).toBe("delivery-intelligence");

    // Cleanup
    await page.evaluate(async (id) => {
      await fetch(`/api/connectors/writeback/rules/${id}`, { method: "DELETE" });
    }, ruleId);
  });

  // ---------------------------------------------------------------------------
  // PATCH — toggle enabled
  // ---------------------------------------------------------------------------

  test("PATCH /api/connectors/writeback/rules/:id toggles enabled to false", async ({ page }) => {
    // Create a rule to patch
    const createRes = await page.evaluate(async () => {
      const res = await fetch("/api/connectors/writeback/rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "E2E PATCH Toggle Test - Safe to Delete",
          domain_type: "scope-creep",
          connector_type: "slack",
          action_type: "post_message",
          action_config: { channel_id: "#alerts" },
          enabled: true,
        }),
      });
      return { status: res.status, body: await res.json() };
    });

    expect(createRes.status).toBe(201);
    expect(createRes.body.rule.enabled).toBe(true);
    const ruleId = createRes.body.rule.id;

    // PATCH to disable
    const patchRes = await page.evaluate(async (id) => {
      const res = await fetch(`/api/connectors/writeback/rules/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: false }),
      });
      return { status: res.status, body: await res.json() };
    }, ruleId);

    expect(patchRes.status).toBe(200);
    expect(patchRes.body).toHaveProperty("rule");
    expect(patchRes.body.rule.enabled).toBe(false);
    expect(patchRes.body.rule.id).toBe(ruleId);

    // Cleanup
    await page.evaluate(async (id) => {
      await fetch(`/api/connectors/writeback/rules/${id}`, { method: "DELETE" });
    }, ruleId);
  });

  test("PATCH /api/connectors/writeback/rules/:id updates name and description", async ({ page }) => {
    const createRes = await page.evaluate(async () => {
      const res = await fetch("/api/connectors/writeback/rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "E2E PATCH Name Test - Safe to Delete",
          domain_type: "early-warning",
          connector_type: "slack",
          action_type: "post_message",
          action_config: { channel_id: "#eng" },
        }),
      });
      return { status: res.status, body: await res.json() };
    });

    expect(createRes.status).toBe(201);
    const ruleId = createRes.body.rule.id;
    const newName = `E2E PATCH Name Updated ${Date.now()} - Safe to Delete`;

    const patchRes = await page.evaluate(async ({ id, name }) => {
      const res = await fetch(`/api/connectors/writeback/rules/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description: "Updated by E2E test" }),
      });
      return { status: res.status, body: await res.json() };
    }, { id: ruleId, name: newName });

    expect(patchRes.status).toBe(200);
    expect(patchRes.body.rule.name).toBe(newName);
    expect(patchRes.body.rule.description).toBe("Updated by E2E test");

    // Cleanup
    await page.evaluate(async (id) => {
      await fetch(`/api/connectors/writeback/rules/${id}`, { method: "DELETE" });
    }, ruleId);
  });

  test("PATCH /api/connectors/writeback/rules/:id returns 400 for empty body", async ({ page }) => {
    const createRes = await page.evaluate(async () => {
      const res = await fetch("/api/connectors/writeback/rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "E2E PATCH Empty Body Test - Safe to Delete",
          domain_type: "pod-match",
          connector_type: "slack",
          action_type: "post_message",
          action_config: { channel_id: "#test" },
        }),
      });
      return { status: res.status, body: await res.json() };
    });

    expect(createRes.status).toBe(201);
    const ruleId = createRes.body.rule.id;

    // PATCH with no updatable fields
    const patchRes = await page.evaluate(async (id) => {
      const res = await fetch(`/api/connectors/writeback/rules/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      return { status: res.status, body: await res.json() };
    }, ruleId);

    expect(patchRes.status).toBe(400);
    expect(patchRes.body).toHaveProperty("error");

    // Cleanup
    await page.evaluate(async (id) => {
      await fetch(`/api/connectors/writeback/rules/${id}`, { method: "DELETE" });
    }, ruleId);
  });

  test("PATCH /api/connectors/writeback/rules/:id returns 404 for non-existent rule", async ({ page }) => {
    const fakeId = "00000000-0000-0000-0000-000000000000";
    const patchRes = await page.evaluate(async (id) => {
      const res = await fetch(`/api/connectors/writeback/rules/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: false }),
      });
      return { status: res.status, body: await res.json() };
    }, fakeId);

    expect(patchRes.status).toBe(404);
    expect(patchRes.body).toHaveProperty("error");
  });

  // ---------------------------------------------------------------------------
  // GET — writeback queue stats
  // ---------------------------------------------------------------------------

  test("GET /api/connectors/writeback/queue returns stats object with pending/completed/failed counts", async ({ page }) => {
    const response = await page.evaluate(async () => {
      const res = await fetch("/api/connectors/writeback/queue");
      return { status: res.status, body: await res.json() };
    });

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty("items");
    expect(response.body).toHaveProperty("stats");
    expect(Array.isArray(response.body.items)).toBe(true);

    const stats = response.body.stats;
    expect(stats).toHaveProperty("pending");
    expect(stats).toHaveProperty("completed");
    expect(stats).toHaveProperty("failed");
    expect(typeof stats.pending).toBe("number");
    expect(typeof stats.completed).toBe("number");
    expect(typeof stats.failed).toBe("number");
  });

  test("GET /api/connectors/writeback/queue?status=pending filters to pending items only", async ({ page }) => {
    const response = await page.evaluate(async () => {
      const res = await fetch("/api/connectors/writeback/queue?status=pending");
      return { status: res.status, body: await res.json() };
    });

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty("items");

    // All returned items must have status: "pending"
    for (const item of response.body.items as any[]) {
      expect(item.status).toBe("pending");
    }
  });

  test("GET /api/connectors/writeback/queue?status=completed filters to completed items only", async ({ page }) => {
    const response = await page.evaluate(async () => {
      const res = await fetch("/api/connectors/writeback/queue?status=completed");
      return { status: res.status, body: await res.json() };
    });

    expect(response.status).toBe(200);
    for (const item of response.body.items as any[]) {
      expect(item.status).toBe("completed");
    }
  });

  test("GET /api/connectors/writeback/queue?limit=5 respects limit parameter", async ({ page }) => {
    const response = await page.evaluate(async () => {
      const res = await fetch("/api/connectors/writeback/queue?limit=5");
      return { status: res.status, body: await res.json() };
    });

    expect(response.status).toBe(200);
    expect(response.body.items.length).toBeLessThanOrEqual(5);
  });

  test("GET /api/connectors/writeback/queue items have expected fields when non-empty", async ({ page }) => {
    const response = await page.evaluate(async () => {
      const res = await fetch("/api/connectors/writeback/queue?limit=10");
      return { status: res.status, body: await res.json() };
    });

    expect(response.status).toBe(200);
    const items = response.body.items as any[];

    // Validate shape of each item when there are items to inspect
    for (const item of items) {
      expect(item).toHaveProperty("id");
      expect(item).toHaveProperty("organization_id");
      expect(item).toHaveProperty("status");
      expect(item).toHaveProperty("connector_type");
      expect(item).toHaveProperty("action_type");
      expect(item).toHaveProperty("created_at");
      expect(["pending", "completed", "failed"]).toContain(item.status);
    }
  });

  // ---------------------------------------------------------------------------
  // DELETE — remove rule
  // ---------------------------------------------------------------------------

  test("DELETE /api/connectors/writeback/rules/:id removes the rule and returns success", async ({ page }) => {
    // Create a rule to delete
    const createRes = await page.evaluate(async () => {
      const res = await fetch("/api/connectors/writeback/rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "E2E DELETE Test - Safe to Delete",
          domain_type: "incident-diagnosis",
          connector_type: "slack",
          action_type: "post_message",
          action_config: { channel_id: "#incidents" },
        }),
      });
      return { status: res.status, body: await res.json() };
    });

    expect(createRes.status).toBe(201);
    const ruleId = createRes.body.rule.id;

    // Delete it
    const deleteRes = await page.evaluate(async (id) => {
      const res = await fetch(`/api/connectors/writeback/rules/${id}`, { method: "DELETE" });
      return { status: res.status, body: await res.json() };
    }, ruleId);

    expect(deleteRes.status).toBe(200);
    expect(deleteRes.body).toHaveProperty("success", true);

    // Verify it no longer appears in the list
    const listRes = await page.evaluate(async () => {
      const res = await fetch("/api/connectors/writeback/rules");
      return { status: res.status, body: await res.json() };
    });

    expect(listRes.status).toBe(200);
    const found = (listRes.body.rules as any[]).find((r: any) => r.id === ruleId);
    expect(found).toBeUndefined();
  });

  test("DELETE /api/connectors/writeback/rules/:id returns 404 for non-existent rule", async ({ page }) => {
    const fakeId = "00000000-0000-0000-0000-000000000001";
    const deleteRes = await page.evaluate(async (id) => {
      const res = await fetch(`/api/connectors/writeback/rules/${id}`, { method: "DELETE" });
      return { status: res.status, body: await res.json() };
    }, fakeId);

    expect(deleteRes.status).toBe(404);
    expect(deleteRes.body).toHaveProperty("error");
  });

  // ---------------------------------------------------------------------------
  // Full CRUD round-trip
  // ---------------------------------------------------------------------------

  test("full CRUD round-trip: create → read → update → delete", async ({ page }) => {
    test.slow();

    // 1. CREATE
    const ruleName = `E2E Round Trip ${Date.now()} - Safe to Delete`;
    const createRes = await page.evaluate(async (name) => {
      const res = await fetch("/api/connectors/writeback/rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          domain_type: "delivery-intelligence",
          connector_type: "jira",
          action_type: "create_ticket",
          action_config: {
            project_key: "OPS",
            summary_template: "Health score drop: {{engagement_name}}",
          },
        }),
      });
      return { status: res.status, body: await res.json() };
    }, ruleName);

    expect(createRes.status).toBe(201);
    const ruleId = createRes.body.rule.id;
    expect(createRes.body.rule.enabled).toBe(true);

    // 2. READ — appears in list
    const listRes = await page.evaluate(async () => {
      const res = await fetch("/api/connectors/writeback/rules");
      return await res.json();
    });
    const found = (listRes.rules as any[]).find((r: any) => r.id === ruleId);
    expect(found).toBeDefined();
    expect(found.name).toBe(ruleName);

    // 3. UPDATE — disable + rename
    const updatedName = `${ruleName} [disabled]`;
    const patchRes = await page.evaluate(async ({ id, name }) => {
      const res = await fetch(`/api/connectors/writeback/rules/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: false, name }),
      });
      return { status: res.status, body: await res.json() };
    }, { id: ruleId, name: updatedName });

    expect(patchRes.status).toBe(200);
    expect(patchRes.body.rule.enabled).toBe(false);
    expect(patchRes.body.rule.name).toBe(updatedName);

    // 4. DELETE
    const deleteRes = await page.evaluate(async (id) => {
      const res = await fetch(`/api/connectors/writeback/rules/${id}`, { method: "DELETE" });
      return { status: res.status, body: await res.json() };
    }, ruleId);

    expect(deleteRes.status).toBe(200);
    expect(deleteRes.body.success).toBe(true);

    // 5. VERIFY GONE
    const finalListRes = await page.evaluate(async () => {
      const res = await fetch("/api/connectors/writeback/rules");
      return await res.json();
    });
    const stillThere = (finalListRes.rules as any[]).find((r: any) => r.id === ruleId);
    expect(stillThere).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Connectors Page UI — Write-back section
// ---------------------------------------------------------------------------

test.describe("Connectors Page UI", () => {
  test("/connectors page loads without redirecting to login", async ({ page }) => {
    await page.goto("/connectors");
    await page.waitForLoadState("domcontentloaded");
    await expect(page).not.toHaveURL(/\/login/);
  });

  test('/connectors page shows "Connectors" heading', async ({ page }) => {
    await page.goto("/connectors");
    await page.waitForLoadState("domcontentloaded");
    await expect(page).not.toHaveURL(/\/login/);

    const heading = page.locator("h1");
    await expect(heading).toContainText("Connectors", { timeout: 15_000 });
  });

  test("/connectors page renders without 500 errors on writeback endpoint", async ({ page }) => {
    let writebackStatus = 0;

    page.on("response", (response) => {
      if (response.url().includes("/api/connectors/writeback")) {
        writebackStatus = response.status();
      }
    });

    await page.goto("/connectors");
    await page.waitForLoadState("domcontentloaded");
    await expect(page).not.toHaveURL(/\/login/);

    // Give the page a moment to fire any async API calls
    await page.waitForTimeout(2000);

    // Any writeback API call should not be a server error
    if (writebackStatus > 0) {
      expect(writebackStatus).toBeLessThan(500);
    }
  });

  test("/connectors page shows connector cards with Install App buttons", async ({ page }) => {
    await page.goto("/connectors");
    await page.waitForLoadState("domcontentloaded");
    await expect(page).not.toHaveURL(/\/login/);

    // At least one connector card with an Install App button should be present
    const installBtn = page.locator("button", { hasText: "Install App" });
    await expect(installBtn.first()).toBeVisible({ timeout: 15_000 });
  });
});

// ---------------------------------------------------------------------------
// Write-back endpoint resilience
// ---------------------------------------------------------------------------

test.describe("Write-back API Resilience", () => {
  test("writeback/rules endpoint returns 401 for unauthenticated requests", async ({ browser }) => {
    const context = await browser.newContext(); // fresh context — no stored auth
    const page = await context.newPage();
    await page.goto("http://localhost:3001");

    const res = await page.evaluate(async () => {
      const r = await fetch("/api/connectors/writeback/rules");
      return { status: r.status };
    });

    expect([401, 403]).toContain(res.status);
    await context.close();
  });

  test("writeback/queue endpoint returns 401 for unauthenticated requests", async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto("http://localhost:3001");

    const res = await page.evaluate(async () => {
      const r = await fetch("/api/connectors/writeback/queue");
      return { status: r.status };
    });

    expect([401, 403]).toContain(res.status);
    await context.close();
  });

  test("writeback/rules POST returns 401 for unauthenticated requests", async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto("http://localhost:3001");

    const res = await page.evaluate(async () => {
      const r = await fetch("/api/connectors/writeback/rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Unauthorized test",
          domain_type: "pod-match",
          connector_type: "slack",
          action_type: "post_message",
          action_config: {},
        }),
      });
      return { status: r.status };
    });

    expect([401, 403]).toContain(res.status);
    await context.close();
  });
});
