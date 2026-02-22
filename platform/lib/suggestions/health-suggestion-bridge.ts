/**
 * Health-to-Suggestion Bridge
 *
 * Converts brain health scoring results into actionable SmartSuggestion[].
 * This bridges the Autonomous Health Monitor (Phase 1) with the copilot UI.
 *
 * Rules engine:
 *   - connectors.score < 30 → "Connect a data source"
 *   - signals.score < 20 → "Trigger a sync"
 *   - predictions.status === "no_predictions" → "Make predictions to learn"
 *   - jobs.status === "failing" → "Check error logs"
 *   - causal_graph.status === "stale" → "Run discovery"
 *   - overall < 50 → "Run full training cycle"
 *
 * Priority: sorted by impact (score gap * dimension weight).
 * Deduplicate: max 3 suggestions at a time.
 * Cooldown: don't re-suggest same type within 4 hours.
 */

import type { SmartSuggestion } from "@/components/copilot/SmartSuggestionCard";

// ── Types ──────────────────────────────────────────────────────────────────

interface HealthDimension {
  score: number;
  status: string;
  details: Record<string, unknown>;
}

interface HealthData {
  status: string;
  overall_score: number;
  dimensions: {
    predictions: HealthDimension;
    causal_graph: HealthDimension;
    signals: HealthDimension;
    connectors: HealthDimension;
    jobs: HealthDimension;
  };
  recommendations: string[];
}

export interface HealthSuggestionAction {
  type: "navigate" | "api_call";
  url: string;
  method?: string;
  body?: Record<string, unknown>;
}

// ── Dimension Weights (for priority sorting) ──────────────────────────────

const DIMENSION_WEIGHTS: Record<string, number> = {
  connectors: 1.2,  // Most impactful — without connectors, nothing works
  signals: 1.0,
  predictions: 0.8,
  causal_graph: 0.7,
  jobs: 0.9,
};

// ── Main Bridge Function ──────────────────────────────────────────────────

/**
 * Generate health-driven suggestions from brain health data.
 * Returns at most 3 suggestions, sorted by impact.
 */
export function generateHealthSuggestions(
  healthData: HealthData,
  recentDismissals?: Map<string, number>, // type → timestamp
): SmartSuggestion[] {
  const suggestions: Array<SmartSuggestion & { priority: number }> = [];
  const { dimensions: dims, overall_score } = healthData;

  // Cooldown: skip recently dismissed types (4 hours)
  const cooldownMs = 4 * 60 * 60 * 1000;
  const now = Date.now();
  const isCoolingDown = (type: string): boolean => {
    if (!recentDismissals) return false;
    const lastDismissed = recentDismissals.get(type);
    return !!lastDismissed && now - lastDismissed < cooldownMs;
  };

  // ── Rule: No connectors ─────────────────────────────────────────────
  if (dims.connectors.score < 30 && !isCoolingDown("health-connectors")) {
    const gap = 100 - dims.connectors.score;
    suggestions.push({
      type: "health-action",
      title: dims.connectors.status === "no_connectors"
        ? "Connect a data source to start"
        : "Connector health is low",
      description: dims.connectors.status === "no_connectors"
        ? "Connect GitHub, Slack, or Jira to start ingesting signals into your Brain."
        : `Connector score: ${dims.connectors.score}/100. Verify credentials and re-authenticate if expired.`,
      actionLabel: dims.connectors.status === "no_connectors" ? "Add Connector" : "Check Connectors",
      healthScore: dims.connectors.score,
      healthDimension: "connectors",
      healthAction: { type: "navigate", url: "/settings?tab=connections" },
      priority: gap * (DIMENSION_WEIGHTS.connectors || 1),
    });
  }

  // ── Rule: Stale or empty signals ────────────────────────────────────
  if (dims.signals.score < 20 && !isCoolingDown("health-signals")) {
    const gap = 100 - dims.signals.score;
    suggestions.push({
      type: "training-needed",
      title: dims.signals.status === "empty"
        ? "No signals yet"
        : "Signals are stale",
      description: dims.signals.status === "empty"
        ? "Your Brain hasn't received any signals. Run a connector sync to populate it with data."
        : `No signals in the last 24h. Score: ${dims.signals.score}/100. Trigger a sync.`,
      actionLabel: "Sync Connectors",
      healthScore: dims.signals.score,
      healthDimension: "signals",
      healthAction: { type: "api_call", url: "/api/connectors/sync-all", method: "POST" },
      priority: gap * (DIMENSION_WEIGHTS.signals || 1),
    });
  }

  // ── Rule: No predictions ────────────────────────────────────────────
  if (dims.predictions.status === "no_predictions" && !isCoolingDown("health-predictions")) {
    suggestions.push({
      type: "prediction-review",
      title: "Brain needs to make predictions",
      description: "Your Brain hasn't made any predictions yet. It needs to predict outcomes to learn and improve.",
      actionLabel: "Run Training",
      healthScore: dims.predictions.score,
      healthDimension: "predictions",
      healthAction: { type: "api_call", url: "/api/brain/cycle", method: "POST", body: { mode: "full" } },
      priority: 80 * (DIMENSION_WEIGHTS.predictions || 1),
    });
  } else if (dims.predictions.status === "low_accuracy" && !isCoolingDown("health-predictions")) {
    suggestions.push({
      type: "prediction-review",
      title: "Prediction accuracy is low",
      description: `Accuracy: ${(dims.predictions.details.accuracy as number) ?? 0}%. Run verification cycles to improve.`,
      actionLabel: "Verify Predictions",
      healthScore: dims.predictions.score,
      healthDimension: "predictions",
      healthAction: { type: "navigate", url: "/predictions" },
      priority: (100 - dims.predictions.score) * (DIMENSION_WEIGHTS.predictions || 1),
    });
  }

  // ── Rule: Stale causal graph ────────────────────────────────────────
  if (dims.causal_graph.status === "stale" && !isCoolingDown("health-causal")) {
    suggestions.push({
      type: "health-action",
      title: "Causal graph is stale",
      description: "The causal graph hasn't been updated in 7+ days. Run causal discovery to refresh it.",
      actionLabel: "Run Discovery",
      healthScore: dims.causal_graph.score,
      healthDimension: "causal_graph",
      healthAction: { type: "api_call", url: "/api/brain/cycle", method: "POST", body: { mode: "sleep" } },
      priority: (100 - dims.causal_graph.score) * (DIMENSION_WEIGHTS.causal_graph || 1),
    });
  }

  // ── Rule: Failing jobs ──────────────────────────────────────────────
  if (dims.jobs.status === "failing" && !isCoolingDown("health-jobs")) {
    const failedCount = (dims.jobs.details.failed as number) ?? 0;
    suggestions.push({
      type: "health-action",
      title: `${failedCount} job${failedCount > 1 ? "s" : ""} failing`,
      description: `Job success rate: ${((dims.jobs.details.success_rate as number) ?? 0) * 100}%. Check error logs and fix failing jobs.`,
      actionLabel: "Check Logs",
      healthScore: dims.jobs.score,
      healthDimension: "jobs",
      healthAction: { type: "navigate", url: "/settings?tab=brain" },
      priority: (100 - dims.jobs.score) * (DIMENSION_WEIGHTS.jobs || 1),
    });
  }

  // ── Rule: Overall degraded ──────────────────────────────────────────
  if (overall_score < 50 && !isCoolingDown("health-overall")) {
    // Only add if we don't have 3+ other suggestions
    if (suggestions.length < 3) {
      suggestions.push({
        type: "health-action",
        title: "Brain health is degraded",
        description: `Overall score: ${overall_score}/100. Run a full training cycle to improve all dimensions.`,
        actionLabel: "Full Training",
        healthScore: overall_score,
        healthDimension: "overall",
        healthAction: { type: "api_call", url: "/api/brain/cycle", method: "POST", body: { mode: "full" } },
        priority: (100 - overall_score) * 1.5,
      });
    }
  }

  // ── Sort by priority (highest first) and cap at 3 ──────────────────
  suggestions.sort((a, b) => b.priority - a.priority);
  return suggestions.slice(0, 3).map(({ priority: _p, ...s }) => s);
}

/**
 * Fetch health data from the API (client-side).
 * Returns null if the request fails.
 */
export async function fetchHealthForSuggestions(organizationId: string): Promise<HealthData | null> {
  try {
    const res = await fetch(`/api/brain/health?learning=true&organizationId=${organizationId}`);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}
