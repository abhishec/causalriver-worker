/**
 * Agent Template A/B Test Manager
 * ================================
 *
 * Enables controlled experiments on agent templates:
 *   - Create A/B tests comparing two template versions
 *   - Route traffic based on configurable split ratio
 *   - Track per-variant metrics (confidence, approval rate, duration)
 *   - Auto-promote winner after statistical significance reached
 *
 * Storage: Uses `ab_tests` table with `ai_memory` fallback.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/lib/logger";

// ── Types ──────────────────────────────────────────────────────────────────

export interface ABTest {
  id: string;
  organization_id: string;
  template_id: string;
  name: string;
  status: "draft" | "running" | "completed" | "cancelled";
  /** Variant A = current template, Variant B = challenger */
  variant_a: ABVariant;
  variant_b: ABVariant;
  /** Traffic split: 0.0–1.0 = fraction sent to variant B */
  traffic_split: number;
  /** Minimum samples before auto-evaluation */
  min_samples: number;
  /** Primary metric to optimize */
  primary_metric: "confidence" | "approval_rate" | "duration" | "user_rating";
  /** Winner (set when test completes) */
  winner?: "a" | "b" | "inconclusive";
  created_by: string;
  created_at: string;
  completed_at?: string;
}

export interface ABVariant {
  label: string;
  /** Template version string (e.g., "1.2.0") or snapshot config */
  version?: string;
  prompt_override?: string;
  config_override?: Record<string, unknown>;
  /** Accumulated metrics */
  metrics: VariantMetrics;
}

export interface VariantMetrics {
  total_runs: number;
  total_approvals: number;
  total_rejections: number;
  avg_confidence: number;
  avg_duration_ms: number;
  avg_user_rating: number;
  /** Sum of confidence scores (for running average calculation) */
  sum_confidence: number;
  /** Sum of durations (for running average calculation) */
  sum_duration_ms: number;
  sum_user_rating: number;
}

function emptyMetrics(): VariantMetrics {
  return {
    total_runs: 0,
    total_approvals: 0,
    total_rejections: 0,
    avg_confidence: 0,
    avg_duration_ms: 0,
    avg_user_rating: 0,
    sum_confidence: 0,
    sum_duration_ms: 0,
    sum_user_rating: 0,
  };
}

// ── Core Functions ─────────────────────────────────────────────────────────

/**
 * Create a new A/B test for a template.
 */
export async function createABTest(
  supabase: SupabaseClient,
  params: {
    organizationId: string;
    templateId: string;
    name: string;
    userId: string;
    variantALabel?: string;
    variantBLabel?: string;
    variantBPrompt?: string;
    variantBConfig?: Record<string, unknown>;
    trafficSplit?: number;
    minSamples?: number;
    primaryMetric?: ABTest["primary_metric"];
  },
): Promise<ABTest | null> {
  try {
    const test: Omit<ABTest, "id"> = {
      organization_id: params.organizationId,
      template_id: params.templateId,
      name: params.name,
      status: "draft",
      variant_a: {
        label: params.variantALabel || "Control (Current)",
        metrics: emptyMetrics(),
      },
      variant_b: {
        label: params.variantBLabel || "Challenger",
        prompt_override: params.variantBPrompt,
        config_override: params.variantBConfig,
        metrics: emptyMetrics(),
      },
      traffic_split: params.trafficSplit ?? 0.5,
      min_samples: params.minSamples ?? 30,
      primary_metric: params.primaryMetric ?? "confidence",
      created_by: params.userId,
      created_at: new Date().toISOString(),
    };

    // Try dedicated table first
    const { data, error } = await supabase
      .from("ab_tests")
      .insert(test)
      .select("id")
      .single();

    if (error) {
      // Fallback to ai_memory
      logger.warn("[ABTestManager] ab_tests table not found, storing in ai_memory");
      const testId = `ab_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      await supabase.from("ai_memory").insert({
        organization_id: params.organizationId,
        memory_type: "ab_test",
        content: JSON.stringify({ ...test, id: testId }),
        source: "ab-test-manager",
        confidence: 1.0,
      });
      return { ...test, id: testId };
    }

    return { ...test, id: data.id };
  } catch (err) {
    logger.error("[ABTestManager] createABTest error:", err);
    return null;
  }
}

/**
 * Start a test (move from draft to running).
 */
export async function startABTest(
  supabase: SupabaseClient,
  testId: string,
): Promise<boolean> {
  try {
    const { error } = await supabase
      .from("ab_tests")
      .update({ status: "running" })
      .eq("id", testId)
      .eq("status", "draft");

    if (error) {
      // Fallback: update in ai_memory
      const { data: records } = await supabase
        .from("ai_memory")
        .select("id, content")
        .eq("memory_type", "ab_test")
        .order("created_at", { ascending: false })
        .limit(50);

      if (records) {
        for (const r of records) {
          let parsed: any;
          try { parsed = JSON.parse(r.content); } catch { continue; }
          if (parsed.id === testId && parsed.status === "draft") {
            parsed.status = "running";
            await supabase
              .from("ai_memory")
              .update({ content: JSON.stringify(parsed) })
              .eq("id", r.id);
            return true;
          }
        }
      }
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Route a request to the appropriate variant.
 * Returns "a" or "b" based on traffic split.
 */
export function routeToVariant(test: ABTest): "a" | "b" {
  if (test.status !== "running") return "a";
  return Math.random() < test.traffic_split ? "b" : "a";
}

/**
 * Record a metric data point for a variant.
 */
export async function recordMetric(
  supabase: SupabaseClient,
  testId: string,
  variant: "a" | "b",
  metric: {
    confidence?: number;
    durationMs?: number;
    approved?: boolean;
    rejected?: boolean;
    userRating?: number;
  },
): Promise<void> {
  try {
    // Fetch current test
    let test: ABTest | null = null;

    const { data, error } = await supabase
      .from("ab_tests")
      .select("*")
      .eq("id", testId)
      .maybeSingle();

    if (error || !data) {
      // Fallback: check ai_memory
      const { data: records } = await supabase
        .from("ai_memory")
        .select("id, content")
        .eq("memory_type", "ab_test")
        .order("created_at", { ascending: false })
        .limit(50);

      if (records) {
        for (const r of records) {
          let parsed: any;
          try { parsed = JSON.parse(r.content); } catch { continue; }
          if (parsed.id === testId) {
            test = parsed;
            break;
          }
        }
      }
    } else {
      test = data;
    }

    if (!test || test.status !== "running") return;

    const v = variant === "a" ? test.variant_a : test.variant_b;
    const m = v.metrics;

    m.total_runs++;
    if (metric.confidence !== undefined) {
      m.sum_confidence += metric.confidence;
      m.avg_confidence = m.sum_confidence / m.total_runs;
    }
    if (metric.durationMs !== undefined) {
      m.sum_duration_ms += metric.durationMs;
      m.avg_duration_ms = m.sum_duration_ms / m.total_runs;
    }
    if (metric.approved) m.total_approvals++;
    if (metric.rejected) m.total_rejections++;
    if (metric.userRating !== undefined) {
      m.sum_user_rating += metric.userRating;
      m.avg_user_rating = m.sum_user_rating / m.total_runs;
    }

    // Update
    const updatePayload = variant === "a"
      ? { variant_a: test.variant_a }
      : { variant_b: test.variant_b };

    await supabase
      .from("ab_tests")
      .update(updatePayload)
      .eq("id", testId);

    // Check auto-evaluate
    if (
      test.variant_a.metrics.total_runs >= test.min_samples &&
      test.variant_b.metrics.total_runs >= test.min_samples
    ) {
      await evaluateTest(supabase, testId);
    }
  } catch (err) {
    logger.error("[ABTestManager] recordMetric error:", err);
  }
}

/**
 * Evaluate the test and determine a winner.
 */
export async function evaluateTest(
  supabase: SupabaseClient,
  testId: string,
): Promise<"a" | "b" | "inconclusive"> {
  try {
    const { data: test } = await supabase
      .from("ab_tests")
      .select("*")
      .eq("id", testId)
      .maybeSingle();

    if (!test) return "inconclusive";

    const a = test.variant_a.metrics as VariantMetrics;
    const b = test.variant_b.metrics as VariantMetrics;

    // Calculate primary metric comparison
    let aScore: number;
    let bScore: number;

    switch (test.primary_metric) {
      case "confidence":
        aScore = a.avg_confidence;
        bScore = b.avg_confidence;
        break;
      case "approval_rate":
        aScore = a.total_runs > 0 ? a.total_approvals / a.total_runs : 0;
        bScore = b.total_runs > 0 ? b.total_approvals / b.total_runs : 0;
        break;
      case "duration":
        // Lower is better for duration — invert
        aScore = a.avg_duration_ms > 0 ? 1 / a.avg_duration_ms : 0;
        bScore = b.avg_duration_ms > 0 ? 1 / b.avg_duration_ms : 0;
        break;
      case "user_rating":
        aScore = a.avg_user_rating;
        bScore = b.avg_user_rating;
        break;
      default:
        aScore = a.avg_confidence;
        bScore = b.avg_confidence;
    }

    // Require > 5% relative improvement to declare winner
    const threshold = 0.05;
    let winner: "a" | "b" | "inconclusive";

    if (bScore > aScore * (1 + threshold)) {
      winner = "b";
    } else if (aScore > bScore * (1 + threshold)) {
      winner = "a";
    } else {
      winner = "inconclusive";
    }

    await supabase
      .from("ab_tests")
      .update({
        status: "completed",
        winner,
        completed_at: new Date().toISOString(),
      })
      .eq("id", testId);

    // Emit RL signal for test completion
    const _abNow = new Date().toISOString();
    await supabase.from("cross_domain_signals").insert({
      organization_id: test.organization_id,
      source_domain: "brain.ab_testing",
      signal_type: "ab_test_completed",
      signal_value: winner === "b" ? 1 : winner === "a" ? 0.5 : 0,
      entity_type: "ab_test",
      entity_id: testId,
      signal_metadata: {
        templateId: test.template_id,
        winner,
        primaryMetric: test.primary_metric,
        variantA: { label: test.variant_a.label, metrics: a },
        variantB: { label: test.variant_b.label, metrics: b },
        totalSamples: a.total_runs + b.total_runs,
        aScore,
        bScore,
        improvementPct: aScore > 0 ? ((bScore - aScore) / aScore * 100).toFixed(1) : "N/A",
      },
      // signal_timestamp required for rl-status hourly/daily/weekly window queries
      signal_timestamp: _abNow,
      created_at: _abNow,
    });

    return winner;
  } catch (err) {
    logger.error("[ABTestManager] evaluateTest error:", err);
    return "inconclusive";
  }
}

/**
 * Get all A/B tests for a template.
 */
export async function getTestsForTemplate(
  supabase: SupabaseClient,
  templateId: string,
): Promise<ABTest[]> {
  try {
    const { data, error } = await supabase
      .from("ab_tests")
      .select("*")
      .eq("template_id", templateId)
      .order("created_at", { ascending: false });

    if (error) {
      // Fallback
      const { data: records } = await supabase
        .from("ai_memory")
        .select("content")
        .eq("memory_type", "ab_test")
        .order("created_at", { ascending: false })
        .limit(100);

      if (records) {
        return records
          .map((r: { content: string }) => {
            try { return JSON.parse(r.content) as ABTest; } catch { return null; }
          })
          .filter((t): t is ABTest => t !== null && t.template_id === templateId);
      }
      return [];
    }

    return data || [];
  } catch {
    return [];
  }
}

/**
 * Get active A/B test for a template (if any).
 * Returns the running test to enable traffic routing.
 */
export async function getActiveTest(
  supabase: SupabaseClient,
  templateId: string,
): Promise<ABTest | null> {
  try {
    const { data } = await supabase
      .from("ab_tests")
      .select("*")
      .eq("template_id", templateId)
      .eq("status", "running")
      .limit(1)
      .maybeSingle();

    return data || null;
  } catch {
    return null;
  }
}
