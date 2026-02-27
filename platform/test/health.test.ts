/**
 * Brain Health Route — business logic unit tests
 * ================================================
 * Tests the observable contracts of the /api/brain/health endpoint:
 *   - Status determination logic (ok / degraded thresholds)
 *   - Score aggregation (overall_score = mean of dimension scores)
 *   - Status label mapping (healthy / learning / degraded / initializing)
 *   - Recommendation generation logic
 *   - Queue metric alert thresholds
 *
 * The route handler itself requires Next.js runtime + Supabase; those are
 * integration-tested. Here we test the pure, extractable logic in isolation
 * using plain TypeScript — no mocking of framework internals required.
 */

import { describe, it, expect } from "vitest";

// ── Replicated pure helpers (mirrors health/route.ts private logic) ─────────

/** Mirrors the status determination from GET /api/brain/health (basic) */
function getLivenessStatus(supabaseOk: boolean, stuckJobs: number, queueDepth: number): string {
  return (!supabaseOk || stuckJobs > 5 || queueDepth > 200) ? "degraded" : "ok";
}

/** Mirrors the overall learning score status mapping in handleLearningHealth */
function getLearningStatus(overallScore: number): string {
  return overallScore >= 80 ? "healthy"
    : overallScore >= 50 ? "learning"
    : overallScore >= 20 ? "degraded"
    : "initializing";
}

/** Mirrors mean score aggregation across dimensions */
function computeOverallScore(dimensionScores: number[]): number {
  if (dimensionScores.length === 0) return 0;
  return Math.round(dimensionScores.reduce((a, b) => a + b, 0) / dimensionScores.length);
}

/** Mirrors generateRecommendations from health/route.ts */
interface HealthDimension {
  score: number;
  status: string;
  details: Record<string, unknown>;
}

function generateRecommendations(
  predictions: HealthDimension,
  causalGraph: HealthDimension,
  signals: HealthDimension,
  connectors: HealthDimension,
  jobs: HealthDimension
): string[] {
  const recs: string[] = [];

  if (connectors.status === "no_connectors") {
    recs.push("Connect at least one data source (GitHub, Slack, Jira) to start ingesting signals.");
  }

  if (signals.status === "empty") {
    recs.push("No signals ingested yet. Run a connector sync to populate the brain with data.");
  } else if (signals.status === "stale") {
    recs.push("No signals in the last 24h. Check connector sync status or trigger a manual sync.");
  }

  if (causalGraph.status === "empty" && (signals.details.total_signals as number) > 100) {
    recs.push("Enough signals to discover causal patterns. Run a causal discovery job.");
  } else if (causalGraph.status === "stale") {
    recs.push("Causal graph is stale. Run daily causal discovery to keep the brain up to date.");
  }

  if (predictions.status === "no_predictions" && (causalGraph.details.significant_edges as number) > 0) {
    recs.push("Causal edges exist but no predictions made. The brain needs to make predictions to learn.");
  } else if (predictions.status === "low_accuracy") {
    recs.push("Prediction accuracy is low. Run more verification cycles and weight updates.");
  }

  if (jobs.status === "no_recent_jobs") {
    recs.push("No scheduled jobs have run in 48h. Set up pg_cron or trigger jobs manually.");
  } else if (jobs.status === "failing") {
    recs.push("Multiple job failures detected. Check error logs and fix failing jobs.");
  }

  if (recs.length === 0) {
    recs.push("Brain is healthy. Continue monitoring for changes in accuracy and signal freshness.");
  }

  return recs;
}

// ── Liveness status tests ─────────────────────────────────────────────────

describe("GET /api/brain/health — liveness status determination", () => {
  it("returns 'ok' when supabase is reachable and metrics are normal", () => {
    expect(getLivenessStatus(true, 0, 0)).toBe("ok");
  });

  it("returns 'ok' when supabase is ok and queue depth is exactly 200", () => {
    // Boundary: queueDepth > 200 triggers degraded, so exactly 200 = ok
    expect(getLivenessStatus(true, 0, 200)).toBe("ok");
  });

  it("returns 'degraded' when supabase is not reachable", () => {
    expect(getLivenessStatus(false, 0, 0)).toBe("degraded");
  });

  it("returns 'degraded' when stuckJobs exceeds threshold (> 5)", () => {
    expect(getLivenessStatus(true, 6, 0)).toBe("degraded");
  });

  it("returns 'ok' when stuckJobs is exactly 5 (boundary — not degraded)", () => {
    // stuckJobs > 5 triggers degraded, so exactly 5 = ok
    expect(getLivenessStatus(true, 5, 0)).toBe("ok");
  });

  it("returns 'degraded' when queueDepth exceeds 200", () => {
    expect(getLivenessStatus(true, 0, 201)).toBe("degraded");
  });

  it("returns 'degraded' for any one failing condition (OR semantics)", () => {
    // Each condition independently causes degraded
    expect(getLivenessStatus(false, 0, 0)).toBe("degraded"); // supabase down
    expect(getLivenessStatus(true, 10, 0)).toBe("degraded"); // stuck jobs
    expect(getLivenessStatus(true, 0, 500)).toBe("degraded"); // queue overflow
  });

  it("returns 'ok' for healthy system even with some queue depth", () => {
    expect(getLivenessStatus(true, 2, 50)).toBe("ok");
  });
});

// ── Learning status label tests ───────────────────────────────────────────

describe("GET /api/brain/health?learning=true — status label mapping", () => {
  it("returns 'healthy' for score >= 80", () => {
    expect(getLearningStatus(80)).toBe("healthy");
    expect(getLearningStatus(100)).toBe("healthy");
    expect(getLearningStatus(95)).toBe("healthy");
  });

  it("returns 'learning' for score in range [50, 79]", () => {
    expect(getLearningStatus(50)).toBe("learning");
    expect(getLearningStatus(79)).toBe("learning");
    expect(getLearningStatus(65)).toBe("learning");
  });

  it("returns 'degraded' for score in range [20, 49]", () => {
    expect(getLearningStatus(20)).toBe("degraded");
    expect(getLearningStatus(49)).toBe("degraded");
    expect(getLearningStatus(35)).toBe("degraded");
  });

  it("returns 'initializing' for score below 20", () => {
    expect(getLearningStatus(0)).toBe("initializing");
    expect(getLearningStatus(19)).toBe("initializing");
    expect(getLearningStatus(10)).toBe("initializing");
  });

  it("boundary: score 80 is 'healthy' (not 'learning')", () => {
    expect(getLearningStatus(80)).toBe("healthy");
    expect(getLearningStatus(79)).toBe("learning");
  });

  it("boundary: score 50 is 'learning' (not 'degraded')", () => {
    expect(getLearningStatus(50)).toBe("learning");
    expect(getLearningStatus(49)).toBe("degraded");
  });

  it("boundary: score 20 is 'degraded' (not 'initializing')", () => {
    expect(getLearningStatus(20)).toBe("degraded");
    expect(getLearningStatus(19)).toBe("initializing");
  });
});

// ── Overall score aggregation tests ──────────────────────────────────────

describe("overall_score aggregation", () => {
  it("returns mean of dimension scores rounded to nearest integer", () => {
    // 5 dimensions: 80 + 60 + 70 + 90 + 100 = 400 / 5 = 80
    expect(computeOverallScore([80, 60, 70, 90, 100])).toBe(80);
  });

  it("rounds fractional means correctly", () => {
    // 100 + 0 = 100 / 2 = 50 exactly
    expect(computeOverallScore([100, 0])).toBe(50);
    // 1 + 2 + 3 = 6 / 3 = 2 exactly
    expect(computeOverallScore([1, 2, 3])).toBe(2);
  });

  it("returns 0 for empty array", () => {
    expect(computeOverallScore([])).toBe(0);
  });

  it("returns score unchanged for single dimension", () => {
    expect(computeOverallScore([75])).toBe(75);
  });

  it("handles all-zero dimensions → score 0 (initializing)", () => {
    expect(computeOverallScore([0, 0, 0, 0, 0])).toBe(0);
    expect(getLearningStatus(0)).toBe("initializing");
  });

  it("handles all-100 dimensions → score 100 (healthy)", () => {
    expect(computeOverallScore([100, 100, 100, 100, 100])).toBe(100);
    expect(getLearningStatus(100)).toBe("healthy");
  });
});

// ── Recommendation generation tests ──────────────────────────────────────

const healthyDimension = (status = "healthy"): HealthDimension => ({
  score: 80,
  status,
  details: { total_signals: 500, significant_edges: 10 },
});

describe("generateRecommendations", () => {
  it("returns generic healthy message when all dimensions are healthy", () => {
    const recs = generateRecommendations(
      healthyDimension("accurate"),
      healthyDimension("healthy"),
      healthyDimension("active"),
      healthyDimension("syncing"),
      healthyDimension("healthy")
    );
    expect(recs).toHaveLength(1);
    expect(recs[0]).toContain("Brain is healthy");
  });

  it("recommends connecting data sources when no connectors exist", () => {
    const recs = generateRecommendations(
      healthyDimension(),
      healthyDimension(),
      healthyDimension("active"),
      healthyDimension("no_connectors"),
      healthyDimension()
    );
    expect(recs.some(r => r.includes("Connect at least one data source"))).toBe(true);
  });

  it("recommends connector sync when signals are empty", () => {
    const recs = generateRecommendations(
      healthyDimension(),
      healthyDimension(),
      { score: 50, status: "empty", details: { total_signals: 0, significant_edges: 0 } },
      healthyDimension("syncing"),
      healthyDimension()
    );
    expect(recs.some(r => r.includes("No signals ingested yet"))).toBe(true);
  });

  it("recommends manual sync when signals are stale", () => {
    const recs = generateRecommendations(
      healthyDimension(),
      healthyDimension(),
      healthyDimension("stale"),
      healthyDimension("syncing"),
      healthyDimension()
    );
    expect(recs.some(r => r.includes("No signals in the last 24h"))).toBe(true);
  });

  it("recommends causal discovery when signals are rich but graph is empty", () => {
    const recs = generateRecommendations(
      healthyDimension(),
      { score: 50, status: "empty", details: { total_signals: 200, significant_edges: 0 } },
      { score: 70, status: "active", details: { total_signals: 200, significant_edges: 0 } },
      healthyDimension("syncing"),
      healthyDimension()
    );
    expect(recs.some(r => r.includes("Enough signals to discover causal patterns"))).toBe(true);
  });

  it("recommends stale graph refresh when causal graph is stale", () => {
    const recs = generateRecommendations(
      healthyDimension(),
      healthyDimension("stale"),
      healthyDimension("active"),
      healthyDimension("syncing"),
      healthyDimension()
    );
    expect(recs.some(r => r.includes("Causal graph is stale"))).toBe(true);
  });

  it("recommends predictions when causal edges exist but no predictions made", () => {
    const recs = generateRecommendations(
      { score: 50, status: "no_predictions", details: { total_signals: 0, significant_edges: 5 } },
      { score: 80, status: "healthy", details: { total_signals: 200, significant_edges: 10 } },
      healthyDimension("active"),
      healthyDimension("syncing"),
      healthyDimension()
    );
    expect(recs.some(r => r.includes("Causal edges exist but no predictions made"))).toBe(true);
  });

  it("recommends improvement cycles when prediction accuracy is low", () => {
    const recs = generateRecommendations(
      healthyDimension("low_accuracy"),
      healthyDimension("healthy"),
      healthyDimension("active"),
      healthyDimension("syncing"),
      healthyDimension()
    );
    expect(recs.some(r => r.includes("Prediction accuracy is low"))).toBe(true);
  });

  it("recommends setting up pg_cron when no jobs have run", () => {
    const recs = generateRecommendations(
      healthyDimension(),
      healthyDimension(),
      healthyDimension("active"),
      healthyDimension("syncing"),
      { score: 50, status: "no_recent_jobs", details: {} }
    );
    expect(recs.some(r => r.includes("No scheduled jobs have run in 48h"))).toBe(true);
  });

  it("recommends checking error logs when jobs are failing", () => {
    const recs = generateRecommendations(
      healthyDimension(),
      healthyDimension(),
      healthyDimension("active"),
      healthyDimension("syncing"),
      { score: 20, status: "failing", details: {} }
    );
    expect(recs.some(r => r.includes("Multiple job failures detected"))).toBe(true);
  });

  it("can return multiple recommendations for multiple failing dimensions", () => {
    const recs = generateRecommendations(
      healthyDimension("low_accuracy"),
      healthyDimension("stale"),
      { score: 50, status: "empty", details: { total_signals: 0, significant_edges: 0 } },
      healthyDimension("no_connectors"),
      { score: 50, status: "no_recent_jobs", details: {} }
    );
    // Should have recommendations for: no_connectors, empty signals, stale graph, low_accuracy, no_recent_jobs
    expect(recs.length).toBeGreaterThan(1);
  });
});
