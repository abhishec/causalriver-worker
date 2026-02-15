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
import { streamInBatches } from '../infra/streaming-batcher';
import { createBrainPipeline, type BrainCycleReport } from './brain-pipeline';

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
      // Cursor-based streaming: OOM-safe at 10M+ signals
      // Uses id-based cursor instead of offset (O(1) vs O(n) per page)
      const allSignals: any[] = [];
      await streamInBatches(
        async (cursor, batchSize) => {
          let query = supabase
            .from('cross_domain_signals')
            .select('id, source_domain, signal_type, signal_value, signal_timestamp, created_at')
            .eq('organization_id', organizationId)
            .order('id', { ascending: true })
            .limit(batchSize);

          if (cursor) {
            query = query.gt('id', cursor);
          }

          const { data, error: fetchError } = await query;
          if (fetchError || !data || data.length === 0) {
            return { items: [], nextCursor: null, hasMore: false };
          }
          return {
            items: data,
            nextCursor: data[data.length - 1].id,
            hasMore: data.length === batchSize,
          };
        },
        async (batch) => { allSignals.push(...batch); },
        { batchSize: 1000, batchDelayMs: 10 },
      );

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

    // ── Training Pack Application Job ──────────────────────────────────

    /**
     * Apply pending custom training packs to the brain.
     *
     * Training packs created via `/api/training-packs` are stored with
     * `status: 'pending'`. This job processes them by:
     * 1. Loading pending packs for the org
     * 2. Inserting causal chains as `causal_relationships_statistical` edges
     * 3. Inserting business rules as `ai_memory` entries
     * 4. Marking packs as 'applied'
     *
     * Recommended: daily via cron (after discovery).
     */
    async runTrainingPackApplication(organizationId: string): Promise<{ packsApplied: number; chainsCreated: number; rulesCreated: number; errors: string[] }> {
      let packsApplied = 0;
      let chainsCreated = 0;
      let rulesCreated = 0;
      const errors: string[] = [];

      // Fetch pending training packs for this org
      const { data: pendingPacks, error: fetchErr } = await supabase
        .from('custom_training_packs')
        .select('id, pack_data, created_by')
        .eq('organization_id', organizationId)
        .eq('status', 'pending')
        .order('created_at', { ascending: true })
        .limit(20);

      if (fetchErr || !pendingPacks || pendingPacks.length === 0) {
        return { packsApplied: 0, chainsCreated: 0, rulesCreated: 0, errors: fetchErr ? [fetchErr.message] : [] };
      }

      for (const pack of pendingPacks) {
        try {
          const packData = pack.pack_data as { chains?: Array<Record<string, unknown>>; rules?: Array<Record<string, unknown>> } | null;
          if (!packData) continue;

          // Apply causal chains as statistical relationships
          if (packData.chains && Array.isArray(packData.chains)) {
            for (const chain of packData.chains) {
              const { error: insertErr } = await supabase
                .from('causal_relationships_statistical')
                .upsert({
                  organization_id: organizationId,
                  source_domain: chain.source_domain || chain.source || 'unknown',
                  target_domain: chain.target_domain || chain.target || 'unknown',
                  source_entity: chain.source_metric || chain.source_entity || '',
                  target_entity: chain.target_metric || chain.target_entity || '',
                  effect_size: chain.effect_size || chain.strength || 0.5,
                  optimal_lag_days: chain.lag_days || chain.optimal_lag_days || 7,
                  granger_p_value: chain.p_value || chain.granger_p_value || 0.05,
                  granger_f_statistic: chain.f_statistic || 0,
                  sample_size: chain.sample_size || 1,
                  is_significant: true,
                  natural_language: chain.description || chain.natural_language || null,
                  discovery_method: 'training_pack',
                  created_at: new Date().toISOString(),
                  updated_at: new Date().toISOString(),
                }, { onConflict: 'organization_id,source_domain,target_domain,source_entity,target_entity' });

              if (insertErr) {
                errors.push(`Chain insert error: ${insertErr.message}`);
              } else {
                chainsCreated++;
              }
            }
          }

          // Apply business rules as ai_memory entries
          if (packData.rules && Array.isArray(packData.rules)) {
            for (const rule of packData.rules) {
              try {
                const { error: memErr } = await supabase.from('ai_memory').insert({
                  organization_id: organizationId,
                  memory_type: 'business_rule',
                  domain: (rule.domain as string) || 'general',
                  content: (rule.rule as string) || (rule.content as string) || JSON.stringify(rule),
                  importance: (rule.importance as number) || 0.7,
                  metadata: {
                    source: 'training_pack',
                    packId: pack.id,
                    title: rule.title || rule.name || '',
                    createdBy: pack.created_by,
                  },
                  created_at: new Date().toISOString(),
                  updated_at: new Date().toISOString(),
                });
                if (memErr) {
                  errors.push(`Memory insert error: ${memErr.message}`);
                } else {
                  rulesCreated++;
                }
              } catch (memErr: any) {
                errors.push(`Rule upsert error: ${memErr.message}`);
              }
            }
          }

          // Mark pack as applied
          await supabase
            .from('custom_training_packs')
            .update({ status: 'applied', applied_at: new Date().toISOString() })
            .eq('id', pack.id);

          packsApplied++;
        } catch (packErr: any) {
          errors.push(`Pack ${pack.id}: ${packErr.message}`);
        }
      }

      return { packsApplied, chainsCreated, rulesCreated, errors };
    },

    // ── Prediction Outcome Verification Job ──────────────────────────

    /**
     * Verify prediction outcomes by matching predictions against actual signal data.
     * Closes the calibration feedback loop: prediction → wait → verify → recalibrate.
     * Recommended: daily via cron.
     */
    async runPredictionOutcomeVerification(organizationId: string): Promise<{
      predictionsChecked: number;
      outcomesRecorded: number;
      correctPredictions: number;
      incorrectPredictions: number;
    }> {
      let predictionsChecked = 0;
      let outcomesRecorded = 0;
      let correctPredictions = 0;
      let incorrectPredictions = 0;

      try {
        // Find unverified predictions that are at least 7 days old (give outcomes time to materialize)
        const verificationCutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
        const { data: pendingPredictions, error: fetchErr } = await supabase
          .from('prediction_records')
          .select('*')
          .eq('organization_id', organizationId)
          .is('verified_at', null)
          .lt('created_at', verificationCutoff)
          .limit(100); // Process in batches

        if (fetchErr || !pendingPredictions || pendingPredictions.length === 0) {
          return { predictionsChecked: 0, outcomesRecorded: 0, correctPredictions: 0, incorrectPredictions: 0 };
        }

        for (const pred of pendingPredictions) {
          predictionsChecked++;

          try {
            // Query actual signals for this entity in the period after prediction
            const { data: actualSignals } = await supabase
              .from('cross_domain_signals')
              .select('signal_value, signal_timestamp')
              .eq('organization_id', organizationId)
              .eq('source_domain', pred.domain)
              .eq('signal_type', pred.entity_type)
              .gt('created_at', pred.created_at)
              .order('created_at', { ascending: false })
              .limit(10);

            if (!actualSignals || actualSignals.length === 0) continue;

            // Compare predicted value to actual values
            const latestActual = actualSignals[0];
            const actualValue = latestActual.signal_value;
            const predictedValue = pred.predicted_value;

            // Determine if prediction was correct within a tolerance
            let wasCorrect = false;
            if (predictedValue != null && actualValue != null) {
              const tolerance = Math.abs(predictedValue) * 0.2; // 20% tolerance
              wasCorrect = Math.abs(actualValue - predictedValue) <= Math.max(tolerance, 0.01);
            } else if (pred.predicted_outcome && pred.predicted_outcome !== '') {
              // Qualitative prediction — mark as needing manual review
              wasCorrect = false;
            }

            // Update prediction_records with outcome
            await supabase
              .from('prediction_records')
              .update({
                actual_value: actualValue,
                actual_outcome: `Signal value: ${actualValue} (${actualSignals.length} signals observed)`,
                was_correct: wasCorrect,
                verified_at: new Date().toISOString(),
              })
              .eq('id', pred.id);

            outcomesRecorded++;
            if (wasCorrect) correctPredictions++;
            else incorrectPredictions++;
          } catch { /* individual prediction failure — continue */ }
        }
      } catch { /* table may not exist yet */ }

      return { predictionsChecked, outcomesRecorded, correctPredictions, incorrectPredictions };
    },

    // ── Data Retention Job ────────────────────────────────────────────

    /**
     * Clean up stale data based on retention policies.
     * Prevents unbounded table growth in production.
     * Recommended: daily via cron.
     */
    async runDataRetention(organizationId: string): Promise<DataRetentionResult> {
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

      // CRITICAL: All delete operations MUST be scoped to organizationId
      // to prevent cross-org data deletion in multi-tenant environment.

      // cross_domain_signals: keep 180 days
      const signalsCutoff = new Date(Date.now() - retentionDays.signals * 24 * 60 * 60 * 1000).toISOString();
      const { count: sigCount } = await supabase
        .from('cross_domain_signals')
        .delete({ count: 'exact' })
        .eq('organization_id', organizationId)
        .lt('created_at', signalsCutoff);
      signalsDeleted = sigCount ?? 0;

      // prediction_records: keep 365 days
      try {
        const predCutoff = new Date(Date.now() - retentionDays.predictions * 24 * 60 * 60 * 1000).toISOString();
        const { count: predCount } = await supabase
          .from('prediction_records')
          .delete({ count: 'exact' })
          .eq('organization_id', organizationId)
          .lt('created_at', predCutoff);
        predictionsDeleted = predCount ?? 0;
      } catch { /* table may not exist yet */ }

      // weight_update_history: keep 90 days
      try {
        const weightCutoff = new Date(Date.now() - retentionDays.weightHistory * 24 * 60 * 60 * 1000).toISOString();
        const { count: weightCount } = await supabase
          .from('weight_update_history')
          .delete({ count: 'exact' })
          .eq('organization_id', organizationId)
          .lt('created_at', weightCutoff);
        weightsDeleted = weightCount ?? 0;
      } catch { /* table may not exist yet */ }

      // ai_memory: archive low-importance memories older than 365 days
      try {
        const memCutoff = new Date(Date.now() - retentionDays.memory * 24 * 60 * 60 * 1000).toISOString();
        const { count: memCount } = await supabase
          .from('ai_memory')
          .delete({ count: 'exact' })
          .eq('organization_id', organizationId)
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
          .eq('organization_id', organizationId)
          .lt('created_at', eventCutoff);
        eventsDeleted = eventCount ?? 0;
      } catch { /* table may not exist yet */ }

      return { signalsDeleted, predictionsDeleted, weightsDeleted, memoriesDeleted, eventsDeleted };
    },

    // ── Brain Consolidation Cycle Job ────────────────────────────────

    /**
     * Run a full brain consolidation cycle (sleep + dream + learn + cognitive stack).
     *
     * This is THE missing link: scheduled jobs ran causal discovery but never
     * triggered the full brain pipeline. This job instantiates the pipeline,
     * runs a full cycle (consolidation → DMN → learning → cognitive stack L3-L15),
     * persists LEAP states, and returns the cycle report.
     *
     * Recommended: daily via cron (after connector sync completes).
     * For design partners with 500K+ codebase + 1M+ Slack: run every 6 hours.
     */
    async runConsolidationCycle(organizationId: string): Promise<{
      status: string;
      totalDurationMs: number;
      signalsProcessed: number;
      causalEdgesDiscovered: number;
      cognitiveStackRan: boolean;
      leapStatesPersisted: boolean;
      errors: string[];
    }> {
      const pipeline = createBrainPipeline({
        supabase,
        organizationId,
        verbose: true,
      });

      const report: BrainCycleReport = await pipeline.runFullCycle();

      return {
        status: report.status,
        totalDurationMs: report.totalDurationMs,
        signalsProcessed: report.consolidation?.report.stats.signalsProcessed ?? 0,
        causalEdgesDiscovered: report.consolidation?.report.stats.causalEdgesDiscovered ?? 0,
        cognitiveStackRan: report.cognitiveStack !== null,
        leapStatesPersisted: report.cognitiveStack !== null, // persisted if cognitive stack ran
        errors: report.errors,
      };
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
      consolidation: JobResult<{ status: string; totalDurationMs: number; signalsProcessed: number; causalEdgesDiscovered: number; cognitiveStackRan: boolean; leapStatesPersisted: boolean; errors: string[] }>;
      federation: JobResult<UpstreamPromotionResult>;
      retention: JobResult<DataRetentionResult>;
      trainingPacks: JobResult<{ packsApplied: number; chainsCreated: number; rulesCreated: number; errors: string[] }>;
      predictionOutcomes: JobResult<{ predictionsChecked: number; outcomesRecorded: number; correctPredictions: number; incorrectPredictions: number }>;
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

      // Phase B: Independent jobs (decay + discovery + consolidation in parallel)
      // Consolidation runs the full brain pipeline: consolidation → DMN → learning → L3-L15 cognitive stack
      // Uses longer timeout (10 min) since it's the heaviest job
      const consolidationTimeout = Math.max(jobTimeout, 600_000); // At least 10 min for large datasets
      const [decaySettled, discoverySettled, consolidationSettled] = await Promise.allSettled([
        safeRun(() => this.runEvidenceDecay(organizationId), 'decay', jobTimeout),
        safeRun(() => this.runDailyCausalDiscovery(organizationId), 'discovery', jobTimeout),
        safeRun(() => this.runConsolidationCycle(organizationId), 'consolidation', consolidationTimeout),
      ]);
      const decay = decaySettled.status === 'fulfilled'
        ? decaySettled.value
        : { error: `[decay] ${(decaySettled as PromiseRejectedResult).reason?.message || 'unknown'}` };
      const discovery = discoverySettled.status === 'fulfilled'
        ? discoverySettled.value
        : { error: `[discovery] ${(discoverySettled as PromiseRejectedResult).reason?.message || 'unknown'}` };
      const consolidation = consolidationSettled.status === 'fulfilled'
        ? consolidationSettled.value
        : { error: `[consolidation] ${(consolidationSettled as PromiseRejectedResult).reason?.message || 'unknown'}` };

      // Phase C: Post-discovery jobs (federation + retention + training packs + prediction outcomes in parallel)
      const [fedSettled, retentionSettled, trainingPacksSettled, predOutcomeSettled] = await Promise.allSettled([
        safeRun(() => this.runUpstreamFederation(organizationId), 'federation', jobTimeout),
        safeRun(() => this.runDataRetention(organizationId), 'retention', jobTimeout),
        safeRun(() => this.runTrainingPackApplication(organizationId), 'trainingPacks', jobTimeout),
        safeRun(() => this.runPredictionOutcomeVerification(organizationId), 'predictionOutcomes', jobTimeout),
      ]);
      const federation = fedSettled.status === 'fulfilled'
        ? fedSettled.value
        : { error: `[federation] ${(fedSettled as PromiseRejectedResult).reason?.message || 'unknown'}` };
      const retention = retentionSettled.status === 'fulfilled'
        ? retentionSettled.value
        : { error: `[retention] ${(retentionSettled as PromiseRejectedResult).reason?.message || 'unknown'}` };
      const trainingPacks = trainingPacksSettled.status === 'fulfilled'
        ? trainingPacksSettled.value
        : { error: `[trainingPacks] ${(trainingPacksSettled as PromiseRejectedResult).reason?.message || 'unknown'}` };
      const predictionOutcomes = predOutcomeSettled.status === 'fulfilled'
        ? predOutcomeSettled.value
        : { error: `[predictionOutcomes] ${(predOutcomeSettled as PromiseRejectedResult).reason?.message || 'unknown'}` };

      return { verifications, weights, decay, discovery, consolidation, federation, retention, trainingPacks, predictionOutcomes };
    },
  };
}
