/**
 * Smoke tests for request correlation ID generation in middleware.
 *
 * The middleware injects X-Request-Id via crypto.randomUUID().
 * We test the UUID format directly (middleware itself runs in edge runtime
 * and cannot be imported as a module in jsdom, so we test the UUID contract).
 *
 * These are pure unit tests — no I/O, no Supabase, no Next.js internals.
 */
import { describe, it, expect } from "vitest";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe("Request correlation ID format (crypto.randomUUID)", () => {
  it("crypto.randomUUID() is available in the test environment", () => {
    expect(typeof crypto.randomUUID).toBe("function");
  });

  it("produces a valid UUID v4 string", () => {
    const id = crypto.randomUUID();
    expect(UUID_REGEX.test(id)).toBe(true);
  });

  it("each call produces a unique ID", () => {
    const ids = new Set(Array.from({ length: 20 }, () => crypto.randomUUID()));
    expect(ids.size).toBe(20);
  });

  it("UUID has the expected dash-separated segment lengths", () => {
    const id = crypto.randomUUID();
    const parts = id.split("-");
    expect(parts).toHaveLength(5);
    expect(parts[0]).toHaveLength(8);
    expect(parts[1]).toHaveLength(4);
    expect(parts[2]).toHaveLength(4);
    expect(parts[3]).toHaveLength(4);
    expect(parts[4]).toHaveLength(12);
  });

  it("UUID version nibble is '4'", () => {
    const id = crypto.randomUUID();
    const versionNibble = id.split("-")[2][0];
    expect(versionNibble).toBe("4");
  });

  it("UUID variant nibble is 8, 9, a, or b", () => {
    const id = crypto.randomUUID();
    const variantNibble = id.split("-")[3][0].toLowerCase();
    expect(["8", "9", "a", "b"]).toContain(variantNibble);
  });
});

describe("X-Request-Id header contract", () => {
  it("a Headers object can hold an X-Request-Id value matching UUID format", () => {
    // Simulate what middleware does: set the header on a NextResponse
    const headers = new Headers();
    const requestId = crypto.randomUUID();
    headers.set("X-Request-Id", requestId);
    expect(headers.get("X-Request-Id")).toBe(requestId);
    expect(UUID_REGEX.test(headers.get("X-Request-Id")!)).toBe(true);
  });

  it("X-Request-Id header name is case-insensitive via Headers API", () => {
    const headers = new Headers();
    const id = crypto.randomUUID();
    headers.set("X-Request-Id", id);
    expect(headers.get("x-request-id")).toBe(id);
    expect(headers.get("X-REQUEST-ID")).toBe(id);
  });
});
