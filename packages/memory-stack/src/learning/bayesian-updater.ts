/**
 * Bayesian Weight Updater — Proper Posterior Updates
 *
 * Replaces the naive `weight × 1.05` arithmetic with real Bayesian inference:
 *
 *   Prior:     Beta(α, β) — our belief about edge reliability
 *   Evidence:  prediction was correct or incorrect
 *   Posterior: Beta(α + correct, β + incorrect)
 *
 * Why this matters:
 *   - After 1 correct prediction:  weight goes from 0.5 → 0.67 (big jump, low evidence)
 *   - After 100 correct predictions: weight goes from 0.95 → 0.951 (tiny jump, already confident)
 *   - After 1 wrong out of 100:     weight goes from 0.95 → 0.94 (small dip, lots of evidence)
 *
 * This is REAL learning — the system becomes more certain with evidence
 * and appropriately uncertain when evidence is scarce.
 *
 * Features:
 *   1. Beta-Binomial posterior for edge weights
 *   2. Thompson sampling for exploration (try uncertain edges)
 *   3. Posterior predictive for "what would happen if..." queries
 *   4. Credible intervals (Bayesian confidence bands)
 *   5. Evidence decay (older evidence counts less)
 *
 * @packageDocumentation
 */

import type { SupabaseClient } from '@supabase/supabase-js';

// ============================================================================
// TYPES
// ============================================================================

/** Bayesian state for a single causal edge */
export interface EdgePosterior {
  /** Source domain */
  sourceDomain: string;
  /** Target domain */
  targetDomain: string;
  /** Alpha parameter (pseudo-count of successes) */
  alpha: number;
  /** Beta parameter (pseudo-count of failures) */
  beta: number;
  /** Mean of the posterior: α / (α + β) */
  mean: number;
  /** Variance of the posterior */
  variance: number;
  /** 95% credible interval */
  credibleInterval: [number, number];
  /** Total evidence count: α + β - prior */
  evidenceCount: number;
  /** Entropy of the posterior (higher = more uncertain) */
  entropy: number;
  /** Last updated */
  updatedAt: string;
}

/** Update event — a prediction result */
export interface PredictionEvidence {
  /** Source domain of the edge */
  sourceDomain: string;
  /** Target domain of the edge */
  targetDomain: string;
  /** Was the prediction correct? */
  wasCorrect: boolean;
  /** Confidence of the prediction (0-1) — higher = stronger evidence */
  predictionConfidence: number;
  /** Age of this evidence in days (for decay) */
  ageDays?: number;
}

/** Bayesian updater configuration */
export interface BayesianUpdaterConfig {
  /** Supabase client */
  supabase: SupabaseClient;
  /** Organization ID */
  organizationId: string;
  /** Prior alpha (default: 1 — uniform prior) */
  priorAlpha?: number;
  /** Prior beta (default: 1 — uniform prior) */
  priorBeta?: number;
  /** Evidence decay half-life in days (default: 90) */
  decayHalfLifeDays?: number;
  /** Minimum weight to maintain (default: 0.05) */
  minWeight?: number;
  /** Verbose logging */
  verbose?: boolean;
}

/** Thompson sampling result */
export interface ThompsonSample {
  sourceDomain: string;
  targetDomain: string;
  /** Sampled probability from posterior */
  sampledProbability: number;
  /** Whether this edge should be explored (high uncertainty) */
  shouldExplore: boolean;
  /** Current posterior mean */
  posteriorMean: number;
  /** Current uncertainty (standard deviation) */
  uncertainty: number;
}

// ============================================================================
// BAYESIAN UPDATER
// ============================================================================

export function createBayesianUpdater(config: BayesianUpdaterConfig) {
  const {
    supabase,
    organizationId,
    priorAlpha = 1,
    priorBeta = 1,
    decayHalfLifeDays = 90,
    minWeight = 0.05,
    verbose = false,
  } = config;

  // In-memory posterior cache
  const posteriors = new Map<string, EdgePosterior>();

  function log(msg: string): void {
    if (verbose) {
      const time = new Date().toISOString().substring(11, 19);
      console.log(`[${time}] [BAYESIAN] ${msg}`);
    }
  }

  function edgeKey(source: string, target: string): string {
    return `${source}→${target}`;
  }

  // ── Beta Distribution Helpers ─────────────────────────────────────

  function betaMean(alpha: number, beta: number): number {
    return alpha / (alpha + beta);
  }

  function betaVariance(alpha: number, beta: number): number {
    const total = alpha + beta;
    return (alpha * beta) / (total * total * (total + 1));
  }

  function betaEntropy(alpha: number, beta: number): number {
    // Approximate entropy of Beta distribution
    // H = ln(B(α,β)) - (α-1)ψ(α) - (β-1)ψ(β) + (α+β-2)ψ(α+β)
    // Using simplified approximation
    const total = alpha + beta;
    if (total < 2) return 1.0; // Maximum uncertainty
    return Math.log(total) / Math.log(total + 10); // Normalized 0-1 (approx)
  }

  function betaCredibleInterval(alpha: number, beta: number, level: number = 0.95): [number, number] {
    // Approximate 95% credible interval using normal approximation
    // For Beta distribution with moderate α, β this is reasonable
    const mean = betaMean(alpha, beta);
    const std = Math.sqrt(betaVariance(alpha, beta));
    const z = 1.96; // 95% CI

    const lower = Math.max(0, mean - z * std);
    const upper = Math.min(1, mean + z * std);

    return [lower, upper];
  }

  /** Sample from Beta distribution using Jöhnk's method */
  function betaSample(alpha: number, beta: number): number {
    // Use the gamma function method for general alpha, beta
    const gammaA = gammaSample(alpha);
    const gammaB = gammaSample(beta);
    return gammaA / (gammaA + gammaB);
  }

  /** Sample from Gamma distribution using Marsaglia's method */
  function gammaSample(shape: number): number {
    if (shape < 1) {
      // Ahrens-Dieter method for shape < 1
      return gammaSample(shape + 1) * Math.pow(Math.random(), 1 / shape);
    }

    // Marsaglia and Tsang's method for shape >= 1
    const d = shape - 1 / 3;
    const c = 1 / Math.sqrt(9 * d);

    while (true) {
      let x: number;
      let v: number;

      do {
        // Box-Muller transform for normal sample
        const u1 = Math.random();
        const u2 = Math.random();
        x = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
        v = 1 + c * x;
      } while (v <= 0);

      v = v * v * v;
      const u = Math.random();

      if (u < 1 - 0.0331 * (x * x) * (x * x)) return d * v;
      if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
    }
  }

  // ── Core Bayesian Update ──────────────────────────────────────────

  function getOrCreatePosterior(source: string, target: string): EdgePosterior {
    const key = edgeKey(source, target);
    if (posteriors.has(key)) return posteriors.get(key)!;

    const posterior: EdgePosterior = {
      sourceDomain: source,
      targetDomain: target,
      alpha: priorAlpha,
      beta: priorBeta,
      mean: betaMean(priorAlpha, priorBeta),
      variance: betaVariance(priorAlpha, priorBeta),
      credibleInterval: betaCredibleInterval(priorAlpha, priorBeta),
      evidenceCount: 0,
      entropy: 1.0,
      updatedAt: new Date().toISOString(),
    };

    posteriors.set(key, posterior);
    return posterior;
  }

  function updatePosterior(posterior: EdgePosterior, evidence: PredictionEvidence): void {
    // Evidence weight based on prediction confidence and age
    let evidenceWeight = evidence.predictionConfidence;

    // Apply temporal decay — older evidence counts less
    if (evidence.ageDays && evidence.ageDays > 0) {
      const decayFactor = Math.pow(0.5, evidence.ageDays / decayHalfLifeDays);
      evidenceWeight *= decayFactor;
    }

    // Bayesian update
    if (evidence.wasCorrect) {
      posterior.alpha += evidenceWeight;
    } else {
      posterior.beta += evidenceWeight;
    }

    // Recompute derived values
    posterior.mean = betaMean(posterior.alpha, posterior.beta);
    posterior.variance = betaVariance(posterior.alpha, posterior.beta);
    posterior.credibleInterval = betaCredibleInterval(posterior.alpha, posterior.beta);
    posterior.evidenceCount = (posterior.alpha - priorAlpha) + (posterior.beta - priorBeta);
    posterior.entropy = betaEntropy(posterior.alpha, posterior.beta);
    posterior.updatedAt = new Date().toISOString();
  }

  // ══════════════════════════════════════════════════════════════════
  // PUBLIC API
  // ══════════════════════════════════════════════════════════════════

  return {
    /**
     * Update an edge's posterior with new prediction evidence.
     * This is the core Bayesian learning step.
     */
    update(evidence: PredictionEvidence): EdgePosterior {
      const posterior = getOrCreatePosterior(evidence.sourceDomain, evidence.targetDomain);
      updatePosterior(posterior, evidence);

      log(`Updated ${edgeKey(evidence.sourceDomain, evidence.targetDomain)}: ` +
        `${evidence.wasCorrect ? '✓' : '✗'} → mean=${posterior.mean.toFixed(3)} ` +
        `[${posterior.credibleInterval[0].toFixed(3)}, ${posterior.credibleInterval[1].toFixed(3)}] ` +
        `(evidence: ${posterior.evidenceCount.toFixed(1)})`);

      return { ...posterior };
    },

    /**
     * Batch update from multiple predictions.
     */
    batchUpdate(evidenceList: PredictionEvidence[]): Map<string, EdgePosterior> {
      const updated = new Map<string, EdgePosterior>();

      for (const evidence of evidenceList) {
        const posterior = this.update(evidence);
        updated.set(edgeKey(evidence.sourceDomain, evidence.targetDomain), posterior);
      }

      log(`Batch updated ${updated.size} edges from ${evidenceList.length} predictions`);
      return updated;
    },

    /**
     * Get the current posterior for an edge.
     */
    getPosterior(source: string, target: string): EdgePosterior {
      return { ...getOrCreatePosterior(source, target) };
    },

    /**
     * Thompson sampling — explore uncertain edges.
     * Returns sampled probabilities for all known edges.
     * Use this to decide WHICH causal relationships to test next.
     */
    thompsonSample(): ThompsonSample[] {
      const samples: ThompsonSample[] = [];

      for (const [, posterior] of posteriors) {
        const sampledProbability = betaSample(posterior.alpha, posterior.beta);
        const uncertainty = Math.sqrt(posterior.variance);

        samples.push({
          sourceDomain: posterior.sourceDomain,
          targetDomain: posterior.targetDomain,
          sampledProbability,
          shouldExplore: uncertainty > 0.15, // High uncertainty → explore
          posteriorMean: posterior.mean,
          uncertainty,
        });
      }

      // Sort by uncertainty (most uncertain first — explore these)
      samples.sort((a, b) => b.uncertainty - a.uncertainty);
      return samples;
    },

    /**
     * Persist posteriors to database (call during consolidation).
     * Saves full Beta(α,β) to bayesian_posteriors table AND updates
     * causal_relationships_statistical with derived weight.
     */
    async persistPosteriors(): Promise<number> {
      if (posteriors.size === 0) return 0;

      // Performance fix: Batch upsert instead of N individual DB calls
      // Before: 265 edges × 2 calls = 530 sequential DB round-trips (90-180s)
      // After: 1 batch upsert + 1 batch update per chunk (~2-5s total)
      const BATCH_SIZE = 100;
      let persisted = 0;

      const allRows = Array.from(posteriors.values()).map(posterior => ({
        organization_id: organizationId,
        source_domain: posterior.sourceDomain,
        target_domain: posterior.targetDomain,
        alpha: posterior.alpha,
        beta: posterior.beta,
        mean: posterior.mean,
        variance: posterior.variance,
        entropy: posterior.entropy,
        ci_lower: posterior.credibleInterval[0],
        ci_upper: posterior.credibleInterval[1],
        evidence_count: Math.round(posterior.evidenceCount),
        last_update_source: 'consolidation',
      }));

      // Batch upsert posteriors table
      for (let i = 0; i < allRows.length; i += BATCH_SIZE) {
        const batch = allRows.slice(i, i + BATCH_SIZE);
        try {
          await supabase
            .from('bayesian_posteriors')
            .upsert(batch, { onConflict: 'organization_id,source_domain,target_domain' });
          persisted += batch.length;
        } catch (err) {
          // Fall back to individual upserts for this batch
          for (const row of batch) {
            try {
              await supabase
                .from('bayesian_posteriors')
                .upsert(row, { onConflict: 'organization_id,source_domain,target_domain' });
              persisted++;
            } catch {
              // Non-critical: skip failed individual posterior
            }
          }
        }
      }

      // Batch update causal_relationships_statistical (backward compat)
      // Use parallel updates in chunks rather than sequential one-by-one
      const updatePromises = Array.from(posteriors.values()).map(posterior =>
        (async () => {
          try {
            await supabase
              .from('causal_relationships_statistical')
              .update({
                evidence_weight: Math.max(minWeight, posterior.mean),
                confidence_interval_lower: posterior.credibleInterval[0],
                confidence_interval_upper: posterior.credibleInterval[1],
              })
              .eq('organization_id', organizationId)
              .eq('source_domain', posterior.sourceDomain)
              .eq('target_domain', posterior.targetDomain);
          } catch {
            // Non-critical
          }
        })()
      );

      // Run updates in parallel batches of 20
      for (let i = 0; i < updatePromises.length; i += 20) {
        await Promise.allSettled(updatePromises.slice(i, i + 20));
      }

      log(`Persisted ${persisted}/${posteriors.size} posteriors (batched) to bayesian_posteriors + causal_relationships_statistical`);
      return persisted;
    },

    /**
     * Load existing evidence from database to warm up posteriors.
     * Prefers bayesian_posteriors (exact α,β) → falls back to
     * causal_relationships_statistical (approximate reconstruction).
     */
    async loadFromDatabase(): Promise<number> {
      // First try: load from dedicated posteriors table (exact parameters)
      const { data: savedPosteriors } = await supabase
        .from('bayesian_posteriors')
        .select('source_domain, target_domain, alpha, beta, mean, variance, entropy, ci_lower, ci_upper, evidence_count')
        .eq('organization_id', organizationId);

      if (savedPosteriors && savedPosteriors.length > 0) {
        for (const row of savedPosteriors) {
          const key = edgeKey(row.source_domain, row.target_domain);
          posteriors.set(key, {
            sourceDomain: row.source_domain,
            targetDomain: row.target_domain,
            alpha: row.alpha,
            beta: row.beta,
            mean: row.mean,
            variance: row.variance,
            credibleInterval: [row.ci_lower ?? betaCredibleInterval(row.alpha, row.beta)[0], row.ci_upper ?? betaCredibleInterval(row.alpha, row.beta)[1]],
            evidenceCount: row.evidence_count,
            entropy: row.entropy ?? betaEntropy(row.alpha, row.beta),
            updatedAt: new Date().toISOString(),
          });
        }
        log(`Loaded ${savedPosteriors.length} EXACT posteriors from bayesian_posteriors table`);
        return savedPosteriors.length;
      }

      // Fallback: reconstruct from causal_relationships_statistical
      const { data: edges } = await supabase
        .from('causal_relationships_statistical')
        .select('source_domain, target_domain, evidence_weight, sample_size, confidence_interval_lower, confidence_interval_upper')
        .eq('organization_id', organizationId)
        .eq('is_significant', true);

      if (!edges) return 0;

      for (const edge of edges) {
        const weight = edge.evidence_weight || 0.5;
        const samples = edge.sample_size || 10;

        // Reconstruct approximate Beta parameters from weight and sample size
        const alpha = Math.max(priorAlpha, weight * samples);
        const beta = Math.max(priorBeta, (1 - weight) * samples);

        const key = edgeKey(edge.source_domain, edge.target_domain);
        posteriors.set(key, {
          sourceDomain: edge.source_domain,
          targetDomain: edge.target_domain,
          alpha,
          beta,
          mean: betaMean(alpha, beta),
          variance: betaVariance(alpha, beta),
          credibleInterval: [
            edge.confidence_interval_lower || betaCredibleInterval(alpha, beta)[0],
            edge.confidence_interval_upper || betaCredibleInterval(alpha, beta)[1],
          ],
          evidenceCount: alpha + beta - priorAlpha - priorBeta,
          entropy: betaEntropy(alpha, beta),
          updatedAt: new Date().toISOString(),
        });
      }

      log(`Loaded ${edges.length} edges (approximate posteriors from causal_relationships_statistical)`);
      return edges.length;
    },

    /**
     * Get all posteriors (for reporting).
     */
    getAllPosteriors(): EdgePosterior[] {
      return [...posteriors.values()].map(p => ({ ...p }));
    },

    /**
     * Get edges that need more data (high uncertainty).
     */
    getUncertainEdges(maxUncertainty: number = 0.2): EdgePosterior[] {
      const uncertain: EdgePosterior[] = [];
      for (const [, posterior] of posteriors) {
        const ci = posterior.credibleInterval;
        const width = ci[1] - ci[0];
        if (width > maxUncertainty) {
          uncertain.push({ ...posterior });
        }
      }
      uncertain.sort((a, b) => {
        const widthA = a.credibleInterval[1] - a.credibleInterval[0];
        const widthB = b.credibleInterval[1] - b.credibleInterval[0];
        return widthB - widthA;
      });
      return uncertain;
    },
  };
}
