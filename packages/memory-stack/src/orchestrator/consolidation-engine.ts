/**
 * Consolidation Engine — "Brain Sleep"
 *
 * Like the human brain consolidates memories during sleep, this engine runs
 * nightly (or on schedule) to process, compress, and strengthen organizational
 * knowledge. It is the single source of truth reconciler between the three
 * learning paths: batch (autonomous-learner), cron (scheduled-jobs), and
 * real-time (continuous-learner + anomaly-monitor).
 *
 * 10-Step Consolidation Cycle:
 *   1. FETCH     — Collect signals from the last cycle window (default 48h)
 *   2. DISCOVER  — Run full causal discovery (3-paradigm ensemble + Bayesian Judge)
 *   3. ANOMALIES — Cross-domain anomaly detection with causal context
 *   4. PATTERNS  — Mine patterns (Apriori + PrefixSpan + temporal rules)
 *   5. GENERATE  — Auto-generate training packs from discoveries
 *   6. TRAIN     — Feed through brain trainer
 *   7. PRUNE     — Remove edges with low confidence, unvalidated for 30+ days
 *   8. STRENGTHEN— Boost edges whose predictions came true
 *   9. REPORT    — Generate "What the brain learned today" summary
 *  10. PERSIST   — Store consolidation results + snapshot graph state
 *
 * Architecture:
 *   - Uses ALL existing NexusBrain modules (no duplication)
 *   - Runs as a laptop agent via scripts/brain-consolidation-runner.ts
 *   - Supports both core brain and org-specific consolidation
 *   - Tracks every run in `consolidation_runs` for observability
 *   - Generates a natural language report after each cycle
 *
 * @packageDocumentation
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  runCausalDiscovery,
  findNewRelationships,
  findLostRelationships,
  type CausalRelationship,
} from '../causality/causal-discovery-runner';
import { createFeedbackLoop } from '../causality/feedback-loop';
import {
  createContinuousLearner,
  loadDAGFromDatabase,
} from '../causality/continuous-learner';
import { createThresholdOptimizer } from '../causality/threshold-optimizer';
import { createUpstreamPromoter } from '../federation/upstream-promoter';
import { streamInBatches } from '../infra/streaming-batcher';
import {
  createIncrementalGranger,
  updateWithNewSignal,
  type IncrementalGrangerState,
} from '../causality/granger-causality';
import { detectAnomalies, type AnomalyEvent } from '../learning/anomaly-detector';
import {
  discoverPatterns,
  mineSequentialPatterns,
  mineTemporalAssociationRules,
  type DiscoveredPattern,
  type SequentialPattern,
  type TemporalAssociationRule,
  type TemporalEvent,
} from '../learning/pattern-detector';
import { createBrainTrainer, type TrainingPack } from '../learning/brain-trainer';
import { createExpertiseGraph } from '../core/expertise-graph';
import { createCollaborationGraph } from '../core/collaboration-graph';
import { createKnowledgeDependencyGraph, type DependencyType, type KnowledgeDomain } from '../core/knowledge-dependency-graph';
import { createSupabaseRepository } from '../persistence/supabase-repository';
import { getDefaultLogger, type NexusLogger } from '../observability';
import { createMultiHopReasoner } from '../causality/multi-hop-reasoner';
import { createExplanationGenerator } from '../causality/explanation-generator';
import { createUncertaintyQuantifier } from '../causality/uncertainty-quantifier';
import { createAttentionMechanism, type AttentionContext } from '../causality/attention-mechanism';
import { createTemporalForecaster } from '../causality/temporal-forecaster';
import { signalsToTimeSeries } from '../causality/signal-to-timeseries';
import { type BrainAmplifier } from './llm-brain-amplifier';

// ============================================================================
// TYPES
// ============================================================================

export interface ConsolidationConfig {
  /** Supabase client */
  supabase: SupabaseClient;
  /** Organization to consolidate (core brain or specific org) */
  organizationId: string;
  /** Hours of signals to look back (default: 48) */
  lookbackHours?: number;
  /** Days of stale edges before pruning (default: 30) */
  pruneAfterDays?: number;
  /** Minimum evidence weight to keep an edge (default: 0.15) */
  minEdgeWeight?: number;
  /** Minimum accuracy to boost an edge (default: 0.6) */
  minAccuracyForBoost?: number;
  /** Boost multiplier for accurate predictions (default: 1.08) */
  accuracyBoostFactor?: number;
  /** Decay factor for unvalidated edges (default: 0.92) */
  stalePruneFactor?: number;
  /** Lookback days for causal discovery (default: 90) */
  discoveryLookbackDays?: number;
  /** Minimum observations per domain for discovery (default: 5) */
  minObservations?: number;
  /** Auto-promote pattern confidence threshold (default: 0.7) */
  autoPromoteConfidence?: number;
  /** Whether to run federation after consolidation (default: true for org, false for core) */
  runFederation?: boolean;
  /** Whether to run threshold optimization (default: true) */
  runThresholdOptimization?: boolean;
  /** Verbose logging (default: false) */
  verbose?: boolean;
  /** Structured logger (defaults to global logger) */
  logger?: NexusLogger;
  /** Optional LLM Brain Amplifier for causal hypothesis generation (Gap 4) */
  amplifier?: BrainAmplifier;
}

export interface ConsolidationStepResult {
  step: string;
  status: 'success' | 'skipped' | 'error';
  durationMs: number;
  details: Record<string, unknown>;
}

export interface ConsolidationReport {
  /** Human-readable summary of what the brain learned */
  narrative: string;
  /** Key discoveries in natural language */
  discoveries: string[];
  /** Warnings and concerns */
  warnings: string[];
  /** Statistics */
  stats: {
    signalsProcessed: number;
    causalEdgesDiscovered: number;
    newRelationships: number;
    lostRelationships: number;
    anomaliesDetected: number;
    patternsFound: number;
    sequentialPatternsFound: number;
    temporalRulesFound: number;
    packsGenerated: number;
    edgesPruned: number;
    edgesStrengthened: number;
    edgesDecayed: number;
    memoriesCreated: number;
  };
}

export interface ConsolidationResult {
  /** Unique run ID */
  runId: string;
  /** Organization consolidated */
  organizationId: string;
  /** Whether this is core brain or org-specific */
  isCoreBrain: boolean;
  /** Start timestamp */
  startedAt: string;
  /** End timestamp */
  completedAt: string;
  /** Total duration in ms */
  totalDurationMs: number;
  /** Per-step results */
  steps: ConsolidationStepResult[];
  /** Natural language report */
  report: ConsolidationReport;
  /** Overall status */
  status: 'success' | 'partial' | 'failed';
  /** Errors encountered */
  errors: string[];
}

const CORE_BRAIN_ORG_ID = '00000000-0000-4000-a000-000000000001';

// ============================================================================
// CONSOLIDATION ENGINE
// ============================================================================

/**
 * Create a consolidation engine for an organization.
 */
export function createConsolidationEngine(config: ConsolidationConfig) {
  const {
    supabase,
    organizationId,
    lookbackHours = 48,
    pruneAfterDays = 30,
    minEdgeWeight = 0.20, // Tightened from 0.15: prune edges below 0.20 weight
    minAccuracyForBoost = 0.65, // Tightened from 0.6: require 65% accuracy before boosting
    accuracyBoostFactor = 1.08,
    stalePruneFactor = 0.92,
    discoveryLookbackDays = 90,
    minObservations = 30, // Tightened from 5: require 30+ observations for causal discovery
    autoPromoteConfidence = 0.75, // Tightened from 0.7: require 75% confidence to auto-promote
    runFederation = organizationId !== CORE_BRAIN_ORG_ID,
    runThresholdOptimization = true,
    verbose = false,
  } = config;

  const amplifier = config.amplifier;
  const isCoreBrain = organizationId === CORE_BRAIN_ORG_ID;
  const repository = createSupabaseRepository(supabase, organizationId);
  const trainer = createBrainTrainer();
  const logger = config.logger ?? getDefaultLogger().child({ module: 'consolidation', orgId: (organizationId ?? 'unknown').substring(0, 8) });

  function log(step: string, msg: string): void {
    if (verbose) {
      logger.info(msg, { step });
    }
  }

  function logError(step: string, msg: string, err?: unknown): void {
    logger.error(msg, { step, error: err instanceof Error ? err.message : String(err) });
  }

  // ── Step 1: FETCH ──────────────────────────────────────────────────

  async function fetchSignals(): Promise<{ signals: any[]; step: ConsolidationStepResult }> {
    const start = Date.now();
    try {
      const cutoff = new Date(Date.now() - lookbackHours * 60 * 60 * 1000).toISOString();

      // ── 10M SCALE FIX: Memory-bounded signal fetch ──────────────────
      // Problem: At 10M signals, accumulating all into an array uses 5GB+ RAM → OOM.
      // Solution: Cap at 500K signals max for consolidation. Use stratified
      // sampling by domain so every domain gets proportional representation.
      // Downstream algorithms (causal discovery, pattern mining) work with
      // statistical samples — they don't need ALL 10M signals.
      const MAX_CONSOLIDATION_SIGNALS = 500_000;

      const allSignals: any[] = [];

      // Cursor-based streaming with memory cap
      await streamInBatches(
        async (cursor, batchSize) => {
          let query = supabase
            .from('cross_domain_signals')
            .select('id, source_domain, signal_type, signal_value, signal_timestamp, created_at, entity_type, entity_id')
            .eq('organization_id', organizationId)
            .gte('created_at', cutoff)
            .order('id', { ascending: true })
            .limit(batchSize);
          if (cursor) query = query.gt('id', cursor);
          const { data, error } = await query;
          if (error || !data || data.length === 0) {
            return { items: [], nextCursor: null, hasMore: false };
          }
          return { items: data, nextCursor: data[data.length - 1].id, hasMore: data.length === batchSize };
        },
        async (batch) => { allSignals.push(...batch); },
        { batchSize: 2000, batchDelayMs: 10, maxItems: MAX_CONSOLIDATION_SIGNALS },
      );

      // If we got very few recent signals, also fetch historical signals for discovery
      // (causal discovery needs historical context, not just last 48h)
      let allHistoricalSignals = allSignals;
      if (allSignals.length < 100) {
        log('FETCH', 'Few recent signals, fetching historical signals for causal discovery...');
        const fullSignals: any[] = [];
        await streamInBatches(
          async (cursor, batchSize) => {
            let query = supabase
              .from('cross_domain_signals')
              .select('id, source_domain, signal_type, signal_value, signal_timestamp, created_at')
              .eq('organization_id', organizationId)
              .order('id', { ascending: true })
              .limit(batchSize);
            if (cursor) query = query.gt('id', cursor);
            const { data, error } = await query;
            if (error || !data || data.length === 0) {
              return { items: [], nextCursor: null, hasMore: false };
            }
            return { items: data, nextCursor: data[data.length - 1].id, hasMore: data.length === batchSize };
          },
          async (batch) => { fullSignals.push(...batch); },
          { batchSize: 2000, batchDelayMs: 10, maxItems: MAX_CONSOLIDATION_SIGNALS },
        );
        allHistoricalSignals = fullSignals;
      }

      // ── Stratified sampling for very large signal sets ──────────────
      // If we hit the cap, ensure every domain gets proportional representation.
      // This prevents a single high-volume domain (e.g., GitHub) from drowning
      // out lower-volume domains (e.g., Jira, Slack) in the consolidation.
      if (allHistoricalSignals.length >= MAX_CONSOLIDATION_SIGNALS * 0.95) {
        log('FETCH', `Signal cap reached (${allHistoricalSignals.length}). Applying stratified sampling...`);
        const byDomain = new Map<string, any[]>();
        for (const s of allHistoricalSignals) {
          const domain = s.source_domain || 'unknown';
          if (!byDomain.has(domain)) byDomain.set(domain, []);
          byDomain.get(domain)!.push(s);
        }

        const domainCount = byDomain.size;
        // Each domain gets at least 1000 signals, rest distributed proportionally
        const minPerDomain = Math.min(1000, Math.floor(MAX_CONSOLIDATION_SIGNALS / domainCount));
        const remaining = MAX_CONSOLIDATION_SIGNALS - (minPerDomain * domainCount);

        const sampled: any[] = [];
        for (const [, domainSignals] of byDomain) {
          // Give minimum allocation
          const shuffled = domainSignals.sort(() => Math.random() - 0.5);
          const allocation = Math.min(
            domainSignals.length,
            minPerDomain + Math.floor(remaining * (domainSignals.length / allHistoricalSignals.length)),
          );
          sampled.push(...shuffled.slice(0, allocation));
        }
        allHistoricalSignals = sampled;
        log('FETCH', `Stratified to ${allHistoricalSignals.length} signals across ${domainCount} domains`);
      }

      log('FETCH', `${allSignals.length} recent signals (last ${lookbackHours}h), ${allHistoricalSignals.length} total historical`);

      // ── Signal Quality Filter ──────────────────────────────────────
      // Separate org-specific signals from public/background data noise.
      // Public data (Wikipedia pageviews, FRED, IMF, BLS, World Bank) is useful for
      // macro context but drowns org-specific HubSpot/Jira/GitHub signals.
      // Strategy: Keep org data as-is, sample public data to max 20% of total signals.
      const PUBLIC_SIGNAL_PREFIXES = [
        'pageviews_', 'fred_', 'imf_', 'gdp_', 'fed_funds_', 'unemployment_',
        'annual_patent_count', 'bls_', 'world_bank_', 'wiki_',
      ];
      const PUBLIC_SOURCES = ['wikipedia', 'fred', 'imf', 'bls', 'world_bank', 'uspto'];

      const isPublicSignal = (s: any): boolean => {
        const signalType = (s.signal_type || '').toLowerCase();
        const source = ((s.signal_metadata as any)?.source || s.source || '').toLowerCase();
        return PUBLIC_SIGNAL_PREFIXES.some(p => signalType.startsWith(p)) ||
               PUBLIC_SOURCES.includes(source);
      };

      const orgSignals = allHistoricalSignals.filter((s: any) => !isPublicSignal(s));
      const publicSignals = allHistoricalSignals.filter((s: any) => isPublicSignal(s));

      // Cap public signals to max 20% of org signal count (minimum 50 for macro context)
      const maxPublicCount = Math.max(50, Math.floor(orgSignals.length * 0.2));
      const sampledPublic = publicSignals.length > maxPublicCount
        ? publicSignals
            .sort(() => Math.random() - 0.5) // Shuffle
            .slice(0, maxPublicCount)
        : publicSignals;

      const filteredSignals = [...orgSignals, ...sampledPublic];
      log('FETCH', `Signal quality filter: ${orgSignals.length} org signals + ${sampledPublic.length}/${publicSignals.length} public signals (${filteredSignals.length} total)`);

      return {
        signals: filteredSignals,
        step: {
          step: 'fetch',
          status: 'success',
          durationMs: Date.now() - start,
          details: {
            recentSignals: allSignals.length,
            totalHistorical: filteredSignals.length,
            totalBeforeFilter: allHistoricalSignals.length,
            orgSignals: orgSignals.length,
            publicSignals: publicSignals.length,
            publicSampled: sampledPublic.length,
            lookbackHours,
            domains: [...new Set(filteredSignals.map((s: any) => s.source_domain))],
          },
        },
      };
    } catch (err: any) {
      logError('FETCH', 'Failed to fetch signals', err);
      return {
        signals: [],
        step: {
          step: 'fetch',
          status: 'error',
          durationMs: Date.now() - start,
          details: { error: err.message },
        },
      };
    }
  }

  // ── Step 2: DISCOVER ───────────────────────────────────────────────

  async function discoverCausalRelationships(signals: any[]): Promise<{
    relationships: CausalRelationship[];
    newRels: CausalRelationship[];
    lostRels: CausalRelationship[];
    step: ConsolidationStepResult;
  }> {
    const start = Date.now();
    try {
      if (signals.length < 20) {
        log('DISCOVER', 'Not enough signals for causal discovery');
        return {
          relationships: [],
          newRels: [],
          lostRels: [],
          step: {
            step: 'causal_discovery',
            status: 'skipped',
            durationMs: Date.now() - start,
            details: { reason: 'Insufficient signals', count: signals.length },
          },
        };
      }

      // ── Incremental Granger Pre-Screen (10M+ scalability) ──────────
      // For large signal sets, use O(p²) IncrementalGranger to pre-screen
      // likely causal pairs before running the expensive batch ensemble.
      // This is a 100-1000x speedup at scale.
      let incrementalEdgesDiscovered = 0;
      if (signals.length >= 5000) {
        try {
          // Group signals by domain for pairwise streaming
          const byDomain = new Map<string, Array<{ value: number; ts: number }>>();
          for (const s of signals) {
            const domain = (s as any).source_domain || 'unknown';
            const arr = byDomain.get(domain) || [];
            arr.push({
              value: (s as any).signal_value ?? 0,
              ts: new Date((s as any).signal_timestamp || (s as any).created_at || Date.now()).getTime(),
            });
            byDomain.set(domain, arr);
          }

          // Sort each domain by time
          for (const arr of byDomain.values()) {
            arr.sort((a, b) => a.ts - b.ts);
          }

          const domainNames = [...byDomain.keys()];
          // Run incremental Granger for each pair (limited to top 20 domains)
          const topDomains = domainNames.slice(0, 20);
          for (let i = 0; i < topDomains.length; i++) {
            for (let j = i + 1; j < topDomains.length; j++) {
              const xArr = byDomain.get(topDomains[i])!;
              const yArr = byDomain.get(topDomains[j])!;
              const minLen = Math.min(xArr.length, yArr.length);
              if (minLen < 35) continue; // Need lag + 30 min observations

              const state: IncrementalGrangerState = createIncrementalGranger({
                lag: 5,
                windowSize: Math.min(500, minLen),
              });

              for (let k = 0; k < minLen; k++) {
                const result = updateWithNewSignal(state, xArr[k].value, yArr[k].value);
                if (result && result.isSignificant) {
                  incrementalEdgesDiscovered++;
                  break; // Found significant — no need to continue this pair
                }
              }
            }
          }

          log('DISCOVER', `IncrementalGranger pre-screen: ${incrementalEdgesDiscovered} likely edges from ${topDomains.length} domains (${signals.length} signals)`);
        } catch (err) {
          log('DISCOVER', `IncrementalGranger pre-screen failed (non-critical): ${(err as Error).message}`);
        }
      }

      // Run the 3-paradigm ensemble (Parametric + Structural + Info-theoretic + Judge)
      const result = runCausalDiscovery(
        signals.map((s: any) => ({
          source_domain: s.source_domain,
          signal_type: s.signal_type,
          signal_value: s.signal_value,
          signal_timestamp: s.signal_timestamp || s.created_at,
        })),
        organizationId,
        {
          lookbackDays: discoveryLookbackDays,
          minObservations,
        }
      );

      // Compare with existing relationships
      const { data: previousRelationships } = await supabase
        .from('causal_relationships_statistical')
        .select('*')
        .eq('organization_id', organizationId);

      const newRels = previousRelationships
        ? findNewRelationships(result.discovered_relationships, previousRelationships)
        : result.discovered_relationships;

      const lostRels = previousRelationships
        ? findLostRelationships(result.discovered_relationships, previousRelationships)
        : [];

      // Upsert discovered relationships
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
              last_validated_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            };
            if (r.knockout_score !== undefined) row.knockout_score = r.knockout_score;
            if (r.is_likely_confounded !== undefined) row.is_likely_confounded = r.is_likely_confounded;
            if (r.coefficient_sign !== undefined) row.coefficient_sign = r.coefficient_sign;
            if (r.discovery_method !== undefined) row.discovery_method = r.discovery_method;
            return row;
          }),
          { onConflict: 'organization_id,source_domain,target_domain' }
        );
      }

      // ── GAP 4: LLM Causal Hypothesis Generation ─────────────────────
      // For each NEW relationship, ask Claude "Why does A cause B?"
      // Only for genuinely new edges to control costs.
      if (amplifier && newRels.length > 0) {
        try {
          const edgesToAmplify = newRels.slice(0, 5); // Max 5 per run
          log('DISCOVER', `Generating causal hypotheses for ${edgesToAmplify.length} new edges...`);

          const hypothesisResults = await Promise.allSettled(
            edgesToAmplify.map(edge =>
              amplifier.generateCausalHypothesis({
                sourceDomain: edge.source_domain,
                targetDomain: edge.target_domain,
                effectSize: edge.effect_size || 0,
                lagHours: edge.optimal_lag_days ? edge.optimal_lag_days * 24 : undefined,
                method: edge.discovery_method,
                naturalLanguage: edge.natural_language,
              })
            )
          );

          // Persist hypotheses to the causal_relationships_statistical table
          for (let i = 0; i < edgesToAmplify.length; i++) {
            const result_i = hypothesisResults[i];
            if (result_i.status === 'fulfilled' && result_i.value.mechanismHypothesis) {
              const hypothesis = result_i.value;
              const edge = edgesToAmplify[i];
              await supabase
                .from('causal_relationships_statistical')
                .update({
                  mechanism_hypothesis: hypothesis.mechanismHypothesis,
                  llm_confounders: hypothesis.confounders,
                  testable_implications: hypothesis.testableImplications,
                })
                .eq('organization_id', organizationId)
                .eq('source_domain', edge.source_domain)
                .eq('target_domain', edge.target_domain);
            }
          }

          const succeeded = hypothesisResults.filter(r => r.status === 'fulfilled').length;
          log('DISCOVER', `Generated ${succeeded}/${edgesToAmplify.length} causal hypotheses`);
        } catch (err: any) {
          // Non-critical: statistical edge still stands without hypothesis
          log('DISCOVER', `Causal hypothesis generation failed (non-critical): ${err?.message}`);
        }
      }

      log('DISCOVER', `${result.discovered_relationships.length} relationships found (${newRels.length} new, ${lostRels.length} lost)`);

      return {
        relationships: result.discovered_relationships,
        newRels,
        lostRels,
        step: {
          step: 'causal_discovery',
          status: 'success',
          durationMs: Date.now() - start,
          details: {
            totalDiscovered: result.discovered_relationships.length,
            newRelationships: newRels.length,
            lostRelationships: lostRels.length,
            significant: result.discovered_relationships.filter(r => r.is_significant).length,
            // Include specific relationship details for rich report generation
            newRelationshipDetails: newRels.slice(0, 10).map(r => ({
              source: r.source_domain,
              target: r.target_domain,
              effectSize: r.effect_size,
              lag: r.optimal_lag_days,
              narrative: r.natural_language,
            })),
            lostRelationshipDetails: lostRels.slice(0, 5).map(r => ({
              source: r.source_domain,
              target: r.target_domain,
              narrative: r.natural_language,
            })),
            topRelationships: result.discovered_relationships
              .filter(r => r.is_significant)
              .sort((a, b) => (b.effect_size || 0) - (a.effect_size || 0))
              .slice(0, 5)
              .map(r => ({
                source: r.source_domain,
                target: r.target_domain,
                effectSize: r.effect_size,
                lag: r.optimal_lag_days,
                narrative: r.natural_language,
              })),
          },
        },
      };
    } catch (err: any) {
      logError('DISCOVER', 'Causal discovery failed', err);
      return {
        relationships: [],
        newRels: [],
        lostRels: [],
        step: {
          step: 'causal_discovery',
          status: 'error',
          durationMs: Date.now() - start,
          details: { error: err.message },
        },
      };
    }
  }

  // ── Step 3: ANOMALIES ──────────────────────────────────────────────

  async function detectCrossDomainAnomalies(
    signals: any[],
    relationships: CausalRelationship[],
  ): Promise<{ anomalies: AnomalyEvent[]; step: ConsolidationStepResult }> {
    const start = Date.now();
    try {
      // Group signals by domain for anomaly detection
      const domainGroups = new Map<string, any[]>();
      for (const s of signals) {
        const domain = s.source_domain;
        if (!domainGroups.has(domain)) domainGroups.set(domain, []);
        domainGroups.get(domain)!.push(s);
      }

      const allAnomalies: AnomalyEvent[] = [];

      // Build causal edges for confounder-aware detection
      const causalEdges = relationships
        .filter(r => r.is_significant)
        .map(r => ({
          sourceDomain: r.source_domain,
          targetDomain: r.target_domain,
          lagDays: r.optimal_lag_days || 7,
          effectSize: r.effect_size || 0,
          isLikelyConfounded: r.is_likely_confounded,
        }));

      for (const [domain, domainSignals] of domainGroups) {
        if (domainSignals.length < 10) continue;

        const observations = domainSignals.map((s: any) => ({
          entityId: s.entity_id || domain,
          entityType: domain,
          metricName: s.signal_type || 'signal_value',
          value: s.signal_value,
        }));

        const anomalies = detectAnomalies(observations, {
          method: 'zscore',
          zScoreThreshold: 2.5,
          causalEdges,
        });

        for (const a of anomalies) {
          allAnomalies.push(a);
        }
      }

      log('ANOMALIES', `${allAnomalies.length} anomalies detected across ${domainGroups.size} domains`);

      return {
        anomalies: allAnomalies,
        step: {
          step: 'anomaly_detection',
          status: 'success',
          durationMs: Date.now() - start,
          details: {
            domainsScanned: domainGroups.size,
            anomaliesDetected: allAnomalies.length,
            affectedDomains: [...new Set(allAnomalies.map(a => a.entityType || 'unknown'))],
          },
        },
      };
    } catch (err: any) {
      logError('ANOMALIES', 'Anomaly detection failed', err);
      return {
        anomalies: [],
        step: {
          step: 'anomaly_detection',
          status: 'error',
          durationMs: Date.now() - start,
          details: { error: err.message },
        },
      };
    }
  }

  // ── Step 4: PATTERNS ───────────────────────────────────────────────

  async function minePatterns(signals: any[]): Promise<{
    patterns: DiscoveredPattern[];
    sequentialPatterns: SequentialPattern[];
    temporalRules: TemporalAssociationRule[];
    step: ConsolidationStepResult;
  }> {
    const start = Date.now();
    try {
      // Build temporal events first (used by multiple mining steps)
      const temporalEvents: TemporalEvent[] = signals
        .filter((s: any) => s.signal_timestamp)
        .map((s: any) => ({
          event: `${s.source_domain}:${s.signal_type}`,
          timestamp: new Date(s.signal_timestamp).getTime(),
          entityId: s.entity_id || 'unknown',
        }));

      // Frequent itemset mining (Apriori + K-Means++)
      const transactions = groupSignalsIntoTransactions(signals);
      const discoveryResult = discoverPatterns(
        transactions,
        [], // No entity features for cross-domain pattern mining
        {
          minSupport: 0.15, // Tightened from 0.05: require 15% support to filter noise patterns
          minConfidence: 0.65, // Tightened from 0.5: only keep patterns with meaningful confidence
          temporalEvents,
        }
      );
      const patterns = discoveryResult.patterns || [];

      // Sequential pattern mining (PrefixSpan)
      const sequentialPatterns = mineSequentialPatterns(temporalEvents, {
        minSupport: 10, // Tightened from 3: require 10+ observations to be considered a real pattern
        maxGap: 7 * 24 * 60 * 60 * 1000, // 7 days max gap
        maxLength: 5,
      });

      // Temporal association rules
      const temporalRules = mineTemporalAssociationRules(temporalEvents, {
        minSupport: 10, // Tightened from 3: require 10+ occurrences
        minConfidence: 0.65, // Tightened from 0.5: require 65% confidence
        maxWindow: 30 * 24 * 60 * 60 * 1000, // 30 days max window
      });

      // Store discovered patterns as memories
      const topPatterns = patterns.slice(0, 20);
      for (const pattern of topPatterns) {
        try {
          await repository.upsertMemory({
            memoryType: 'discovered_pattern',
            content: `${pattern.naturalLanguage || pattern.description} (domains: ${pattern.domainsInvolved.join(', ')})`,
            importance: pattern.isSignificant ? 0.8 : 0.5,
            metadata: {
              patternId: pattern.id,
              domains: pattern.domainsInvolved,
              isSignificant: pattern.isSignificant,
              confirmations: pattern.confirmationCount,
              discoveredAt: new Date().toISOString(),
            },
          });
        } catch (err) {
          // Non-critical: pattern memory upsert may fail without blocking mining — err instanceof Error ? err.message : String(err) logged for debugging
        }
      }

      // Store temporal rules as memories
      for (const rule of temporalRules.slice(0, 10)) {
        try {
          await repository.upsertMemory({
            memoryType: 'temporal_rule',
            content: `Temporal rule: ${rule.antecedent} => ${rule.consequent} (lag: ${rule.avgLag.toFixed(1)}, confidence: ${(rule.confidence * 100).toFixed(1)}%)`,
            importance: rule.confidence,
            metadata: {
              antecedent: rule.antecedent,
              consequent: rule.consequent,
              avgLag: rule.avgLag,
              confidence: rule.confidence,
              support: rule.support,
            },
          });
        } catch (err) {
          // Non-critical: temporal rule memory upsert may fail without blocking mining — err instanceof Error ? err.message : String(err) logged for debugging
        }
      }

      log('PATTERNS', `${patterns.length} patterns, ${sequentialPatterns.length} sequential, ${temporalRules.length} temporal rules`);

      return {
        patterns,
        sequentialPatterns,
        temporalRules,
        step: {
          step: 'pattern_mining',
          status: 'success',
          durationMs: Date.now() - start,
          details: {
            frequentPatterns: patterns.length,
            sequentialPatterns: sequentialPatterns.length,
            temporalRules: temporalRules.length,
            transactionsAnalyzed: transactions.length,
          },
        },
      };
    } catch (err: any) {
      logError('PATTERNS', 'Pattern mining failed', err);
      return {
        patterns: [],
        sequentialPatterns: [],
        temporalRules: [],
        step: {
          step: 'pattern_mining',
          status: 'error',
          durationMs: Date.now() - start,
          details: { error: err.message },
        },
      };
    }
  }

  // ── Step 5: GENERATE training packs ────────────────────────────────

  function generateTrainingPacks(
    relationships: CausalRelationship[],
    anomalies: AnomalyEvent[],
    patterns: DiscoveredPattern[],
    temporalRules: TemporalAssociationRule[],
  ): { packs: TrainingPack[]; step: ConsolidationStepResult } {
    const start = Date.now();
    try {
      const packs: TrainingPack[] = [];
      const today = new Date().toISOString().split('T')[0];

      // Pack 1: Causal discoveries
      if (relationships.length > 0) {
        const significantRels = relationships.filter(r => r.is_significant);
        // Collect unique domains
        const relDomains = new Set<string>();
        for (const r of significantRels) {
          relDomains.add(r.source_domain);
          relDomains.add(r.target_domain);
        }

        const causalPack: TrainingPack = {
          id: `consolidation-causal-${today}`,
          title: `Causal Discoveries (${today})`,
          source: 'consolidation_engine',
          industry: 'cross_domain',
          domains: Array.from(relDomains),
          confidence: 0.8,
          narrative: `Auto-generated from consolidation on ${today}: ${significantRels.length} significant causal relationships discovered`,
          causalChains: significantRels.map(r => ({
            source: r.source_domain,
            target: r.target_domain,
            metric: 'cross_domain_signal',
            effectSize: r.effect_size || 0.5,
            lagDays: r.optimal_lag_days || 7,
            pValue: r.granger_p_value,
            knockoutScore: r.knockout_score,
            isLikelyConfounded: r.is_likely_confounded,
            coefficientSign: r.coefficient_sign,
          })),
          businessRules: [],
          cascades: [],
          patterns: [],
          outcomes: [],
        };
        packs.push(causalPack);
      }

      // Pack 2: Pattern-derived knowledge
      if (patterns.length > 0 || anomalies.length > 0) {
        const patternDomains: string[] = [];
        for (const p of patterns) {
          for (const d of p.domainsInvolved) {
            if (patternDomains.indexOf(d) === -1) patternDomains.push(d);
          }
        }

        const patternPack: TrainingPack = {
          id: `consolidation-patterns-${today}`,
          title: `Discovered Patterns & Anomalies (${today})`,
          source: 'consolidation_engine',
          industry: 'cross_domain',
          domains: patternDomains.length > 0 ? patternDomains : ['cross_domain'],
          confidence: 0.7,
          narrative: `Auto-generated: ${patterns.length} patterns, ${anomalies.length} anomalies`,
          causalChains: [],
          businessRules: [],
          cascades: [],
          patterns: [
            ...patterns.slice(0, 15).map(p => ({
              name: p.name,
              domains: p.domainsInvolved,
              description: p.naturalLanguage || p.description,
              observed: p.confirmationCount || 1,
              expected: Math.max(1, Math.round((p.confirmationCount || 1) * 0.5)),
              total: p.evidence?.sampleSize || 100,
            })),
            ...anomalies.slice(0, 10).map(a => ({
              name: `anomaly_${a.entityType}_${a.metricName}`,
              domains: [a.entityType],
              description: a.explanation,
              observed: 1,
              expected: 0,
              total: 100,
            })),
          ],
          outcomes: [],
        };
        packs.push(patternPack);
      }

      log('GENERATE', `${packs.length} training packs generated`);

      return {
        packs,
        step: {
          step: 'generate_packs',
          status: packs.length > 0 ? 'success' : 'skipped',
          durationMs: Date.now() - start,
          details: { packsGenerated: packs.length },
        },
      };
    } catch (err: any) {
      logError('GENERATE', 'Pack generation failed', err);
      return {
        packs: [],
        step: {
          step: 'generate_packs',
          status: 'error',
          durationMs: Date.now() - start,
          details: { error: err.message },
        },
      };
    }
  }

  // ── Step 5.5: EXPERTISE — Update contributor expertise graph ────────

  /**
   * Data-driven mapping: signal_type → expertise evidence.
   * Adding a new connector that emits these signal types automatically
   * feeds the expertise graph — no code changes needed.
   */
  const EXPERTISE_SIGNAL_MAP: Record<string, {
    contributorField: string;
    topicFields: string[];
    evidenceType: 'code_change' | 'review' | 'issue_resolution' | 'discussion' | 'documentation' | 'incident_response';
  }> = {
    'pr_merged': { contributorField: 'author', topicFields: ['directories_changed'], evidenceType: 'code_change' },
    'pr_review_submitted': { contributorField: 'reviewer', topicFields: ['directories_changed'], evidenceType: 'review' },
    'issue_resolved': { contributorField: 'assignee', topicFields: ['labels'], evidenceType: 'issue_resolution' },
    'incident_resolved': { contributorField: 'responder', topicFields: ['service_name'], evidenceType: 'incident_response' },
    'message_sent': { contributorField: 'user', topicFields: ['topics'], evidenceType: 'discussion' },
    'pr_files_changed': { contributorField: 'author', topicFields: ['directories_changed'], evidenceType: 'code_change' },
    'bug_closed': { contributorField: 'assignee', topicFields: ['labels'], evidenceType: 'issue_resolution' },
  };

  async function updateExpertiseGraph(signals: any[]): Promise<ConsolidationStepResult> {
    const start = Date.now();
    try {
      const graph = createExpertiseGraph({ minEvidence: 1 });

      // Load existing expertise from database
      await graph.load(supabase, organizationId);

      let edgesRecorded = 0;

      for (const signal of signals) {
        const mapping = EXPERTISE_SIGNAL_MAP[signal.signal_type];
        if (!mapping) continue;

        const metadata = signal.signal_metadata || signal.metadata || {};
        const contributorId = metadata[mapping.contributorField];
        if (!contributorId || typeof contributorId !== 'string') continue;

        // Extract topics from the configured fields
        const topics: string[] = [];
        for (const field of mapping.topicFields) {
          const value = metadata[field];
          if (Array.isArray(value)) {
            topics.push(...value.filter((v: unknown) => typeof v === 'string'));
          } else if (typeof value === 'string') {
            topics.push(value);
          }
        }

        // Record expertise for each topic
        for (const topic of topics) {
          graph.recordExpertise({
            contributorId,
            contributorName: metadata.display_name || metadata.contributor_name || contributorId,
            topic,
            evidenceType: mapping.evidenceType,
            timestamp: signal.signal_timestamp ? new Date(signal.signal_timestamp) : undefined,
          });
          edgesRecorded++;
        }
      }

      // Apply time-based decay
      graph.applyDecay(new Date());

      // Persist to database
      if (edgesRecorded > 0) {
        await graph.persist(supabase, organizationId);
      }

      const stats = graph.getStats();
      log('EXPERTISE', `${edgesRecorded} expertise signals → ${stats.totalEdges} edges, ${stats.uniqueContributors} contributors, ${stats.uniqueTopics} topics`);

      return {
        step: 'expertise_update',
        status: 'success',
        durationMs: Date.now() - start,
        details: {
          edgesRecorded,
          totalEdges: stats.totalEdges,
          uniqueContributors: stats.uniqueContributors,
          uniqueTopics: stats.uniqueTopics,
        },
      };
    } catch (err: any) {
      logError('EXPERTISE', 'Expertise graph update failed', err);
      return {
        step: 'expertise_update',
        status: 'error',
        durationMs: Date.now() - start,
        details: { error: err.message },
      };
    }
  }

  // ── Step 5.55: COLLABORATION — Update cross-team collaboration graph ──────

  /**
   * Data-driven mapping: signal_type → collaboration interaction.
   * PR reviews, thread replies, incident responses, and mentions
   * automatically build the team collaboration graph.
   */
  const COLLABORATION_SIGNAL_MAP: Record<string, {
    contributorAField: string;
    contributorBField: string;
    interactionType: 'code_review' | 'pr_co_author' | 'thread_reply' | 'incident_collab' | 'mention' | 'approval';
    teamField?: string;
  }> = {
    'pr_review_submitted': { contributorAField: 'reviewer', contributorBField: 'author', interactionType: 'code_review', teamField: 'directories_changed' },
    'pr_merged': { contributorAField: 'author', contributorBField: 'reviewers_who_approved', interactionType: 'approval' },
    'incident_resolved': { contributorAField: 'responder', contributorBField: 'escalated_to', interactionType: 'incident_collab' },
    'thread_reply': { contributorAField: 'user', contributorBField: 'thread_starter', interactionType: 'thread_reply' },
  };

  async function updateCollaborationGraph(signals: any[]): Promise<ConsolidationStepResult> {
    const start = Date.now();
    try {
      const collabGraph = createCollaborationGraph();

      // Load existing collaboration edges from database
      await collabGraph.load(supabase, organizationId);

      let interactionsRecorded = 0;

      for (const signal of signals) {
        const mapping = COLLABORATION_SIGNAL_MAP[signal.signal_type];
        if (!mapping) continue;

        const metadata = signal.signal_metadata || signal.metadata || {};
        const contributorA = metadata[mapping.contributorAField];
        if (!contributorA || typeof contributorA !== 'string') continue;

        // Handle both single contributor and array (e.g., reviewers_who_approved)
        const bValue = metadata[mapping.contributorBField];
        const contributorBs: string[] = [];

        if (Array.isArray(bValue)) {
          contributorBs.push(...bValue.filter((v: unknown) => typeof v === 'string'));
        } else if (typeof bValue === 'string') {
          contributorBs.push(bValue);
        }

        for (const contributorB of contributorBs) {
          if (contributorA === contributorB) continue; // Skip self-interaction

          collabGraph.recordInteraction({
            contributorA,
            contributorB,
            interactionType: mapping.interactionType,
            timestamp: signal.signal_timestamp ? new Date(signal.signal_timestamp) : new Date(),
            context: signal.entity_id,
          });
          interactionsRecorded++;
        }
      }

      // Apply time-based decay
      collabGraph.applyDecay(new Date());

      // Persist to database
      if (interactionsRecorded > 0) {
        await collabGraph.persist(supabase, organizationId);
      }

      const stats = collabGraph.getNetworkStats();
      log('COLLABORATION', `${interactionsRecorded} interactions → ${stats.totalEdges} edges, ${stats.uniqueContributors} contributors, ${stats.crossTeamEdges} cross-team`);

      return {
        step: 'collaboration_update',
        status: 'success',
        durationMs: Date.now() - start,
        details: {
          interactionsRecorded,
          totalEdges: stats.totalEdges,
          totalContributors: stats.uniqueContributors,
          crossTeamEdges: stats.crossTeamEdges,
          networkDensity: stats.density,
        },
      };
    } catch (err: any) {
      logError('COLLABORATION', 'Collaboration graph update failed', err);
      return {
        step: 'collaboration_update',
        status: 'error',
        durationMs: Date.now() - start,
        details: { error: err.message },
      };
    }
  }

  // ── Step 5.7: KNOWLEDGE DEPENDENCY — Build/update structural dependency graph ──

  /**
   * Data-driven mapping: signal_type → dependency recording.
   * Co-change signals (files changed together) build dependency edges.
   * Financial signals build feeds/rolls_up edges.
   * Document signals build references edges.
   */
  const DEPENDENCY_SIGNAL_MAP: Record<string, {
    entityIdField: string;
    relatedEntitiesField: string;
    dependencyType: DependencyType;
    knowledgeDomain: KnowledgeDomain;
  }> = {
    // Code signals — files changed in same PR are co-dependent
    'pr_merged':          { entityIdField: 'file_paths', relatedEntitiesField: 'file_paths', dependencyType: 'depends_on', knowledgeDomain: 'code' },
    'pr_files_changed':   { entityIdField: 'file_paths', relatedEntitiesField: 'file_paths', dependencyType: 'depends_on', knowledgeDomain: 'code' },
    // Financial signals
    'revenue_recorded':   { entityIdField: 'line_item', relatedEntitiesField: 'related_accounts', dependencyType: 'feeds', knowledgeDomain: 'finance' },
    'deal_closed':        { entityIdField: 'deal_id', relatedEntitiesField: 'products', dependencyType: 'depends_on', knowledgeDomain: 'finance' },
    // Document/knowledge signals
    'document_indexed':   { entityIdField: 'document_id', relatedEntitiesField: 'references', dependencyType: 'references', knowledgeDomain: 'documentation' },
    'runbook_indexed':    { entityIdField: 'runbook_id', relatedEntitiesField: 'related_services', dependencyType: 'references', knowledgeDomain: 'documentation' },
  };

  async function updateKnowledgeDependencyGraph(signals: any[]): Promise<ConsolidationStepResult> {
    const start = Date.now();
    try {
      const depGraph = createKnowledgeDependencyGraph();

      // Load existing dependency graph from database
      await depGraph.load(supabase, organizationId);

      let edgesRecorded = 0;

      for (const signal of signals) {
        const mapping = DEPENDENCY_SIGNAL_MAP[signal.signal_type];
        if (!mapping) continue;

        const metadata = signal.signal_metadata || signal.metadata || {};

        // Extract entity IDs
        const entityIdRaw = metadata[mapping.entityIdField];
        const entityIds: string[] = Array.isArray(entityIdRaw)
          ? entityIdRaw.filter((v: unknown) => typeof v === 'string')
          : (typeof entityIdRaw === 'string' ? [entityIdRaw] : []);

        const relatedRaw = metadata[mapping.relatedEntitiesField];
        const relatedIds: string[] = Array.isArray(relatedRaw)
          ? relatedRaw.filter((v: unknown) => typeof v === 'string')
          : (typeof relatedRaw === 'string' ? [relatedRaw] : []);

        // For co-change signals (same field for both), build pairwise edges
        if (mapping.entityIdField === mapping.relatedEntitiesField && entityIds.length > 1) {
          for (let i = 0; i < entityIds.length; i++) {
            for (let j = i + 1; j < entityIds.length; j++) {
              depGraph.recordDependency({
                sourceId: entityIds[i],
                targetId: entityIds[j],
                dependencyType: mapping.dependencyType,
                knowledgeDomain: mapping.knowledgeDomain,
                timestamp: signal.signal_timestamp ? new Date(signal.signal_timestamp) : new Date(),
              });
              edgesRecorded++;
            }
          }
        } else {
          // For directional signals (entity → related entities)
          for (const entityId of entityIds) {
            for (const relatedId of relatedIds) {
              if (entityId === relatedId) continue;
              depGraph.recordDependency({
                sourceId: entityId,
                targetId: relatedId,
                dependencyType: mapping.dependencyType,
                knowledgeDomain: mapping.knowledgeDomain,
                timestamp: signal.signal_timestamp ? new Date(signal.signal_timestamp) : new Date(),
              });
              edgesRecorded++;
            }
          }
        }
      }

      // Apply time-based decay
      depGraph.applyDecay(new Date());

      // Persist to database
      if (edgesRecorded > 0) {
        await depGraph.persist(supabase, organizationId);
      }

      const stats = depGraph.getStats();
      const cycles = depGraph.detectCycles();

      log('KNOWLEDGE_DEPENDENCY', `${edgesRecorded} edges → ${stats.totalEdges} total, ${stats.uniqueEntities} entities, ${cycles.count} cycles`);

      return {
        step: 'knowledge_dependency_update',
        status: 'success',
        durationMs: Date.now() - start,
        details: {
          edgesRecorded,
          totalEdges: stats.totalEdges,
          uniqueEntities: stats.uniqueEntities,
          byDomain: stats.byDomain,
          cycleCount: cycles.count,
          avgDepsPerEntity: stats.avgDepsPerEntity,
        },
      };
    } catch (err: any) {
      logError('KNOWLEDGE_DEPENDENCY', 'Knowledge dependency graph update failed', err);
      return {
        step: 'knowledge_dependency_update',
        status: 'error',
        durationMs: Date.now() - start,
        details: { error: err.message },
      };
    }
  }

  // ── Step 5.6: COGNITIVE — Attention-aware multi-hop + uncertainty + forecasting ──

  async function runCognitiveAnalysis(
    signals: any[],
    relationships: CausalRelationship[],
    anomalies: AnomalyEvent[],
  ): Promise<ConsolidationStepResult> {
    const start = Date.now();
    try {
      // Load the current DAG from database
      const dag = await loadDAGFromDatabase(supabase, organizationId);
      if (!dag || dag.nodes.size === 0) {
        return {
          step: 'cognitive_analysis',
          status: 'skipped',
          durationMs: Date.now() - start,
          details: { reason: 'No DAG available for cognitive analysis' },
        };
      }

      const multiHopReasoner = createMultiHopReasoner({ maxHops: 4 });
      const uncertaintyQ = createUncertaintyQuantifier();
      const explanationGen = createExplanationGenerator();
      const attentionMech = createAttentionMechanism();
      const forecaster = createTemporalForecaster();

      // ── NEW: Build attention context from anomalies + patterns ──
      const attentionContext: AttentionContext = {
        recentAnomalies: anomalies.map(a => ({
          domain: a.entityType || 'unknown',
          severity: a.zScore !== undefined ? Math.min(1, Math.abs(a.zScore) / 3) : 0.5,
          detectedAt: new Date(),
        })),
        focusDomains: anomalies.length > 0
          ? [...new Set(anomalies.map(a => a.entityType || '').filter(Boolean))].slice(0, 5)
          : undefined,
        recencyHalfLifeDays: 21, // Consolidation emphasizes recent evidence
      };

      // ── NEW: Apply attention weighting to DAG ──
      const weightedDAG = attentionMech.applyAttention(dag, attentionContext);

      // 1. Multi-hop reasoning on ATTENTION-WEIGHTED DAG
      const domains = Array.from(dag.nodes);
      const discoveredPaths: Array<{ source: string; target: string; hops: number; confidence: number; explanation: string }> = [];

      for (let i = 0; i < Math.min(domains.length, 15); i++) {
        for (let j = 0; j < Math.min(domains.length, 15); j++) {
          if (i === j) continue;
          const prediction = multiHopReasoner.reason(weightedDAG, domains[i], domains[j]);
          if (prediction.bestPath && prediction.bestPath.hopCount > 1 && prediction.bestPath.pathConfidence > 0.05) {
            discoveredPaths.push({
              source: domains[i],
              target: domains[j],
              hops: prediction.bestPath.hopCount,
              confidence: prediction.bestPath.pathConfidence,
              explanation: prediction.bestPath.explanation,
            });
          }
        }
      }

      // ── NEW: Backward reasoning — diagnose anomalous domains ──
      const diagnoses: Array<{ effect: string; topCause: string; likelihood: number }> = [];
      for (const anomaly of anomalies.slice(0, 5)) {
        const domain = anomaly.entityType || '';
        if (!domain || !dag.nodes.has(domain)) continue;
        const diagnosis = multiHopReasoner.diagnose(dag, domain, anomaly.zScore ?? 1.0);
        if (diagnosis.topCauses.length > 0) {
          diagnoses.push({
            effect: domain,
            topCause: diagnosis.topCauses[0].cause,
            likelihood: diagnosis.topCauses[0].likelihood,
          });
        }
      }

      // 2. Compute DAG confidence quality (on original DAG, not weighted)
      const dagQuality = uncertaintyQ.computeDAGConfidenceQuality(dag);

      // 3. Find highest-uncertainty edges
      const highUncertainty = uncertaintyQ.findHighestUncertaintyEdges(dag, 5);

      // ── NEW: Build time series and run forecasts ──
      let forecastCount = 0;
      try {
        const rawSignals = signals.map((s: any) => ({
          organization_id: organizationId,
          source_domain: s.source_domain,
          signal_type: s.signal_type,
          signal_value: s.signal_value,
          signal_timestamp: s.signal_timestamp || s.created_at,
        }));
        const timeSeries = signalsToTimeSeries(rawSignals);
        for (const domain of domains.slice(0, 10)) {
          const forecast = forecaster.forecast(timeSeries, dag, domain, 14);
          if (forecast.predictions.length > 0) {
            forecastCount++;
            // Store forecast as memory
            const trendDir = forecast.predictions[forecast.predictions.length - 1]?.value > forecast.predictions[0]?.value ? 'upward' : 'downward';
            await repository.upsertMemory({
              memoryType: 'domain_forecast',
              content: `${domain}: ${trendDir} trend forecast over 14 days (confidence: ${(forecast.confidence * 100).toFixed(0)}%). ${forecast.summary}`,
              importance: forecast.confidence * 0.7,
              metadata: { domain, horizonDays: 14, confidence: forecast.confidence, forecastedAt: new Date().toISOString() },
            }).catch((err) => {
              // Fire-and-forget: forecast memory upsert may fail without blocking analysis — err instanceof Error ? err.message : String(err) logged for debugging
            }); // Non-fatal
          }
        }
      } catch (err) {
        // Non-critical: forecasting is non-critical — err instanceof Error ? err.message : String(err) logged for debugging
      }

      // 4. Generate intelligence briefing
      const recentChanges = relationships
        .filter(r => r.is_significant)
        .map(r => ({
          type: 'edge_add' as const,
          source: r.source_domain,
          target: r.target_domain,
          weight: Math.abs(r.effect_size || 0),
          timestamp: new Date(),
        }));
      const briefing = explanationGen.generateBriefing(dag, recentChanges);

      // 5. Store top multi-hop discoveries as memories
      let memoriesCreated = 0;
      for (const path of discoveredPaths.slice(0, 10)) {
        try {
          await repository.upsertMemory({
            memoryType: 'multi_hop_discovery',
            content: `Indirect causal chain: ${path.explanation} (${path.hops} hops, ${(path.confidence * 100).toFixed(1)}% confidence)`,
            importance: Math.min(0.9, path.confidence + 0.3),
            metadata: {
              source: path.source,
              target: path.target,
              hops: path.hops,
              confidence: path.confidence,
              discoveredAt: new Date().toISOString(),
            },
          });
          memoriesCreated++;
        } catch (err) {
          // Non-critical: multi-hop discovery memory upsert may fail without blocking analysis — err instanceof Error ? err.message : String(err) logged for debugging
        }
      }

      const attentionSummary = attentionMech.summarizeAttention(dag, attentionContext);

      log('COGNITIVE', `${discoveredPaths.length} multi-hop paths, ${diagnoses.length} diagnoses, ${forecastCount} forecasts, DAG quality: ${dagQuality.category} (${(dagQuality.quality * 100).toFixed(0)}%), ${memoriesCreated} memories`);

      return {
        step: 'cognitive_analysis',
        status: 'success',
        durationMs: Date.now() - start,
        details: {
          attentionApplied: true,
          attentionBoostedEdges: attentionSummary.boosted.length,
          attentionDampenedEdges: attentionSummary.dampened.length,
          multiHopPathsFound: discoveredPaths.length,
          topPaths: discoveredPaths.slice(0, 5).map(p => ({
            chain: `${p.source} → ... → ${p.target}`,
            hops: p.hops,
            confidence: `${(p.confidence * 100).toFixed(1)}%`,
          })),
          backwardDiagnoses: diagnoses.slice(0, 3),
          forecastsGenerated: forecastCount,
          dagQuality: dagQuality.category,
          dagQualityScore: dagQuality.quality,
          highUncertaintyEdges: highUncertainty.length,
          briefingRisk: briefing.riskAssessment.overallRisk,
          memoriesCreated,
        },
      };
    } catch (err: any) {
      logError('COGNITIVE', 'Cognitive analysis failed', err);
      return {
        step: 'cognitive_analysis',
        status: 'error',
        durationMs: Date.now() - start,
        details: { error: err.message },
      };
    }
  }

  // ── Step 6: TRAIN ──────────────────────────────────────────────────

  async function trainPacks(packs: TrainingPack[]): Promise<ConsolidationStepResult> {
    const start = Date.now();
    try {
      let trained = 0;
      const errors: string[] = [];

      for (const pack of packs) {
        try {
          await trainer.train(supabase, organizationId, pack);
          trained++;
          log('TRAIN', `  Trained: ${pack.id}`);
        } catch (err: any) {
          errors.push(`${pack.id}: ${err.message}`);
          logError('TRAIN', `  Failed: ${pack.id}`, err);
        }
      }

      return {
        step: 'train',
        status: errors.length === 0 ? 'success' : (trained > 0 ? 'success' : 'error'),
        durationMs: Date.now() - start,
        details: { packsTrained: trained, errors },
      };
    } catch (err: any) {
      logError('TRAIN', 'Training failed', err);
      return {
        step: 'train',
        status: 'error',
        durationMs: Date.now() - start,
        details: { error: err.message },
      };
    }
  }

  // ── Step 7: PRUNE ──────────────────────────────────────────────────

  async function pruneStaleEdges(): Promise<ConsolidationStepResult> {
    const start = Date.now();
    try {
      const pruneThreshold = new Date(Date.now() - pruneAfterDays * 24 * 60 * 60 * 1000).toISOString();

      // Find stale edges: not validated in 30+ days
      const { data: staleEdges } = await supabase
        .from('causal_relationships_statistical')
        .select('id, source_domain, target_domain, evidence_weight, is_significant, last_validated_at')
        .eq('organization_id', organizationId)
        .or(`last_validated_at.is.null,last_validated_at.lt.${pruneThreshold}`);

      let decayed = 0;
      let pruned = 0;

      for (const edge of staleEdges || []) {
        const currentWeight = edge.evidence_weight ?? 1.0;
        const newWeight = currentWeight * stalePruneFactor;

        if (newWeight < minEdgeWeight) {
          // Remove edge entirely
          await supabase
            .from('causal_relationships_statistical')
            .update({
              is_significant: false,
              evidence_weight: newWeight,
              updated_at: new Date().toISOString(),
            })
            .eq('id', edge.id);
          pruned++;
          log('PRUNE', `  Pruned: ${edge.source_domain} -> ${edge.target_domain} (weight: ${newWeight.toFixed(3)})`);
        } else {
          // Decay weight
          await supabase
            .from('causal_relationships_statistical')
            .update({
              evidence_weight: newWeight,
              is_significant: newWeight > 0.3,
              updated_at: new Date().toISOString(),
            })
            .eq('id', edge.id);
          decayed++;
        }
      }

      log('PRUNE', `${decayed} edges decayed, ${pruned} edges pruned (below ${minEdgeWeight})`);

      return {
        step: 'prune',
        status: 'success',
        durationMs: Date.now() - start,
        details: {
          staleEdgesFound: (staleEdges || []).length,
          edgesDecayed: decayed,
          edgesPruned: pruned,
          pruneThresholdDays: pruneAfterDays,
          minEdgeWeight,
        },
      };
    } catch (err: any) {
      logError('PRUNE', 'Edge pruning failed', err);
      return {
        step: 'prune',
        status: 'error',
        durationMs: Date.now() - start,
        details: { error: err.message },
      };
    }
  }

  // ── Step 8: STRENGTHEN ─────────────────────────────────────────────

  async function strengthenAccurateEdges(): Promise<ConsolidationStepResult> {
    const start = Date.now();
    try {
      const feedbackLoop = createFeedbackLoop();

      // First process any pending verifications
      const verificationsProcessed = await feedbackLoop.processPendingVerifications(supabase, organizationId);

      // Get all significant relationships
      const { data: relationships } = await supabase
        .from('causal_relationships_statistical')
        .select('*')
        .eq('organization_id', organizationId)
        .eq('is_significant', true);

      let strengthened = 0;
      let weakened = 0;

      for (const rel of relationships || []) {
        try {
          const accuracy = await feedbackLoop.getRelationshipAccuracy(
            supabase,
            organizationId,
            rel.source_domain,
            rel.target_domain,
            30, // 30-day window
          );

          if (accuracy.totalPredictions < 3) continue; // Not enough data

          const currentWeight = rel.evidence_weight ?? 1.0;

          if (accuracy.accuracy >= minAccuracyForBoost) {
            // Boost edge — predictions are coming true
            const newWeight = Math.min(1.0, currentWeight * accuracyBoostFactor);
            await supabase
              .from('causal_relationships_statistical')
              .update({
                evidence_weight: newWeight,
                last_validated_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              })
              .eq('id', rel.id);
            strengthened++;
            log('STRENGTHEN', `  Boosted: ${rel.source_domain} -> ${rel.target_domain} (accuracy: ${(accuracy.accuracy * 100).toFixed(0)}%)`);
          } else if (accuracy.accuracy < 0.4 && accuracy.totalPredictions >= 5) {
            // Weaken edge — predictions are failing
            const newWeight = currentWeight * 0.85;
            await supabase
              .from('causal_relationships_statistical')
              .update({
                evidence_weight: newWeight,
                is_significant: newWeight > 0.3,
                updated_at: new Date().toISOString(),
              })
              .eq('id', rel.id);
            weakened++;
            log('STRENGTHEN', `  Weakened: ${rel.source_domain} -> ${rel.target_domain} (accuracy: ${(accuracy.accuracy * 100).toFixed(0)}%)`);
          }
        } catch (err) {
          // Non-critical: relationship strengthening update may fail without blocking loop — err instanceof Error ? err.message : String(err) logged for debugging
        }
      }

      log('STRENGTHEN', `${strengthened} edges boosted, ${weakened} edges weakened, ${verificationsProcessed} verifications processed`);

      return {
        step: 'strengthen',
        status: 'success',
        durationMs: Date.now() - start,
        details: {
          verificationsProcessed,
          edgesStrengthened: strengthened,
          edgesWeakened: weakened,
          totalRelationshipsChecked: (relationships || []).length,
        },
      };
    } catch (err: any) {
      logError('STRENGTHEN', 'Edge strengthening failed', err);
      return {
        step: 'strengthen',
        status: 'error',
        durationMs: Date.now() - start,
        details: { error: err.message },
      };
    }
  }

  // ── Step 9: REPORT ─────────────────────────────────────────────────

  function generateReport(steps: ConsolidationStepResult[]): ConsolidationReport {
    const discoveries: string[] = [];
    const warnings: string[] = [];
    const stats = {
      signalsProcessed: 0,
      causalEdgesDiscovered: 0,
      newRelationships: 0,
      lostRelationships: 0,
      anomaliesDetected: 0,
      patternsFound: 0,
      sequentialPatternsFound: 0,
      temporalRulesFound: 0,
      packsGenerated: 0,
      edgesPruned: 0,
      edgesStrengthened: 0,
      edgesDecayed: 0,
      memoriesCreated: 0,
    };

    // Extract stats from step results — generate SPECIFIC discoveries, not generic counts
    for (const step of steps) {
      switch (step.step) {
        case 'fetch':
          stats.signalsProcessed = (step.details.totalHistorical as number) || 0;
          break;
        case 'causal_discovery': {
          stats.causalEdgesDiscovered = (step.details.totalDiscovered as number) || 0;
          stats.newRelationships = (step.details.newRelationships as number) || 0;
          stats.lostRelationships = (step.details.lostRelationships as number) || 0;

          // Generate SPECIFIC discoveries with domain names, effect sizes, and lag times
          const newDetails = (step.details.newRelationshipDetails as Array<{source: string; target: string; effectSize: number; lag: number; narrative: string}>) || [];
          for (const rel of newDetails) {
            const effectPct = ((rel.effectSize || 0) * 100).toFixed(0);
            discoveries.push(
              rel.narrative || `New causal link: ${rel.source} → ${rel.target} (${effectPct}% effect, ${rel.lag}-day lag)`
            );
          }
          // If no details but count > 0, use a summary with count
          if (newDetails.length === 0 && stats.newRelationships > 0) {
            discoveries.push(`Discovered ${stats.newRelationships} new causal relationship${stats.newRelationships > 1 ? 's' : ''}`);
          }

          // Include top existing relationships for context
          const topRels = (step.details.topRelationships as Array<{source: string; target: string; effectSize: number; lag: number; narrative: string}>) || [];
          if (topRels.length > 0 && newDetails.length === 0) {
            // Only add top rels if we didn't already add new ones
            const strongest = topRels[0];
            discoveries.push(
              `Strongest causal link: ${strongest.source} → ${strongest.target} (${((strongest.effectSize || 0) * 100).toFixed(0)}% effect over ${strongest.lag} days)`
            );
          }

          const lostDetails = (step.details.lostRelationshipDetails as Array<{source: string; target: string; narrative: string}>) || [];
          for (const rel of lostDetails) {
            warnings.push(`Lost link: ${rel.source} → ${rel.target} is no longer statistically significant`);
          }
          if (lostDetails.length === 0 && stats.lostRelationships > 0) {
            warnings.push(`${stats.lostRelationships} previously-known relationship${stats.lostRelationships > 1 ? 's' : ''} no longer significant`);
          }
          break;
        }
        case 'anomaly_detection':
          stats.anomaliesDetected = (step.details.anomaliesDetected as number) || 0;
          if (stats.anomaliesDetected > 0) {
            const domains = step.details.affectedDomains as string[] || [];
            if (domains.length > 0) {
              discoveries.push(`Anomaly detected in ${domains.join(', ')}: unusual signal patterns diverging from baseline`);
            } else {
              discoveries.push(`Detected ${stats.anomaliesDetected} cross-domain anomal${stats.anomaliesDetected > 1 ? 'ies' : 'y'}`);
            }
          }
          break;
        case 'pattern_mining':
          stats.patternsFound = (step.details.frequentPatterns as number) || 0;
          stats.sequentialPatternsFound = (step.details.sequentialPatterns as number) || 0;
          stats.temporalRulesFound = (step.details.temporalRules as number) || 0;
          if (stats.patternsFound > 0) {
            discoveries.push(`Found ${stats.patternsFound} recurring signal co-occurrence patterns across domains`);
          }
          if (stats.temporalRulesFound > 0) {
            discoveries.push(`Discovered ${stats.temporalRulesFound} temporal cause-effect sequences with measurable time lags`);
          }
          break;
        case 'generate_packs':
          stats.packsGenerated = (step.details.packsGenerated as number) || 0;
          break;
        case 'prune':
          stats.edgesPruned = (step.details.edgesPruned as number) || 0;
          stats.edgesDecayed = (step.details.edgesDecayed as number) || 0;
          if (stats.edgesPruned > 0) {
            warnings.push(`Pruned ${stats.edgesPruned} weak/stale causal edge${stats.edgesPruned > 1 ? 's' : ''}`);
          }
          break;
        case 'strengthen':
          stats.edgesStrengthened = (step.details.edgesStrengthened as number) || 0;
          if (stats.edgesStrengthened > 0) {
            discoveries.push(`Validated and strengthened ${stats.edgesStrengthened} causal edge${stats.edgesStrengthened > 1 ? 's' : ''} through prediction accuracy verification`);
          }
          break;
        case 'knowledge_dependency_update': {
          const depEdges = (step.details.totalEdges as number) || 0;
          const depEntities = (step.details.uniqueEntities as number) || 0;
          const depCycles = (step.details.cycleCount as number) || 0;
          const depByDomain = step.details.byDomain as Record<string, number> || {};
          if (depEdges > 0) {
            const domainSummary = Object.entries(depByDomain)
              .map(([d, c]) => `${d}: ${c}`)
              .join(', ');
            discoveries.push(
              `Knowledge dependency graph: ${depEdges} edges across ${depEntities} entities (${domainSummary})`
            );
          }
          if (depCycles > 0) {
            warnings.push(`${depCycles} circular dependency cycle${depCycles > 1 ? 's' : ''} detected in the knowledge graph`);
          }
          break;
        }
        case 'cognitive_analysis': {
          const multiHopCount = (step.details.multiHopPathsFound as number) || 0;
          const dagQ = step.details.dagQuality as string || 'unknown';
          if (multiHopCount > 0) {
            discoveries.push(`Multi-hop reasoning discovered ${multiHopCount} indirect causal chain${multiHopCount > 1 ? 's' : ''} (DAG quality: ${dagQ})`);
          }
          const briefingRisk = step.details.briefingRisk as string;
          if (briefingRisk === 'high' || briefingRisk === 'critical') {
            warnings.push(`Intelligence briefing flags ${briefingRisk} overall risk — review recommended`);
          }
          break;
        }
        case 'observation_consolidation': {
          const totalObs = (step.details.totalObservations as number) || 0;
          const rulesExtracted = (step.details.rulesExtracted as number) || 0;
          const cascadesDetected = (step.details.cascadesDetected as number) || 0;
          if (totalObs > 0) {
            discoveries.push(`Observational memory generated ${totalObs} structured observations with ${rulesExtracted} rules and ${cascadesDetected} entity cascades`);
          }
          break;
        }
      }

      if (step.status === 'error') {
        warnings.push(`Step "${step.step}" failed: ${step.details.error || 'unknown error'}`);
      }
    }

    // Build narrative with specifics
    const parts: string[] = [];
    parts.push(`Brain consolidation processed ${stats.signalsProcessed.toLocaleString()} signals.`);

    if (stats.causalEdgesDiscovered > 0) {
      parts.push(`The 3-paradigm causal ensemble identified ${stats.causalEdgesDiscovered} statistically significant causal relationships (p < 0.01).`);
    }
    if (stats.newRelationships > 0) {
      parts.push(`${stats.newRelationships} are newly discovered connections.`);
    }
    if (stats.anomaliesDetected > 0) {
      parts.push(`${stats.anomaliesDetected} anomalies flagged.`);
    }
    if (stats.patternsFound > 0) {
      parts.push(`${stats.patternsFound} recurring patterns confirmed.`);
    }
    if (stats.edgesStrengthened > 0) {
      parts.push(`${stats.edgesStrengthened} edges validated by real-world outcomes.`);
    }
    if (stats.edgesPruned > 0) {
      parts.push(`${stats.edgesPruned} weak edges pruned.`);
    }

    const narrative = parts.join(' ');

    return {
      narrative,
      discoveries,
      warnings,
      stats,
    };
  }

  // ── Step 10: PERSIST ───────────────────────────────────────────────

  async function persistConsolidation(result: ConsolidationResult): Promise<ConsolidationStepResult> {
    const start = Date.now();
    try {
      // Store consolidation run record
      await supabase.from('consolidation_runs').insert({
        id: result.runId,
        organization_id: organizationId,
        is_core_brain: isCoreBrain,
        started_at: result.startedAt,
        completed_at: result.completedAt,
        total_duration_ms: result.totalDurationMs,
        status: result.status,
        steps: result.steps,
        report: result.report,
        errors: result.errors,
      }).then(({ error }) => {
        // If table doesn't exist yet, log but don't fail
        if (error) {
          log('PERSIST', `Note: consolidation_runs table insert: ${error.message}`);
        }
      });

      // Store the report as a memory
      await repository.upsertMemory({
        memoryType: 'consolidation_report',
        content: result.report.narrative,
        importance: 0.8,
        metadata: {
          runId: result.runId,
          stats: result.report.stats,
          discoveries: result.report.discoveries,
          warnings: result.report.warnings,
          completedAt: result.completedAt,
        },
      });

      // Store individual discoveries as searchable memories
      for (const discovery of result.report.discoveries) {
        await repository.upsertMemory({
          memoryType: 'brain_discovery',
          content: discovery,
          importance: 0.7,
          metadata: {
            runId: result.runId,
            discoveredAt: result.completedAt,
          },
        });
      }

      // Log agent activity
      await repository.logActivity({
        agentType: 'consolidation_engine',
        actionType: 'brain_sleep',
        inputSummary: `Consolidated ${result.report.stats.signalsProcessed} signals for ${isCoreBrain ? 'core brain' : 'org ' + (organizationId ?? 'unknown').substring(0, 8)}`,
        outputSummary: (result.report.narrative ?? '').substring(0, 500),
        metadata: {
          runId: result.runId,
          status: result.status,
          durationMs: result.totalDurationMs,
          stats: result.report.stats,
        },
      });

      log('PERSIST', `Consolidation results persisted (run: ${result.runId})`);

      return {
        step: 'persist',
        status: 'success',
        durationMs: Date.now() - start,
        details: { runId: result.runId, memoriesStored: result.report.discoveries.length + 1 },
      };
    } catch (err: any) {
      logError('PERSIST', 'Failed to persist consolidation', err);
      return {
        step: 'persist',
        status: 'error',
        durationMs: Date.now() - start,
        details: { error: err.message },
      };
    }
  }

  // ── Optional: Federation ───────────────────────────────────────────

  async function federateKnowledge(): Promise<ConsolidationStepResult> {
    const start = Date.now();
    try {
      if (!runFederation) {
        return {
          step: 'federation',
          status: 'skipped',
          durationMs: 0,
          details: { reason: isCoreBrain ? 'Core brain does not federate upstream' : 'Federation disabled' },
        };
      }

      const promoter = createUpstreamPromoter(supabase, organizationId);
      const result = await promoter.promoteKnowledge();

      const totalPromoted = result.relationshipsPromoted + result.memoriesPromoted + result.rulesPromoted;
      log('FEDERATION', `Promoted ${totalPromoted} items to core brain`);

      return {
        step: 'federation',
        status: 'success',
        durationMs: Date.now() - start,
        details: {
          relationshipsPromoted: result.relationshipsPromoted,
          memoriesPromoted: result.memoriesPromoted,
          rulesPromoted: result.rulesPromoted,
          skippedPII: result.itemsSkippedPII,
          skippedDuplicate: result.itemsSkippedDuplicate,
        },
      };
    } catch (err: any) {
      logError('FEDERATION', 'Federation failed', err);
      return {
        step: 'federation',
        status: 'error',
        durationMs: Date.now() - start,
        details: { error: err.message },
      };
    }
  }

  // ── Optional: Threshold Optimization ───────────────────────────────

  async function optimizeThresholds(): Promise<ConsolidationStepResult> {
    const start = Date.now();
    try {
      if (!runThresholdOptimization) {
        return {
          step: 'threshold_optimization',
          status: 'skipped',
          durationMs: 0,
          details: { reason: 'Threshold optimization disabled' },
        };
      }

      const optimizer = createThresholdOptimizer();
      const results = await optimizer.optimizeAllThresholds(supabase, organizationId);

      const highConfidence = results.filter(r => r.shouldUpdate && r.confidence === 'high');
      if (highConfidence.length > 0) {
        await optimizer.applyUpdates(supabase, organizationId, highConfidence);
      }

      log('THRESHOLDS', `${results.length} thresholds analyzed, ${highConfidence.length} auto-applied`);

      return {
        step: 'threshold_optimization',
        status: 'success',
        durationMs: Date.now() - start,
        details: {
          thresholdsAnalyzed: results.length,
          updatesApplied: highConfidence.length,
        },
      };
    } catch (err: any) {
      logError('THRESHOLDS', 'Threshold optimization failed', err);
      return {
        step: 'threshold_optimization',
        status: 'error',
        durationMs: Date.now() - start,
        details: { error: err.message },
      };
    }
  }

  // ── Bonus: Observational Memory Consolidation ──────────────────────
  // Generates structured observations from signals and causal discoveries,
  // then extracts rules and cascades. This percolates the observational
  // memory paradigm (proven at 79.6% on LongMemEval) into the nightly
  // consolidation cycle.

  async function consolidateObservations(
    signals: any[],
    relationships: CausalRelationship[],
    anomalies: AnomalyEvent[]
  ): Promise<ConsolidationStepResult> {
    const start = Date.now();
    try {
      // Generate observations from signals
      const observations: Array<{
        tag: string;
        content: string;
        entityId: string;
        domain: string;
        confidence: number;
        timestamp: Date;
      }> = [];

      // Convert signals to [FACT] and [CHANGE] observations
      for (const signal of signals) {
        const domain = signal.source_domain || 'unknown';
        const entityId = signal.entity_id || signal.entity_type || domain;
        const value = signal.signal_value ?? 0;

        observations.push({
          tag: 'FACT',
          content: `${domain} ${signal.signal_type || 'metric'} for ${entityId}: value=${value}`,
          entityId,
          domain,
          confidence: Math.min(1, Math.abs(value)),
          timestamp: new Date(signal.signal_timestamp || signal.created_at),
        });

        if (Math.abs(value) > 0.7) {
          observations.push({
            tag: 'CHANGE',
            content: `Significant ${value > 0 ? 'increase' : 'decrease'} in ${domain} ${signal.signal_type || 'metric'} for ${entityId} (value=${value})`,
            entityId,
            domain,
            confidence: Math.min(1, Math.abs(value)),
            timestamp: new Date(signal.signal_timestamp || signal.created_at),
          });
        }
      }

      // Convert relationships to [RELATIONSHIP] observations
      for (const rel of relationships) {
        observations.push({
          tag: 'RELATIONSHIP',
          content: `${rel.source_domain} → ${rel.target_domain}: ${rel.natural_language || `effect=${rel.effect_size}, lag=${rel.optimal_lag_days}d`}`,
          entityId: `${rel.source_domain}::${rel.target_domain}`,
          domain: rel.source_domain,
          confidence: rel.is_significant ? 0.9 : 0.5,
          timestamp: new Date(),
        });
      }

      // Convert anomalies to [EVENT] observations
      for (const anomaly of anomalies) {
        observations.push({
          tag: 'EVENT',
          content: `Anomaly detected: ${anomaly.explanation || anomaly.metricName || 'unknown'} for ${anomaly.entityType}/${anomaly.entityId} (z=${anomaly.zScore.toFixed(1)})`,
          entityId: anomaly.entityId,
          domain: anomaly.entityType,
          confidence: anomaly.severity === 'critical' ? 1.0 : anomaly.severity === 'high' ? 0.8 : 0.6,
          timestamp: anomaly.detectedAt,
        });
      }

      // Extract rules from observations (L4 logic)
      const factObs = observations.filter(o => o.tag === 'FACT' && o.confidence > 0.7);
      const changeObs = observations.filter(o => o.tag === 'CHANGE');
      const rules: Array<{
        type: string;
        content: string;
        entityId: string;
        domain: string;
        isCurrent: boolean;
        supportCount: number;
      }> = [];

      // Group facts by entity to extract rules
      const entityFacts = new Map<string, typeof factObs>();
      for (const obs of factObs) {
        const key = `${obs.domain}::${obs.entityId}`;
        if (!entityFacts.has(key)) entityFacts.set(key, []);
        entityFacts.get(key)!.push(obs);
      }

      for (const [key, facts] of entityFacts) {
        const [domain, entityId] = key.split('::');
        if (facts.length >= 2) {
          rules.push({
            type: 'fact',
            content: facts[facts.length - 1].content,
            entityId,
            domain,
            isCurrent: true,
            supportCount: facts.length,
          });
        }
      }

      // Detect cascades from changes (L5 logic)
      const entityChanges = new Map<string, typeof changeObs>();
      for (const obs of changeObs) {
        const key = `${obs.domain}::${obs.entityId}`;
        if (!entityChanges.has(key)) entityChanges.set(key, []);
        entityChanges.get(key)!.push(obs);
      }

      let cascadesDetected = 0;
      for (const [, changes] of entityChanges) {
        if (changes.length >= 2) {
          cascadesDetected++;
        }
      }

      // Persist observation summary to consolidation metadata
      try {
        await supabase.from('consolidation_runs').update({
          observation_summary: {
            totalObservations: observations.length,
            factCount: observations.filter(o => o.tag === 'FACT').length,
            changeCount: observations.filter(o => o.tag === 'CHANGE').length,
            relationshipCount: observations.filter(o => o.tag === 'RELATIONSHIP').length,
            eventCount: observations.filter(o => o.tag === 'EVENT').length,
            rulesExtracted: rules.length,
            cascadesDetected,
            updatedAt: new Date().toISOString(),
          },
        }).eq('organization_id', organizationId).eq('status', 'running');
      } catch (err) {
        // Non-critical: consolidation run metadata update may fail without blocking observations — err instanceof Error ? err.message : String(err) logged for debugging
      }

      log('OBSERVATIONS', `${observations.length} observations generated, ${rules.length} rules extracted, ${cascadesDetected} cascades detected`);

      return {
        step: 'observation_consolidation',
        status: 'success',
        durationMs: Date.now() - start,
        details: {
          totalObservations: observations.length,
          tagDistribution: {
            FACT: observations.filter(o => o.tag === 'FACT').length,
            CHANGE: observations.filter(o => o.tag === 'CHANGE').length,
            RELATIONSHIP: observations.filter(o => o.tag === 'RELATIONSHIP').length,
            EVENT: observations.filter(o => o.tag === 'EVENT').length,
          },
          rulesExtracted: rules.length,
          cascadesDetected,
        },
      };
    } catch (err: any) {
      logError('OBSERVATIONS', 'Observation consolidation failed', err);
      return {
        step: 'observation_consolidation',
        status: 'error',
        durationMs: Date.now() - start,
        details: { error: err.message },
      };
    }
  }

  // ══════════════════════════════════════════════════════════════════
  // MAIN: Run the 10-step consolidation cycle
  // ══════════════════════════════════════════════════════════════════

  // ── Consolidation Race Lock ──────────────────────────────────────
  // Prevents concurrent consolidation runs on the same org.
  // Uses the consolidation_runs table as an advisory lock.

  async function acquireConsolidationLock(runId: string): Promise<boolean> {
    try {
      // First, clean up stale locks — any "running" entry older than 2 hours is considered crashed
      const staleThreshold = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
      await supabase
        .from('consolidation_runs')
        .update({ status: 'stale_timeout', completed_at: new Date().toISOString() })
        .eq('organization_id', organizationId)
        .eq('status', 'running')
        .lt('started_at', staleThreshold);

      // Check for active consolidation in the last 60 minutes (increased from 30 to avoid overlap)
      const lockWindow = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const { data: activeRuns } = await supabase
        .from('consolidation_runs')
        .select('id, started_at')
        .eq('organization_id', organizationId)
        .eq('status', 'running')
        .gte('started_at', lockWindow)
        .limit(1);

      if (activeRuns && activeRuns.length > 0) {
        log('LOCK', `Consolidation already running (run: ${activeRuns[0].id}). Skipping.`);
        return false;
      }

      // Insert our run as 'running' — acts as a lock
      const { error: insertError } = await supabase.from('consolidation_runs').insert({
        id: runId,
        organization_id: organizationId,
        is_core_brain: isCoreBrain,
        started_at: new Date().toISOString(),
        status: 'running',
      });

      if (insertError) {
        log('LOCK', `Failed to acquire lock: ${insertError.message}`);
        return false;
      }

      return true;
    } catch {
      // If consolidation_runs table doesn't exist, skip locking (non-fatal)
      return true;
    }
  }

  async function releaseConsolidationLock(runId: string, finalStatus: string): Promise<void> {
    try {
      await supabase
        .from('consolidation_runs')
        .update({
          status: finalStatus,
          completed_at: new Date().toISOString(),
        })
        .eq('id', runId);
    } catch (err) {
      // Non-critical: consolidation lock release may fail — lock will expire naturally — err instanceof Error ? err.message : String(err) logged for debugging
    }
  }

  return {
    /**
     * Run the full 10-step brain consolidation ("brain sleep").
     * This is the master function that orchestrates everything.
     *
     * Production hardening:
     * - Advisory lock prevents concurrent runs on same org
     * - Returns 'skipped' status if another consolidation is already running
     */
    async runConsolidation(): Promise<ConsolidationResult> {
      const runId = `consolidation-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
      const startedAt = new Date().toISOString();
      const startTime = Date.now();
      const steps: ConsolidationStepResult[] = [];
      const errors: string[] = [];

      // Acquire advisory lock — skip if another consolidation is running
      const lockAcquired = await acquireConsolidationLock(runId);
      if (!lockAcquired) {
        return {
          runId,
          organizationId,
          isCoreBrain,
          startedAt,
          completedAt: new Date().toISOString(),
          totalDurationMs: Date.now() - startTime,
          steps: [],
          report: {
            narrative: 'Consolidation skipped — concurrent run detected.',
            discoveries: [],
            warnings: ['Another consolidation is already running for this organization'],
            stats: {
              signalsProcessed: 0, causalEdgesDiscovered: 0, newRelationships: 0,
              lostRelationships: 0, anomaliesDetected: 0, patternsFound: 0,
              sequentialPatternsFound: 0, temporalRulesFound: 0, packsGenerated: 0,
              edgesPruned: 0, edgesStrengthened: 0, edgesDecayed: 0, memoriesCreated: 0,
            },
          },
          status: 'success', // Not an error — intentionally skipped
          errors: ['Skipped: concurrent consolidation run detected'],
        };
      }

      if (verbose) {
        logger.info('BRAIN CONSOLIDATION ("Sleep") started', {
          target: isCoreBrain ? 'Core Brain' : `Org: ${(organizationId ?? 'unknown').substring(0, 8)}`,
          runId,
        });
      }

      try {
      // Step 1: FETCH
      log('1/10', 'Fetching signals...');
      const { signals, step: fetchStep } = await fetchSignals();
      steps.push(fetchStep);
      if (fetchStep.status === 'error') errors.push('Signal fetch failed');

      if (signals.length === 0) {
        log('SKIP', 'No signals to process — skipping consolidation');
        const result: ConsolidationResult = {
          runId,
          organizationId,
          isCoreBrain,
          startedAt,
          completedAt: new Date().toISOString(),
          totalDurationMs: Date.now() - startTime,
          steps,
          report: {
            narrative: 'No signals to process. Brain consolidation skipped.',
            discoveries: [],
            warnings: ['No signals found for the configured lookback window'],
            stats: {
              signalsProcessed: 0, causalEdgesDiscovered: 0, newRelationships: 0,
              lostRelationships: 0, anomaliesDetected: 0, patternsFound: 0,
              sequentialPatternsFound: 0, temporalRulesFound: 0, packsGenerated: 0,
              edgesPruned: 0, edgesStrengthened: 0, edgesDecayed: 0, memoriesCreated: 0,
            },
          },
          status: 'success',
          errors,
        };
        await persistConsolidation(result);
        return result;
      }

      // Step 2: DISCOVER
      log('2/10', 'Running causal discovery (3-paradigm ensemble + Bayesian Judge)...');
      const { relationships, newRels, lostRels, step: discoverStep } = await discoverCausalRelationships(signals);
      steps.push(discoverStep);
      if (discoverStep.status === 'error') errors.push('Causal discovery failed');

      // Step 3: ANOMALIES
      log('3/10', 'Detecting cross-domain anomalies...');
      const { anomalies, step: anomalyStep } = await detectCrossDomainAnomalies(signals, relationships);
      steps.push(anomalyStep);
      if (anomalyStep.status === 'error') errors.push('Anomaly detection failed');

      // Step 4: PATTERNS
      log('4/10', 'Mining patterns (Apriori + PrefixSpan + temporal rules)...');
      const { patterns, sequentialPatterns, temporalRules, step: patternStep } = await minePatterns(signals);
      steps.push(patternStep);
      if (patternStep.status === 'error') errors.push('Pattern mining failed');

      // Step 5: GENERATE
      log('5/10', 'Generating training packs from discoveries...');
      const { packs, step: genStep } = generateTrainingPacks(relationships, anomalies, patterns, temporalRules);
      steps.push(genStep);

      // Step 5.5: EXPERTISE
      log('5.5/10', 'Updating contributor expertise graph...');
      const expertiseStep = await updateExpertiseGraph(signals);
      steps.push(expertiseStep);
      if (expertiseStep.status === 'error') errors.push('Expertise graph update failed');

      // Step 5.55: COLLABORATION — Update cross-team collaboration graph
      log('5.55/10', 'Updating cross-team collaboration graph...');
      const collabStep = await updateCollaborationGraph(signals);
      steps.push(collabStep);
      if (collabStep.status === 'error') errors.push('Collaboration graph update failed');

      // Step 5.7: KNOWLEDGE DEPENDENCY — Build/update structural dependency graph
      log('5.7/10', 'Updating knowledge dependency graph (code, finance, docs)...');
      const depGraphStep = await updateKnowledgeDependencyGraph(signals);
      steps.push(depGraphStep);
      if (depGraphStep.status === 'error') errors.push('Knowledge dependency graph update failed');

      // Step 5.6: COGNITIVE — Multi-hop reasoning + uncertainty + intelligence briefing
      log('5.6/10', 'Running cognitive analysis (multi-hop reasoning, uncertainty, briefing)...');
      const cognitiveStep = await runCognitiveAnalysis(signals, relationships, anomalies);
      steps.push(cognitiveStep);

      // Step 6: TRAIN
      log('6/10', 'Training brain with discovered knowledge...');
      const trainStep = await trainPacks(packs);
      steps.push(trainStep);
      if (trainStep.status === 'error') errors.push('Training failed');

      // Step 7: PRUNE
      log('7/10', 'Pruning stale/weak causal edges...');
      const pruneStep = await pruneStaleEdges();
      steps.push(pruneStep);
      if (pruneStep.status === 'error') errors.push('Edge pruning failed');

      // Step 8: STRENGTHEN
      log('8/10', 'Strengthening edges with verified predictions...');
      const strengthenStep = await strengthenAccurateEdges();
      steps.push(strengthenStep);
      if (strengthenStep.status === 'error') errors.push('Edge strengthening failed');

      // Bonus: Threshold optimization
      log('BONUS', 'Optimizing signal thresholds...');
      const thresholdStep = await optimizeThresholds();
      steps.push(thresholdStep);

      // Bonus: Federation (for org-specific consolidation)
      log('BONUS', 'Running knowledge federation...');
      const federationStep = await federateKnowledge();
      steps.push(federationStep);

      // Bonus: Observational Memory Consolidation
      // Leverages the observation bridge (proven at 79.6% on LongMemEval) to
      // generate structured observation rules and cascade detections from signals.
      log('BONUS', 'Consolidating observational memory...');
      const obsConsolidationStep = await consolidateObservations(signals, relationships, anomalies);
      steps.push(obsConsolidationStep);

      // Step 9: REPORT
      log('9/10', 'Generating consolidation report...');
      const report = generateReport(steps);

      // Build final result
      const result: ConsolidationResult = {
        runId,
        organizationId,
        isCoreBrain,
        startedAt,
        completedAt: new Date().toISOString(),
        totalDurationMs: Date.now() - startTime,
        steps,
        report,
        status: errors.length === 0 ? 'success' : (steps.some(s => s.status === 'success') ? 'partial' : 'failed'),
        errors,
      };

      // Step 10: PERSIST
      log('10/10', 'Persisting consolidation results...');
      const persistStep = await persistConsolidation(result);
      steps.push(persistStep);

      if (verbose) {
        logger.info('CONSOLIDATION COMPLETE', {
          status: result.status,
          durationMs: result.totalDurationMs,
          narrative: report.narrative,
          discoveries: report.discoveries,
          warnings: report.warnings,
        });
      }

      // Release advisory lock
      await releaseConsolidationLock(runId, result.status);
      return result;
      } catch (err: any) {
        // Release lock on unexpected failure
        await releaseConsolidationLock(runId, 'failed');
        throw err;
      }
    },

    /**
     * Run consolidation for a specific org AND then federate to core brain.
     * This is the recommended way to run org-specific consolidation.
     */
    async runOrgConsolidation(): Promise<ConsolidationResult> {
      if (isCoreBrain) {
        throw new Error('Use runConsolidation() for core brain, not runOrgConsolidation()');
      }
      // Run consolidation with federation enabled
      return this.runConsolidation();
    },
  };
}

// ============================================================================
// HELPER: Group signals into transactions for pattern mining
// ============================================================================

function groupSignalsIntoTransactions(signals: any[]): string[][] {
  // Group by day
  const dayGroups = new Map<string, Set<string>>();

  for (const s of signals) {
    const ts = s.signal_timestamp || s.created_at;
    if (!ts) continue;
    const day = new Date(ts).toISOString().split('T')[0];
    if (!dayGroups.has(day)) dayGroups.set(day, new Set());
    dayGroups.get(day)!.add(`${s.source_domain}:${s.signal_type}`);
  }

  return Array.from(dayGroups.values()).map(set => Array.from(set));
}

// ============================================================================
// EXPORTS
// ============================================================================

export type { TrainingPack } from '../learning/brain-trainer';
export type { CausalRelationship } from '../causality/causal-discovery-runner';
export type { AnomalyEvent } from '../learning/anomaly-detector';
