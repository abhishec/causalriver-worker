/**
 * Brain Trainer — Generic Model Training Pipeline
 *
 * Train NexusBrain from any structured business knowledge: case studies,
 * industry reports, internal analyses, historical data, domain expertise,
 * or community-contributed training packs.
 *
 * Pre-loads causal relationships, brain rules, cascade predictions,
 * patterns, and prediction/outcome pairs into all 7 layers.
 *
 * Open source: Anyone can create and share TrainingPack data to make
 * the brain smarter. See the built-in TRAINING_LIBRARY for examples.
 *
 * Supports two modes:
 * - In-memory (Tier 1): Load causal graph + patterns with zero dependencies
 * - Persistent (Tier 2+): Load everything into Supabase for cross-session knowledge
 *
 * @example
 * ```typescript
 * import { createBrainTrainer, TRAINING_LIBRARY } from '@nexus-ai/memory-stack';
 *
 * const trainer = createBrainTrainer();
 * for (const pack of TRAINING_LIBRARY) { trainer.trainInMemory(pack); }
 * console.log(trainer.getTrainingStats());
 * ```
 */

import { createCausalGraphBuilder } from '../causality/causal-graph-builder';
import type { CausalEdge } from '../causality/causal-graph-builder';
import type { ConfidenceInterval } from '../causality/statistical-tests';
import { validatePattern, registerPattern } from './pattern-detector';
import type { DiscoveredPattern, PatternEvidence } from './pattern-detector';
import { generateEmbedding } from '../core/embeddings/embedding-engine';
import type {
  BrainGrammarRule,
  ConditionGroup,
  RuleAction,
  MemoryType,
} from '../types';

// ============================================================================
// TRAINING PACK SCHEMA
// ============================================================================

/**
 * A causal relationship to teach the brain.
 * Describes "X causes Y with this effect size after N days".
 */
export interface CausalChainEntry {
  /** Source domain (e.g. "finance", "cs", "product") */
  source: string;
  /** Target domain being affected */
  target: string;
  /** Metric being impacted (e.g. "health_score", "churn_rate") */
  metric: string;
  /** Standardized effect size (0-1 range, negative for inverse) */
  effectSize: number;
  /** Time lag in days before cause becomes effect */
  lagDays: number;
  /** Statistical significance (lower = stronger evidence, default 0.01) */
  pValue?: number;
}

/**
 * A business rule to teach the brain.
 * Uses the same condition/action grammar as BrainGrammarRule.
 */
export interface TrainingRule {
  /** Human-readable rule title */
  title: string;
  /** Entity this rule applies to (e.g. "client", "deal", "account") */
  entityType: string;
  /** When these conditions are true... */
  when: ConditionGroup;
  /** ...then take these actions */
  then: RuleAction[];
  /** Human-readable explanation */
  naturalLanguage: string;
  /** Priority (higher = evaluated first) */
  priority?: number;
}

/**
 * A cascade relationship between domains.
 * Describes how problems in one domain ripple to another.
 */
export interface TrainingCascade {
  /** Domain where the issue starts */
  source: string;
  /** Domain that gets impacted */
  target: string;
  /** How the impact flows */
  type: 'blocks' | 'delays' | 'impacts' | 'enables' | 'triggers';
  /** How severe is the cascade */
  severity: 'critical' | 'high' | 'medium' | 'low';
  /** Keywords that identify this cascade in signals */
  keywords: {
    source: string[];
    target: string[];
  };
  /** Template for alert messages */
  reasonTemplate?: string;
}

/**
 * A pattern to teach the brain, with statistical evidence.
 */
export interface TrainingPattern {
  /** Pattern name */
  name: string;
  /** Domains involved */
  domains: string[];
  /** Description of the pattern */
  description?: string;
  /** How many times this pattern was observed */
  observed: number;
  /** How many times it was expected by chance */
  expected: number;
  /** Total observations in the dataset */
  total: number;
}

/**
 * A prediction/outcome pair for calibrating the feedback loop.
 */
export interface TrainingOutcome {
  /** What was predicted */
  predicted: string;
  /** Confidence in the prediction (0-1) */
  predictedConfidence: number;
  /** What actually happened */
  actual: string;
  /** Whether the prediction was correct */
  wasCorrect: boolean;
  /** Source domain of prediction */
  sourceDomain?: string;
  /** Target domain of prediction */
  targetDomain?: string;
}

/**
 * A training pack — structured business knowledge the brain can learn from.
 *
 * Anyone can create these from case studies, industry reports, internal
 * analyses, historical data, or domain expertise. Share them as JSON
 * to help the community build smarter brains.
 */
export interface TrainingPack {
  /** Unique identifier */
  id: string;
  /** Training pack title */
  title: string;
  /** Where this knowledge came from */
  source: string;
  /** Industry vertical (e.g. "SaaS", "FinTech", "Retail") */
  industry: string;
  /** Business domains involved */
  domains: string[];

  /** Causal relationships to teach */
  causalChains: CausalChainEntry[];
  /** Business rules derived from outcomes */
  businessRules: TrainingRule[];
  /** Cross-domain cascade effects */
  cascades: TrainingCascade[];
  /** Patterns with statistical backing */
  patterns: TrainingPattern[];
  /** Prediction/outcome pairs for feedback loop */
  outcomes: TrainingOutcome[];

  /** Raw narrative text for semantic embedding (optional) */
  narrative?: string;
  /** Confidence in this knowledge's general applicability (0-1) */
  confidence: number;
  /** Tags for categorization */
  tags?: string[];
  /** Version for tracking updates to this pack */
  version?: string;
  /** Original author or contributor */
  author?: string;
}

// ============================================================================
// TRAINING RESULT TYPES
// ============================================================================

export interface TrainingStats {
  casesLoaded: number;
  causalEdgesLoaded: number;
  rulesLoaded: number;
  cascadesLoaded: number;
  patternsLoaded: number;
  outcomesLoaded: number;
  embeddingsGenerated: number;
  errors: string[];
}

export interface PackTrainingResult {
  packId: string;
  success: boolean;
  causalEdges: number;
  rules: number;
  cascades: number;
  patterns: number;
  outcomes: number;
  errors: string[];
}

export interface PackValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

// ============================================================================
// CONFIG
// ============================================================================

export interface BrainTrainerConfig {
  /** Default sample size to assign training evidence (default: 100) */
  defaultSampleSize?: number;
  /** Default F-statistic for causal edges (default: 8.0) */
  defaultFStatistic?: number;
  /** Whether trained rules should be active immediately (default: true) */
  autoActivateRules?: boolean;
}

// ============================================================================
// TRAINER IMPLEMENTATION
// ============================================================================

/**
 * Create a brain trainer for pre-loading business knowledge into NexusBrain.
 *
 * Works with any structured knowledge source: case studies, industry reports,
 * internal analyses, community-contributed training packs, or historical data.
 *
 * @example In-memory (zero dependencies)
 * ```typescript
 * const trainer = createBrainTrainer();
 * trainer.trainInMemory(trainingPack);
 * console.log(trainer.getTrainingStats());
 * ```
 *
 * @example Persistent (with Supabase)
 * ```typescript
 * const trainer = createBrainTrainer();
 * await trainer.train(supabase, 'org_123', trainingPack);
 * ```
 */
export function createBrainTrainer(config: BrainTrainerConfig = {}) {
  const {
    defaultSampleSize = 100,
    defaultFStatistic = 8.0,
    autoActivateRules = true,
  } = config;

  // In-memory stores
  const graphBuilder = createCausalGraphBuilder();
  const trainedPatterns: DiscoveredPattern[] = [];
  const trainedRules: BrainGrammarRule[] = [];

  // Stats tracking
  const stats: TrainingStats = {
    casesLoaded: 0,
    causalEdgesLoaded: 0,
    rulesLoaded: 0,
    cascadesLoaded: 0,
    patternsLoaded: 0,
    outcomesLoaded: 0,
    embeddingsGenerated: 0,
    errors: [],
  };

  // ── Validation ──────────────────────────────────────────────────────────

  function validatePack(pack: TrainingPack): PackValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!pack.id || pack.id.trim() === '') errors.push('Training pack must have an id');
    if (!pack.title || pack.title.trim() === '') errors.push('Training pack must have a title');
    if (!pack.source || pack.source.trim() === '') errors.push('Training pack must have a source');
    if (!pack.industry || pack.industry.trim() === '') errors.push('Training pack must have an industry');
    if (!pack.domains || pack.domains.length === 0) errors.push('Training pack must have at least one domain');
    if (typeof pack.confidence !== 'number' || pack.confidence < 0 || pack.confidence > 1) {
      errors.push('Confidence must be between 0 and 1');
    }

    // Validate causal chains
    for (let i = 0; i < (pack.causalChains || []).length; i++) {
      const chain = pack.causalChains[i];
      if (!chain.source) errors.push(`causalChains[${i}]: missing source`);
      if (!chain.target) errors.push(`causalChains[${i}]: missing target`);
      if (typeof chain.effectSize !== 'number') errors.push(`causalChains[${i}]: effectSize must be a number`);
      if (typeof chain.lagDays !== 'number' || chain.lagDays < 0) errors.push(`causalChains[${i}]: lagDays must be a non-negative number`);
      if (chain.source === chain.target) warnings.push(`causalChains[${i}]: source and target are the same domain`);
    }

    // Validate business rules
    for (let i = 0; i < (pack.businessRules || []).length; i++) {
      const rule = pack.businessRules[i];
      if (!rule.title) errors.push(`businessRules[${i}]: missing title`);
      if (!rule.entityType) errors.push(`businessRules[${i}]: missing entityType`);
      if (!rule.when || !rule.when.logic) errors.push(`businessRules[${i}]: missing or invalid 'when' condition`);
      if (!rule.then || rule.then.length === 0) errors.push(`businessRules[${i}]: must have at least one 'then' action`);
    }

    // Validate cascades
    for (let i = 0; i < (pack.cascades || []).length; i++) {
      const cascade = pack.cascades[i];
      if (!cascade.source) errors.push(`cascades[${i}]: missing source`);
      if (!cascade.target) errors.push(`cascades[${i}]: missing target`);
      if (!cascade.type) errors.push(`cascades[${i}]: missing type`);
      if (!cascade.severity) errors.push(`cascades[${i}]: missing severity`);
    }

    // Validate patterns
    for (let i = 0; i < (pack.patterns || []).length; i++) {
      const pattern = pack.patterns[i];
      if (!pattern.name) errors.push(`patterns[${i}]: missing name`);
      if (!pattern.domains || pattern.domains.length === 0) errors.push(`patterns[${i}]: missing domains`);
      if (pattern.observed < 0 || pattern.expected <= 0 || pattern.total <= 0) {
        errors.push(`patterns[${i}]: invalid counts (observed >= 0, expected > 0, total > 0)`);
      }
    }

    // Warnings
    if ((pack.causalChains || []).length === 0) warnings.push('No causal chains — consider adding them for maximum value');
    if ((pack.outcomes || []).length === 0) warnings.push('No outcomes — feedback loop cannot be seeded');
    if (!pack.narrative) warnings.push('No narrative — semantic embedding will be skipped');

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  // ── In-Memory Training (Tier 1) ────────────────────────────────────────

  function trainCausalEdgesInMemory(pack: TrainingPack): number {
    let loaded = 0;
    for (const chain of pack.causalChains || []) {
      const edge: CausalEdge = {
        source: chain.source,
        target: chain.target,
        effectSize: Math.abs(chain.effectSize),
        confidenceInterval: computeCI(chain.effectSize, pack.confidence),
        lagDays: chain.lagDays,
        pValue: chain.pValue ?? 0.01,
        fStatistic: defaultFStatistic,
        sampleSize: defaultSampleSize,
        discoveredAt: new Date(),
        lastValidated: new Date(),
        isActive: true,
      };
      graphBuilder.addEdge(edge);
      loaded++;
    }
    return loaded;
  }

  function trainPatternsInMemory(pack: TrainingPack): number {
    let loaded = 0;
    for (const pattern of pack.patterns || []) {
      const evidence = validatePattern(
        pattern.observed,
        pattern.expected,
        pattern.total,
        (pack.patterns || []).length,
      );
      const registered = registerPattern(
        pattern.name,
        pattern.description || `Pattern from training pack: ${pack.title}`,
        pattern.domains,
        evidence,
      );
      trainedPatterns.push(registered);
      loaded++;
    }
    return loaded;
  }

  function trainRulesInMemory(pack: TrainingPack): number {
    let loaded = 0;
    for (const rule of pack.businessRules || []) {
      const brainRule: BrainGrammarRule = {
        id: `train_${pack.id}_rule_${loaded}`,
        version: 1,
        title: rule.title,
        description: `From training pack: ${pack.title} (${pack.source})`,
        entity_type: rule.entityType,
        when: rule.when,
        then: rule.then,
        priority: rule.priority ?? 100,
        is_active: autoActivateRules,
        created_by: 'ai',
        natural_language: rule.naturalLanguage,
        reasoning: `Derived from "${pack.title}" (${pack.source}), confidence: ${pack.confidence}`,
      };
      trainedRules.push(brainRule);
      loaded++;
    }
    return loaded;
  }

  function trainInMemory(pack: TrainingPack): PackTrainingResult {
    const validation = validatePack(pack);
    if (!validation.valid) {
      return {
        packId: pack.id,
        success: false,
        causalEdges: 0,
        rules: 0,
        cascades: 0,
        patterns: 0,
        outcomes: 0,
        errors: validation.errors,
      };
    }

    const errors: string[] = [];
    let causalEdges = 0;
    let patterns = 0;
    let rules = 0;

    try {
      causalEdges = trainCausalEdgesInMemory(pack);
      stats.causalEdgesLoaded += causalEdges;
    } catch (err) {
      errors.push(`Causal edges: ${err instanceof Error ? err.message : String(err)}`);
    }

    try {
      patterns = trainPatternsInMemory(pack);
      stats.patternsLoaded += patterns;
    } catch (err) {
      errors.push(`Patterns: ${err instanceof Error ? err.message : String(err)}`);
    }

    try {
      rules = trainRulesInMemory(pack);
      stats.rulesLoaded += rules;
    } catch (err) {
      errors.push(`Rules: ${err instanceof Error ? err.message : String(err)}`);
    }

    const cascades = (pack.cascades || []).length;
    const outcomes = (pack.outcomes || []).length;
    stats.cascadesLoaded += cascades;
    stats.outcomesLoaded += outcomes;

    if (pack.narrative) {
      generateEmbedding(pack.narrative);
      stats.embeddingsGenerated++;
    }

    stats.casesLoaded++;
    stats.errors.push(...errors);

    return {
      packId: pack.id,
      success: errors.length === 0,
      causalEdges,
      rules,
      cascades,
      patterns,
      outcomes,
      errors,
    };
  }

  // ── Persistent Training (Tier 2+) ─────────────────────────────────────

  async function trainCausalEdgesDB(
    supabase: any,
    organizationId: string,
    pack: TrainingPack,
  ): Promise<number> {
    let loaded = 0;
    for (const chain of pack.causalChains || []) {
      const { error } = await supabase.from('causal_relationships_statistical').upsert(
        {
          organization_id: organizationId,
          source_domain: chain.source,
          target_domain: chain.target,
          effect_size: Math.abs(chain.effectSize),
          granger_p_value: chain.pValue ?? 0.01,
          optimal_lag_days: chain.lagDays,
          sample_size: defaultSampleSize,
          granger_f_statistic: defaultFStatistic,
          is_significant: true,
          confidence_interval_lower: computeCI(chain.effectSize, pack.confidence).lower,
          confidence_interval_upper: computeCI(chain.effectSize, pack.confidence).upper,
          natural_language: `${chain.source} causes ${chain.target} change in ${chain.metric} (effect: ${chain.effectSize}, lag: ${chain.lagDays} days) — from: ${pack.title}`,
        },
        { onConflict: 'organization_id,source_domain,target_domain', ignoreDuplicates: false },
      );
      if (!error) loaded++;
    }
    return loaded;
  }

  async function trainRulesDB(
    supabase: any,
    organizationId: string,
    pack: TrainingPack,
  ): Promise<number> {
    let loaded = 0;
    for (let i = 0; i < (pack.businessRules || []).length; i++) {
      const rule = pack.businessRules[i];
      const ruleContent: BrainGrammarRule = {
        id: `train_${pack.id}_rule_${i}`,
        version: 1,
        title: rule.title,
        description: `From training pack: ${pack.title} (${pack.source})`,
        entity_type: rule.entityType,
        when: rule.when,
        then: rule.then,
        priority: rule.priority ?? 100,
        is_active: autoActivateRules,
        created_by: 'ai',
        natural_language: rule.naturalLanguage,
        reasoning: `Derived from "${pack.title}" (${pack.source})`,
      };

      const { error } = await supabase.from('ai_memory').insert({
        organization_id: organizationId,
        memory_type: 'rule' as MemoryType,
        content: JSON.stringify(ruleContent),
        importance: pack.confidence,
        domain: pack.domains[0] || 'general',
        metadata: {
          entity_type: rule.entityType,
          title: rule.title,
          source_pack: pack.id,
          is_active: autoActivateRules,
        },
      });
      if (!error) loaded++;
    }
    return loaded;
  }

  async function trainCascadesDB(
    supabase: any,
    organizationId: string,
    pack: TrainingPack,
  ): Promise<number> {
    let loaded = 0;
    for (const cascade of pack.cascades || []) {
      const ruleName = `[${pack.id}] ${cascade.source} ${cascade.type} ${cascade.target}`;
      const { error } = await supabase.from('org_cascade_rules').insert(
        {
          organization_id: organizationId,
          rule_name: ruleName,
          trigger_domain: cascade.source,
          trigger_signal_type: cascade.type,
          trigger_threshold: pack.confidence,
          propagation_chain: [
            {
              source_domain: cascade.source,
              target_domain: cascade.target,
              severity: cascade.severity,
              keywords: cascade.keywords,
              reason_template:
                cascade.reasonTemplate ||
                `${cascade.source} issue "{source}" ${cascade.type} ${cascade.target} "{target}" — from: ${pack.title}`,
            },
          ],
          actions: [
            { type: 'alert', severity: cascade.severity },
          ],
          is_active: autoActivateRules,
          priority: 200,
        },
      );
      if (!error) loaded++;
    }
    return loaded;
  }

  async function trainOutcomesDB(
    supabase: any,
    organizationId: string,
    pack: TrainingPack,
  ): Promise<number> {
    let loaded = 0;
    for (const outcome of pack.outcomes || []) {
      const { error } = await supabase.from('prediction_records').insert({
        organization_id: organizationId,
        domain: outcome.sourceDomain || pack.domains[0] || 'general',
        prediction_type: 'training_outcome',
        entity_type: 'training_pack',
        entity_id: pack.id,
        predicted_value: outcome.predictedConfidence,
        predicted_outcome: outcome.predicted,
        confidence: outcome.predictedConfidence,
        actual_value: outcome.wasCorrect ? outcome.predictedConfidence : 0,
        actual_outcome: outcome.actual,
        was_correct: outcome.wasCorrect,
        verified_at: new Date().toISOString(),
        source_rule_id: `train_${pack.id}`,
      });
      if (!error) loaded++;
    }
    return loaded;
  }

  async function trainNarrativeDB(
    supabase: any,
    organizationId: string,
    pack: TrainingPack,
  ): Promise<number> {
    if (!pack.narrative) return 0;

    const _embedding = generateEmbedding(pack.narrative);

    const { error } = await supabase.from('ai_memory').insert({
      organization_id: organizationId,
      memory_type: 'insight' as MemoryType,
      content: pack.narrative,
      importance: pack.confidence,
      domain: pack.domains[0] || 'general',
      metadata: {
        title: pack.title,
        source: pack.source,
        industry: pack.industry,
        domains: pack.domains,
        pack_id: pack.id,
      },
    });

    return error ? 0 : 1;
  }

  async function train(
    supabase: any,
    organizationId: string,
    pack: TrainingPack,
  ): Promise<PackTrainingResult> {
    const validation = validatePack(pack);
    if (!validation.valid) {
      return {
        packId: pack.id,
        success: false,
        causalEdges: 0,
        rules: 0,
        cascades: 0,
        patterns: 0,
        outcomes: 0,
        errors: validation.errors,
      };
    }

    const errors: string[] = [];

    // Also train in-memory for immediate use
    trainCausalEdgesInMemory(pack);
    trainPatternsInMemory(pack);
    trainRulesInMemory(pack);

    // Persist to database
    let causalEdges = 0;
    let rules = 0;
    let cascades = 0;
    let patterns = 0;
    let outcomes = 0;
    let embeddings = 0;

    try {
      causalEdges = await trainCausalEdgesDB(supabase, organizationId, pack);
      stats.causalEdgesLoaded += causalEdges;
    } catch (err) {
      errors.push(`Causal edges DB: ${err instanceof Error ? err.message : String(err)}`);
    }

    try {
      rules = await trainRulesDB(supabase, organizationId, pack);
      stats.rulesLoaded += rules;
    } catch (err) {
      errors.push(`Rules DB: ${err instanceof Error ? err.message : String(err)}`);
    }

    try {
      cascades = await trainCascadesDB(supabase, organizationId, pack);
      stats.cascadesLoaded += cascades;
    } catch (err) {
      errors.push(`Cascades DB: ${err instanceof Error ? err.message : String(err)}`);
    }

    try {
      patterns = (pack.patterns || []).length;
      stats.patternsLoaded += patterns;
    } catch (err) {
      errors.push(`Patterns: ${err instanceof Error ? err.message : String(err)}`);
    }

    try {
      outcomes = await trainOutcomesDB(supabase, organizationId, pack);
      stats.outcomesLoaded += outcomes;
    } catch (err) {
      errors.push(`Outcomes DB: ${err instanceof Error ? err.message : String(err)}`);
    }

    try {
      embeddings = await trainNarrativeDB(supabase, organizationId, pack);
      stats.embeddingsGenerated += embeddings;
    } catch (err) {
      errors.push(`Narrative embedding: ${err instanceof Error ? err.message : String(err)}`);
    }

    stats.casesLoaded++;
    stats.errors.push(...errors);

    return {
      packId: pack.id,
      success: errors.length === 0,
      causalEdges,
      rules,
      cascades,
      patterns,
      outcomes,
      errors,
    };
  }

  async function trainBatch(
    supabase: any,
    organizationId: string,
    packs: TrainingPack[],
  ): Promise<TrainingStats> {
    for (const pack of packs) {
      await train(supabase, organizationId, pack);
    }
    return { ...stats };
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  function computeCI(effectSize: number, confidence: number): ConfidenceInterval {
    const absEffect = Math.abs(effectSize);
    const margin = absEffect * (1 - confidence) * 0.5;
    return {
      lower: Math.max(0, absEffect - margin),
      upper: Math.min(1, absEffect + margin),
      level: 0.95,
    };
  }

  function getTrainingStats(): TrainingStats {
    return { ...stats };
  }

  function getTrainedGraph() {
    return graphBuilder.getGraph();
  }

  function getTrainedPatterns(): DiscoveredPattern[] {
    return [...trainedPatterns];
  }

  function getTrainedRules(): BrainGrammarRule[] {
    return [...trainedRules];
  }

  function resetStats(): void {
    stats.casesLoaded = 0;
    stats.causalEdgesLoaded = 0;
    stats.rulesLoaded = 0;
    stats.cascadesLoaded = 0;
    stats.patternsLoaded = 0;
    stats.outcomesLoaded = 0;
    stats.embeddingsGenerated = 0;
    stats.errors = [];
  }

  return {
    validatePack,
    trainInMemory,
    train,
    trainBatch,
    getTrainingStats,
    getTrainedGraph,
    getTrainedPatterns,
    getTrainedRules,
    resetStats,
  };
}
