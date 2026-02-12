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
import { createSupabaseRepository } from '../persistence/supabase-repository';
import { getDefaultLogger, type NexusLogger } from '../observability';

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
    minEdgeWeight = 0.15,
    minAccuracyForBoost = 0.6,
    accuracyBoostFactor = 1.08,
    stalePruneFactor = 0.92,
    discoveryLookbackDays = 90,
    minObservations = 5,
    autoPromoteConfidence = 0.7,
    runFederation = organizationId !== CORE_BRAIN_ORG_ID,
    runThresholdOptimization = true,
    verbose = false,
  } = config;

  const isCoreBrain = organizationId === CORE_BRAIN_ORG_ID;
  const repository = createSupabaseRepository(supabase, organizationId);
  const trainer = createBrainTrainer();
  const logger = config.logger ?? getDefaultLogger().child({ module: 'consolidation', orgId: organizationId.substring(0, 8) });

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
      const allSignals: any[] = [];
      const PAGE_SIZE = 1000;
      let offset = 0;
      let hasMore = true;

      while (hasMore) {
        const { data, error } = await supabase
          .from('cross_domain_signals')
          .select('source_domain, signal_type, signal_value, signal_timestamp, created_at, entity_type, entity_id')
          .eq('organization_id', organizationId)
          .gte('created_at', cutoff)
          .order('signal_timestamp', { ascending: true })
          .range(offset, offset + PAGE_SIZE - 1);

        if (error || !data || data.length === 0) {
          hasMore = false;
        } else {
          allSignals.push(...data);
          offset += data.length;
          if (data.length < PAGE_SIZE) hasMore = false;
        }
      }

      // If we got very few recent signals, also fetch ALL signals for discovery
      // (causal discovery needs historical context, not just last 48h)
      let allHistoricalSignals = allSignals;
      if (allSignals.length < 100) {
        log('FETCH', 'Few recent signals, fetching full history for causal discovery...');
        const fullSignals: any[] = [];
        offset = 0;
        hasMore = true;

        while (hasMore) {
          const { data, error } = await supabase
            .from('cross_domain_signals')
            .select('source_domain, signal_type, signal_value, signal_timestamp, created_at')
            .eq('organization_id', organizationId)
            .order('signal_timestamp', { ascending: true })
            .range(offset, offset + PAGE_SIZE - 1);

          if (error || !data || data.length === 0) {
            hasMore = false;
          } else {
            fullSignals.push(...data);
            offset += data.length;
            if (data.length < PAGE_SIZE) hasMore = false;
          }
        }
        allHistoricalSignals = fullSignals;
      }

      log('FETCH', `${allSignals.length} recent signals (last ${lookbackHours}h), ${allHistoricalSignals.length} total historical`);

      return {
        signals: allHistoricalSignals,
        step: {
          step: 'fetch',
          status: 'success',
          durationMs: Date.now() - start,
          details: {
            recentSignals: allSignals.length,
            totalHistorical: allHistoricalSignals.length,
            lookbackHours,
            domains: [...new Set(allHistoricalSignals.map((s: any) => s.source_domain))],
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
          minSupport: 0.05,
          minConfidence: 0.5,
          temporalEvents,
        }
      );
      const patterns = discoveryResult.patterns || [];

      // Sequential pattern mining (PrefixSpan)
      const sequentialPatterns = mineSequentialPatterns(temporalEvents, {
        minSupport: 3,
        maxGap: 7 * 24 * 60 * 60 * 1000, // 7 days max gap
        maxLength: 5,
      });

      // Temporal association rules
      const temporalRules = mineTemporalAssociationRules(temporalEvents, {
        minSupport: 3,
        minConfidence: 0.5,
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
        } catch {
          // Non-critical — continue
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
        } catch {
          // Non-critical
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
        } catch {
          // Non-critical — skip this relationship
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

    // Extract stats from step results
    for (const step of steps) {
      switch (step.step) {
        case 'fetch':
          stats.signalsProcessed = (step.details.totalHistorical as number) || 0;
          break;
        case 'causal_discovery':
          stats.causalEdgesDiscovered = (step.details.totalDiscovered as number) || 0;
          stats.newRelationships = (step.details.newRelationships as number) || 0;
          stats.lostRelationships = (step.details.lostRelationships as number) || 0;
          if (stats.newRelationships > 0) {
            discoveries.push(`Discovered ${stats.newRelationships} new causal relationship${stats.newRelationships > 1 ? 's' : ''}`);
          }
          if (stats.lostRelationships > 0) {
            warnings.push(`${stats.lostRelationships} previously-known relationship${stats.lostRelationships > 1 ? 's' : ''} no longer significant`);
          }
          break;
        case 'anomaly_detection':
          stats.anomaliesDetected = (step.details.anomaliesDetected as number) || 0;
          if (stats.anomaliesDetected > 0) {
            const domains = step.details.affectedDomains as string[] || [];
            discoveries.push(`Detected ${stats.anomaliesDetected} anomal${stats.anomaliesDetected > 1 ? 'ies' : 'y'} in: ${domains.join(', ')}`);
          }
          break;
        case 'pattern_mining':
          stats.patternsFound = (step.details.frequentPatterns as number) || 0;
          stats.sequentialPatternsFound = (step.details.sequentialPatterns as number) || 0;
          stats.temporalRulesFound = (step.details.temporalRules as number) || 0;
          if (stats.patternsFound > 0) {
            discoveries.push(`Found ${stats.patternsFound} co-occurrence patterns across domains`);
          }
          if (stats.temporalRulesFound > 0) {
            discoveries.push(`Discovered ${stats.temporalRulesFound} temporal rules (cause-effect sequences with time lags)`);
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
            discoveries.push(`Strengthened ${stats.edgesStrengthened} causal edge${stats.edgesStrengthened > 1 ? 's' : ''} based on verified predictions`);
          }
          break;
      }

      if (step.status === 'error') {
        warnings.push(`Step "${step.step}" failed: ${step.details.error || 'unknown error'}`);
      }
    }

    // Build narrative
    const parts: string[] = [];
    parts.push(`Brain consolidation processed ${stats.signalsProcessed.toLocaleString()} signals.`);

    if (stats.causalEdgesDiscovered > 0) {
      parts.push(`The 3-paradigm causal ensemble (Parametric + Structural + Info-theoretic) identified ${stats.causalEdgesDiscovered} causal relationships.`);
    }
    if (stats.newRelationships > 0) {
      parts.push(`${stats.newRelationships} are newly discovered connections the brain didn't know about before.`);
    }
    if (stats.anomaliesDetected > 0) {
      parts.push(`${stats.anomaliesDetected} anomalies were flagged for attention.`);
    }
    if (stats.patternsFound > 0) {
      parts.push(`Pattern mining revealed ${stats.patternsFound} recurring signal combinations.`);
    }
    if (stats.edgesStrengthened > 0) {
      parts.push(`${stats.edgesStrengthened} causal edges were validated by real-world outcomes and strengthened.`);
    }
    if (stats.edgesPruned > 0) {
      parts.push(`${stats.edgesPruned} weak edges were pruned to keep the graph accurate.`);
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
        inputSummary: `Consolidated ${result.report.stats.signalsProcessed} signals for ${isCoreBrain ? 'core brain' : 'org ' + organizationId.substring(0, 8)}`,
        outputSummary: result.report.narrative.substring(0, 500),
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

  // ══════════════════════════════════════════════════════════════════
  // MAIN: Run the 10-step consolidation cycle
  // ══════════════════════════════════════════════════════════════════

  // ── Consolidation Race Lock ──────────────────────────────────────
  // Prevents concurrent consolidation runs on the same org.
  // Uses the consolidation_runs table as an advisory lock.

  async function acquireConsolidationLock(runId: string): Promise<boolean> {
    try {
      // Check for active consolidation in the last 30 minutes
      const lockWindow = new Date(Date.now() - 30 * 60 * 1000).toISOString();
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
    } catch {
      // Non-fatal — lock will expire naturally
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
        console.log(`\n${'='.repeat(70)}`);
        console.log(`  BRAIN CONSOLIDATION ("Sleep") — ${isCoreBrain ? 'Core Brain' : 'Org: ' + organizationId.substring(0, 8)}`);
        console.log(`  Run: ${runId}`);
        console.log(`${'='.repeat(70)}\n`);
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
        console.log(`\n${'='.repeat(70)}`);
        console.log(`  CONSOLIDATION COMPLETE — ${result.status.toUpperCase()}`);
        console.log(`  Duration: ${(result.totalDurationMs / 1000).toFixed(1)}s`);
        console.log(`${'='.repeat(70)}`);
        console.log(`\n${report.narrative}\n`);
        if (report.discoveries.length > 0) {
          console.log('Discoveries:');
          for (const d of report.discoveries) console.log(`  + ${d}`);
        }
        if (report.warnings.length > 0) {
          console.log('Warnings:');
          for (const w of report.warnings) console.log(`  ! ${w}`);
        }
        console.log('');
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
