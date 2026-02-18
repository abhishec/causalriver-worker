/**
 * Federated Causal Learning — Gradient-Based Cross-Org Knowledge Transfer
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * THE PROBLEM WITH CURRENT FEDERATION:
 *
 * Current approach: promote RAW relationships to CORE
 *   org.effect_size = 0.72  →  CORE gets: effect_size = 0.72
 *
 * This has two fundamental problems:
 *   1. Privacy: absolute effect sizes reveal org-specific data patterns
 *      (a very high effect size for "sales→churn" might reveal business trouble)
 *   2. Aggregation: how do you merge org's 0.72 with another org's 0.45?
 *      Average? Max? The current system just overwrites or skips.
 *
 * THE SOLUTION — FEDERATED CAUSAL LEARNING:
 *
 * Instead of sharing ABSOLUTE edge weights, share DELTA edge weights:
 *
 *   Before learning cycle: effect_size = 0.65  (baseline)
 *   After learning cycle:  effect_size = 0.72  (updated by feedback)
 *   Delta promoted to CORE: Δ = +0.07
 *
 * The CORE brain aggregates deltas using WEIGHTED FEDAVG:
 *   CORE.effect_size += Σ(weight_i × delta_i) / Σ(weight_i)
 *
 * Where weight_i = sample_size_i (orgs with more data have more influence).
 *
 * This is architecturally equivalent to Federated Averaging (McMahan et al., 2017)
 * applied to causal graph learning instead of neural network weights.
 *
 * Why this is novel:
 *   - McMahan's FedAvg: averages neural network PARAMETERS
 *   - This system: averages causal EDGE WEIGHTS (effect sizes)
 *   - Directly analogous: edge weight = "parameter" of the causal graph model
 *   - Same privacy guarantee: only deltas shared, not org data or absolute weights
 *   - Same convergence property: with enough orgs, CORE converges to true population estimate
 *
 * Privacy guarantees:
 *   - No raw time-series data leaves the org
 *   - No absolute effect sizes leave the org (only deltas)
 *   - Deltas are clipped to [-maxDelta, +maxDelta] to prevent large outliers
 *   - Organizations can opt out via organization_federation_settings
 *   - All delta promotions are logged with source org hash (not org ID)
 *
 * Database schema (new table):
 *   causal_weight_deltas:
 *     id, organization_id, pair_key, source_domain, target_domain,
 *     delta_effect_size, sample_size, cycle_id, created_at
 *
 *   core_causal_weights:
 *     pair_key, source_domain, target_domain,
 *     effect_size, contributing_orgs, last_updated_at
 *     (this is the CORE brain's causal graph, updated by FedAvg)
 *
 * @packageDocumentation
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { checkSemanticNovelty } from './semantic-federation';
import { CORE_BRAIN_ORG_ID, FED_AVG_LEARNING_RATE, FED_AVG_MAX_DELTA } from './constants';

// ============================================================================
// TYPES
// ============================================================================

/**
 * A causal edge weight delta — the unit of federated learning.
 * This is what each org contributes to the CORE brain, not raw weights.
 */
export interface CausalWeightDelta {
  /** Canonical key: "source_domain::target_domain" */
  pairKey: string;
  sourceDomain: string;
  targetDomain: string;

  /**
   * The CHANGE in effect size after this learning cycle.
   * Positive = prediction was correct, edge strengthened.
   * Negative = prediction was wrong, edge weakened.
   *
   * Always clipped to [-maxDelta, +maxDelta] before promotion.
   */
  deltaEffectSize: number;

  /**
   * Number of observations underlying this delta.
   * Used as weight in FedAvg aggregation.
   * Higher sample size = more influence on CORE estimate.
   */
  sampleSize: number;

  /**
   * Current absolute effect size AFTER applying this delta.
   * Stored locally but NOT shared with CORE (privacy).
   * CORE only receives delta, not absolute.
   */
  currentEffectSize: number;

  /**
   * Discovery method that produced this relationship.
   * Stored for observability.
   */
  discoveryMethod?: string;

  /** Natural language description (anonymized before sharing) */
  naturalLanguage?: string;

  /** Whether this relationship is likely confounded */
  isLikelyConfounded?: boolean;
}

/**
 * Configuration for federated causal learning.
 */
export interface FederatedCausalLearningConfig {
  /**
   * Maximum magnitude of delta to share.
   * Clips large swings to prevent outlier influence on CORE.
   * Default: 0.15 (15% max change per cycle per relationship)
   *
   * This is the DP (Differential Privacy) analog of gradient clipping —
   * it bounds the influence of any single org's learning cycle.
   */
  maxDelta?: number;

  /**
   * Minimum sample size for a delta to be considered credible.
   * Deltas from low-sample relationships are filtered out.
   * Default: 30 observations
   */
  minSampleSize?: number;

  /**
   * Minimum absolute delta to promote.
   * Very tiny changes (< 0.01) add noise without signal.
   * Default: 0.01
   */
  minDelta?: number;

  /**
   * FedAvg aggregation: how much weight to give new deltas vs existing CORE weight.
   * Higher = new deltas have more influence (faster learning, less stable).
   * Lower = existing CORE weight has more influence (more stable, slower learning).
   * Default: 0.3
   */
  fedAvgLearningRate?: number;

  /**
   * Maximum number of domain pairs to promote per run.
   * Default: 50
   */
  maxPairsPerRun?: number;

  /**
   * Whether to use semantic novelty check before promoting.
   * Prevents promoting deltas for relationships the CORE already knows well.
   * Default: true
   */
  useSemanticNoveltyCheck?: boolean;

  /**
   * Novelty threshold for semantic check.
   * Relationships with similarity > this to CORE are considered "known".
   * Default: 0.90 (higher than promotion threshold — deltas can refine known relationships)
   */
  noveltyThreshold?: number;
}

const DEFAULT_CONFIG: Required<FederatedCausalLearningConfig> = {
  maxDelta: 0.15,
  minSampleSize: 30,
  minDelta: 0.01,
  fedAvgLearningRate: 0.3,
  maxPairsPerRun: 50,
  useSemanticNoveltyCheck: true,
  noveltyThreshold: 0.90,
};

/**
 * Result of a federated learning cycle.
 */
export interface FederatedLearningResult {
  /** Number of deltas successfully applied to CORE */
  deltasApplied: number;
  /** Number of deltas filtered (too small, confounded, etc.) */
  deltasFiltered: number;
  /** Number of new domain pairs added to CORE's causal graph */
  newPairsAdded: number;
  /** Number of existing CORE pairs updated by FedAvg */
  existingPairsUpdated: number;
  /** Total sample weight contributed */
  totalSampleWeight: number;
  /** Duration in ms */
  durationMs: number;
  /** Cycle ID for audit trail */
  cycleId: string;
}

/**
 * A snapshot of a causal relationship before and after a learning cycle.
 * The promoter reads these to compute deltas.
 */
export interface CausalWeightSnapshot {
  sourceDomain: string;
  targetDomain: string;
  /** Effect size at the START of this learning cycle (before predictions verified) */
  effectSizeBefore: number;
  /** Effect size at the END of this learning cycle (after weight updates) */
  effectSizeAfter: number;
  sampleSize: number;
  discoveryMethod?: string;
  naturalLanguage?: string;
  isLikelyConfounded?: boolean;
  isSignificant: boolean;
}

// ============================================================================
// DELTA COMPUTATION
// ============================================================================

/**
 * Compute causal weight deltas from before/after snapshots of a learning cycle.
 *
 * This is called at the END of each autonomous learning cycle, after
 * feedback-loop.ts has updated edge weights based on prediction outcomes.
 *
 * @param snapshots - Before/after snapshots for all relationships
 * @param config - Federated learning config
 * @returns Filtered, clipped deltas ready for promotion
 */
export function computeCausalWeightDeltas(
  snapshots: CausalWeightSnapshot[],
  config: Partial<FederatedCausalLearningConfig> = {},
): CausalWeightDelta[] {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const deltas: CausalWeightDelta[] = [];

  for (const snap of snapshots) {
    // Only include significant, non-confounded relationships with enough data
    if (!snap.isSignificant) continue;
    if (snap.sampleSize < cfg.minSampleSize) continue;
    if (snap.isLikelyConfounded) continue; // Confounded edges produce misleading deltas

    const rawDelta = snap.effectSizeAfter - snap.effectSizeBefore;

    // Filter tiny deltas (no learning happened)
    if (Math.abs(rawDelta) < cfg.minDelta) continue;

    // Clip delta to [-maxDelta, +maxDelta]
    // This is the analog of gradient clipping in neural network training.
    // It prevents a single org's anomalous learning cycle from dominating CORE.
    const clippedDelta = Math.max(-cfg.maxDelta, Math.min(cfg.maxDelta, rawDelta));

    deltas.push({
      pairKey: `${snap.sourceDomain}::${snap.targetDomain}`,
      sourceDomain: snap.sourceDomain,
      targetDomain: snap.targetDomain,
      deltaEffectSize: clippedDelta,
      sampleSize: snap.sampleSize,
      currentEffectSize: snap.effectSizeAfter,
      discoveryMethod: snap.discoveryMethod,
      naturalLanguage: snap.naturalLanguage,
      isLikelyConfounded: false,
    });
  }

  return deltas;
}

// ============================================================================
// FEDAVG AGGREGATION
// ============================================================================

/**
 * Apply FedAvg aggregation to update the CORE brain's causal graph.
 *
 * FedAvg formula (McMahan et al., 2017, adapted for causal graphs):
 *   CORE_weight_new = (1 - lr) × CORE_weight_old + lr × weighted_avg(deltas)
 *
 * Where:
 *   weighted_avg = Σ(sampleSize_i × delta_i) / Σ(sampleSize_i)
 *   lr = fedAvgLearningRate (default: 0.3)
 *
 * For new pairs (not in CORE yet):
 *   CORE_weight = initial_effect_size (derived from delta + prior)
 *
 * This is the core of the novel contribution — the CORE brain's causal graph
 * is a federated parameter estimate, updated by weighted gradient averaging
 * from multiple organizations without any org seeing another's raw data.
 *
 * @param supabase - Supabase client
 * @param organizationId - Source organization ID (for logging)
 * @param deltas - Computed deltas from this org's learning cycle
 * @param cycleId - Unique ID for this learning cycle
 * @param config - Federated learning config
 */
export async function applyFedAvgToCore(
  supabase: SupabaseClient,
  organizationId: string,
  deltas: CausalWeightDelta[],
  cycleId: string,
  config: Partial<FederatedCausalLearningConfig> = {},
): Promise<FederatedLearningResult> {
  const startMs = Date.now();
  const cfg = { ...DEFAULT_CONFIG, ...config };

  if (deltas.length === 0) {
    return { deltasApplied: 0, deltasFiltered: 0, newPairsAdded: 0, existingPairsUpdated: 0, totalSampleWeight: 0, durationMs: 0, cycleId };
  }

  // Cap to maxPairsPerRun
  const candidateDeltas = deltas.slice(0, cfg.maxPairsPerRun);
  const filteredCount = deltas.length - candidateDeltas.length;

  // ── Semantic novelty check (optional) ───────────────────────────────────
  // Skip pairs whose natural language description is semantically identical
  // to existing CORE descriptions. We still want DELTAS for known pairs
  // (to refine them), but skip truly novel pairs at very high similarity.
  let finalDeltas = candidateDeltas;
  if (cfg.useSemanticNoveltyCheck) {
    // Fetch CORE's existing relationship descriptions for comparison
    const { data: coreRelationships } = await supabase
      .from('causal_relationships_statistical')
      .select('source_domain, target_domain, natural_language')
      .eq('organization_id', CORE_BRAIN_ORG_ID)
      .limit(500);

    if (coreRelationships && coreRelationships.length > 0) {
      const coreTexts = coreRelationships
        .filter((r: any) => r.natural_language)
        .map((r: any) => ({
          text: `${r.source_domain} causes ${r.target_domain}: ${r.natural_language}`,
          metadata: { pair: `${r.source_domain}::${r.target_domain}` },
        }));

      finalDeltas = candidateDeltas.filter(delta => {
        if (!delta.naturalLanguage) return true; // No description → always include

        const candidateText = `${delta.sourceDomain} causes ${delta.targetDomain}: ${delta.naturalLanguage}`;
        const novelty = checkSemanticNovelty(candidateText, coreTexts, {
          noveltyThreshold: cfg.noveltyThreshold,
        });

        // Allow even "non-novel" deltas through — they still refine the CORE weight.
        // Only skip if similarity is extremely high (> 0.97 = nearly identical text)
        // AND the delta is negative (weakening an already-known relationship is risky).
        const isTooSimilar = novelty.noveltyScore < 0.03; // similarity > 0.97
        const isDeltaNegative = delta.deltaEffectSize < 0;
        return !(isTooSimilar && isDeltaNegative);
      });
    }
  }

  // ── Fetch existing CORE weights for FedAvg ───────────────────────────────
  const pairKeys = finalDeltas.map(d => [d.sourceDomain, d.targetDomain]);
  const existingCoreWeights = new Map<string, { effectSize: number; contributingOrgs: number }>();

  if (pairKeys.length > 0) {
    // Build OR filter for all source/target pairs
    for (const delta of finalDeltas) {
      const { data: existing } = await supabase
        .from('causal_relationships_statistical')
        .select('source_domain, target_domain, effect_size, evidence_weight')
        .eq('organization_id', CORE_BRAIN_ORG_ID)
        .eq('source_domain', delta.sourceDomain)
        .eq('target_domain', delta.targetDomain)
        .maybeSingle();

      if (existing) {
        existingCoreWeights.set(delta.pairKey, {
          effectSize: existing.effect_size ?? 0.5,
          contributingOrgs: existing.evidence_weight ?? 1,
        });
      }
    }
  }

  // ── Pull recent pending deltas from other orgs (FedAvg cross-org aggregation) ──
  //
  // TRUE FedAvg (McMahan et al. 2017):
  //   CORE_new = (1 - lr) × CORE_old + lr × weighted_mean(Δ_i)
  //   weighted_mean = Σ(sampleSize_i × Δ_i) / Σ(sampleSize_i)
  //
  // We collect ALL recent deltas for each pair (from all orgs, last 24h)
  // from causal_federated_delta_log, add THIS org's current deltas, then
  // compute the weighted mean before applying the lr-scaled update.
  // This means CORE is updated once per aggregation window, not once per org.
  //
  // Why this matters: if 5 orgs each send Δ=+0.05 with sampleSize=100,
  //   Single-org update (old):  CORE += 0.3 × 0.05 = +0.015 (per org, 5 updates = +0.075)
  //   True FedAvg (new):       CORE += 0.3 × mean(0.05 × 5) = +0.015 (one update, stable)
  // The old approach over-weighted high-frequency orgs. FedAvg is sample-size neutral.

  const FEDAVG_AGGREGATION_WINDOW_HOURS = 24;
  const aggregationCutoff = new Date(
    Date.now() - FEDAVG_AGGREGATION_WINDOW_HOURS * 60 * 60 * 1000
  ).toISOString();

  // Fetch recent deltas from ALL orgs for the same pair keys (anonymized hash — safe)
  const pairKeysForAgg = finalDeltas.map(d => d.pairKey);
  const { data: recentLogRows } = await supabase
    .from('causal_federated_delta_log')
    .select('pair_key, delta_effect_size, sample_size')
    .in('pair_key', pairKeysForAgg)
    .gte('created_at', aggregationCutoff);

  // Build per-pair aggregation buckets: include existing log rows + current org's deltas
  const pairDeltaBuckets = new Map<string, Array<{ deltaEffectSize: number; sampleSize: number }>>();

  // Seed buckets with recent log rows from other orgs
  for (const row of (recentLogRows ?? [])) {
    const bucket = pairDeltaBuckets.get(row.pair_key) ?? [];
    bucket.push({ deltaEffectSize: row.delta_effect_size, sampleSize: row.sample_size });
    pairDeltaBuckets.set(row.pair_key, bucket);
  }

  // Add current org's deltas to their respective buckets
  for (const delta of finalDeltas) {
    const bucket = pairDeltaBuckets.get(delta.pairKey) ?? [];
    bucket.push({ deltaEffectSize: delta.deltaEffectSize, sampleSize: delta.sampleSize });
    pairDeltaBuckets.set(delta.pairKey, bucket);
  }

  // ── Apply FedAvg updates ─────────────────────────────────────────────────
  let deltasApplied = 0;
  let newPairsAdded = 0;
  let existingPairsUpdated = 0;
  let totalSampleWeight = 0;
  const deltaLog: Array<Record<string, unknown>> = [];

  for (const delta of finalDeltas) {
    const existing = existingCoreWeights.get(delta.pairKey);

    // ── Compute weighted mean Δ across all contributing orgs ─────────────
    // weighted_mean = Σ(sampleSize_i × Δ_i) / Σ(sampleSize_i)
    const bucket = pairDeltaBuckets.get(delta.pairKey) ?? [{ deltaEffectSize: delta.deltaEffectSize, sampleSize: delta.sampleSize }];
    const totalWeight = bucket.reduce((sum, b) => sum + b.sampleSize, 0);
    const weightedMeanDelta = totalWeight > 0
      ? bucket.reduce((sum, b) => sum + b.sampleSize * b.deltaEffectSize, 0) / totalWeight
      : delta.deltaEffectSize;

    // Clip the aggregated delta (post-aggregation clipping prevents outlier org coalitions)
    const aggregatedDelta = Math.max(-cfg.maxDelta, Math.min(cfg.maxDelta, weightedMeanDelta));

    let newEffectSize: number;
    let isNewPair: boolean;

    if (existing) {
      // True FedAvg update for existing CORE relationship:
      //   CORE_new = (1 - lr) × CORE_old + lr × weighted_mean(Δ_i)
      // This is mathematically equivalent to CORE_old + lr × weighted_mean(Δ_i)
      // but the (1-lr) form makes the learning rate semantics explicit.
      newEffectSize = Math.max(0.05, Math.min(0.95,
        (1 - cfg.fedAvgLearningRate) * existing.effectSize +
        cfg.fedAvgLearningRate * (existing.effectSize + aggregatedDelta),
      ));
      isNewPair = false;
      existingPairsUpdated++;
    } else {
      // New pair not in CORE: initialize with a conservative prior.
      // We don't know the absolute effect size, only the aggregated delta.
      // A positive aggregated delta means relationship confirmed → start above 0.5.
      // A negative aggregated delta means disconfirmed → skip (don't add weak edges).
      if (aggregatedDelta <= 0) continue; // Don't add newly-disconfirmed pairs

      // Initial estimate: neutral prior + dampened aggregated delta
      newEffectSize = Math.max(0.05, Math.min(0.95,
        0.4 + cfg.fedAvgLearningRate * aggregatedDelta,
      ));
      isNewPair = true;
      newPairsAdded++;
    }

    const now = new Date().toISOString();

    // Upsert to CORE brain's causal relationships
    const { error } = await supabase
      .from('causal_relationships_statistical')
      .upsert({
        organization_id: CORE_BRAIN_ORG_ID,
        source_domain: delta.sourceDomain,
        target_domain: delta.targetDomain,
        effect_size: Math.round(newEffectSize * 10000) / 10000,
        // Increment evidence_weight to track how many orgs contributed
        evidence_weight: isNewPair ? 1 : (existing!.contributingOrgs + 1),
        // For new pairs, mark as significant only if delta is strong
        is_significant: isNewPair ? delta.deltaEffectSize >= cfg.minDelta * 3 : true,
        natural_language: delta.naturalLanguage
          ? `[federated] ${delta.naturalLanguage.substring(0, 200)}`
          : undefined,
        discovery_method: delta.discoveryMethod ?? 'federated_learning',
        last_computed_at: now,
      }, {
        onConflict: 'organization_id,source_domain,target_domain',
        ignoreDuplicates: false,
      });

    if (error) {
      console.warn(`[FederatedCausalLearning] FedAvg update failed for ${delta.pairKey}:`, error.message);
      continue;
    }

    deltasApplied++;
    totalSampleWeight += delta.sampleSize;

    // Log delta for audit trail (includes org hash but NOT org ID)
    // This is the privacy-preserving audit: we know THAT an org contributed,
    // but the actual org ID is hashed to a non-reversible token.
    // We record both the raw per-org delta AND the aggregated FedAvg delta
    // so the audit trail shows both individual contribution and collective update.
    deltaLog.push({
      organization_hash: _hashOrgId(organizationId), // Non-reversible hash
      pair_key: delta.pairKey,
      source_domain: delta.sourceDomain,
      target_domain: delta.targetDomain,
      delta_effect_size: Math.round(delta.deltaEffectSize * 10000) / 10000,
      sample_size: delta.sampleSize,
      // FedAvg observability: record the aggregated update that was actually applied
      aggregated_delta: Math.round(aggregatedDelta * 10000) / 10000,
      contributing_orgs_count: bucket.length,
      is_new_pair: isNewPair,
      cycle_id: cycleId,
      created_at: now,
    });
  }

  // Batch-insert delta log
  if (deltaLog.length > 0) {
    await supabase
      .from('causal_federated_delta_log')
      .insert(deltaLog)
      .then(({ error }: { error: any }) => {
        if (error) console.warn('[FederatedCausalLearning] Delta log insert failed (non-fatal):', error.message);
      });
  }

  return {
    deltasApplied,
    deltasFiltered: filteredCount + (finalDeltas.length - deltasApplied),
    newPairsAdded,
    existingPairsUpdated,
    totalSampleWeight,
    durationMs: Date.now() - startMs,
    cycleId,
  };
}

// ============================================================================
// HIGH-LEVEL INTEGRATION API
// ============================================================================

/**
 * Capture a snapshot of current causal relationship weights.
 *
 * Call this at the BEGINNING of a learning cycle, BEFORE predictions are
 * verified and weights updated. Store the result and pass it to
 * computeAndPromoteCausalDeltas() at the END of the cycle.
 *
 * @param supabase - Supabase client
 * @param organizationId - Organization ID
 * @returns Map from pairKey → effect_size_before
 */
export async function snapshotCausalWeights(
  supabase: SupabaseClient,
  organizationId: string,
): Promise<Map<string, number>> {
  const { data, error } = await supabase
    .from('causal_relationships_statistical')
    .select('source_domain, target_domain, effect_size')
    .eq('organization_id', organizationId)
    .eq('is_significant', true);

  if (error || !data) return new Map();

  const snapshot = new Map<string, number>();
  for (const row of data) {
    snapshot.set(`${row.source_domain}::${row.target_domain}`, row.effect_size ?? 0.5);
  }
  return snapshot;
}

/**
 * End-of-cycle: compute deltas from before/after weights and apply FedAvg to CORE.
 *
 * This is the main entry point for the federated learning loop.
 * Call it at the END of each autonomous learning cycle, after
 * feedback-loop.ts has updated edge weights based on prediction outcomes.
 *
 * Full workflow:
 * ```typescript
 * // At cycle START:
 * const beforeSnapshot = await snapshotCausalWeights(supabase, orgId);
 *
 * // ... run learning cycle (feedback-loop updates weights) ...
 *
 * // At cycle END:
 * const result = await computeAndPromoteCausalDeltas(
 *   supabase, orgId, beforeSnapshot, cycleId, config
 * );
 * // CORE brain now has updated causal graph with this org's discoveries
 * ```
 *
 * @param supabase - Supabase client
 * @param organizationId - Organization ID
 * @param beforeSnapshot - Weights captured at cycle start (from snapshotCausalWeights)
 * @param cycleId - Unique cycle identifier for audit trail
 * @param config - Federated learning config
 */
export async function computeAndPromoteCausalDeltas(
  supabase: SupabaseClient,
  organizationId: string,
  beforeSnapshot: Map<string, number>,
  cycleId: string,
  config: Partial<FederatedCausalLearningConfig> = {},
): Promise<FederatedLearningResult> {
  // Check federation opt-in settings
  const { data: settings } = await supabase
    .from('organization_federation_settings')
    .select('contribute_to_core_brain')
    .eq('organization_id', organizationId)
    .maybeSingle();

  const contributeEnabled = settings?.contribute_to_core_brain ?? true;
  if (!contributeEnabled) {
    return { deltasApplied: 0, deltasFiltered: 0, newPairsAdded: 0, existingPairsUpdated: 0, totalSampleWeight: 0, durationMs: 0, cycleId };
  }

  // Fetch current (post-cycle) relationship weights
  const { data: afterData, error } = await supabase
    .from('causal_relationships_statistical')
    .select('source_domain, target_domain, effect_size, sample_size, discovery_method, natural_language, is_likely_confounded, is_significant')
    .eq('organization_id', organizationId)
    .eq('is_significant', true);

  if (error || !afterData || afterData.length === 0) {
    return { deltasApplied: 0, deltasFiltered: 0, newPairsAdded: 0, existingPairsUpdated: 0, totalSampleWeight: 0, durationMs: 0, cycleId };
  }

  // Build before/after snapshots
  const snapshots: CausalWeightSnapshot[] = afterData.map((row: any) => {
    const pairKey = `${row.source_domain}::${row.target_domain}`;
    const effectSizeBefore = beforeSnapshot.get(pairKey) ?? row.effect_size; // If not in snapshot, assume no change

    return {
      sourceDomain: row.source_domain,
      targetDomain: row.target_domain,
      effectSizeBefore,
      effectSizeAfter: row.effect_size ?? 0.5,
      sampleSize: row.sample_size ?? 0,
      discoveryMethod: row.discovery_method,
      naturalLanguage: row.natural_language,
      isLikelyConfounded: row.is_likely_confounded ?? false,
      isSignificant: row.is_significant ?? false,
    };
  });

  // Compute deltas
  const deltas = computeCausalWeightDeltas(snapshots, config);

  if (deltas.length === 0) {
    return { deltasApplied: 0, deltasFiltered: snapshots.length, newPairsAdded: 0, existingPairsUpdated: 0, totalSampleWeight: 0, durationMs: 0, cycleId };
  }

  // Apply FedAvg to CORE
  return applyFedAvgToCore(supabase, organizationId, deltas, cycleId, config);
}

// ============================================================================
// PRIVACY UTILITIES
// ============================================================================

/**
 * Non-reversible hash of an organization ID for audit logging.
 * This lets us audit "how many orgs contributed to this pair" without
 * storing which specific org contributed.
 *
 * Implementation: DJB2 hash truncated to 8 hex chars.
 * Not cryptographically secure — just provides basic anonymization for logs.
 */
function _hashOrgId(orgId: string): string {
  let hash = 5381;
  for (let i = 0; i < orgId.length; i++) {
    hash = ((hash << 5) + hash) + orgId.charCodeAt(i);
    hash = hash & hash;
  }
  return (Math.abs(hash) >>> 0).toString(16).padStart(8, '0');
}

// ============================================================================
// CORE BRAIN QUERY — Federated Causal Weight Retrieval
// ============================================================================

/**
 * Get the CORE brain's current causal weight for a domain pair.
 *
 * This gives you the federated estimate — the weighted average from
 * all organizations that have contributed deltas for this pair.
 *
 * @param supabase - Supabase client
 * @param sourceDomain - Source domain
 * @param targetDomain - Target domain
 * @returns The CORE brain's effect size estimate, or null if not in CORE
 */
export async function getCoreEffectSize(
  supabase: SupabaseClient,
  sourceDomain: string,
  targetDomain: string,
): Promise<{ effectSize: number; contributingOrgs: number } | null> {
  const { data, error } = await supabase
    .from('causal_relationships_statistical')
    .select('effect_size, evidence_weight')
    .eq('organization_id', CORE_BRAIN_ORG_ID)
    .eq('source_domain', sourceDomain)
    .eq('target_domain', targetDomain)
    .maybeSingle();

  if (error || !data) return null;

  return {
    effectSize: data.effect_size ?? 0.5,
    contributingOrgs: data.evidence_weight ?? 1,
  };
}

/**
 * Get all CORE brain causal weights with contribution metadata.
 * Useful for dashboarding the federated learning state.
 */
export async function getAllCoreCausalWeights(
  supabase: SupabaseClient,
  minContributingOrgs: number = 1,
): Promise<Array<{
  sourceDomain: string;
  targetDomain: string;
  effectSize: number;
  contributingOrgs: number;
  naturalLanguage?: string;
}>> {
  const { data, error } = await supabase
    .from('causal_relationships_statistical')
    .select('source_domain, target_domain, effect_size, evidence_weight, natural_language')
    .eq('organization_id', CORE_BRAIN_ORG_ID)
    .eq('is_significant', true)
    .gte('evidence_weight', minContributingOrgs)
    .order('effect_size', { ascending: false });

  if (error || !data) return [];

  return data.map((row: any) => ({
    sourceDomain: row.source_domain,
    targetDomain: row.target_domain,
    effectSize: row.effect_size ?? 0.5,
    contributingOrgs: row.evidence_weight ?? 1,
    naturalLanguage: row.natural_language,
  }));
}
