/**
 * Rate Limiter Helper Tests
 * =========================
 * Tests the pure helper functions in lib/rate-limiter.ts:
 * - hashKey: deterministic SHA-256 of an API key (no DB needed)
 * - setRateLimitHeaders: sets standard X-RateLimit-* headers on a Response
 *
 * The async checkRateLimit function requires Supabase + Redis and is tested
 * via integration/e2e tests only.
 */

import { describe, it, expect } from "vitest";
import { hashKey, setRateLimitHeaders } from "../lib/rate-limiter";

// ── hashKey ───────────────────────────────────────────────────────────────

describe("hashKey", () => {
  it("returns a 64-character hex string (SHA-256)", () => {
    const hash = hashKey("brainos_test_key_abc123");
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is deterministic — same key always produces same hash", () => {
    const key = "brainos_api_key_determinism_test";
    expect(hashKey(key)).toBe(hashKey(key));
  });

  it("different keys produce different hashes", () => {
    expect(hashKey("key-alpha")).not.toBe(hashKey("key-beta"));
  });

  it("hashes empty string without throwing", () => {
    const hash = hashKey("");
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("does not expose the raw key in the hash output", () => {
    const rawKey = "super_secret_api_key_12345";
    const hash = hashKey(rawKey);
    expect(hash).not.toContain(rawKey);
    expect(hash).not.toContain("super_secret");
  });
});

// ── setRateLimitHeaders ───────────────────────────────────────────────────

describe("setRateLimitHeaders", () => {
  function makeHeaders(): Headers {
    return new Headers();
  }

  const resetAt = new Date("2026-02-27T10:01:00Z");
  const limit = 30;

  it("sets X-RateLimit-Limit to the configured limit", () => {
    const headers = makeHeaders();
    setRateLimitHeaders(headers, { allowed: true, remaining: 25, resetAt }, limit);
    expect(headers.get("X-RateLimit-Limit")).toBe("30");
  });

  it("sets X-RateLimit-Remaining to remaining count", () => {
    const headers = makeHeaders();
    setRateLimitHeaders(headers, { allowed: true, remaining: 12, resetAt }, limit);
    expect(headers.get("X-RateLimit-Remaining")).toBe("12");
  });

  it("sets X-RateLimit-Reset to Unix epoch seconds", () => {
    const headers = makeHeaders();
    setRateLimitHeaders(headers, { allowed: true, remaining: 5, resetAt }, limit);
    const expectedEpoch = String(Math.floor(resetAt.getTime() / 1000));
    expect(headers.get("X-RateLimit-Reset")).toBe(expectedEpoch);
  });

  it("clamps negative remaining to 0 (never shows negative quota)", () => {
    const headers = makeHeaders();
    // remaining can be -1 from DB rpc when over limit
    setRateLimitHeaders(headers, { allowed: false, remaining: -1, resetAt }, limit);
    expect(headers.get("X-RateLimit-Remaining")).toBe("0");
  });

  it("correctly handles remaining = 0 (last request consumed quota)", () => {
    const headers = makeHeaders();
    setRateLimitHeaders(headers, { allowed: true, remaining: 0, resetAt }, limit);
    expect(headers.get("X-RateLimit-Remaining")).toBe("0");
  });

  it("all three X-RateLimit-* headers are set on each call", () => {
    const headers = makeHeaders();
    setRateLimitHeaders(headers, { allowed: true, remaining: 20, resetAt }, limit);
    expect(headers.get("X-RateLimit-Limit")).not.toBeNull();
    expect(headers.get("X-RateLimit-Remaining")).not.toBeNull();
    expect(headers.get("X-RateLimit-Reset")).not.toBeNull();
  });
});
