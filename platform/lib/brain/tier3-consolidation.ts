/**
 * Tier 3 — Consolidation Engine
 * ==============================
 * Promotes stable, high-quality patterns from Tier 2 signals into the
 * `consolidated_patterns` table. These patterns are injected into system
 * prompts to give the Brain long-term, org-specific intelligence.
 *
 * Consolidation criteria:
 *   - Signals: `signal_strength >= 0.72` AND `signal_value = 'dopamine'` (7-day window)
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

// ── Types ─────────────────────────────────────────────────────────────────────

interface CrossDomainSignal {
  id: string;
  target_domain: string;
  signal_type: string;
  signal_strength: number | null;
  signal_value: string | null;
  payload: Record<string, unknown> | null;
}

interface PredictionRecord {
  id: string;
  domain: string;
  confidence: number;
  task_description: string | null;
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
 * Condition: signal_strength >= 0.72 OR signal_value === 'dopamine'
 */
export function shouldConsolidate(signal: {
  signal_strength?: number | null;
  signal_value?: string | null;
}): boolean {
  const strength = signal.signal_strength ?? 0;
  // TODO(Phase 3): make 0.72 adaptive via getDomainThreshold() from agent-rl.ts
  // Currently a global threshold; can be per-domain in a future pass once
  // tier3 consolidation is wired to receive orgId + domain context.
  return strength >= 0.72 || signal.signal_value === "dopamine";
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function sevenDaysAgo(): string {
  return new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
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
      // TODO(Phase 3): 0.72 is a global threshold — can become per-domain via
      // getDomainThreshold() from agent-rl.ts once orgId+domain context is available here.
      .gte("signal_strength", 0.72)
      .in("signal_value", ["dopamine"])
      .gte("created_at", since)
      .order("signal_strength", { ascending: false })
      .limit(50);

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
      .select("id, domain, confidence, task_description")
      .eq("organization_id", orgId)
      .gte("confidence", 0.75)
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
      if (cluster.length < 3) continue;

      const avgQuality = average(cluster.map((p) => p.confidence));
      const predIds = cluster.map((p) => p.id);

      const created = await upsertPattern(admin, {
        orgId,
        patternType: "routing_pattern",
        domain,
        clusterSize: cluster.length,
        avgStrength: avgQuality,
        signalIds: predIds,
      });

      if (created) patternsPromoted += 1;
    }

    // ── Step 5: Log consolidation run ────────────────────────────────────────
    const durationMs = Date.now() - startMs;

    const { error: runLogError } = await admin
      .from("consolidation_runs")
      .insert({
        organization_id: orgId,
        patterns_promoted: patternsPromoted,
        signals_scanned: signalsScanned,
        duration_ms: durationMs,
        triggered_by: "library",
      });

    if (runLogError) {
      logger.warn("[tier3-consolidation] consolidation_runs insert failed", {
        orgId,
        error: runLogError.message,
      });
    }

    logger.warn("[tier3-consolidation] run complete", {
      orgId,
      patternsPromoted,
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
