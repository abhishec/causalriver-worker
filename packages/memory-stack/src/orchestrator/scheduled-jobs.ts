/**
 * Scheduled Jobs
 *
 * Cron-compatible functions for periodic maintenance tasks.
 * Designed to be called from Supabase cron or pg_cron.
 *
 * Jobs:
 * - Daily causal discovery (batch Granger causality)
 * - Feedback loop: pending verification processing
 * - Feedback loop: relationship weight updates
 * - Continuous learner: evidence decay
 * - Threshold optimizer: adaptive signal threshold tuning
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  runCausalDiscovery,
  findNewRelationships,
  findLostRelationships,
  type CausalRelationship,
} from '../causality/causal-discovery-runner';
import { createFeedbackLoop, type FeedbackLoopConfig } from '../causality/feedback-loop';
import { createContinuousLearner, createEmptyDAG, loadDAGFromDatabase } from '../causality/continuous-learner';
import { createThresholdOptimizer, type ThresholdOptimizerConfig, type ThresholdOptimizationResult } from '../causality/threshold-optimizer';
import type { WeightUpdate, RelationshipAccuracyMetrics } from '../causality/feedback-loop';

// ============================================================================
// TYPES
// ============================================================================

export interface ScheduledJobsConfig {
  /** Lookback window for causal discovery (default: 90 days) */
  lookbackDays: number;
  /** Minimum observations per domain (default: 30) */
  minObservations: number;
  /** Feedback loop configuration */
  feedbackLoop?: Partial<FeedbackLoopConfig>;
  /** Threshold optimizer configuration */
  thresholdOptimizer?: Partial<ThresholdOptimizerConfig>;
}

const DEFAULT_CONFIG: ScheduledJobsConfig = {
  lookbackDays: 90,
  minObservations: 30,
};

// ============================================================================
// JOBS
// ============================================================================

/**
 * Create a scheduled jobs runner
 */
export function createScheduledJobs(
  supabase: SupabaseClient,
  config: Partial<ScheduledJobsConfig> = {}
) {
  const fullConfig = { ...DEFAULT_CONFIG, ...config };

  return {
    /**
     * Run full causal discovery for an organization.
     * Recommended: daily via cron.
     */
    async runDailyCausalDiscovery(organizationId: string): Promise<{
      newRelationships: CausalRelationship[];
      lostRelationships: CausalRelationship[];
      totalDiscovered: number;
    }> {
      // Fetch recent signals
      const lookbackDate = new Date();
      lookbackDate.setDate(lookbackDate.getDate() - fullConfig.lookbackDays);

      const { data: signals, error } = await supabase
        .from('cross_domain_signals')
        .select('source_domain, signal_type, signal_value, created_at')
        .eq('organization_id', organizationId)
        .gte('created_at', lookbackDate.toISOString())
        .order('created_at', { ascending: true });

      if (error || !signals || signals.length === 0) {
        return {
          newRelationships: [],
          lostRelationships: [],
          totalDiscovered: 0,
        };
      }

      // Run discovery
      const result = runCausalDiscovery(
        signals.map((s: any) => ({
          source_domain: s.source_domain,
          signal_type: s.signal_type,
          signal_value: s.signal_value,
          signal_timestamp: s.created_at,
        })),
        organizationId,
        {
          lookbackDays: fullConfig.lookbackDays,
          minObservations: fullConfig.minObservations,
        }
      );

      // Compare with previous run
      const { data: previousRelationships } = await supabase
        .from('causal_relationships_statistical')
        .select('*')
        .eq('organization_id', organizationId);

      const newRels = previousRelationships
        ? findNewRelationships(
            result.discovered_relationships,
            previousRelationships
          )
        : result.discovered_relationships;

      const lostRels = previousRelationships
        ? findLostRelationships(
            result.discovered_relationships,
            previousRelationships
          )
        : [];

      // Store new results
      if (result.discovered_relationships.length > 0) {
        await supabase.from('causal_relationships_statistical').upsert(
          result.discovered_relationships.map((r) => ({
            organization_id: r.organization_id,
            source_domain: r.source_domain,
            target_domain: r.target_domain,
            granger_f_statistic: r.granger_f_statistic,
            granger_p_value: r.granger_p_value,
            optimal_lag_days: r.optimal_lag_days,
            effect_size: r.effect_size,
            confidence_interval_lower: r.confidence_interval_lower,
            confidence_interval_upper: r.confidence_interval_upper,
            natural_language: r.natural_language,
            sample_size: r.sample_size,
            is_significant: r.is_significant,
            last_computed_at: new Date().toISOString(),
          })),
          { onConflict: 'organization_id,source_domain,target_domain' }
        );
      }

      return {
        newRelationships: newRels,
        lostRelationships: lostRels,
        totalDiscovered: result.discovered_relationships.length,
      };
    },

    // ── Feedback Loop Jobs ───────────────────────────────────────────

    /**
     * Process all pending prediction verifications.
     * Checks if predictions are due for verification and runs them.
     * Recommended: hourly via cron.
     */
    async runPendingVerifications(organizationId: string): Promise<{
      verificationsProcessed: number;
    }> {
      const feedbackLoop = createFeedbackLoop(fullConfig.feedbackLoop);
      const count = await feedbackLoop.processPendingVerifications(
        supabase,
        organizationId
      );
      return { verificationsProcessed: count };
    },

    /**
     * Update all relationship weights based on prediction accuracy.
     * Re-calibrates causal edge weights using verified predictions.
     * Recommended: daily via cron (after verifications).
     */
    async runWeightUpdates(organizationId: string): Promise<{
      weightsUpdated: WeightUpdate[];
      degradingRelationships: RelationshipAccuracyMetrics[];
    }> {
      const feedbackLoop = createFeedbackLoop(fullConfig.feedbackLoop);

      const weightsUpdated = await feedbackLoop.updateAllWeights(
        supabase,
        organizationId
      );

      const degradingRelationships = await feedbackLoop.findDegradingRelationships(
        supabase,
        organizationId
      );

      return { weightsUpdated, degradingRelationships };
    },

    // ── Continuous Learner Jobs ──────────────────────────────────────

    /**
     * Apply evidence decay to the causal graph.
     * Weakens old evidence so the graph stays fresh and responsive.
     * Recommended: daily via cron.
     */
    async runEvidenceDecay(organizationId: string): Promise<{
      edgesDecayed: number;
      edgesRemoved: number;
    }> {
      const dag = await loadDAGFromDatabase(supabase, organizationId);
      const learner = createContinuousLearner(dag);
      const updates = learner.applyEvidenceDecay();

      return {
        edgesDecayed: updates.filter(
          (u) => u.updateType === 'edge_weaken'
        ).length,
        edgesRemoved: updates.filter(
          (u) => u.updateType === 'edge_remove'
        ).length,
      };
    },

    // ── Threshold Optimizer Jobs ─────────────────────────────────────

    /**
     * Optimize all signal thresholds using ROC analysis.
     * Finds the best cutoff for each signal type based on outcomes.
     * Recommended: weekly via cron.
     */
    async runThresholdOptimization(organizationId: string): Promise<{
      results: ThresholdOptimizationResult[];
      updatesApplied: number;
    }> {
      const optimizer = createThresholdOptimizer(fullConfig.thresholdOptimizer);
      const results = await optimizer.optimizeAllThresholds(
        supabase,
        organizationId
      );

      // Auto-apply high-confidence updates
      const highConfidenceUpdates = results.filter(
        (r) => r.shouldUpdate && r.confidence === 'high'
      );

      if (highConfidenceUpdates.length > 0) {
        await optimizer.applyUpdates(
          supabase,
          organizationId,
          highConfidenceUpdates
        );
      }

      return {
        results,
        updatesApplied: highConfidenceUpdates.length,
      };
    },

    // ── Combined Daily Job ───────────────────────────────────────────

    /**
     * Run all daily maintenance jobs in sequence.
     * A single entry point for cron: verifications → weights → decay → discovery.
     * Recommended: once daily via cron.
     */
    async runAllDailyJobs(organizationId: string): Promise<{
      verifications: { verificationsProcessed: number };
      weights: { weightsUpdated: WeightUpdate[]; degradingRelationships: RelationshipAccuracyMetrics[] };
      decay: { edgesDecayed: number; edgesRemoved: number };
      discovery: { newRelationships: CausalRelationship[]; lostRelationships: CausalRelationship[]; totalDiscovered: number };
    }> {
      // 1. Process pending verifications first
      const verifications = await this.runPendingVerifications(organizationId);

      // 2. Update weights (needs verifications to be current)
      const weights = await this.runWeightUpdates(organizationId);

      // 3. Apply evidence decay
      const decay = await this.runEvidenceDecay(organizationId);

      // 4. Run causal discovery (benefits from fresh weights)
      const discovery = await this.runDailyCausalDiscovery(organizationId);

      return { verifications, weights, decay, discovery };
    },
  };
}
