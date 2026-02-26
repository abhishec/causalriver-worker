/**
 * Core Utility Function Tests
 * ===========================
 * Tests pure formatting utilities in lib/utils.ts:
 * - formatUSD: cost display for AI token usage
 * - formatTokens: token count display in copilot context monitor
 * - formatNumber: generic large number formatting
 * - timeAgo: relative timestamp display
 *
 * All functions are pure (no I/O, no DB) — no mocking required.
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { formatUSD, formatTokens, formatNumber, timeAgo } from "../lib/utils";

// ── formatUSD ─────────────────────────────────────────────────────────────

describe("formatUSD", () => {
  it("formats amounts >= $1 with 2 decimal places", () => {
    expect(formatUSD(5.5)).toBe("$5.50");
    expect(formatUSD(100)).toBe("$100.00");
    expect(formatUSD(1234.56)).toBe("$1234.56");
  });

  it("formats amounts in cents (0.01–0.99) with 4 decimal places", () => {
    expect(formatUSD(0.5)).toBe("$0.5000");
    expect(formatUSD(0.01)).toBe("$0.0100");
    expect(formatUSD(0.99)).toBe("$0.9900");
  });

  it("formats sub-cent amounts (< 0.01) with 6 decimal places", () => {
    expect(formatUSD(0.000123)).toBe("$0.000123");
    expect(formatUSD(0.000001)).toBe("$0.000001");
    // Exactly 0.01 should use the 4dp path, not 6dp
    expect(formatUSD(0.009)).toBe("$0.009000");
  });

  it("formats zero correctly", () => {
    expect(formatUSD(0)).toBe("$0.000000");
  });

  it("always prefixes with $", () => {
    [0, 0.001, 0.5, 5, 1000].forEach((amount) => {
      expect(formatUSD(amount)).toMatch(/^\$/);
    });
  });
});

// ── formatTokens ──────────────────────────────────────────────────────────

describe("formatTokens", () => {
  it("formats millions with M suffix", () => {
    expect(formatTokens(1_000_000)).toBe("1.0M");
    expect(formatTokens(2_500_000)).toBe("2.5M");
    expect(formatTokens(10_000_000)).toBe("10.0M");
  });

  it("formats thousands with K suffix", () => {
    expect(formatTokens(1_000)).toBe("1.0K");
    expect(formatTokens(8_192)).toBe("8.2K");
    expect(formatTokens(128_000)).toBe("128.0K");
  });

  it("formats small counts as plain integers", () => {
    expect(formatTokens(0)).toBe("0");
    expect(formatTokens(100)).toBe("100");
    expect(formatTokens(999)).toBe("999");
  });

  it("uses 1 decimal place for K and M", () => {
    // 1500 → "1.5K" not "1.50K"
    expect(formatTokens(1500)).toBe("1.5K");
    expect(formatTokens(1_500_000)).toBe("1.5M");
  });

  it("M takes precedence over K for >= 1M", () => {
    // 1M is exactly the boundary — should be "M", not "1000.0K"
    expect(formatTokens(1_000_000)).toContain("M");
    expect(formatTokens(1_000_000)).not.toContain("K");
  });
});

// ── formatNumber ──────────────────────────────────────────────────────────

describe("formatNumber", () => {
  it("formats millions with M suffix", () => {
    expect(formatNumber(1_000_000)).toBe("1.0M");
    expect(formatNumber(5_500_000)).toBe("5.5M");
  });

  it("formats thousands with K suffix", () => {
    expect(formatNumber(1_000)).toBe("1.0K");
    expect(formatNumber(42_000)).toBe("42.0K");
  });

  it("formats small numbers using locale string", () => {
    // Small numbers go through toLocaleString
    const result = formatNumber(999);
    expect(result).toBe("999");
  });

  it("formats zero", () => {
    expect(formatNumber(0)).toBe("0");
  });
});

// ── timeAgo ───────────────────────────────────────────────────────────────

describe("timeAgo", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns 'just now' for timestamps under 1 minute old", () => {
    vi.useFakeTimers();
    const now = new Date("2026-02-27T10:00:00Z");
    vi.setSystemTime(now);

    const thirtySecondsAgo = new Date(now.getTime() - 30_000);
    expect(timeAgo(thirtySecondsAgo)).toBe("just now");
  });

  it("returns minutes ago for timestamps 1–59 minutes old", () => {
    vi.useFakeTimers();
    const now = new Date("2026-02-27T10:00:00Z");
    vi.setSystemTime(now);

    const fiveMinutesAgo = new Date(now.getTime() - 5 * 60_000);
    expect(timeAgo(fiveMinutesAgo)).toBe("5m ago");

    const fiftyNineMinutesAgo = new Date(now.getTime() - 59 * 60_000);
    expect(timeAgo(fiftyNineMinutesAgo)).toBe("59m ago");
  });

  it("returns hours ago for timestamps 1–23 hours old", () => {
    vi.useFakeTimers();
    const now = new Date("2026-02-27T10:00:00Z");
    vi.setSystemTime(now);

    const twoHoursAgo = new Date(now.getTime() - 2 * 3600_000);
    expect(timeAgo(twoHoursAgo)).toBe("2h ago");
  });

  it("returns days ago for timestamps 1–29 days old", () => {
    vi.useFakeTimers();
    const now = new Date("2026-02-27T10:00:00Z");
    vi.setSystemTime(now);

    const threeDaysAgo = new Date(now.getTime() - 3 * 86400_000);
    expect(timeAgo(threeDaysAgo)).toBe("3d ago");
  });

  it("returns locale date string for timestamps >= 30 days old", () => {
    vi.useFakeTimers();
    const now = new Date("2026-02-27T10:00:00Z");
    vi.setSystemTime(now);

    const sixtyDaysAgo = new Date(now.getTime() - 60 * 86400_000);
    const result = timeAgo(sixtyDaysAgo);
    // Should NOT be "just now", "m ago", "h ago", or "d ago"
    expect(result).not.toMatch(/ago$/);
    expect(result.length).toBeGreaterThan(0);
  });

  it("accepts a date string as well as a Date object", () => {
    vi.useFakeTimers();
    const now = new Date("2026-02-27T10:00:00Z");
    vi.setSystemTime(now);

    const fiveMinutesAgo = new Date(now.getTime() - 5 * 60_000);
    // Both string and Date forms should return the same result
    expect(timeAgo(fiveMinutesAgo.toISOString())).toBe(timeAgo(fiveMinutesAgo));
  });
});
