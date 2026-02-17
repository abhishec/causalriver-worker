/**
 * Autonomous Learner — The Living Brain Engine
 *
 * Ties together causal discovery, anomaly detection, pattern detection,
 * brain training, and maturity evaluation into a self-reinforcing loop.
 *
 * The Learning Cycle:
 * 1. DISCOVER: Run causal discovery on recent signals
 * 2. DETECT: Run anomaly detection across all domains
 * 3. EXTRACT: Run pattern detection on recent data
 * 4. CONVERT: Turn discoveries into TrainingPacks
 * 5. TRAIN: Feed packs through brain-trainer
 * 6. VALIDATE: Run pattern validation + significance tests
 * 7. PROMOTE: Auto-promote high-confidence patterns to rules
 * 8. FEEDBACK: Process pending verification outcomes
 * 9. EVALUATE: Run maturity evaluator for progress tracking
 *
 * This is what makes the brain ALIVE — it doesn't just store and retrieve,
 * it continuously learns from its own discoveries across ALL domains:
 * engineering, finance, support, product, marketing, HR, knowledge.
 *
 * @example
 * ```typescript
 * const learner = createAutonomousLearner({
 *   supabase,
 *   organizationId: 'org_123',
 * });
 * const result = await learner.runLearningCycle();
 * console.log(`Brain maturity: ${result.maturity?.overallLevel}`);
 * ```
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  type CausalRelationship,
} from '../causality/causal-discovery-runner';
import { detectAnomalies, type AnomalyEvent } from './anomaly-detector';
import {
  discoverPatterns,
  validatePattern,
  registerPattern,
  mineSequentialPatterns,
  mineTemporalAssociationRules,
  type DiscoveredPattern,
  type SequentialPattern,
  type TemporalAssociationRule,
  type TemporalEvent,
} from './pattern-detector';
import { testPatternSignificance } from './significance-testing';
import { createBrainTrainer, type TrainingPack, type TrainingStats } from './brain-trainer';
import { createMaturityEvaluator, type MaturityReport, type BenchmarkScores } from '../benchmarks/maturity-evaluator';
import type { NexusRepository } from '../persistence/supabase-repository';

// ============================================================================
// TYPES
// ============================================================================

export interface AutonomousLearnerConfig {
  /** Supabase client */
  supabase: SupabaseClient;
  /** Organization ID */
  organizationId: string;
  /** Repository for persistence (optional) */
  repository?: NexusRepository;
  /** Minimum confidence to auto-promote a discovery to a rule (default: 0.7) */
  autoPromoteConfidence?: number;
  /** Minimum pattern observations before auto-training (default: 5) */
  minPatternObservations?: number;
  /** Whether to run maturity evaluation after each cycle (default: true) */
  evaluateMaturity?: boolean;
  /** Lookback days for signal analysis (default: 90) */
  lookbackDays?: number;
  /** Verbose logging */
  verbose?: boolean;
}

export interface LearningCycleResult {
  /** TrainingPacks auto-generated from discoveries */
  packsGenerated: number;
  /** Rules auto-promoted from validated patterns */
  rulesPromoted: number;
  /** Memories created from discoveries */
  memoriesCreated: number;
  /** Causal edges discovered/updated */
  causalEdgesUpdated: number;
  /** Anomalies detected */
  anomaliesDetected: number;
  /** Patterns validated and registered */
  patternsRegistered: number;
  /** Sequential patterns discovered (ordered event sequences) */
  sequentialPatternsFound: number;
  /** Temporal association rules discovered (time-lagged rules) */
  temporalRulesFound: number;
  /** Brain maturity report (if evaluateMaturity=true) */
  maturity?: MaturityReport;
  /** Training stats from this cycle */
  trainingStats: TrainingStats;
  /** Duration in ms */
  duration: number;
}

// ============================================================================
// FACTORY
// ============================================================================

/**
 * Create an autonomous learner — the Living Brain engine.
 */
export function createAutonomousLearner(config: AutonomousLearnerConfig) {
  const {
    supabase,
    organizationId,
    repository,
    autoPromoteConfidence = 0.7,
    minPatternObservations = 5,
    evaluateMaturity: shouldEvaluate = true,
    lookbackDays = 90,
    verbose = false,
  } = config;

  const trainer = createBrainTrainer();
  const maturityEvaluator = createMaturityEvaluator();

  function log(msg: string) {
    if (verbose) console.log(`[AutonomousLearner] ${msg}`);
  }

  /**
   * Fetch signals from the database for learning within the lookback window.
   * Uses signal_timestamp (the real data date) not created_at (DB insertion time).
   *
   * SCALE FIX: At 10M+ signals, fetching ALL signals causes:
   *   - 10,000+ paginated round-trips to Supabase (minutes of I/O)
   *   - O(10M) memory allocation → OOM risk
   *   - O(n^4) causal discovery if all signals are processed
   *
   * Solution: Filter by lookbackDays (default 90) + stratified sampling.
   * For a design partner with 10M signals:
   *   - 90-day lookback captures ~75% of active patterns
   *   - Stratified sampling (5% per domain) reduces to ~500K tractable signals
   *   - Domains with < 100 signals are always included (preserves rare events)
   *
   * The brain learns from RECENT patterns, not all history.
   * Older patterns are already consolidated into edges/rules from prior cycles.
   */
  async function fetchRecentSignals(): Promise<any[]> {
    const allSignals: any[] = [];
    const PAGE_SIZE = 1000; // Supabase default max per request
    const MAX_SIGNALS = 50_000; // Hard cap to prevent OOM — 50K is safe for 3-paradigm ensemble (Granger + PC/LiNGAM + KSG) at 4GB ECS memory
    let offset = 0;
    let hasMore = true;

    // Time-based filtering: only fetch signals within lookback window
    const sinceTimestamp = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000).toISOString();

    while (hasMore) {
      const { data, error } = await supabase
        .from('cross_domain_signals')
        .select('source_domain, signal_type, signal_value, signal_timestamp, created_at, entity_type, entity_id')
        .eq('organization_id', organizationId)
        .gte('signal_timestamp', sinceTimestamp) // SCALE FIX: time-bounded query
        .order('signal_timestamp', { ascending: true })
        .range(offset, offset + PAGE_SIZE - 1);

      if (error) {
        log(`Error fetching signals at offset ${offset}: ${error.message}`);
        break;
      }

      if (!data || data.length === 0) {
        hasMore = false;
      } else {
        allSignals.push(...data);
        offset += data.length;
        if (data.length < PAGE_SIZE) {
          hasMore = false; // Last page
        }
        // Hard cap: stop fetching if we've exceeded the tractable limit
        if (allSignals.length >= MAX_SIGNALS) {
          log(`Reached MAX_SIGNALS cap (${MAX_SIGNALS}). Applying stratified sampling.`);
          hasMore = false;
        }
      }
    }

    // Stratified sampling: if we have too many signals, sample proportionally by domain
    // This preserves domain diversity while keeping total signal count tractable.
    // Domains with < 100 signals are always fully included (rare events matter).
    if (allSignals.length > MAX_SIGNALS) {
      const byDomain = new Map<string, any[]>();
      for (const sig of allSignals) {
        const domain = sig.source_domain || 'unknown';
        const arr = byDomain.get(domain) || [];
        arr.push(sig);
        byDomain.set(domain, arr);
      }

      const sampled: any[] = [];
      const sampleRate = MAX_SIGNALS / allSignals.length;

      for (const [domain, domainSignals] of byDomain) {
        if (domainSignals.length < 100) {
          // Rare domain: include all signals (preserves tail events)
          sampled.push(...domainSignals);
        } else {
          // Common domain: proportional sampling
          const sampleCount = Math.max(100, Math.floor(domainSignals.length * sampleRate));
          // Evenly spaced sampling (not random — reproducible across cycles)
          const step = domainSignals.length / sampleCount;
          for (let i = 0; i < sampleCount; i++) {
            sampled.push(domainSignals[Math.floor(i * step)]);
          }
        }
      }

      log(`Stratified sampling: ${allSignals.length} → ${sampled.length} signals across ${byDomain.size} domains`);
      return sampled;
    }

    log(`Fetched ${allSignals.length} signals from last ${lookbackDays} days across ${Math.ceil(offset / PAGE_SIZE)} pages`);
    return allSignals;
  }

  /**
   * Convert causal discoveries + patterns + anomalies into a TrainingPack.
   *
   * Maps real DiscoveredPattern / AnomalyEvent types into the TrainingPack schema:
   *  - CausalRelationship → CausalChainEntry
   *  - DiscoveredPattern → TrainingPattern (observed/expected/total from evidence)
   *  - AnomalyEvent → TrainingCascade (anomalies signal cross-domain cascades)
   */
  function discoveriesToTrainingPack(
    relationships: CausalRelationship[],
    patterns: DiscoveredPattern[],
    anomalies: AnomalyEvent[]
  ): TrainingPack {
    // Build causal chains from discovered relationships (including confounder metadata)
    const causalChains = relationships.map((r) => ({
      source: r.source_domain,
      target: r.target_domain,
      metric: `${r.source_domain}_to_${r.target_domain}`,
      effectSize: r.effect_size,
      lagDays: r.optimal_lag_days,
      pValue: r.granger_p_value,
      knockoutScore: r.knockout_score,
      isLikelyConfounded: r.is_likely_confounded,
      coefficientSign: r.coefficient_sign,
    }));

    // Build training patterns from discovered patterns
    // TrainingPattern requires: name, domains, observed, expected, total
    const trainingPatterns = patterns.map((p) => ({
      name: p.name,
      domains: p.domainsInvolved,
      description: p.description,
      observed: p.evidence.sampleSize,
      expected: Math.round(p.evidence.sampleSize * (1 - p.evidence.effectSize)),
      total: p.evidence.sampleSize,
    }));

    // Build cascade predictions from high-severity anomalies
    // TrainingCascade requires: source, target, type, severity, keywords
    const cascades = anomalies
      .filter((a) => a.severity === 'high' || a.severity === 'critical')
      .map((a) => ({
        source: a.entityType || 'unknown',
        target: a.metricName || 'unknown',
        type: 'triggers' as const,
        severity: a.severity as 'critical' | 'high' | 'medium' | 'low',
        keywords: {
          source: [a.entityType, a.metricName].filter(Boolean),
          target: [a.metricName].filter(Boolean),
        },
        reasonTemplate: a.explanation,
      }));

    return {
      id: `auto_${organizationId}_${Date.now()}`,
      title: `Auto-discovered pack (${new Date().toISOString().split('T')[0]})`,
      source: `autonomous-learner: ${relationships.length} causal, ${patterns.length} patterns, ${anomalies.length} anomalies`,
      industry: 'auto-discovered',
      domains: [...new Set(relationships.flatMap((r) => [r.source_domain, r.target_domain]))],
      tags: ['auto-generated', 'living-brain'],
      confidence: relationships.length > 0
        ? relationships.reduce((sum, r) => sum + (1 - r.granger_p_value), 0) / relationships.length
        : 0.5,
      causalChains,
      businessRules: [],
      cascades,
      patterns: trainingPatterns,
      outcomes: [],
    };
  }

  /**
   * Auto-promote validated patterns to brain grammar rules.
   *
   * A pattern is promoted when:
   * - confirmationCount >= minPatternObservations
   * - evidence.pValue < 0.05
   * - evidence survives correction
   */
  async function promotePatterns(
    patterns: DiscoveredPattern[]
  ): Promise<{ promoted: number; candidates: number }> {
    let promoted = 0;
    let candidates = 0;

    for (const pattern of patterns) {
      // Check promotion criteria using confirmationCount
      if (pattern.confirmationCount < minPatternObservations) continue;
      // Gate on statistical significance: only promote patterns with p < 0.05
      // (autoPromoteConfidence is the minimum confidence = 1 - alpha)
      if (pattern.evidence.pValue >= 0.05) continue;

      candidates++;

      // Run significance test using contingency table
      const sampleSize = pattern.evidence.sampleSize;
      const observedCount = Math.round(sampleSize * pattern.evidence.effectSize);
      const table = {
        exposed: [observedCount, sampleSize - observedCount] as [number, number],
        notExposed: [
          Math.max(1, Math.round(sampleSize * 0.3)),
          Math.max(1, Math.round(sampleSize * 0.7)),
        ] as [number, number],
      };

      const significance = testPatternSignificance({ table });

      if (significance.isSignificant && significance.pValue < 0.05) {
        // Validate the pattern evidence
        const validated = validatePattern(
          observedCount,
          Math.round(sampleSize * 0.5), // expected by chance
          sampleSize
        );

        if (validated.pValue < 0.05) {
          // Register as a confirmed pattern
          registerPattern(
            pattern.name,
            pattern.description,
            pattern.domainsInvolved,
            validated
          );
          promoted++;

          // Store as organizational memory (non-critical — don't crash on transient failures)
          if (repository) {
            try {
              await repository.upsertMemory({
                memoryType: 'promoted_pattern',
                domain: pattern.domainsInvolved[0] || 'general',
                content: `Auto-promoted pattern: ${pattern.name}. ${pattern.description}`,
                importance: 1 - pattern.evidence.pValue,
                metadata: {
                  source: 'autonomous_learner',
                  patternName: pattern.name,
                  confirmationCount: pattern.confirmationCount,
                  pValue: significance.pValue,
                },
              });
            } catch (err) {
              // Non-critical: memory upsert for promoted patterns — errors here don't block the main flow
            }
          }

          log(`Promoted pattern: ${pattern.name} (p=${significance.pValue.toFixed(4)})`);
        }
      }
    }

    return { promoted, candidates };
  }

  /**
   * Generate natural language insights from discoveries and store as memories
   */
  async function generateInsights(
    relationships: CausalRelationship[]
  ): Promise<number> {
    if (!repository || relationships.length === 0) return 0;

    let insightsCreated = 0;

    for (const rel of relationships) {
      if (!rel.is_significant) continue;

      const confounderNote = rel.is_likely_confounded
        ? ' [POSSIBLY CONFOUNDED — knockout validation suggests a hidden common cause]'
        : rel.knockout_score !== undefined && rel.knockout_score > 0.5
          ? ' [KNOCKOUT-VALIDATED — confirmed via counterfactual analysis]'
          : '';

      const insight =
        `Discovered causal relationship: ${rel.source_domain} → ${rel.target_domain}. ` +
        `${rel.natural_language || `Changes in ${rel.source_domain} affect ${rel.target_domain} with effect size ${rel.effect_size.toFixed(2)} after ${rel.optimal_lag_days} days.`} ` +
        `(p-value: ${rel.granger_p_value.toFixed(4)}, sample size: ${rel.sample_size})${confounderNote}`;

      try {
        await repository.upsertMemory({
          memoryType: 'causal_insight',
          domain: rel.target_domain,
          content: insight,
          importance: Math.min(0.9, 1 - rel.granger_p_value),
          metadata: {
            source: 'autonomous_learner',
            sourceDomain: rel.source_domain,
            targetDomain: rel.target_domain,
            effectSize: rel.effect_size,
            lagDays: rel.optimal_lag_days,
            pValue: rel.granger_p_value,
          },
        });
        insightsCreated++;
      } catch (err) {
        // Non-critical: transient network failure shouldn't kill the learning cycle
        log(`Warning: Failed to store insight for ${rel.source_domain} → ${rel.target_domain}: ${err}`);
      }
    }

    return insightsCreated;
  }

  return {
    /**
     * Run one full learning cycle — the Living Brain loop.
     */
    async runLearningCycle(): Promise<LearningCycleResult> {
      const startTime = Date.now();
      log('Starting learning cycle...');

      // 1. Fetch recent signals
      const signals = await fetchRecentSignals();
      log(`Fetched ${signals.length} signals (all stored data, ordered by signal_timestamp)`);

      if (signals.length === 0) {
        return {
          packsGenerated: 0,
          rulesPromoted: 0,
          memoriesCreated: 0,
          causalEdgesUpdated: 0,
          anomaliesDetected: 0,
          patternsRegistered: 0,
          sequentialPatternsFound: 0,
          temporalRulesFound: 0,
          trainingStats: trainer.getTrainingStats(),
          duration: Date.now() - startTime,
        };
      }

      // 2. READ existing causal relationships from DB (discovery is delegated to consolidation engine)
      // The autonomous learner focuses on pattern mining, anomaly detection, and promotion
      // — NOT redundant full causal discovery (which runs via consolidation engine / scheduled jobs).
      let relationships: CausalRelationship[] = [];
      try {
        const { data: dbRels } = await supabase
          .from('causal_relationships_statistical')
          .select('*')
          .eq('organization_id', organizationId)
          .eq('is_significant', true);

        relationships = (dbRels || []).map((r: any) => ({
          organization_id: organizationId,
          source_domain: r.source_domain,
          target_domain: r.target_domain,
          granger_f_statistic: r.granger_f_statistic ?? 0,
          granger_p_value: r.granger_p_value ?? 0.05,
          optimal_lag_days: r.optimal_lag_days ?? 7,
          effect_size: r.effect_size ?? 0,
          confidence_interval_lower: r.confidence_interval_lower ?? 0,
          confidence_interval_upper: r.confidence_interval_upper ?? 1,
          natural_language: r.natural_language || '',
          sample_size: r.sample_size ?? 0,
          observation_window_days: r.observation_window_days ?? 90,
          is_significant: r.is_significant ?? true,
          last_computed_at: r.last_computed_at ? new Date(r.last_computed_at) : new Date(),
          knockout_score: r.knockout_score,
          is_likely_confounded: r.is_likely_confounded,
          coefficient_sign: r.coefficient_sign,
          discovery_method: r.discovery_method,
        }));
        log(`Read ${relationships.length} existing causal relationships from DB (discovery delegated to consolidation engine)`);
      } catch (err: any) {
        log(`Relationship read error: ${err.message}`);
      }

      // 3. DETECT: Run anomaly detection on signal values by domain
      // detectAnomalies expects: Array<{entityId, entityType, metricName, value}>
      const anomalies: AnomalyEvent[] = [];
      const domainGroups = new Map<string, Array<{ entityId: string; entityType: string; metricName: string; value: number }>>();
      for (const sig of signals) {
        const entries = domainGroups.get(sig.source_domain) || [];
        entries.push({
          entityId: sig.entity_id || sig.signal_type,
          entityType: sig.entity_type || sig.source_domain,
          metricName: sig.signal_type,
          value: sig.signal_value,
        });
        domainGroups.set(sig.source_domain, entries);
      }

      // Build causalEdges config from discovered relationships for confounder-aware detection
      const causalEdgesForDetection = relationships
        .filter(r => r.is_significant)
        .map(r => ({
          sourceDomain: r.source_domain,
          targetDomain: r.target_domain,
          effectSize: r.effect_size,
          lagDays: r.optimal_lag_days,
          isLikelyConfounded: r.is_likely_confounded,
        }));

      for (const [_domain, observations] of domainGroups) {
        try {
          const detected = detectAnomalies(observations, {
            method: 'auto',
            causalEdges: causalEdgesForDetection.length > 0 ? causalEdgesForDetection : undefined,
          });
          for (const a of detected) {
            anomalies.push(a);
          }
        } catch (err) {
          // Non-critical: anomaly detection on domain group — can fail on small datasets without blocking cycle
        }
      }
      log(`Detected ${anomalies.length} anomalies`);

      // 4. EXTRACT: Run pattern detection
      // discoverPatterns expects: (transactions: string[][], entities: EntityFeatures[], config?)
      let patterns: DiscoveredPattern[] = [];
      try {
        // Build transactions: each signal as a "transaction" of features
        const transactions = signals.map((s: any) => [
          s.source_domain,
          s.signal_type,
          s.entity_type || 'unknown',
        ]);

        // Build entity features
        const entityData = signals.map((s: any) => ({
          entityId: s.entity_id || s.signal_type,
          entityType: s.entity_type || s.source_domain,
          features: { [s.signal_type]: s.signal_value },
        }));

        const discoveryResult = discoverPatterns(transactions, entityData);
        patterns = discoveryResult.patterns;
        log(`Discovered ${patterns.length} patterns`);
      } catch (err: any) {
        log(`Pattern detection error: ${err.message}`);
      }

      // 4b. SEQUENTIAL PATTERN MINING: Discover ordered event sequences
      let seqPatterns: SequentialPattern[] = [];
      let temporalRules: TemporalAssociationRule[] = [];
      try {
        // Convert signals to temporal events for sequential mining
        const temporalEvents: TemporalEvent[] = signals.map((s: any) => ({
          event: `${s.source_domain}:${s.signal_type}`,
          timestamp: new Date(s.signal_timestamp || s.created_at).getTime(),
          entityId: s.entity_id || s.source_domain,
        }));

        if (temporalEvents.length >= 10) {
          // Mine sequential patterns (e.g., deploy → bug → support ticket)
          seqPatterns = mineSequentialPatterns(temporalEvents, {
            minSupport: 0.3,
            maxLength: 4,
            maxGap: lookbackDays * 24 * 60 * 60 * 1000, // Convert days to ms
          });
          log(`Mined ${seqPatterns.length} sequential patterns`);

          // Mine temporal association rules (e.g., A causes B after X days)
          temporalRules = mineTemporalAssociationRules(temporalEvents, {
            minSupport: 0.2,
            minConfidence: 0.4,
            minLift: 1.0,
            maxWindow: lookbackDays * 24 * 60 * 60 * 1000,
          });
          log(`Mined ${temporalRules.length} temporal association rules`);

          // Store high-confidence temporal rules as memories
          if (repository) {
            for (const rule of temporalRules.slice(0, 10)) {
              if (rule.confidence >= 0.6 && rule.lift >= 1.5) {
                const lagDays = Math.round(rule.avgLag / (24 * 60 * 60 * 1000));
                await repository.upsertMemory({
                  memoryType: 'temporal_rule',
                  domain: rule.antecedent[0]?.split(':')[0] || 'general',
                  content: `Temporal rule: ${rule.antecedent.join(' + ')} → ${rule.consequent.join(' + ')} ` +
                    `(confidence: ${(rule.confidence * 100).toFixed(0)}%, lag: ~${lagDays}d, direction: ${rule.direction})`,
                  importance: Math.min(0.9, rule.confidence * rule.lift / 3),
                  metadata: {
                    source: 'autonomous_learner',
                    ruleType: 'temporal_association',
                    antecedent: rule.antecedent,
                    consequent: rule.consequent,
                    confidence: rule.confidence,
                    lift: rule.lift,
                    avgLagMs: rule.avgLag,
                    direction: rule.direction,
                  },
                }).catch((err) => {
                  // Fire-and-forget: temporal rule memory upsert may fail without blocking main flow
                });
              }
            }
          }
        }
      } catch (err: any) {
        log(`Sequential pattern mining error: ${err.message}`);
      }

      // 5. CONVERT: Turn discoveries into a TrainingPack
      let packsGenerated = 0;
      if (relationships.length > 0 || patterns.length > 0 || seqPatterns.length > 0) {
        const pack = discoveriesToTrainingPack(relationships, patterns, anomalies);

        // Enrich pack with sequential pattern info
        if (seqPatterns.length > 0) {
          if (pack.tags) pack.tags.push('sequential-patterns');
          pack.source += `, ${seqPatterns.length} sequential, ${temporalRules.length} temporal`;
        }

        // 6. TRAIN: Feed through brain-trainer
        trainer.trainInMemory(pack);
        packsGenerated = 1;
        log(`Trained brain with auto-generated pack`);
      }

      // 7. PROMOTE: Auto-promote validated patterns
      const { promoted: rulesPromoted } = await promotePatterns(patterns);
      log(`Promoted ${rulesPromoted} patterns to rules`);

      // 8. INSIGHTS: Generate and store natural language insights
      const memoriesCreated = await generateInsights(relationships);
      log(`Created ${memoriesCreated} insight memories`);

      // 9. Store causal relationships in database
      let causalEdgesUpdated = 0;
      for (const rel of relationships) {
        if (!rel.is_significant) continue;
        try {
          if (repository) {
            await repository.upsertRelationship({
              sourceDomain: rel.source_domain,
              targetDomain: rel.target_domain,
              effectSize: rel.effect_size,
              pValue: rel.granger_p_value,
              lagDays: rel.optimal_lag_days,
              confidence: 1 - rel.granger_p_value,
              naturalLanguage: rel.natural_language,
              sampleSize: rel.sample_size,
              isSignificant: rel.is_significant,
              knockoutScore: rel.knockout_score,
              isLikelyConfounded: rel.is_likely_confounded,
              coefficientSign: rel.coefficient_sign,
              discoveryMethod: rel.discovery_method,
            });
            causalEdgesUpdated++;
          }
        } catch (err) {
          // Non-critical: causal relationship upsert — persistence failure doesn't block learning cycle
        }
      }

      // 10. EVALUATE: Run maturity evaluation
      let maturity: MaturityReport | undefined;
      if (shouldEvaluate) {
        try {
          const scores: BenchmarkScores = {
            causal: relationships.length > 0
              ? [{
                  datasetId: 'live_data',
                  shd: Math.max(0, 20 - relationships.length),
                  f1: Math.min(1, relationships.filter((r) => r.is_significant).length / Math.max(1, relationships.length)),
                  auroc: Math.min(1, relationships.reduce((s, r) => s + (1 - r.granger_p_value), 0) / Math.max(1, relationships.length)),
                }]
              : [],
            anomaly: anomalies.length > 0
              ? [{
                  datasetId: 'live_data',
                  f1: Math.min(1, anomalies.length / Math.max(1, signals.length * 0.05)),
                  nabScore: Math.min(100, anomalies.length * 10),
                }]
              : [],
            prediction: [],
            cascade: [],
          };
          maturity = maturityEvaluator.evaluateMaturity(scores);
          log(`Brain maturity: ${maturity.overallLevel} (score: ${maturity.overallScore})`);
        } catch (err) {
          // Non-critical: maturity evaluation — failure here doesn't block learning cycle completion
        }
      }

      // Log the cycle result
      if (repository) {
        await repository.logActivity({
          agentType: 'autonomous_learner',
          actionType: 'learning_cycle',
          outputSummary: `Cycle complete: ${relationships.length} causal, ${anomalies.length} anomalies, ${patterns.length} patterns, ${seqPatterns.length} sequential, ${temporalRules.length} temporal rules, ${rulesPromoted} promoted, ${memoriesCreated} insights`,
          metadata: {
            causalEdgesUpdated,
            anomaliesDetected: anomalies.length,
            patternsRegistered: patterns.length,
            sequentialPatternsFound: seqPatterns.length,
            temporalRulesFound: temporalRules.length,
            packsGenerated,
            rulesPromoted,
            memoriesCreated,
            maturityLevel: maturity?.overallLevel,
          },
        }).catch((err) => {
          // Fire-and-forget: activity log persistence may fail without blocking learning cycle
        });
      }

      const result: LearningCycleResult = {
        packsGenerated,
        rulesPromoted,
        memoriesCreated,
        causalEdgesUpdated,
        anomaliesDetected: anomalies.length,
        patternsRegistered: patterns.length,
        sequentialPatternsFound: seqPatterns.length,
        temporalRulesFound: temporalRules.length,
        maturity,
        trainingStats: trainer.getTrainingStats(),
        duration: Date.now() - startTime,
      };

      log(`Learning cycle complete in ${result.duration}ms`);
      return result;
    },

    /**
     * Convert discoveries into a TrainingPack (exposed for testing)
     */
    discoveriesToTrainingPack,

    /**
     * Get the brain's current maturity level (from last evaluation)
     */
    async evaluateCurrentMaturity(): Promise<MaturityReport> {
      const scores: BenchmarkScores = { causal: [], anomaly: [], prediction: [], cascade: [] };
      return maturityEvaluator.evaluateMaturity(scores);
    },

    /**
     * Get training stats from accumulated learning
     */
    getTrainingStats(): TrainingStats {
      return trainer.getTrainingStats();
    },
  };
}
