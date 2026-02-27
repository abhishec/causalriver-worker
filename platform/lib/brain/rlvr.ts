/**
 * RLVR — Ground-Truth RL Verification
 * =====================================
 *
 * Closes the confidence calibration loop by comparing predicted quality
 * scores (from prediction_records) against actual outcome signals
 * (from cross_domain_signals) for the same job.
 *
 * Pattern:
 *   1. Fetch prediction_records from last 24h for an org
 *   2. For each prediction, fetch cross_domain_signals for the same entity_id
 *   3. Compute calibration error: |predicted_confidence - actual_outcome_quality|
 *   4. Store calibration stats in ai_memory (domain='rlvr', memory_type='calibration')
 *   5. Return { totalEvaluated, avgCalibrationError, domainsImproved }
 *
 * Run by: POST /api/brain/rlvr (CRON_SECRET auth, wired to daily 3AM cron)
 *
 * All functions are fire-and-forget safe — never throw, only logger.warn.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/lib/logger";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface RLVRResult {
  /** Number of prediction_records evaluated */
  totalEvaluated: number;
  /** Average |predicted_confidence - actual_outcome_quality| across all evaluated records */
  avgCalibrationError: number;
  /** Domains where current calibration error is lower than the prior stored calibration */
  domainsImproved: string[];
  /** Per-domain calibration breakdown */
  byDomain: Array<{
    domain: string;
    sampleCount: number;
    avgCalibrationError: number;
    avgPredictedConfidence: number;
    avgActualQuality: number;
  }>;
  /** ISO timestamp when this run completed */
  ranAt: string;
}

interface PredictionRecord {
  id: string;
  domain: string;
  entity_id: string;
  confidence: number;
  was_correct: boolean | null;
  created_at: string;
}

interface CrossDomainSignal {
  signal_value: number;
  signal_type: string;
  signal_timestamp: string;
}

interface StoredCalibration {
  avgCalibrationError: number;
  ranAt: string;
  byDomain: Array<{ domain: string; avgCalibrationError: number }>;
}

// ── Main Function ─────────────────────────────────────────────────────────────

/**
 * Run RLVR calibration for one organisation.
 *
 * Compares each prediction_record's confidence score against the
 * cross_domain_signals emitted for the same entity_id (job/agent).
 * For signals of type 'dopamine', actual quality = signal_value (0–1).
 * For signals of type 'gaba', actual quality = 1 + signal_value (since gaba
 * values are stored as negative: -(1 - quality)).
 *
 * Stores calibration stats in ai_memory and returns the RLVR summary.
 * Never throws — returns a zeroed-out result on failure.
 */
export async function runRLVR(
  supabase: SupabaseClient,
  orgId: string
): Promise<RLVRResult> {
  const ranAt = new Date().toISOString();
  const empty: RLVRResult = {
    totalEvaluated: 0,
    avgCalibrationError: 0,
    domainsImproved: [],
    byDomain: [],
    ranAt,
  };

  try {
    // ── Step 1: Fetch prediction_records from last 24h ──────────────────
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const { data: predictions, error: predErr } = await supabase
      .from("prediction_records")
      .select("id, domain, entity_id, confidence, was_correct, created_at")
      .eq("organization_id", orgId)
      .eq("prediction_type", "agent_task_outcome")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(500);

    if (predErr) {
      logger.warn("[rlvr] prediction_records fetch failed:", predErr.message);
      return empty;
    }

    if (!predictions || predictions.length === 0) {
      logger.warn(`[rlvr] No predictions to evaluate for org=${orgId.slice(0, 8)}`);
      return empty;
    }

    // ── Step 2: For each prediction, fetch matching cross_domain_signals ─
    // We match by entity_id (job/agent ID) — the same ID is used as entity_id
    // in both prediction_records and cross_domain_signals by recordAgentOutcome().
    const entityIds = [...new Set(
      (predictions as PredictionRecord[]).map(p => p.entity_id).filter(Boolean)
    )];

    const { data: signals } = await supabase
      .from("cross_domain_signals")
      .select("entity_id, signal_value, signal_type, signal_timestamp")
      .eq("organization_id", orgId)
      .in("entity_id", entityIds)
      .in("signal_type", ["dopamine", "gaba"])
      .gte("signal_timestamp", since);

    // Build a map of entity_id → actual outcome quality
    const signalMap = new Map<string, number>();
    for (const sig of (signals ?? []) as Array<CrossDomainSignal & { entity_id: string }>) {
      if (!sig.entity_id) continue;

      let actualQuality: number;
      if (sig.signal_type === "dopamine") {
        // Dopamine: signal_value is 0–1 (the quality score directly)
        actualQuality = Math.max(0, Math.min(1, sig.signal_value));
      } else {
        // Gaba: signal_value is negative: -(1 - quality), so quality = 1 + signal_value
        actualQuality = Math.max(0, Math.min(1, 1 + sig.signal_value));
      }

      // Keep the most recent signal per entity
      if (!signalMap.has(sig.entity_id)) {
        signalMap.set(sig.entity_id, actualQuality);
      }
    }

    // ── Step 3: Compute calibration error per prediction ────────────────
    // Collect per-domain stats
    const domainStats = new Map<string, {
      calibrationErrors: number[];
      predictedValues: number[];
      actualValues: number[];
    }>();

    let totalError = 0;
    let evaluated = 0;

    for (const pred of predictions as PredictionRecord[]) {
      const actual = signalMap.get(pred.entity_id);
      if (actual === undefined) continue; // No matching signal — skip

      const predicted = pred.confidence ?? 0.5;
      const calibrationError = Math.abs(predicted - actual);

      totalError += calibrationError;
      evaluated++;

      const domain = pred.domain ?? "unknown";
      if (!domainStats.has(domain)) {
        domainStats.set(domain, {
          calibrationErrors: [],
          predictedValues: [],
          actualValues: [],
        });
      }
      const ds = domainStats.get(domain)!;
      ds.calibrationErrors.push(calibrationError);
      ds.predictedValues.push(predicted);
      ds.actualValues.push(actual);
    }

    if (evaluated === 0) {
      logger.warn(`[rlvr] No matched prediction+signal pairs for org=${orgId.slice(0, 8)}`);
      return { ...empty, totalEvaluated: predictions.length };
    }

    const avgCalibrationError = Math.round((totalError / evaluated) * 10000) / 10000;

    // Build per-domain breakdown
    const byDomain = Array.from(domainStats.entries()).map(([domain, stats]) => {
      const n = stats.calibrationErrors.length;
      return {
        domain,
        sampleCount: n,
        avgCalibrationError: Math.round(
          (stats.calibrationErrors.reduce((a, b) => a + b, 0) / n) * 10000
        ) / 10000,
        avgPredictedConfidence: Math.round(
          (stats.predictedValues.reduce((a, b) => a + b, 0) / n) * 10000
        ) / 10000,
        avgActualQuality: Math.round(
          (stats.actualValues.reduce((a, b) => a + b, 0) / n) * 10000
        ) / 10000,
      };
    }).sort((a, b) => a.avgCalibrationError - b.avgCalibrationError);

    // ── Step 4: Compare against prior calibration to detect improvements ─
    let domainsImproved: string[] = [];

    try {
      const { data: priorMemory } = await supabase
        .from("ai_memory")
        .select("content")
        .eq("organization_id", orgId)
        .eq("domain", "rlvr")
        .eq("memory_type", "calibration")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (priorMemory?.content) {
        const prior = JSON.parse(priorMemory.content) as StoredCalibration;
        const priorByDomain = new Map<string, number>(
          (prior.byDomain ?? []).map(d => [d.domain, d.avgCalibrationError])
        );

        domainsImproved = byDomain
          .filter(d => {
            const priorErr = priorByDomain.get(d.domain);
            return priorErr !== undefined && d.avgCalibrationError < priorErr;
          })
          .map(d => d.domain);
      }
    } catch {
      // Non-fatal: no prior calibration to compare against
    }

    // ── Step 5: Store calibration stats in ai_memory ──────────────────────
    try {
      const calibrationContent = JSON.stringify({
        avgCalibrationError,
        totalEvaluated: evaluated,
        ranAt,
        byDomain: byDomain.map(d => ({
          domain: d.domain,
          avgCalibrationError: d.avgCalibrationError,
        })),
      });

      // Upsert: delete old calibration entry and insert fresh one
      await supabase
        .from("ai_memory")
        .delete()
        .eq("organization_id", orgId)
        .eq("domain", "rlvr")
        .eq("memory_type", "calibration");

      await supabase.from("ai_memory").insert({
        organization_id: orgId,
        domain: "rlvr",
        memory_type: "calibration",
        content: calibrationContent,
        importance: 0.9,
        metadata: {
          totalEvaluated: evaluated,
          avgCalibrationError,
          domainsImproved,
          ranAt,
        },
      });
    } catch (memErr) {
      logger.warn("[rlvr] ai_memory calibration store failed:", memErr);
      // Non-fatal: return results even if storage failed
    }

    logger.warn(
      `[rlvr] org=${orgId.slice(0, 8)} evaluated=${evaluated} ` +
      `avgCalibrationError=${avgCalibrationError.toFixed(4)} ` +
      `domainsImproved=${domainsImproved.join(",") || "none"}`
    );

    return {
      totalEvaluated: evaluated,
      avgCalibrationError,
      domainsImproved,
      byDomain,
      ranAt,
    };
  } catch (err) {
    logger.warn("[rlvr] runRLVR failed:", err);
    return empty;
  }
}
