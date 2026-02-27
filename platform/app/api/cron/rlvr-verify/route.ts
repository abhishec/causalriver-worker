/**
 * RLVR Verification Cron — 30-60 Day Ground-Truth Window
 * ========================================================
 *
 * GET /api/cron/rlvr-verify
 *
 * Queries prediction_records created 30–60 days ago where was_correct IS NULL.
 * For each unverified prediction, checks actual connector outcomes and updates
 * was_correct with ground truth.
 *
 * Unlike /api/cron/rlvr (which uses rlvr_prediction_outcomes), this route
 * verifies the core prediction_records table — the L4 Causal layer that drives
 * all downstream RL quality scoring.
 *
 * Verification logic per domain:
 *   pod-match          → check engagements.pod_name matches predicted pod_name
 *   early-warning      → check if engineer still active in engineer_health_snapshots
 *   scope-creep        → check if scope_creep_alerts were resolved (status='resolved')
 *   delivery-intelligence → check engagement_health_latest for actual health_score delta
 *
 * RL signals emitted on verification:
 *   Correct prediction  → +0.1 signal to cross_domain_signals (dopamine)
 *   Incorrect prediction → -0.05 signal to cross_domain_signals (gaba)
 *
 * Runs: Weekly on Sunday at 3 AM UTC (see brain-refresh.yml)
 * Auth: Bearer CRON_SECRET
 *
 * Returns: { verified, correct, incorrect, skipped, accuracy, durationMs }
 */

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// ── RL reward magnitudes ────────────────────────────────────────────────────
const CORRECT_SIGNAL   =  0.1;  // dopamine: reward for correct prediction
const INCORRECT_SIGNAL = -0.05; // gaba: small penalty for wrong prediction

// ── How far back to look (30–60 day window) ─────────────────────────────────
const WINDOW_MIN_DAYS = 30;
const WINDOW_MAX_DAYS = 60;

interface PredictionRow {
  id: string;
  organization_id: string;
  domain: string;
  prediction_type: string;
  entity_type: string;
  entity_id: string;
  predicted_outcome: string | null;
  confidence: number;
  created_at: string;
}

interface VerificationResult {
  predictionId: string;
  domain: string;
  wasCorrect: boolean | null;
  actualOutcome: string;
  skipped: boolean;
}

/**
 * Verify a single prediction against real connector data.
 * Returns null if no verification is possible (missing data, unknown domain).
 */
async function verifyPrediction(
  supabase: Awaited<ReturnType<typeof createServiceClient>>,
  prediction: PredictionRow
): Promise<VerificationResult> {
  const result: VerificationResult = {
    predictionId: prediction.id,
    domain: prediction.domain,
    wasCorrect: null,
    actualOutcome: "unknown",
    skipped: false,
  };

  try {
    const domain = prediction.domain;
    const orgId = prediction.organization_id;
    const entityId = prediction.entity_id;

    // ── pod-match: did the engagement end up with the predicted pod? ─────────
    if (domain === "pod-match") {
      const { data: engagement } = await supabase
        .from("engagements")
        .select("pod_name, status")
        .eq("organization_id", orgId)
        .eq("id", entityId)
        .maybeSingle();

      if (!engagement) {
        result.skipped = true;
        result.actualOutcome = "engagement not found";
        return result;
      }

      // Predicted outcome contains the recommended pod name as text
      const predictedPod = (prediction.predicted_outcome ?? "").toLowerCase();
      const actualPod = (engagement.pod_name ?? "").toLowerCase();

      result.wasCorrect = actualPod.length > 0 && predictedPod.includes(actualPod);
      result.actualOutcome = `pod=${engagement.pod_name ?? "unassigned"} status=${engagement.status}`;
      return result;
    }

    // ── early-warning: is the engineer still active? ─────────────────────────
    if (domain === "early-warning") {
      // entity_id is the github_login for engineer predictions
      const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const { data: snapshot } = await supabase
        .from("engineer_health_snapshots")
        .select("flight_risk_score, velocity_index, computed_at")
        .eq("organization_id", orgId)
        .eq("github_login", entityId)
        .gte("computed_at", cutoff)
        .order("computed_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!snapshot) {
        // No recent snapshot means the engineer may have left
        const highRiskPredicted = (prediction.confidence ?? 0) >= 0.5;
        result.wasCorrect = highRiskPredicted; // predicted high risk → engineer gone = correct
        result.actualOutcome = "no recent health snapshot (engineer may have left)";
        return result;
      }

      const actualRisk = (snapshot.flight_risk_score ?? 0);
      const predictedHighRisk = (prediction.confidence ?? 0) >= 0.5;
      const actuallyHighRisk = actualRisk >= 0.5;

      result.wasCorrect = predictedHighRisk === actuallyHighRisk;
      result.actualOutcome = `flight_risk=${actualRisk.toFixed(2)} velocity=${(snapshot.velocity_index ?? 0).toFixed(2)}`;
      return result;
    }

    // ── scope-creep: were the alerts eventually resolved? ────────────────────
    if (domain === "scope-creep") {
      const { data: alert } = await supabase
        .from("scope_creep_alerts")
        .select("status, resolved_at, severity")
        .eq("organization_id", orgId)
        .eq("id", entityId)
        .maybeSingle();

      if (!alert) {
        result.skipped = true;
        result.actualOutcome = "alert not found";
        return result;
      }

      // Prediction was "scope creep will occur/escalate"
      // Correct if: alert is still open or was escalated (not quietly resolved)
      const wasEscalated = alert.status === "escalated" || alert.severity === "critical";
      const wasResolved = alert.status === "resolved" && alert.resolved_at;

      // A high-confidence scope-creep prediction is correct if it escalated
      result.wasCorrect = prediction.confidence >= 0.6 ? wasEscalated : wasResolved;
      result.actualOutcome = `status=${alert.status} severity=${alert.severity}`;
      return result;
    }

    // ── delivery-intelligence: did health score improve as predicted? ─────────
    if (domain === "delivery-intelligence") {
      const { data: healthRow } = await supabase
        .from("engagement_health_latest")
        .select("health_score, computed_at")
        .eq("organization_id", orgId)
        .eq("engagement_id", entityId)
        .maybeSingle();

      if (!healthRow) {
        result.skipped = true;
        result.actualOutcome = "engagement health not found";
        return result;
      }

      // Simple heuristic: if predicted confidence >= 0.6, health should be >= 0.6
      const predictedGood = prediction.confidence >= 0.6;
      const actuallyGood = (healthRow.health_score ?? 0) >= 60;

      result.wasCorrect = predictedGood === actuallyGood;
      result.actualOutcome = `health_score=${healthRow.health_score}`;
      return result;
    }

    // Unknown domain — skip
    result.skipped = true;
    result.actualOutcome = `domain '${domain}' not handled by rlvr-verify`;
    return result;

  } catch (err) {
    logger.warn(`[RLVR-Verify] Verification error for prediction ${prediction.id}:`,
      err instanceof Error ? err.message : String(err));
    result.skipped = true;
    result.actualOutcome = "verification error";
    return result;
  }
}

export async function GET(request: NextRequest) {
  try {
    // ── Auth ─────────────────────────────────────────────────────────────────
    const authHeader = request.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let supabase: Awaited<ReturnType<typeof createServiceClient>>;
    try {
      supabase = await createServiceClient();
    } catch {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const runStart = Date.now();
    const now = new Date();

    // 30–60 day window: predictions made between 60 and 30 days ago
    const windowStart = new Date(now.getTime() - WINDOW_MAX_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const windowEnd   = new Date(now.getTime() - WINDOW_MIN_DAYS * 24 * 60 * 60 * 1000).toISOString();

    // Fetch unverified predictions in the 30–60 day window
    const { data: predictions, error: queryErr } = await supabase
      .from("prediction_records")
      .select("id, organization_id, domain, prediction_type, entity_type, entity_id, predicted_outcome, confidence, created_at")
      .gte("created_at", windowStart)
      .lte("created_at", windowEnd)
      .is("was_correct", null)
      .in("domain", ["pod-match", "early-warning", "scope-creep", "delivery-intelligence"])
      .order("created_at", { ascending: true })
      .limit(500);

    if (queryErr) {
      logger.warn("[RLVR-Verify] Query failed:", queryErr.message);
      return NextResponse.json({ error: "Failed to query prediction_records" }, { status: 500 });
    }

    if (!predictions || predictions.length === 0) {
      logger.warn("[RLVR-Verify] No unverified predictions in 30-60 day window");
      return NextResponse.json({
        success: true,
        message: "No unverified predictions in 30-60 day window",
        verified: 0, correct: 0, incorrect: 0, skipped: 0, accuracy: null,
        windowStart, windowEnd, durationMs: Date.now() - runStart,
      });
    }

    logger.warn(`[RLVR-Verify] Found ${predictions.length} unverified predictions in 30-60d window`);

    let verified = 0;
    let correct = 0;
    let incorrect = 0;
    let skipped = 0;

    for (const prediction of predictions as PredictionRow[]) {
      const verification = await verifyPrediction(supabase, prediction);

      if (verification.skipped) {
        skipped++;
        continue;
      }

      // Update prediction_records with ground truth
      try {
        await supabase
          .from("prediction_records")
          .update({
            was_correct: verification.wasCorrect,
            actual_outcome: verification.actualOutcome,
            verified_at: new Date().toISOString(),
          })
          .eq("id", prediction.id)
          .eq("organization_id", prediction.organization_id);

        verified++;
        if (verification.wasCorrect === true) correct++;
        if (verification.wasCorrect === false) incorrect++;
      } catch (updateErr) {
        logger.warn(`[RLVR-Verify] Failed to update prediction ${prediction.id}:`,
          updateErr instanceof Error ? updateErr.message : String(updateErr));
        skipped++;
        continue;
      }

      // Emit RL signal for verified prediction
      try {
        const isCorrect = verification.wasCorrect === true;
        const signalValue = isCorrect ? CORRECT_SIGNAL : INCORRECT_SIGNAL; // numeric: +0.1 or -0.05
        const signalType = isCorrect ? "dopamine" : "gaba";

        await supabase.from("cross_domain_signals").insert({
          organization_id: prediction.organization_id,
          source_domain: `rlvr.${prediction.domain}`,
          target_domain: prediction.domain,
          signal_type: signalType,
          signal_value: signalValue,
          signal_strength: Math.abs(signalValue),
          entity_type: "prediction",
          entity_id: prediction.id,
          signal_timestamp: new Date().toISOString(),
          signal_metadata: {
            predictionId: prediction.id,
            wasCorrect: verification.wasCorrect,
            actualOutcome: verification.actualOutcome,
            originalConfidence: prediction.confidence,
            verificationWindow: `${WINDOW_MIN_DAYS}-${WINDOW_MAX_DAYS}d`,
            source: "rlvr_verify",
          },
        });
      } catch (signalErr) {
        // Non-fatal — RL signal emission failure must not block verification loop
        logger.warn(`[RLVR-Verify] Failed to emit RL signal for prediction ${prediction.id}:`,
          signalErr instanceof Error ? signalErr.message : String(signalErr));
      }
    }

    const durationMs = Date.now() - runStart;
    const accuracy = verified > 0 ? Math.round((correct / verified) * 100) / 100 : null;

    logger.warn(
      `[RLVR-Verify] Complete: verified=${verified} correct=${correct} ` +
      `incorrect=${incorrect} skipped=${skipped} accuracy=${accuracy !== null ? (accuracy * 100).toFixed(1) + "%" : "n/a"} ` +
      `took=${durationMs}ms`
    );

    // Audit log
    try {
      await supabase.from("scheduled_job_runs").insert({
        organization_id: "system",
        job_name: "cron-rlvr-verify",
        job_type: "rlvr_prediction_records_verification",
        started_at: new Date(Date.now() - durationMs).toISOString(),
        completed_at: new Date().toISOString(),
        status: "success",
        result: JSON.stringify({ verified, correct, incorrect, skipped, accuracy }),
        duration_ms: durationMs,
      });
    } catch { /* non-fatal */ }

    return NextResponse.json({
      success: true,
      verified,
      correct,
      incorrect,
      skipped,
      accuracy,
      windowStart,
      windowEnd,
      windowDays: `${WINDOW_MIN_DAYS}-${WINDOW_MAX_DAYS}`,
      durationMs,
    });

  } catch (error: unknown) {
    logger.error("[RLVR-Verify] Fatal error:", {
      error: (error as Error)?.message ?? String(error),
      route: "/api/cron/rlvr-verify",
    });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
