/**
 * Tier 3 — Consolidation Engine
 * ==============================
 * Promotes stable, high-quality patterns from Tier 2 signals into the
 * `consolidated_patterns` table. These patterns are injected into system
 * prompts to give the Brain long-term, org-specific intelligence.
 *
 * Consolidation criteria:
 *   - Signals: `signal_strength >= 0.72` AND `signal_type = 'dopamine'` (7-day window)
 *   - Predictions: `confidence >= 0.75` (7-day window)
 *   - Cluster threshold: 3+ events on the same domain → pattern candidate
 *
 * Upsert behaviour:
 *   - Existing pattern → update evidence_count + confidence
 *   - New cluster → insert fresh pattern row
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/lib/logger";
import { getAdminClient } from "@/lib/supabase/admin";
import { getDomainThreshold } from "@/lib/brain/agent-rl";

// ── Types ─────────────────────────────────────────────────────────────────────

interface CrossDomainSignal {
  id: string;
  target_domain: string;
  signal_type: string;
  signal_strength: number | null;
  signal_value: number | null;   // numeric in DB (e.g. 0.3, -0.5)
  payload: Record<string, unknown> | null;
}

interface PredictionRecord {
  id: string;
  domain: string;
  confidence: number;
  // task_description omitted — column does not exist in production schema
}

export interface ConsolidationResult {
  patternsPromoted: number;
  signalsScanned: number;
  durationMs: number;
}

export interface ConsolidatedPatternRow {
  pattern_type: string;
  title: string;
  description: string;
  confidence: number;
}

// ── Threshold check ───────────────────────────────────────────────────────────

/**
 * Returns true when a cross-domain signal is strong enough to contribute to
 * a consolidated pattern.
 *
 * Condition:
 *   signal_strength >= 0.72  — any high-quality RL signal
 *   OR signal_type === 'dopamine'                — positive RL reward
 *   OR signal_type === 'cognitive_layer_execution' — brain activity signals
 *
 * Note: signal_value is a numeric column in the DB (not the string type indicator).
 *       signal_type holds the string label ('dopamine', 'gaba', 'cognitive_layer_execution'…).
 *
 * ADR-026.2: The 0.72 threshold for signals has been superseded by getDomainThreshold()
 * which is applied per-domain in the prediction clustering loop of runConsolidation().
 * This function is retained for compatibility and for signal-type gating only.
 */
export function shouldConsolidate(signal: {
  signal_strength?: number | null;
  signal_type?: string | null;
}): boolean {
  const strength = signal.signal_strength ?? 0;
  return (
    strength >= 0.72 ||
    signal.signal_type === "dopamine" ||
    signal.signal_type === "cognitive_layer_execution"
  );
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function sevenDaysAgo(): string {
  return new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
}

function thirtyDaysAgo(): string {
  return new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/** Group an array by a string key selector. */
function groupBy<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    const bucket = map.get(k);
    if (bucket) {
      bucket.push(item);
    } else {
      map.set(k, [item]);
    }
  }
  return map;
}

// ── Pattern upsert ────────────────────────────────────────────────────────────

interface PatternUpsertParams {
  orgId: string;
  patternType: "domain_expertise" | "routing_pattern";
  domain: string;
  clusterSize: number;
  avgStrength: number;
  signalIds: string[];
}

/**
 * Check whether a consolidated_pattern already exists for this org + domain.
 * If it does, update evidence_count and confidence.
 * If not, insert a new row.
 *
 * Returns true if a row was created (not updated).
 */
async function upsertPattern(
  admin: ReturnType<typeof getAdminClient>,
  params: PatternUpsertParams
): Promise<boolean> {
  const {
    orgId,
    patternType,
    domain,
    clusterSize,
    avgStrength,
    signalIds,
  } = params;

  const titleFragment =
    patternType === "domain_expertise"
      ? `${domain} execution pattern`
      : `${domain} routing pattern`;

  // Check for an existing pattern
  const { data: existing, error: lookupError } = await admin
    .from("consolidated_patterns")
    .select("id, evidence_count, confidence")
    .eq("organization_id", orgId)
    .eq("pattern_type", patternType)
    .ilike("title", `%${domain}%`)
    .maybeSingle();

  if (lookupError) {
    logger.warn("[tier3-consolidation] pattern lookup failed", {
      orgId,
      domain,
      error: lookupError.message,
    });
    return false;
  }

  if (existing) {
    // Merge evidence: grow count, nudge confidence toward new signal
    const newCount: number = (existing.evidence_count as number) + clusterSize;
    const newConfidence = Math.min(
      Math.max(existing.confidence as number, avgStrength * 1.1),
      1.0
    );

    const { error: updateError } = await admin
      .from("consolidated_patterns")
      .update({
        evidence_count: newCount,
        confidence: newConfidence,
        last_updated: new Date().toISOString(),
      })
      .eq("id", existing.id);

    if (updateError) {
      logger.warn("[tier3-consolidation] pattern update failed", {
        id: existing.id,
        error: updateError.message,
      });
    }
    return false;
  }

  // Insert new pattern
  const newConfidence = Math.min(avgStrength * 1.1, 1.0);
  const description =
    patternType === "domain_expertise"
      ? `Consistently high-quality ${domain} executions: ${clusterSize} signals averaging ${avgStrength.toFixed(2)} strength over the past 7 days`
      : `Frequent ${domain} routing: ${clusterSize} predictions averaging ${avgStrength.toFixed(2)} quality over the past 7 days`;

  const { error: insertError } = await admin
    .from("consolidated_patterns")
    .insert({
      organization_id: orgId,
      pattern_type: patternType,
      title: titleFragment,
      description,
      confidence: newConfidence,
      evidence_count: clusterSize,
      source_signal_ids: signalIds,
      is_active: true,             // required — tier-stats filters by is_active=true
    });

  if (insertError) {
    logger.warn("[tier3-consolidation] pattern insert failed", {
      orgId,
      domain,
      error: insertError.message,
    });
    return false;
  }

  return true;
}

// ── Main consolidation run ────────────────────────────────────────────────────

/**
 * Run a full consolidation pass for the given org.
 *
 * Steps:
 *   1. Fetch high-quality cross-domain signals (7-day window)
 *   2. Fetch high-quality prediction records (7-day window)
 *   3. Group signals by target_domain — clusters of 3+ → domain_expertise patterns
 *   4. Group predictions by domain — clusters of 3+ → routing_pattern patterns
 *   5. Upsert each pattern (insert or update evidence/confidence)
 *   6. Log to consolidation_runs
 *
 * Never throws — returns zero stats on error.
 */
export async function runConsolidation(
  orgId: string
): Promise<ConsolidationResult> {
  const startMs = Date.now();
  let patternsPromoted = 0;

  try {
    // Admin client bypasses RLS — cross_domain_signals, prediction_records, and consolidated_patterns
    // have no user-scoped RLS. This runs as a cron job with no active user session.
    const admin = getAdminClient();
    const since = sevenDaysAgo();

    // ── Step 1: High-quality cross-domain signals ────────────────────────────
    const { data: signalRows, error: signalError } = await admin
      .from("cross_domain_signals")
      .select(
        "id, target_domain, signal_type, signal_strength, signal_value, payload"
      )
      .eq("organization_id", orgId)
      // Match shouldConsolidate() OR semantics:
      //   signal_type='dopamine' (positive RL reward, any strength)
      //   OR signal_type='cognitive_layer_execution' (dominant brain activity signal type)
      //   OR signal_strength >= 0.72 (any high-quality signal regardless of type)
      .or("signal_type.eq.dopamine,signal_type.eq.cognitive_layer_execution,signal_strength.gte.0.72")
      .gte("created_at", since)
      // nullsFirst: false → non-null strength values sort first (DESC), nulls go to end.
      // Without this, Postgres puts NULLs first in DESC order, filling the limit with
      // null-strength cognitive_layer_execution signals and pushing dopamine signals out.
      .order("signal_strength", { ascending: false, nullsFirst: false })
      .limit(200);

    if (signalError) {
      logger.warn("[tier3-consolidation] cross_domain_signals fetch failed", {
        orgId,
        error: signalError.message,
      });
    }

    const signals: CrossDomainSignal[] = (signalRows ?? []) as CrossDomainSignal[];


    // ── Step 2: High-quality prediction records ──────────────────────────────
    const { data: predRows, error: predError } = await admin
      .from("prediction_records")
      .select("id, domain, confidence")   // task_description column does not exist in prod schema
      .eq("organization_id", orgId)
      .gte("confidence", 0.50)            // ADR-026.2: lowered from 0.75 — per-domain adaptive filter applied in Step 4
      .gte("created_at", since)
      .limit(50);

    if (predError) {
      logger.warn("[tier3-consolidation] prediction_records fetch failed", {
        orgId,
        error: predError.message,
      });
    }

    const predictions: PredictionRecord[] = (predRows ?? []) as PredictionRecord[];

    const signalsScanned = signals.length + predictions.length;

    // ── Step 3: Cluster signals by domain → domain_expertise patterns ────────
    const signalsByDomain = groupBy<CrossDomainSignal>(
      signals,
      (s) => s.target_domain
    );

    for (const [domain, cluster] of signalsByDomain) {
      if (cluster.length < 3) continue;

      const avgStrength = average(
        cluster.map((s) => s.signal_strength ?? 0.72)
      );
      const signalIds = cluster.map((s) => s.id);

      const created = await upsertPattern(admin, {
        orgId,
        patternType: "domain_expertise",
        domain,
        clusterSize: cluster.length,
        avgStrength,
        signalIds,
      });

      if (created) patternsPromoted += 1;
    }

    // ── Step 4: Cluster predictions by domain → routing_pattern entries ──────
    const predsByDomain = groupBy<PredictionRecord>(
      predictions,
      (p) => p.domain
    );

    for (const [domain, cluster] of predsByDomain) {
      // ADR-026.2: per-domain adaptive threshold (replaces hardcoded 0.75 DB filter)
      let domainThreshold = 0.72; // default fallback
      try {
        domainThreshold = await getDomainThreshold(admin, orgId, domain);
      } catch { /* non-fatal — use fallback */ }
      const filteredCluster = cluster.filter(p => p.confidence >= domainThreshold);
      if (filteredCluster.length < 3) continue;
      const avgQuality = average(filteredCluster.map((p) => p.confidence));
      const filteredIds = filteredCluster.map((p) => p.id);

      const created = await upsertPattern(admin, {
        orgId,
        patternType: "routing_pattern",
        domain,
        clusterSize: filteredCluster.length,
        avgStrength: avgQuality,
        signalIds: filteredIds,
      });

      if (created) patternsPromoted += 1;
    }

    // ── Step 5: Log consolidation run ────────────────────────────────────────
    const durationMs = Date.now() - startMs;

    // consolidation_runs: table exists but schema varies by deployment.
    // The Feb-2025 schema has: id TEXT, organization_id, is_core_brain, started_at,
    // completed_at, total_duration_ms, status, steps, report, errors, created_at.
    // The Mar-2026 migration adds patterns_promoted/signals_scanned but uses
    // CREATE TABLE IF NOT EXISTS — so on existing DBs those columns are absent.
    // Write to the old schema columns + stuff new fields into the report JSONB.
    const { error: runLogError } = await admin
      .from("consolidation_runs")
      .insert({
        id: crypto.randomUUID(),
        organization_id: orgId,
        is_core_brain: false,
        started_at: new Date(startMs).toISOString(),
        completed_at: new Date().toISOString(),
        total_duration_ms: durationMs,
        status: "success",
        steps: [],
        errors: [],
        report: { patternsPromoted, signalsScanned, triggeredBy: "library" },
      });

    if (runLogError) {
      logger.warn("[tier3-consolidation] consolidation_runs insert failed", {
        orgId,
        error: runLogError.message,
      });
    }

    // ── Step 6: Promote high-quality RL patterns into federated_knowledge ────
    // Fire-and-forget: result is logged inside promoteHighQualityPredictions.
    // We await it so the count appears in the run-complete log below, but
    // any error inside is caught by the function itself — never throws here.
    const rlPatternsPromoted = await promoteHighQualityPredictions(orgId);

    logger.warn("[tier3-consolidation] run complete", {
      orgId,
      patternsPromoted,
      rlPatternsPromoted,
      signalsScanned,
      durationMs,
    });

    return { patternsPromoted, signalsScanned, durationMs };
  } catch (err) {
    const durationMs = Date.now() - startMs;
    logger.warn("[tier3-consolidation] runConsolidation threw", {
      orgId,
      error: String(err),
      durationMs,
    });
    return { patternsPromoted, signalsScanned: 0, durationMs };
  }
}

// ── RL quality promotion: prediction_records → federated_knowledge ────────────

/**
 * Promote high-quality RL patterns from `prediction_records` into
 * `federated_knowledge` so the knowledge base benefits from domain-level
 * RL learning over time.
 *
 * Eligibility criteria (30-day window):
 *   - Domain has >= 5 prediction records
 *   - Average quality (confidence) >= 0.70
 *
 * For each qualifying domain an `rl_quality_pattern` row is upserted into
 * `federated_knowledge`. The upsert key is (source_org_id, pattern_key) so
 * repeated consolidation runs refresh the content rather than accumulate rows.
 *
 * Never throws — returns 0 on any error.
 */
export async function promoteHighQualityPredictions(
  orgId: string
): Promise<number> {
  try {
    const admin = getAdminClient();
    const since = thirtyDaysAgo();

    // Fetch all prediction records for this org in the 30-day window.
    // We pull id + domain + confidence only — that is all we need for grouping.
    const { data: rows, error: fetchError } = await admin
      .from("prediction_records")
      .select("domain, confidence")
      .eq("organization_id", orgId)
      .gte("created_at", since)
      .limit(500);

    if (fetchError) {
      logger.warn("[Tier3] promoteHighQualityPredictions fetch failed", {
        orgId,
        error: fetchError.message,
      });
      return 0;
    }

    const records = (rows ?? []) as { domain: string; confidence: number }[];

    if (records.length === 0) return 0;

    // Group by domain, then apply eligibility criteria.
    const byDomain = groupBy(records, (r) => r.domain);

    let promoted = 0;

    for (const [domain, cluster] of byDomain) {
      if (cluster.length < 5) continue;

      const avgQuality = average(cluster.map((r) => r.confidence));
      if (avgQuality < 0.70) continue;

      // Compute a simple trend: compare first-half avg vs second-half avg.
      // Positive = improving, negative = declining.
      const midpoint = Math.floor(cluster.length / 2);
      const firstHalfAvg = average(cluster.slice(0, midpoint).map((r) => r.confidence));
      const secondHalfAvg = average(cluster.slice(midpoint).map((r) => r.confidence));
      const trend = secondHalfAvg - firstHalfAvg;

      const patternKey = `prediction.${domain}.quality`;
      const content = JSON.stringify({
        domain,
        avg_quality: Math.round(avgQuality * 1000) / 1000,
        record_count: cluster.length,
        trend: Math.round(trend * 1000) / 1000,
        window_days: 30,
        promoted_at: new Date().toISOString(),
      });

      // Upsert on (source_org_id, pattern_key) — the pair uniquely identifies
      // this domain quality pattern per org. On conflict we overwrite content
      // and confidence with the latest 30-day view.
      const { error: upsertError } = await admin
        .from("federated_knowledge")
        .upsert(
          {
            source_org_id: orgId,
            pattern_key: patternKey,
            knowledge_type: "rl_quality_pattern",
            content,
            confidence: Math.round(avgQuality * 1000) / 1000,
            source_type: "prediction_records",
            updated_at: new Date().toISOString(),
          },
          { onConflict: "source_org_id,pattern_key" }
        );

      if (upsertError) {
        logger.warn("[Tier3] federated_knowledge upsert failed", {
          orgId,
          domain,
          patternKey,
          error: upsertError.message,
        });
        continue;
      }

      promoted += 1;
    }

    if (promoted > 0) {
      logger.warn("[Tier3] promoteHighQualityPredictions complete", {
        orgId,
        domainsEvaluated: byDomain.size,
        patternsPromoted: promoted,
      });
    }

    return promoted;
  } catch (err) {
    logger.warn("[Tier3] promoteHighQualityPredictions threw", {
      orgId,
      error: String(err),
    });
    return 0;
  }
}

// ── Pattern retrieval (for system prompt injection) ───────────────────────────

/**
 * Return active consolidated patterns for an org, highest confidence first.
 * Accepts a user-scoped Supabase client so it respects RLS without needing
 * the service-role key at call sites that already have a session.
 *
 * Returns an empty array on any error — never throws.
 */
export async function getConsolidatedPatterns(
  orgId: string,
  supabase: SupabaseClient,
  limit = 8
): Promise<ConsolidatedPatternRow[]> {
  try {
    const { data, error } = await supabase
      .from("consolidated_patterns")
      .select("pattern_type, title, description, confidence")
      .eq("organization_id", orgId)
      .eq("is_active", true)
      .order("confidence", { ascending: false })
      .limit(limit);

    if (error) {
      logger.warn("[tier3-consolidation] getConsolidatedPatterns failed", {
        orgId,
        error: error.message,
      });
      return [];
    }

    return (data ?? []).map((row) => ({
      pattern_type: row.pattern_type as string,
      title: row.title as string,
      description: row.description as string,
      confidence: row.confidence as number,
    }));
  } catch (err) {
    logger.warn("[tier3-consolidation] getConsolidatedPatterns threw", {
      orgId,
      error: String(err),
    });
    return [];
  }
}
