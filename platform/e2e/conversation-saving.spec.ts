/**
 * E2E Test: Conversation Saving
 *
 * Test 1 (UI + API): Send a message, wait for AI response, verify saved in DB
 * Test 2 (API CRUD): Full Create/Read/Update/Delete cycle via API routes
 *
 * Both tests verify the complete conversation persistence system.
 */
import { test, expect, type Page } from "@playwright/test";

/** Helper: wait for copilot page to be ready and extract workspace ID */
async function waitForCopilotReady(page: Page): Promise<string> {
  // Wait for the textarea (means workspace is resolved and chat is ready)
  await page.waitForSelector("textarea", { timeout: 30_000 });

  // Give workspace context time to settle
  await page.waitForTimeout(1000);

  // Extract workspace ID from page state
  const wsId = await page.evaluate(async () => {
    // Try performance entries for workspace ID in API calls
    await new Promise(r => setTimeout(r, 1500));
    const entries = performance.getEntriesByType("resource") as PerformanceResourceTiming[];
    for (const entry of entries) {
      const match = entry.name.match(/workspaceId=([a-f0-9-]+)/);
      if (match) return match[1];
      const orgMatch = entry.name.match(/orgId=([a-f0-9-]+)/);
      if (orgMatch) return orgMatch[1];
    }

    // Try /api/workspaces
    try {
      const res = await fetch("/api/workspaces");
      if (res.ok) {
        const data = await res.json();
        const ws = data?.workspaces || data;
        if (Array.isArray(ws) && ws.length > 0) return ws[0].id;
      }
    } catch { /* ignore */ }

    // Try /api/organizations
    try {
      const res = await fetch("/api/organizations");
      if (res.ok) {
        const data = await res.json();
        const orgs = data?.organizations || data;
        if (Array.isArray(orgs) && orgs.length > 0) return orgs[0].id;
      }
    } catch { /* ignore */ }

    return null;
  });

  if (!wsId) throw new Error("Could not determine workspace ID");
  return wsId;
}

test.describe("Conversation Saving", () => {
  test("send message → AI responds → conversation saved in DB", async ({ page }) => {
    // Navigate to copilot
    await page.goto("/copilot");
    const workspaceId = await waitForCopilotReady(page);

    // Unique test message
    const testMsg = `E2E save test ${Date.now()}: What is 2+2?`;

    // ── Step 1: Send a message ─────────────────────────────────────────
    const textarea = page.locator("textarea").first();
    await textarea.fill(testMsg);
    await textarea.press("Enter");

    // ── Step 2: Wait for AI response to COMPLETE ─────────────────────
    // First wait for streaming to start (stop button or disabled textarea)
    await page.waitForTimeout(2000);

    // Wait for streaming to FINISH — textarea becomes enabled again
    // The textarea is disabled={isLoading} during streaming
    await page.waitForFunction(
      () => {
        const ta = document.querySelector("textarea");
        // Streaming done = textarea enabled and no stop button visible
        return ta && !ta.disabled;
      },
      { timeout: 90_000 } // AI response can take up to 90s
    );

    // Wait for auto-save to complete (fires on stream done + API call)
    await page.waitForTimeout(5000);

    // ── Step 3: Verify saved in DB via API ─────────────────────────────
    const conversations = await page.evaluate(async (wsId) => {
      const res = await fetch(`/api/copilot/conversations?workspaceId=${wsId}`);
      if (!res.ok) return [];
      const data = await res.json();
      return data.conversations || data || [];
    }, workspaceId);

    // Find our test conversation (title is auto-generated from first user message)
    const found = (conversations as any[]).find((c: any) =>
      c.title?.includes("E2E save test") || c.title?.includes("2+2")
    );

    expect(found).toBeTruthy();
    expect(found.id).toBeTruthy();

    // ── Step 4: Load and verify messages ───────────────────────────────
    const convData = await page.evaluate(async (id) => {
      const res = await fetch(`/api/copilot/conversations/${id}`);
      if (!res.ok) return null;
      return res.json();
    }, found.id);

    expect(convData).toBeTruthy();
    const messages = (convData as any).conversation.messages;
    expect(messages.length).toBeGreaterThanOrEqual(2);

    // First message should be our user message
    const userMsg = messages.find((m: any) => m.role === "user");
    expect(userMsg).toBeTruthy();
    expect(userMsg.content).toContain("E2E save test");

    // Should have an assistant response
    const assistantMsg = messages.find((m: any) => m.role === "assistant");
    expect(assistantMsg).toBeTruthy();
    expect(assistantMsg.content.length).toBeGreaterThan(0);

    // ── Step 5: Verify conversation can be loaded back ───────────────
    // Load the conversation via API (simulates what clicking sidebar does)
    const reloaded = await page.evaluate(async (id) => {
      const res = await fetch(`/api/copilot/conversations/${id}`);
      if (!res.ok) return null;
      return (await res.json()).conversation;
    }, found.id);

    expect(reloaded).toBeTruthy();
    expect(reloaded.messages.length).toBeGreaterThanOrEqual(2);

    // Verify the messages survived a full round-trip
    const reloadedUser = reloaded.messages.find((m: any) => m.role === "user");
    expect(reloadedUser.content).toContain("E2E save test");
    const reloadedAssistant = reloaded.messages.find((m: any) => m.role === "assistant");
    expect(reloadedAssistant.content.length).toBeGreaterThan(0);

    // ── Cleanup: delete test conversation ──────────────────────────────
    await page.evaluate(async (id) => {
      await fetch(`/api/copilot/conversations/${id}`, { method: "DELETE" });
    }, found.id);
  });

  test("conversation CRUD via API", async ({ page }) => {
    await page.goto("/copilot");
    const workspaceId = await waitForCopilotReady(page);

    const testTitle = `API CRUD Test ${Date.now()}`;

    // ── Create ──────────────────────────────────────────────────────────
    const createRes = await page.evaluate(async (params) => {
      const res = await fetch("/api/copilot/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId: params.wsId,
          title: params.title,
          serviceMode: "general",
          messages: [
            { role: "user", content: "E2E API test message" },
            { role: "assistant", content: "This is a test response." },
          ],
        }),
      });
      const data = await res.json();
      return { ok: res.ok, status: res.status, data };
    }, { wsId: workspaceId, title: testTitle });

    expect(createRes.ok).toBe(true);
    expect(createRes.data).toHaveProperty("id");
    const convId = createRes.data.id;

    // ── Read ────────────────────────────────────────────────────────────
    const readRes = await page.evaluate(async (id) => {
      const res = await fetch(`/api/copilot/conversations/${id}`);
      return { ok: res.ok, data: await res.json() };
    }, convId);

    expect(readRes.ok).toBe(true);
    const conv = readRes.data.conversation;
    expect(conv.messages).toHaveLength(2);
    expect(conv.messages[0]).toEqual({ role: "user", content: "E2E API test message" });
    expect(conv.messages[1]).toEqual({ role: "assistant", content: "This is a test response." });
    expect(conv.service_mode).toBe("general");

    // ── Update ──────────────────────────────────────────────────────────
    const updateRes = await page.evaluate(async (params) => {
      const res = await fetch(`/api/copilot/conversations/${params.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [
            ...params.msgs,
            { role: "user", content: "Follow-up" },
            { role: "assistant", content: "Answer." },
          ],
        }),
      });
      return { ok: res.ok };
    }, { id: convId, msgs: conv.messages });

    expect(updateRes.ok).toBe(true);

    // ── Verify update ───────────────────────────────────────────────────
    const verify = await page.evaluate(async (id) => {
      const res = await fetch(`/api/copilot/conversations/${id}`);
      return (await res.json()).conversation;
    }, convId);

    expect(verify.messages).toHaveLength(4);
    expect(verify.messages[2].content).toBe("Follow-up");

    // ── List ─────────────────────────────────────────────────────────────
    const list = await page.evaluate(async (wsId) => {
      const res = await fetch(`/api/copilot/conversations?workspaceId=${wsId}`);
      return (await res.json()).conversations || [];
    }, workspaceId);

    expect((list as any[]).find((c: any) => c.id === convId)).toBeTruthy();

    // ── Delete ──────────────────────────────────────────────────────────
    const del = await page.evaluate(async (id) => {
      const res = await fetch(`/api/copilot/conversations/${id}`, { method: "DELETE" });
      return { ok: res.ok };
    }, convId);

    expect(del.ok).toBe(true);
  });
});
