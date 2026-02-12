/**
 * Scheduled Jobs
 *
 * Cron-compatible functions for periodic maintenance tasks.
 * Designed to be called from Supabase cron or pg_cron.
 *
 * Jobs:
 * - Daily causal discovery (delegates to consolidation engine — single source of truth)
 * - Feedback loop: pending verification processing
 * - Feedback loop: relationship weight updates
 * - Continuous learner: evidence decay
 * - Threshold optimizer: adaptive signal threshold tuning
 * - Data retention: cleanup stale signals, predictions, weight history
 * - Upstream federation: promote anonymized knowledge to core brain
 *
 * Production hardening:
 * - Per-job timeout with configurable limit
 * - Promise.allSettled for independent jobs (one failure never kills others)
 * - Structured error results per job
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
import { createUpstreamPromoter, type UpstreamPromotionResult } from '../federation/upstream-promoter';

// ============================================================================
// TYPES
// ============================================================================

/** Result wrapper: every job returns data OR an error string — never throws from runAllDailyJobs */
export type JobResult<T> = T | { error: string };

export interface ScheduledJobsConfig {
  /** Lookback window for causal discovery (default: 90 days) */
  lookbackDays: number;
  /** Minimum observations per domain (default: 30) */
  minObservations: number;
  /** Feedback loop configuration */
  feedbackLoop?: Partial<FeedbackLoopConfig>;
  /** Threshold optimizer configuration */
  thresholdOptimizer?: Partial<ThresholdOptimizerConfig>;
  /** Per-job timeout in milliseconds (default: 300000 = 5 minutes) */
  jobTimeoutMs?: number;
}

/** Result of data retention cleanup */
export interface DataRetentionResult {
  signalsDeleted: number;
  predictionsDeleted: number;
  weightsDeleted: number;
  memoriesDeleted: number;
  eventsDeleted: number;
}

const DEFAULT_CONFIG: ScheduledJobsConfig = {
  lookbackDays: 90,
  minObservations: 5, // Lowered: activate when data is sufficient, not after arbitrary count
};

// ============================================================================
// JOBS
// ============================================================================

/**
 * Wrap a promise with a timeout. Rejects with descriptive error if exceeded.
 */
function withTimeout<T>(promise: Promise<T>, label: string, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Job "${label}" timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    promise.then(
      (val) => { clearTimeout(timer); resolve(val); },
      (err) => { clearTimeout(timer); reject(err); }
    );
  });
}

/**
 * Safely run a job: wraps in timeout + try/catch → returns data or { error }.
 */
async function safeRun<T>(fn: () => Promise<T>, label: string, timeoutMs: number): Promise<JobResult<T>> {
  try {
    return await withTimeout(fn(), label, timeoutMs);
  } catch (err: any) {
    return { error: `[${label}] ${err.message || String(err)}` };
  }
}

/**
 * Create a scheduled jobs runner
 */
export function createScheduledJobs(
  supabase: SupabaseClient,
  config: Partial<ScheduledJobsConfig> = {}
) {
  const fullConfig = { ...DEFAULT_CONFIG, ...config };
  const jobTimeout = fullConfig.jobTimeoutMs ?? 300_000; // 5 min default

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
      // Fetch ALL signals with pagination — Supabase default limit is 1000 rows
      const allSignals: any[] = [];
      const PAGE_SIZE = 1000; // Supabase default max per request
      let offset = 0;
      let hasMore = true;

      while (hasMore) {
        const { data, error: fetchError } = await supabase
          .from('cross_domain_signals')
          .select('source_domain, signal_type, signal_value, signal_timestamp, created_at')
          .eq('organization_id', organizationId)
          .order('signal_timestamp', { ascending: true })
          .range(offset, offset + PAGE_SIZE - 1);

        if (fetchError || !data || data.length === 0) {
          hasMore = false;
        } else {
          allSignals.push(...data);
          offset += data.length;
          if (data.length < PAGE_SIZE) hasMore = false;
        }
      }

      const signals = allSignals;
      if (signals.length === 0) {
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
          signal_timestamp: s.signal_timestamp || s.created_at,
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
          result.discovered_relationships.map((r) => {
            const row: Record<string, unknown> = {
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
            };
            // Confounder metadata from apex discovery
            if (r.knockout_score !== undefined) row.knockout_score = r.knockout_score;
            if (r.is_likely_confounded !== undefined) row.is_likely_confounded = r.is_likely_confounded;
            if (r.coefficient_sign !== undefined) row.coefficient_sign = r.coefficient_sign;
            if (r.discovery_method !== undefined) row.discovery_method = r.discovery_method;
            return row;
          }),
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
      const dag = await loadDAGFromDatabase(supabase, organizationId, { includeCoreDAG: true });
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

    // ── Upstream Federation Job ─────────────────────────────────────

    /**
     * Promote anonymized org knowledge upstream to the core brain.
     * Respects per-org federation settings (default: ON).
     * All data is PII-sanitized before promotion.
     * Recommended: daily via cron (after discovery).
     */
    async runUpstreamFederation(organizationId: string): Promise<UpstreamPromotionResult> {
      const promoter = createUpstreamPromoter(supabase, organizationId);
      return promoter.promoteKnowledge();
    },

    // ── Data Retention Job ────────────────────────────────────────────

    /**
     * Clean up stale data based on retention policies.
     * Prevents unbounded table growth in production.
     * Recommended: daily via cron.
     */
    async runDataRetention(_organizationId: string): Promise<DataRetentionResult> {
      const retentionDays = {
        signals: 180,
        predictions: 365,
        weightHistory: 90,
        memory: 365,
        events: 30,
      };

      let signalsDeleted = 0;
      let predictionsDeleted = 0;
      let weightsDeleted = 0;
      let memoriesDeleted = 0;
      let eventsDeleted = 0;

      // cross_domain_signals: keep 180 days
      const signalsCutoff = new Date(Date.now() - retentionDays.signals * 24 * 60 * 60 * 1000).toISOString();
      const { count: sigCount } = await supabase
        .from('cross_domain_signals')
        .delete({ count: 'exact' })
        .lt('created_at', signalsCutoff);
      signalsDeleted = sigCount ?? 0;

      // prediction_records: keep 365 days
      try {
        const predCutoff = new Date(Date.now() - retentionDays.predictions * 24 * 60 * 60 * 1000).toISOString();
        const { count: predCount } = await supabase
          .from('prediction_records')
          .delete({ count: 'exact' })
          .lt('created_at', predCutoff);
        predictionsDeleted = predCount ?? 0;
      } catch { /* table may not exist yet */ }

      // weight_update_history: keep 90 days
      try {
        const weightCutoff = new Date(Date.now() - retentionDays.weightHistory * 24 * 60 * 60 * 1000).toISOString();
        const { count: weightCount } = await supabase
          .from('weight_update_history')
          .delete({ count: 'exact' })
          .lt('created_at', weightCutoff);
        weightsDeleted = weightCount ?? 0;
      } catch { /* table may not exist yet */ }

      // ai_memory: archive low-importance memories older than 365 days
      try {
        const memCutoff = new Date(Date.now() - retentionDays.memory * 24 * 60 * 60 * 1000).toISOString();
        const { count: memCount } = await supabase
          .from('ai_memory')
          .delete({ count: 'exact' })
          .lt('created_at', memCutoff)
          .lt('importance', 0.3);
        memoriesDeleted = memCount ?? 0;
      } catch { /* table may not exist yet */ }

      // causal_event_stream: keep 30 days
      try {
        const eventCutoff = new Date(Date.now() - retentionDays.events * 24 * 60 * 60 * 1000).toISOString();
        const { count: eventCount } = await supabase
          .from('causal_event_stream')
          .delete({ count: 'exact' })
          .lt('created_at', eventCutoff);
        eventsDeleted = eventCount ?? 0;
      } catch { /* table may not exist yet */ }

      return { signalsDeleted, predictionsDeleted, weightsDeleted, memoriesDeleted, eventsDeleted };
    },

    // ── Combined Daily Job ───────────────────────────────────────────

    /**
     * Run all daily maintenance jobs with fault isolation.
     *
     * Production hardening:
     * - Each job is wrapped in timeout + try/catch
     * - Independent jobs run in parallel via Promise.allSettled
     * - One job failure NEVER kills other jobs
     * - Returns structured result with success data or error string per job
     *
     * Execution order:
     * Phase A (sequential — dependency chain):   verifications → weights
     * Phase B (parallel — independent):          decay + discovery
     * Phase C (parallel — post-discovery):       federation + data retention
     */
    async runAllDailyJobs(organizationId: string): Promise<{
      verifications: JobResult<{ verificationsProcessed: number }>;
      weights: JobResult<{ weightsUpdated: WeightUpdate[]; degradingRelationships: RelationshipAccuracyMetrics[] }>;
      decay: JobResult<{ edgesDecayed: number; edgesRemoved: number }>;
      discovery: JobResult<{ newRelationships: CausalRelationship[]; lostRelationships: CausalRelationship[]; totalDiscovered: number }>;
      federation: JobResult<UpstreamPromotionResult>;
      retention: JobResult<DataRetentionResult>;
    }> {
      // Phase A: Sequential dependency chain (verifications → weights)
      const verifications = await safeRun(
        () => this.runPendingVerifications(organizationId),
        'verifications', jobTimeout
      );
      const weights = await safeRun(
        () => this.runWeightUpdates(organizationId),
        'weights', jobTimeout
      );

      // Phase B: Independent jobs (decay + discovery in parallel)
      const [decaySettled, discoverySettled] = await Promise.allSettled([
        safeRun(() => this.runEvidenceDecay(organizationId), 'decay', jobTimeout),
        safeRun(() => this.runDailyCausalDiscovery(organizationId), 'discovery', jobTimeout),
      ]);
      const decay = decaySettled.status === 'fulfilled'
        ? decaySettled.value
        : { error: `[decay] ${(decaySettled as PromiseRejectedResult).reason?.message || 'unknown'}` };
      const discovery = discoverySettled.status === 'fulfilled'
        ? discoverySettled.value
        : { error: `[discovery] ${(discoverySettled as PromiseRejectedResult).reason?.message || 'unknown'}` };

      // Phase C: Post-discovery jobs (federation + retention in parallel)
      const [fedSettled, retentionSettled] = await Promise.allSettled([
        safeRun(() => this.runUpstreamFederation(organizationId), 'federation', jobTimeout),
        safeRun(() => this.runDataRetention(organizationId), 'retention', jobTimeout),
      ]);
      const federation = fedSettled.status === 'fulfilled'
        ? fedSettled.value
        : { error: `[federation] ${(fedSettled as PromiseRejectedResult).reason?.message || 'unknown'}` };
      const retention = retentionSettled.status === 'fulfilled'
        ? retentionSettled.value
        : { error: `[retention] ${(retentionSettled as PromiseRejectedResult).reason?.message || 'unknown'}` };

      return { verifications, weights, decay, discovery, federation, retention };
    },
  };
}
