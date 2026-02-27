/**
 * Agent Quality Score Tests — computeAgentQuality
 * ================================================
 * Verifies the RL quality heuristic used to gate dopamine vs gaba signals.
 * A score >= 0.7 triggers a positive RL signal; < 0.7 triggers negative.
 *
 * This test covers lib/brain/agent-rl.ts#computeAgentQuality.
 */

import { describe, it, expect } from "vitest";
import { computeAgentQuality } from "@/lib/brain/agent-rl";

// ── Error cases ───────────────────────────────────────────────────────────

describe("computeAgentQuality — error cases", () => {
  it("returns 0 when an error is passed", () => {
    const score = computeAgentQuality(
      JSON.stringify({ data: [{ id: 1 }] }),
      new Error("DB timeout"),
      100
    );
    expect(score).toBe(0);
  });

  it("returns 0.3 for empty result string", () => {
    const score = computeAgentQuality("", null, 1000);
    expect(score).toBe(0.3);
  });

  it("returns 0.3 for result under 50 chars", () => {
    const score = computeAgentQuality('{"ok":true}', null, 1000);
    expect(score).toBe(0.3);
  });
});

// ── Empty data array (most common false-positive failure) ─────────────────

describe("computeAgentQuality — empty data array", () => {
  it("heavily penalises empty data array (score < 0.7 = negative RL signal)", () => {
    const emptyResult = JSON.stringify({
      data: [],
      summary: "No results found for query",
      source: "se-aas",
    });
    const score = computeAgentQuality(emptyResult, null, 3000);
    // score should be below RL threshold — empty data is a failure
    expect(score).toBeLessThan(0.7);
  });

  it("penalises 'no data found' text pattern", () => {
    const result = JSON.stringify({
      data: [],
      message: "no data found for the requested period",
    });
    const score = computeAgentQuality(result, null, 2000);
    expect(score).toBeLessThan(0.5);
  });
});

// ── Success cases (should cross the 0.7 dopamine threshold) ──────────────

describe("computeAgentQuality — successful results", () => {
  it("scores >= 0.7 for rich result with 3+ data records and fast execution", () => {
    const result = JSON.stringify({
      data: [
        { id: "eng-1", name: "Alice", velocity_index: 0.85 },
        { id: "eng-2", name: "Bob", velocity_index: 0.72 },
        { id: "eng-3", name: "Carol", velocity_index: 0.90 },
      ],
      summary: "Found 3 engineers with high velocity scores for the current sprint.",
      generated_at: new Date().toISOString(),
    });
    // fast execution (<5s) + 3 records + rich result
    const score = computeAgentQuality(result, null, 1500);
    expect(score).toBeGreaterThanOrEqual(0.7);
  });

  it("pod-match domain gets bonus for top_recommendation field", () => {
    const result = JSON.stringify({
      data: [{ pod_name: "Alpha Pod", confidence: 0.91 }],
      top_recommendation: { pod_name: "Alpha Pod", confidence: 0.91 },
      summary: "Recommended pod based on 15 signals.",
    });
    const withBonus = computeAgentQuality(result, null, 2000, "pod-match");
    const withoutBonus = computeAgentQuality(result, null, 2000);
    expect(withBonus).toBeGreaterThan(withoutBonus);
  });

  it("early-warning domain gets bonus for non-empty alerts array", () => {
    const result = JSON.stringify({
      data: [{ engineer: "Dave", risk: "high" }],
      alerts: [{ type: "flight-risk", engineer: "Dave", severity: "high" }],
      summary: "1 flight risk detected.",
    });
    const withBonus = computeAgentQuality(result, null, 3000, "early-warning");
    const withoutBonus = computeAgentQuality(result, null, 3000);
    expect(withBonus).toBeGreaterThan(withoutBonus);
  });
});

// ── Speed scoring ─────────────────────────────────────────────────────────

describe("computeAgentQuality — execution speed", () => {
  const richResult = JSON.stringify({
    data: [{ id: 1, name: "Alpha" }, { id: 2, name: "Beta" }],
    summary: "Completed with 2 records and all fields populated correctly.",
  });

  it("fast execution (<5s) scores higher than slow execution (>60s)", () => {
    const fastScore = computeAgentQuality(richResult, null, 2000);
    const slowScore = computeAgentQuality(richResult, null, 65000);
    expect(fastScore).toBeGreaterThan(slowScore);
  });

  it("very slow execution (>60s) has a score penalty applied", () => {
    const normalScore = computeAgentQuality(richResult, null, 10000);
    const slowScore = computeAgentQuality(richResult, null, 75000);
    expect(normalScore).toBeGreaterThan(slowScore);
  });
});

// ── Non-JSON result ───────────────────────────────────────────────────────

describe("computeAgentQuality — non-JSON result", () => {
  it("penalises plain text result (SE-aaS should always return JSON)", () => {
    const plainText = "Here are the results for your query: 3 engineers are at risk this sprint. "
      + "Alice shows flight risk indicators. Bob has overallocation. Carol has low velocity. "
      + "Please review the dashboard for full details and recommended actions.";
    const score = computeAgentQuality(plainText, null, 3000);
    // Plain text is penalised vs structured JSON
    const jsonResult = JSON.stringify({
      data: [{ name: "Alice" }, { name: "Bob" }, { name: "Carol" }],
      summary: "3 engineers at risk this sprint. Please review for recommended actions.",
    });
    const jsonScore = computeAgentQuality(jsonResult, null, 3000);
    expect(jsonScore).toBeGreaterThan(score);
  });
});

// ── Score bounds ──────────────────────────────────────────────────────────

describe("computeAgentQuality — score bounds", () => {
  it("never returns a score below 0", () => {
    const worstCase = JSON.stringify({ data: [], error: "critical failure", status: "error" });
    const score = computeAgentQuality(worstCase, null, 90000);
    expect(score).toBeGreaterThanOrEqual(0);
  });

  it("never returns a score above 1", () => {
    const bestCase = JSON.stringify({
      data: Array.from({ length: 10 }, (_, i) => ({ id: i, value: `record_${i}` })),
      top_recommendation: { id: 0 },
      alerts: [{ type: "test" }],
      summary: "All signals nominal. 10 records processed. System operating within expected parameters.",
    });
    const score = computeAgentQuality(bestCase, null, 500, "pod-match");
    expect(score).toBeLessThanOrEqual(1);
  });

  it("recoveryUsed flag reduces score slightly", () => {
    const baseResult = JSON.stringify({
      data: [{ id: 1, name: "Alpha" }, { id: 2, name: "Beta" }],
      summary: "Completed with recovery path. 2 records found via fallback mechanism.",
    });
    const recoveryResult = JSON.stringify({
      data: [{ id: 1, name: "Alpha" }, { id: 2, name: "Beta" }],
      summary: "Completed with recovery path. 2 records found via fallback mechanism.",
      _recoveryUsed: true,
    });
    const normalScore = computeAgentQuality(baseResult, null, 3000);
    const recoveryScore = computeAgentQuality(recoveryResult, null, 3000);
    expect(normalScore).toBeGreaterThan(recoveryScore);
  });
});
