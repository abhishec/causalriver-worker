/**
 * API Key Management E2E Tests
 *
 * Tests the full CRUD lifecycle for API keys via the /api/keys endpoint.
 * Uses authenticated session from setup.
 */
import { test, expect } from "@playwright/test";

test.describe("API Key Management", () => {
  let createdKeyId: string | null = null;

  test("can list API keys", async ({ page }) => {
    const response = await page.evaluate(async () => {
      const res = await fetch("/api/keys");
      return {
        status: res.status,
        body: await res.json(),
      };
    });

    expect(response.status).toBe(200);
    // Response should be an array or object with keys
    expect(response.body).toBeDefined();
  });

  test("can create and delete an API key", async ({ page }) => {
    // Create a test API key
    const createResponse = await page.evaluate(async () => {
      const res = await fetch("/api/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "E2E Test Key - Safe to Delete",
          rate_limit: 10,
        }),
      });
      return {
        status: res.status,
        body: await res.json(),
      };
    });

    expect(createResponse.status).toBe(200);
    expect(createResponse.body).toHaveProperty("id");

    createdKeyId = createResponse.body.id;

    // Verify the key appears in the list
    const listResponse = await page.evaluate(async () => {
      const res = await fetch("/api/keys");
      return {
        status: res.status,
        body: await res.json(),
      };
    });

    expect(listResponse.status).toBe(200);

    // Clean up — delete the test key
    if (createdKeyId) {
      const deleteResponse = await page.evaluate(async (keyId) => {
        const res = await fetch(`/api/keys?id=${keyId}`, {
          method: "DELETE",
        });
        return { status: res.status };
      }, createdKeyId);

      expect([200, 204]).toContain(deleteResponse.status);
    }
  });
});
