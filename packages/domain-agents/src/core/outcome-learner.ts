/**
 * Outcome Learner - L5 Learning Engine for Domain Agent Feedback Loop
 *
 * Provides the feedback loop from domain agent actions back to the brain.
 * Tracks predictions made by agents, compares them against outcomes once
 * resolved, and applies Bayesian confidence updates.
 *
 * Two core functions:
 *   - processCompletedActions: Evaluates resolved predictions and updates
 *     confidence scores based on measured accuracy.
 *   - applyConfidenceDecay: Applies time-based decay to unvalidated
 *     predictions, preventing stale high-confidence entries from
 *     misleading future agent reasoning.
 *
 * Persistence: Supabase tables `agent_prediction_tracking` and
 * `agent_outcome_history`.
 *
 * Part of v11.5.1: L5 Learning Engine
 */

// ============================================================================
// TYPES
// ============================================================================

export interface OutcomeLearningResult {
  tracked: number;
  resolved: number;
  accuracyRate: number;
  adjustments: Array<{
    domain: string;
    oldConfidence: number;
    newConfidence: number;
  }>;
  /** Alias used by orchestrator: number of patterns whose confidence was updated */
  patternsUpdated: number;
  /** Alias used by orchestrator: fraction of resolved predictions that were accurate */
  successRate: number;
}

export interface DecayResult {
  decayed: number;
  removed: number;
}

interface TrackedPrediction {
  id: string;
  organization_id: string;
  domain: string;
  prediction_type: string;
  description: string;
  confidence: number;
  original_confidence: number;
  status: 'pending' | 'resolved_correct' | 'resolved_incorrect' | 'expired';
  created_at: string;
  resolved_at: string | null;
  metadata: Record<string, any>;
}

// ============================================================================
// CONSTANTS
// ============================================================================

/** Default lookback window for evaluating resolved predictions (days) */
const DEFAULT_LOOKBACK_DAYS = 7;

/** Minimum confidence below which predictions are removed entirely */
const MIN_CONFIDENCE_THRESHOLD = 0.05;

/** Daily decay factor applied to unvalidated predictions */
const DAILY_DECAY_FACTOR = 0.95;

/** Default max age (days) before a prediction is marked expired */
const DEFAULT_MAX_AGE_DAYS = 30;

/** Bayesian update weight — how strongly outcomes shift confidence */
const BAYESIAN_UPDATE_WEIGHT = 0.3;

// ============================================================================
// PROCESS COMPLETED ACTIONS
// ============================================================================

/**
 * Evaluate recently resolved predictions and update confidence scores.
 *
 * Called by the orchestrator after each batch run to close the learning loop:
 *   1. Fetch predictions that were marked resolved within the lookback window.
 *   2. Compute accuracy rate (correct / total resolved).
 *   3. Apply Bayesian confidence adjustments to the originating domain's
 *      remaining pending predictions.
 *   4. Record the outcome batch in `agent_outcome_history` for audit trail.
 *
 * @param supabase  Supabase client (service-role or RLS-scoped)
 * @param organizationId  Organization UUID
 * @param lookbackDays  How far back to look for resolved predictions (default 7)
 * @returns Learning result with accuracy metrics and confidence adjustments
 */
export async function processCompletedActions(
  supabase: any,
  organizationId: string,
  lookbackDays: number = DEFAULT_LOOKBACK_DAYS,
): Promise<OutcomeLearningResult> {
  const result: OutcomeLearningResult = {
    tracked: 0,
    resolved: 0,
    accuracyRate: 0,
    adjustments: [],
    patternsUpdated: 0,
    successRate: 0,
  };

  try {
    // ── Step 1: Fetch recently resolved predictions ──────────────────────
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - lookbackDays);

    const { data: resolvedPredictions, error: fetchError } = await supabase
      .from('agent_prediction_tracking')
      .select('*')
      .eq('organization_id', organizationId)
      .in('status', ['resolved_correct', 'resolved_incorrect'])
      .gte('resolved_at', cutoffDate.toISOString())
      .order('resolved_at', { ascending: false });

    if (fetchError) {
      console.error('[OutcomeLearner] Failed to fetch resolved predictions:', fetchError.message);
      return result;
    }

    const predictions: TrackedPrediction[] = resolvedPredictions || [];
    result.resolved = predictions.length;

    if (predictions.length === 0) {
      return result;
    }

    // ── Step 2: Compute accuracy by domain ───────────────────────────────
    const domainStats = new Map<string, { correct: number; total: number }>();

    for (const prediction of predictions) {
      const stats = domainStats.get(prediction.domain) || { correct: 0, total: 0 };
      stats.total += 1;
      if (prediction.status === 'resolved_correct') {
        stats.correct += 1;
      }
      domainStats.set(prediction.domain, stats);
    }

    const totalCorrect = predictions.filter(p => p.status === 'resolved_correct').length;
    result.accuracyRate = predictions.length > 0 ? totalCorrect / predictions.length : 0;
    result.successRate = result.accuracyRate;

    // ── Step 3: Apply Bayesian confidence adjustments ────────────────────
    // For each domain, adjust pending prediction confidence based on that
    // domain's recent accuracy. If a domain has been accurate, boost
    // pending predictions slightly. If inaccurate, reduce them.
    for (const [domain, stats] of domainStats.entries()) {
      const domainAccuracy = stats.total > 0 ? stats.correct / stats.total : 0.5;

      // Fetch pending predictions for this domain to adjust
      const { data: pendingPredictions, error: pendingError } = await supabase
        .from('agent_prediction_tracking')
        .select('id, confidence, domain')
        .eq('organization_id', organizationId)
        .eq('domain', domain)
        .eq('status', 'pending');

      if (pendingError) {
        console.warn(`[OutcomeLearner] Failed to fetch pending predictions for ${domain}:`, pendingError.message);
        continue;
      }

      if (!pendingPredictions || pendingPredictions.length === 0) {
        continue;
      }

      // Apply Bayesian update: shift confidence toward domain accuracy
      for (const pending of pendingPredictions) {
        const oldConfidence = pending.confidence;
        // Weighted blend between current confidence and domain accuracy signal
        const newConfidence = Math.max(
          MIN_CONFIDENCE_THRESHOLD,
          Math.min(1.0, oldConfidence + BAYESIAN_UPDATE_WEIGHT * (domainAccuracy - oldConfidence))
        );

        // Only update if the change is meaningful (> 0.5%)
        if (Math.abs(newConfidence - oldConfidence) < 0.005) {
          continue;
        }

        const { error: updateError } = await supabase
          .from('agent_prediction_tracking')
          .update({ confidence: parseFloat(newConfidence.toFixed(4)) })
          .eq('id', pending.id);

        if (updateError) {
          console.warn(`[OutcomeLearner] Failed to update prediction ${pending.id}:`, updateError.message);
          continue;
        }

        result.adjustments.push({
          domain,
          oldConfidence,
          newConfidence: parseFloat(newConfidence.toFixed(4)),
        });
        result.patternsUpdated += 1;
      }
    }

    result.tracked = result.patternsUpdated;

    // ── Step 4: Record outcome batch in history ──────────────────────────
    const historyEntry = {
      organization_id: organizationId,
      lookback_days: lookbackDays,
      resolved_count: result.resolved,
      accuracy_rate: parseFloat(result.accuracyRate.toFixed(4)),
      patterns_updated: result.patternsUpdated,
      adjustments: result.adjustments,
      domain_stats: Object.fromEntries(domainStats),
      recorded_at: new Date().toISOString(),
    };

    const { error: historyError } = await supabase
      .from('agent_outcome_history')
      .insert(historyEntry);

    if (historyError) {
      // Non-fatal: log and continue
      console.warn('[OutcomeLearner] Failed to record outcome history:', historyError.message);
    }

    console.log(
      `[OutcomeLearner] Processed ${result.resolved} resolved predictions: ` +
      `${(result.accuracyRate * 100).toFixed(0)}% accuracy, ` +
      `${result.patternsUpdated} patterns updated across ${domainStats.size} domains`
    );
  } catch (err) {
    console.error('[OutcomeLearner] Unexpected error in processCompletedActions:', err);
  }

  return result;
}

// ============================================================================
// APPLY CONFIDENCE DECAY
// ============================================================================

/**
 * Apply time-based confidence decay to pending predictions that have not
 * been validated. Predictions lose confidence over time to prevent stale
 * high-confidence entries from misleading agent reasoning.
 *
 * Predictions that decay below MIN_CONFIDENCE_THRESHOLD or exceed
 * maxAgeDays are marked as 'expired' and effectively removed from
 * active consideration.
 *
 * @param supabase  Supabase client
 * @param organizationId  Organization UUID
 * @param maxAgeDays  Maximum age before forced expiry (default 30)
 * @returns Count of predictions that were decayed (number for orchestrator compat)
 */
export async function applyConfidenceDecay(
  supabase: any,
  organizationId: string,
  maxAgeDays: number = DEFAULT_MAX_AGE_DAYS,
): Promise<number> {
  let totalDecayed = 0;
  let totalRemoved = 0;

  try {
    // Fetch all pending predictions for this organization
    const { data: pendingPredictions, error: fetchError } = await supabase
      .from('agent_prediction_tracking')
      .select('id, confidence, created_at, domain')
      .eq('organization_id', organizationId)
      .eq('status', 'pending');

    if (fetchError) {
      console.error('[OutcomeLearner] Failed to fetch predictions for decay:', fetchError.message);
      return 0;
    }

    if (!pendingPredictions || pendingPredictions.length === 0) {
      return 0;
    }

    const now = Date.now();
    const maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1000;

    // Batch updates for efficiency
    const decayUpdates: Array<{ id: string; confidence: number }> = [];
    const expireIds: string[] = [];

    for (const prediction of pendingPredictions) {
      const createdAt = new Date(prediction.created_at).getTime();
      const ageMs = now - createdAt;
      const ageDays = ageMs / (24 * 60 * 60 * 1000);

      // Force-expire predictions that exceed max age
      if (ageMs > maxAgeMs) {
        expireIds.push(prediction.id);
        totalRemoved += 1;
        continue;
      }

      // Apply exponential decay based on age
      // Each day of age reduces confidence by (1 - DAILY_DECAY_FACTOR)
      const decayedConfidence = prediction.confidence * Math.pow(DAILY_DECAY_FACTOR, ageDays);
      const roundedConfidence = parseFloat(decayedConfidence.toFixed(4));

      // If decayed below threshold, expire it
      if (roundedConfidence < MIN_CONFIDENCE_THRESHOLD) {
        expireIds.push(prediction.id);
        totalRemoved += 1;
        continue;
      }

      // Only update if confidence actually changed meaningfully
      if (Math.abs(roundedConfidence - prediction.confidence) >= 0.001) {
        decayUpdates.push({ id: prediction.id, confidence: roundedConfidence });
        totalDecayed += 1;
      }
    }

    // Execute decay updates
    for (const update of decayUpdates) {
      const { error: updateError } = await supabase
        .from('agent_prediction_tracking')
        .update({ confidence: update.confidence })
        .eq('id', update.id);

      if (updateError) {
        console.warn(`[OutcomeLearner] Failed to decay prediction ${update.id}:`, updateError.message);
        totalDecayed -= 1; // Undo count for failed update
      }
    }

    // Execute expirations in batch
    if (expireIds.length > 0) {
      const { error: expireError } = await supabase
        .from('agent_prediction_tracking')
        .update({
          status: 'expired',
          resolved_at: new Date().toISOString(),
        })
        .in('id', expireIds);

      if (expireError) {
        console.warn('[OutcomeLearner] Failed to expire old predictions:', expireError.message);
        totalRemoved = 0; // Reset on failure
      }
    }

    if (totalDecayed > 0 || totalRemoved > 0) {
      console.log(
        `[OutcomeLearner] Confidence decay: ${totalDecayed} predictions decayed, ` +
        `${totalRemoved} expired (max age: ${maxAgeDays}d)`
      );
    }
  } catch (err) {
    console.error('[OutcomeLearner] Unexpected error in applyConfidenceDecay:', err);
  }

  // Return total affected count (orchestrator uses this as a simple number)
  return totalDecayed + totalRemoved;
}

// ============================================================================
// PREDICTION TRACKING HELPERS (for use by domain agents)
// ============================================================================

/**
 * Record a new prediction from a domain agent for future accuracy tracking.
 * Called by agent tools when they make forward-looking statements (e.g.,
 * "this client is likely to churn", "this deal will close in Q2").
 *
 * @param supabase  Supabase client
 * @param organizationId  Organization UUID
 * @param domain  Agent domain (e.g., 'cs', 'revenue', 'finance')
 * @param predictionType  Category of prediction (e.g., 'churn_risk', 'deal_close', 'payment_delay')
 * @param description  Human-readable prediction statement
 * @param confidence  Initial confidence score (0-1)
 * @param metadata  Optional structured metadata for the prediction
 * @returns The created prediction ID, or null on failure
 */
export async function trackPrediction(
  supabase: any,
  organizationId: string,
  domain: string,
  predictionType: string,
  description: string,
  confidence: number,
  metadata: Record<string, any> = {},
): Promise<string | null> {
  try {
    const clampedConfidence = Math.max(0, Math.min(1, confidence));

    const { data, error } = await supabase
      .from('agent_prediction_tracking')
      .insert({
        organization_id: organizationId,
        domain,
        prediction_type: predictionType,
        description,
        confidence: parseFloat(clampedConfidence.toFixed(4)),
        original_confidence: parseFloat(clampedConfidence.toFixed(4)),
        status: 'pending',
        metadata,
        created_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    if (error) {
      console.warn(`[OutcomeLearner] Failed to track prediction for ${domain}:`, error.message);
      return null;
    }

    return data?.id || null;
  } catch (err) {
    console.error('[OutcomeLearner] Unexpected error in trackPrediction:', err);
    return null;
  }
}

/**
 * Resolve a previously tracked prediction as correct or incorrect.
 * Called when the predicted outcome can be verified against reality.
 *
 * @param supabase  Supabase client
 * @param predictionId  The prediction UUID to resolve
 * @param correct  Whether the prediction turned out to be accurate
 * @returns True if the resolution was recorded successfully
 */
export async function resolvePrediction(
  supabase: any,
  predictionId: string,
  correct: boolean,
): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('agent_prediction_tracking')
      .update({
        status: correct ? 'resolved_correct' : 'resolved_incorrect',
        resolved_at: new Date().toISOString(),
      })
      .eq('id', predictionId)
      .eq('status', 'pending'); // Only resolve pending predictions

    if (error) {
      console.warn(`[OutcomeLearner] Failed to resolve prediction ${predictionId}:`, error.message);
      return false;
    }

    return true;
  } catch (err) {
    console.error('[OutcomeLearner] Unexpected error in resolvePrediction:', err);
    return false;
  }
}
