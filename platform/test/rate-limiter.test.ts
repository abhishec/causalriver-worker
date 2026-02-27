/**
 * Rate Limiter Helper Tests
 * =========================
 * Tests both the pure helpers and the async checkRateLimit function (mocked).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock Supabase server client and Redis before importing rate-limiter
vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: vi.fn(),
}));
vi.mock("@/lib/redis", () => ({
  checkRateLimit: vi.fn(),
}));
vi.mock("@/lib/logger", () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

import { hashKey, setRateLimitHeaders, checkRateLimit } from "@/lib/rate-limiter";
import { createServiceClient } from "@/lib/supabase/server";
import { checkRateLimit as redisCheckRateLimit } from "@/lib/redis";

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

// ── checkRateLimit (mocked Supabase + Redis) ──────────────────────────────

describe("checkRateLimit — Supabase primary path", () => {
  function makeMockRpc(data: number | null, error: null | { message: string }) {
    return vi.fn().mockResolvedValue({ data, error });
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns allowed=true when Supabase RPC returns positive remaining", async () => {
    const mockRpc = makeMockRpc(15, null);
    vi.mocked(createServiceClient).mockResolvedValue({ rpc: mockRpc } as never);

    const result = await checkRateLimit("abc123hash", 30);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(15);
    expect(result.resetAt).toBeInstanceOf(Date);
  });

  it("returns allowed=false when Supabase RPC returns negative remaining (rate limited)", async () => {
    const mockRpc = makeMockRpc(-1, null);
    vi.mocked(createServiceClient).mockResolvedValue({ rpc: mockRpc } as never);

    const result = await checkRateLimit("abc123hash", 30);
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
    expect(result.error).toMatch(/Rate limit exceeded/);
  });

  it("returns allowed=true when RPC returns 0 remaining (exactly at limit)", async () => {
    const mockRpc = makeMockRpc(0, null);
    vi.mocked(createServiceClient).mockResolvedValue({ rpc: mockRpc } as never);

    const result = await checkRateLimit("abc123hash", 30);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(0);
  });

  it("falls back to Redis when Supabase RPC returns error", async () => {
    const mockRpc = vi.fn().mockResolvedValue({ data: null, error: { message: "DB error" } });
    vi.mocked(createServiceClient).mockResolvedValue({ rpc: mockRpc } as never);
    vi.mocked(redisCheckRateLimit).mockResolvedValue({ allowed: true, remaining: 10 } as never);

    const result = await checkRateLimit("abc123hash", 30);
    expect(result.allowed).toBe(true);
    expect(vi.mocked(redisCheckRateLimit)).toHaveBeenCalled();
  });

  it("falls back to Redis when Supabase throws", async () => {
    vi.mocked(createServiceClient).mockRejectedValue(new Error("Connection refused"));
    vi.mocked(redisCheckRateLimit).mockResolvedValue({ allowed: false, remaining: 0 } as never);

    const result = await checkRateLimit("abc123hash", 30);
    expect(result.allowed).toBe(false);
    expect(vi.mocked(redisCheckRateLimit)).toHaveBeenCalled();
  });
});

describe("checkRateLimit — Redis fallback path", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Make Supabase fail so Redis fallback is always triggered
    vi.mocked(createServiceClient).mockRejectedValue(new Error("Supabase down"));
  });

  it("Redis allowed → returns allowed=true with Redis remaining", async () => {
    vi.mocked(redisCheckRateLimit).mockResolvedValue({ allowed: true, remaining: 7 } as never);
    const result = await checkRateLimit("hash123", 20);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(7);
  });

  it("Redis denied → returns allowed=false", async () => {
    vi.mocked(redisCheckRateLimit).mockResolvedValue({ allowed: false, remaining: 0 } as never);
    const result = await checkRateLimit("hash123", 20);
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
    expect(result.error).toMatch(/Rate limit exceeded.*fallback/);
  });

  it("Redis throws → fail open (allowed=true with conservative limit)", async () => {
    vi.mocked(redisCheckRateLimit).mockRejectedValue(new Error("Redis down"));
    const result = await checkRateLimit("hash123", 20);
    // Conservative limit = Math.max(floor(20 * 0.5), 5) = 10
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(10);
  });

  it("conservative Redis limit = max(floor(limit * 0.5), 5)", async () => {
    // For limit=6: floor(6*0.5)=3, max(3,5)=5
    vi.mocked(redisCheckRateLimit).mockRejectedValue(new Error("Redis down"));
    const result = await checkRateLimit("hash123", 6);
    expect(result.remaining).toBe(5); // max(3, 5) = 5
  });
});
