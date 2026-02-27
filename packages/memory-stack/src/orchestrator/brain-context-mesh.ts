/**
 * Brain Context Mesh — The Unified Brain Context SDK
 * ====================================================
 *
 * Brain Analog: Thalamus + Prefrontal Cortex Integration
 *   — selects which brain regions to activate for each query,
 *     routes context to the right service, prunes irrelevant data
 *
 * THE INNOVATION: Three-layer, intent-driven, composable brain context
 * that replaces ALL per-service context assembly with ONE unified system.
 *
 * Layer 1 — UNIVERSAL: Shared across all services (causal edges, patterns, evolution)
 * Layer 2 — DOMAIN:    Per-service (engineering signals for SE-aaS, GL patterns for AAS)
 * Layer 3 — INTENT:    Per-query (token budget allocation based on user intent)
 *
 * Why this is new:
 *   1. Intent-driven pruning: 80K tokens → 10-15K tokens
 *   2. Bidirectional: AAS anomaly → cross_domain_signals → Copilot picks it up
 *   3. Progressive: Layer 1 cached (instant), Layer 2+3 loaded on demand
 *   4. One SDK: import { createBrainContextMesh } from '@nexus-ai/memory-stack'
 *
 * @packageDocumentation
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { createDispatchAssessor, type DispatchAssessment, type UserIntent, type BusinessDomain } from './dispatch-assessor';
import type { RequiredDataSignals, QueryInterpretation } from './llm-query-interpreter';
import { buildCodeDependencyGraph, summariseCodeDependencyGraph, type CodeDependencyGraph } from '../connectors/cross-domain-linker.js';

// ============================================================================
// TYPES — Service Types
// ============================================================================

export type ServiceType = 'copilot' | 'se-aas' | 'aas';

// ============================================================================
// TYPES — Layer 1: Universal Context
// ============================================================================

export interface UniversalBrainContext {
  causalEdges: CausalEdgeRow[];
  patterns: MemoryRow[];
  cascadeRules: CascadeRuleRow[];
  brainEvolution: {
    latest: EvolutionSnapshotRow | null;
    recentSnapshots: EvolutionSnapshotRow[];
    intelligenceScore: number;
    accuracy: number;
    isLearning: boolean;
  };
  userCorrections: CorrectionRow[];
  brainAccuracy: {
    totalPredictions: number;
    correctPredictions: number;
    accuracy: number;
    recentTrackRecord: Array<{
      domain: string;
      outcome: string;
      wasCorrect: boolean;
      confidence: number;
    }>;
  };
  coldStartDetected: boolean;
  /** BRAIN NUTRITION: LEAP context from cognitive sleep cycles — deep brain reasoning outputs */
  leapContext: LeapContext;
}

// ============================================================================
// TYPES — Layer 2: Domain Context
// ============================================================================

export interface CopilotDomainContext {
  velocity: VelocityRow | null;
  bottleneck: BottleneckRow | null;
  entityLinks: EntityLinkRow[];
  recentSignals: SignalRow[];
  signalCount: number;
}

export interface SeaasDomainContext {
  velocity: VelocityRow | null;
  bottleneck: BottleneckRow | null;
  recentSignals: SignalRow[];
  signalCount: number;
  /** BRAIN NUTRITION: Entity links for SE-aaS (cross-system PR→Jira→Slack→Deploy) */
  entityLinks: EntityLinkRow[];
  /**
   * Code intelligence layer (NB-017/NB-018 Phase 2).
   * Populated when a branch is active; null during cold-start or before first sync.
   */
  codeIntelligence: CodeIntelligenceContext | null;
}

/**
 * Code intelligence context injected into every SE-aaS prompt.
 * Derived from entity_embeddings (symbols) + cross_domain_signals (code_dependency).
 */
export interface CodeIntelligenceContext {
  /** Branch this context is scoped to */
  branch: string;
  /** Total symbols indexed for this branch (from entity_embeddings) */
  symbolCount: number;
  /** Top exported symbols by importance score — most critical API surface */
  topSymbols: Array<{
    name: string;
    kind: string;
    filePath: string;
    signature?: string;
    isExported: boolean;
    language: string;
  }>;
  /** Compact human-readable summary of the dependency graph */
  dependencyGraphSummary: string;
  /** Full graph object for domains that need it (impact, dead-code, dependency-upgrade) */
  dependencyGraph: CodeDependencyGraph;
}

export interface AasDomainContext {
  accountingPatterns: MemoryRow[];
  financialCausalEdges: CausalEdgeRow[];
  recentAccountingSignals: SignalRow[];
}

export type DomainContext = CopilotDomainContext | SeaasDomainContext | AasDomainContext;

// ============================================================================
// TYPES — Layer 3: Intent Context
// ============================================================================

export interface IntentContext {
  assessment: DispatchAssessment;
  tokenBudget: TokenBudget;
}

export interface TokenBudget {
  total: number;
  causal: number;
  patterns: number;
  signals: number;
  rules: number;
  domain: number;
}

// ============================================================================
// TYPES — Assembled (All 3 Layers Combined)
// ============================================================================

export interface AssembledBrainContext {
  organizationId: string;
  serviceType: ServiceType;

  // Layer 1: Universal
  causalEdges: CausalEdgeRow[];
  patterns: MemoryRow[];
  cascadeRules: CascadeRuleRow[];
  brainEvolution: UniversalBrainContext['brainEvolution'];
  userCorrections: CorrectionRow[];
  brainAccuracy: UniversalBrainContext['brainAccuracy'];
  cognitiveStackAvailable: boolean;

  // Layer 2: Domain-specific
  crossDomainContext: {
    engineering: {
      velocity: VelocityRow | null;
      bottleneck: BottleneckRow | null;
      recentSignals: SignalRow[];
      signalCount: number;
    };
  };
  orgPatterns: MemoryRow[];
  brainInsights: MemoryRow[];

  // Layer 3: Intent metadata
  intent: UserIntent;
  domains: BusinessDomain[];

  // AAS-specific (only populated for aas service)
  accountingPatterns?: MemoryRow[];
  financialCausalEdges?: CausalEdgeRow[];

  // BRAIN NUTRITION: Entity links (populated for copilot + se-aas — cross-system connections)
  entityLinks?: EntityLinkRow[];

  // CODE INTELLIGENCE: symbol index + dependency graph (populated for se-aas — NB-017/NB-018)
  codeIntelligence?: CodeIntelligenceContext | null;

  // BRAIN NUTRITION: LEAP context (deep brain reasoning from cognitive sleep cycles)
  leapContext: LeapContext;

  // Phase 3: Token budget used for this assembly (enables downstream consumers to see budget)
  tokenBudget?: TokenBudget;
}

// ============================================================================
// TYPES — LEAP Context (Deep Brain Reasoning from Sleep Cycles)
// ============================================================================

export interface LeapEntry {
  content: string;
  metadata: Record<string, unknown>;
}

export interface LeapContext {
  curiosity: LeapEntry | null;
  selfModel: LeapEntry | null;
  meshPatterns: LeapEntry | null;
  imagination: LeapEntry | null;
  redTeam: LeapEntry | null;
  immune: LeapEntry | null;
  experiments: LeapEntry | null;
  goalPlans: LeapEntry | null;
  narrative: LeapEntry | null;
}

// ============================================================================
// TYPES — DB Row Shapes (matching Supabase table columns)
// ============================================================================

export interface CausalEdgeRow {
  source_signal: string;
  target_signal: string;
  strength: number;
  confidence: number;
  lag: number;
  p_value: number;
  source_domain?: string;
  target_domain?: string;
  effect_size?: number;
  evidence_weight?: number;
}

export interface MemoryRow {
  content: string;
  memory_type?: string;
  domain?: string;
  importance?: number;
  source?: string;
  created_at?: string;
  metadata?: Record<string, unknown>;
}

export interface CascadeRuleRow {
  source_domain: string;
  target_domain: string;
  cascade_type: string;
  severity: string;
  confidence: number;
  description: string;
}

export interface EvolutionSnapshotRow {
  intelligence_score: number;
  accuracy: number;
  brier_score: number;
  total_edges: number;
  total_evidence: number;
  snapshot_date: string;
}

export interface CorrectionRow {
  content: string;
  metadata?: Record<string, unknown>;
  created_at?: string;
}

export interface VelocityRow {
  prs_merged: number;
  mean_pr_cycle_time_hours: number;
  pr_cycle_time_variance: number;
  open_pr_count: number;
  prs_per_engineer: number;
  snapshot_date: string;
}

export interface BottleneckRow {
  bottleneck_risk_score: number;
  risk_level: string;
  reviewer_gini_coefficient: number;
  reviewer_hhi: number;
  top_reviewer_share: number;
  max_betweenness_centrality: number;
}

export interface SignalRow {
  signal_type: string;
  signal_value: number;
  signal_metadata: Record<string, unknown>;
  created_at: string;
  source_domain?: string;
  signal_strength?: number | null;
}

export interface EntityLinkRow {
  source_entity_id: string;
  target_entity_id: string;
  link_type: string;
  confidence: number;
  source_domain?: string;
  target_domain?: string;
}

export interface PredictionRow {
  domain: string;
  predicted_outcome: string;
  was_correct: boolean;
  confidence: number;
  verified_at: string;
}

// ============================================================================
// TOKEN BUDGET ALLOCATION — Intent-Driven Context Pruning
// ============================================================================

/** Token budget ratios per intent (values are percentages that sum to 100) */
const INTENT_TOKEN_BUDGETS: Record<string, { causal: number; patterns: number; signals: number; rules: number; domain: number }> = {
  explain:   { causal: 20, patterns: 30, signals: 20, rules: 10, domain: 20 },
  diagnose:  { causal: 30, patterns: 15, signals: 35, rules: 10, domain: 10 },
  predict:   { causal: 40, patterns: 20, signals: 15, rules: 5,  domain: 20 },
  simulate:  { causal: 40, patterns: 15, signals: 15, rules: 10, domain: 20 },
  build:     { causal: 10, patterns: 10, signals: 10, rules: 30, domain: 40 },
  audit:     { causal: 15, patterns: 10, signals: 15, rules: 30, domain: 30 },
  lookup:    { causal: 10, patterns: 20, signals: 30, rules: 10, domain: 30 },
  compare:   { causal: 25, patterns: 25, signals: 20, rules: 10, domain: 20 },
  monitor:   { causal: 15, patterns: 15, signals: 40, rules: 10, domain: 20 },
  optimize:  { causal: 30, patterns: 20, signals: 20, rules: 10, domain: 20 },
  recommend: { causal: 25, patterns: 20, signals: 20, rules: 15, domain: 20 },
  general:   { causal: 20, patterns: 20, signals: 20, rules: 20, domain: 20 },
};

const DEFAULT_TOTAL_TOKEN_BUDGET = 12000;

function computeTokenBudget(intent: UserIntent, totalBudget: number = DEFAULT_TOTAL_TOKEN_BUDGET): TokenBudget {
  const ratios = INTENT_TOKEN_BUDGETS[intent] || INTENT_TOKEN_BUDGETS.general;
  return {
    total: totalBudget,
    causal:   Math.floor(totalBudget * ratios.causal / 100),
    patterns: Math.floor(totalBudget * ratios.patterns / 100),
    signals:  Math.floor(totalBudget * ratios.signals / 100),
    rules:    Math.floor(totalBudget * ratios.rules / 100),
    domain:   Math.floor(totalBudget * ratios.domain / 100),
  };
}

// ============================================================================
// TOKEN BUDGET ENFORCEMENT — Prune loaded data to fit budget
// ============================================================================

/**
 * Rough token estimate: ~4 chars per token for JSON-ish content.
 * This is a fast heuristic — not a precise tokenizer, but sufficient
 * for budget enforcement (we're targeting 80K→10-15K, not exact counts).
 */
function estimateTokensForItem(item: Record<string, unknown> | string): number {
  const str = typeof item === 'string' ? item : JSON.stringify(item);
  return Math.ceil(str.length / 4);
}

/**
 * Prune an array of items to fit within a token budget.
 * Items are assumed to be pre-sorted by relevance (most important first).
 * Returns a prefix of the array that fits within the budget.
 */
function pruneArrayToTokenBudget<T extends Record<string, unknown>>(
  items: T[],
  budgetTokens: number,
): T[] {
  if (budgetTokens <= 0) return [];
  if (items.length === 0) return items;

  let usedTokens = 0;
  let keepCount = 0;

  for (const item of items) {
    const itemTokens = estimateTokensForItem(item);
    if (usedTokens + itemTokens > budgetTokens && keepCount > 0) break;
    usedTokens += itemTokens;
    keepCount++;
  }

  return keepCount >= items.length ? items : items.slice(0, keepCount);
}

// ============================================================================
// IN-MEMORY CACHE — Layer 1 Universal Context (60s TTL)
// ============================================================================

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

const universalCache = new Map<string, CacheEntry<UniversalBrainContext>>();
const CACHE_TTL_MS = 60_000; // 60 seconds

function getCached(orgId: string): UniversalBrainContext | null {
  const entry = universalCache.get(orgId);
  if (entry && entry.expiresAt > Date.now()) {
    return entry.data;
  }
  universalCache.delete(orgId);
  return null;
}

function setCache(orgId: string, data: UniversalBrainContext): void {
  universalCache.set(orgId, { data, expiresAt: Date.now() + CACHE_TTL_MS });
}

// ============================================================================
// MESH CONFIG
// ============================================================================

export interface BrainContextMeshConfig {
  supabase: SupabaseClient;
  organizationId: string;
  /** Max causal edges to load (default: 50) */
  maxCausalEdges?: number;
  /** Max memory items to load (default: 15) */
  maxMemoryItems?: number;
  /** Total token budget for assembled context (default: 12000) */
  totalTokenBudget?: number;
  /**
   * Active release branch to scope code intelligence context.
   * When set, the mesh loads the code dependency graph + symbol index
   * for this branch and injects them into SE-aaS prompts.
   * Example: 'release/6.3.4' or 'release/5.11.5-enterprise'
   */
  branch?: string;
}

// ============================================================================
// MESH INSTANCE — The Public API
// ============================================================================

export interface BrainContextMeshInstance {
  /** Layer 1: Universal brain context (cached, shared). If interpretation provided, skips unneeded queries. */
  getUniversalContext(requiredData?: RequiredDataSignals): Promise<UniversalBrainContext>;
  /** Layer 2: Domain-specific context. If interpretation provided, skips unneeded queries. */
  getDomainContext(serviceType: ServiceType, requiredData?: RequiredDataSignals): Promise<DomainContext>;
  /** Layer 3: Intent-driven context (token budgets). If interpretation provided, uses it directly. */
  getIntentContext(query: string, interpretation?: QueryInterpretation): Promise<IntentContext>;
  /** Full assembly: all 3 layers combined and de-duplicated. If interpretation provided, uses targeted retrieval. */
  assemble(query: string, serviceType: ServiceType, interpretation?: QueryInterpretation): Promise<AssembledBrainContext>;
  /** Invalidate cache (call after training/learning) */
  invalidateCache(): void;
}

// ============================================================================
// CREATE MESH — Factory Function
// ============================================================================

export function createBrainContextMesh(config: BrainContextMeshConfig): BrainContextMeshInstance {
  const {
    supabase,
    organizationId,
    maxCausalEdges = 50,
    maxMemoryItems = 15,
    totalTokenBudget = DEFAULT_TOTAL_TOKEN_BUDGET,
    branch,
  } = config;

  const dispatchAssessor = createDispatchAssessor();

  // ── Layer 1: Universal Context ──────────────────────────────────────────

  async function getUniversalContext(requiredData?: RequiredDataSignals): Promise<UniversalBrainContext> {
    // Check cache first (cache is always full — no partial caching)
    const cached = getCached(organizationId);
    if (cached) return cached;

    // If requiredData is provided, skip unnecessary queries for faster loading
    const skipCausal = requiredData ? !requiredData.needsCausalEdges : false;
    const skipPatterns = requiredData ? !requiredData.needsPatterns : false;
    const skipCascade = requiredData ? !requiredData.needsCascadeRules : false;
    const skipEvolution = requiredData ? !requiredData.needsEvolution : false;
    const skipCorrections = requiredData ? !requiredData.needsCorrections : false;
    const skipPredictions = requiredData ? !requiredData.needsPredictions : false;

    const emptyResult = { data: [] as any[] };

    // ── BRAIN NUTRITION: Per-query resilience ──────────────────────────
    // Each query wrapped with Promise.resolve().catch() so a single table
    // failure (missing table, permission error) never kills ALL brain context.
    // 7 parallel queries — the universal brain state + LEAP context
    const [
      causalEdgesRes,
      patternsRes,
      cascadeRulesRes,
      evolutionRes,
      correctionsRes,
      verifiedPredictionsRes,
      leapRes,
    ] = await Promise.all([
      // Causal edges the Brain has learned
      skipCausal ? Promise.resolve(emptyResult) :
      Promise.resolve(supabase
        .from('causal_relationships_statistical')
        .select('source_signal, target_signal, strength, confidence, lag, p_value, source_domain, target_domain, effect_size, evidence_weight')
        .eq('organization_id', organizationId)
        .order('updated_at', { ascending: false })
        .limit(maxCausalEdges)
      ).catch(() => ({ data: [] as any[] })),

      // Patterns + insights from ai_memory
      skipPatterns ? Promise.resolve(emptyResult) :
      Promise.resolve(supabase
        .from('ai_memory')
        .select('content, memory_type, domain, importance, source, created_at')
        .eq('organization_id', organizationId)
        .in('memory_type', ['insight', 'pattern', 'prediction'])
        .order('importance', { ascending: false })
        .limit(maxMemoryItems)
      ).catch(() => ({ data: [] as any[] })),

      // Cascade rules
      skipCascade ? Promise.resolve(emptyResult) :
      Promise.resolve(supabase
        .from('brain_cascade_rules')
        .select('source_domain, target_domain, cascade_type, severity, confidence, description')
        .eq('organization_id', organizationId)
        .gte('confidence', 0.5)
        .order('confidence', { ascending: false })
        .limit(15)
      ).catch(() => ({ data: [] as any[] })),

      // Brain evolution snapshots
      skipEvolution ? Promise.resolve(emptyResult) :
      Promise.resolve(supabase
        .from('brain_evolution_snapshots')
        .select('intelligence_score, accuracy, brier_score, total_edges, total_evidence, snapshot_date')
        .eq('organization_id', organizationId)
        .order('snapshot_date', { ascending: false })
        .limit(7)
      ).catch(() => ({ data: [] as any[] })),

      // User corrections (high-priority learning)
      skipCorrections ? Promise.resolve(emptyResult) :
      Promise.resolve(supabase
        .from('ai_memory')
        .select('content, metadata, created_at')
        .eq('organization_id', organizationId)
        .eq('memory_type', 'correction')
        .order('created_at', { ascending: false })
        .limit(5)
      ).catch(() => ({ data: [] as any[] })),

      // Verified predictions (Brain's track record)
      skipPredictions ? Promise.resolve(emptyResult) :
      Promise.resolve(supabase
        .from('prediction_records')
        .select('domain, predicted_outcome, was_correct, confidence, verified_at')
        .eq('organization_id', organizationId)
        .not('was_correct', 'is', null)
        .order('verified_at', { ascending: false })
        .limit(20)
      ).catch(() => ({ data: [] as any[] })),

      // BRAIN NUTRITION: LEAP context (deep brain reasoning from sleep cycles)
      // These are the richest cognitive outputs — curiosity hypotheses, imagination,
      // self-model, red team audits, immune audits, experiments, goal plans, narratives.
      // Previously NEVER queried on the service path. Now shared across ALL services.
      // Scale fix: LIMIT 50 (9 types × ~5 historical = 45 max useful), deduped below.
      Promise.resolve(supabase
        .from('ai_memory')
        .select('memory_type, content, metadata')
        .eq('organization_id', organizationId)
        .in('memory_type', [
          'curiosity_hypothesis', 'self_model', 'mesh_pattern',
          'imagination_hypothesis', 'red_team_audit', 'immune_audit',
          'experiment', 'goal_plan', 'narrative',
        ])
        .order('updated_at', { ascending: false })
        .limit(50)
      ).catch(() => ({ data: [] as any[] })),
    ]);

    const causalEdges = (causalEdgesRes.data || []) as CausalEdgeRow[];
    const patterns = (patternsRes.data || []) as MemoryRow[];
    const cascadeRules = (cascadeRulesRes.data || []) as CascadeRuleRow[];
    const evolutionSnapshots = (evolutionRes.data || []) as EvolutionSnapshotRow[];
    const corrections = (correctionsRes.data || []) as CorrectionRow[];
    const verifiedPreds = (verifiedPredictionsRes.data || []) as PredictionRow[];

    // Compute accuracy
    const correctPreds = verifiedPreds.filter(p => p.was_correct);
    const brainAccuracyValue = verifiedPreds.length > 0
      ? correctPreds.length / verifiedPreds.length
      : 0;

    const latestEvolution = evolutionSnapshots[0] || null;

    // Cold-start detection: Brain has real data only if it has
    // causal edges OR org-specific patterns OR recent signals
    const orgPatterns = patterns.filter(m => m.memory_type === 'pattern');
    const coldStartDetected = causalEdges.length === 0 && orgPatterns.length === 0;

    // BRAIN NUTRITION: Process LEAP context — dedup to most-recent per type
    const leapRows = (leapRes.data || []) as Array<{ memory_type: string; content: string; metadata: Record<string, unknown> }>;
    const leapByType = new Map<string, LeapEntry>();
    for (const row of leapRows) {
      // Take the most recent per type (already ordered by updated_at desc)
      if (!leapByType.has(row.memory_type)) {
        leapByType.set(row.memory_type, { content: row.content, metadata: row.metadata || {} });
      }
    }
    const leapContext: LeapContext = {
      curiosity: leapByType.get('curiosity_hypothesis') || null,
      selfModel: leapByType.get('self_model') || null,
      meshPatterns: leapByType.get('mesh_pattern') || null,
      imagination: leapByType.get('imagination_hypothesis') || null,
      redTeam: leapByType.get('red_team_audit') || null,
      immune: leapByType.get('immune_audit') || null,
      experiments: leapByType.get('experiment') || null,
      goalPlans: leapByType.get('goal_plan') || null,
      narrative: leapByType.get('narrative') || null,
    };

    const result: UniversalBrainContext = {
      causalEdges,
      patterns,
      cascadeRules,
      brainEvolution: {
        latest: latestEvolution,
        recentSnapshots: evolutionSnapshots,
        intelligenceScore: latestEvolution?.intelligence_score ?? 0,
        accuracy: latestEvolution?.accuracy ?? 0,
        isLearning: (latestEvolution?.total_evidence ?? 0) > 0,
      },
      userCorrections: corrections,
      brainAccuracy: {
        totalPredictions: verifiedPreds.length,
        correctPredictions: correctPreds.length,
        accuracy: brainAccuracyValue,
        recentTrackRecord: verifiedPreds.slice(0, 5).map(p => ({
          domain: p.domain,
          outcome: p.predicted_outcome,
          wasCorrect: p.was_correct,
          confidence: p.confidence,
        })),
      },
      coldStartDetected,
      leapContext,
    };

    setCache(organizationId, result);
    return result;
  }

  // ── Layer 2: Domain-Specific Context ────────────────────────────────────

  async function getDomainContext(serviceType: ServiceType, requiredData?: RequiredDataSignals): Promise<DomainContext> {
    switch (serviceType) {
      case 'copilot':
        return getCopilotDomainContext(requiredData);
      case 'se-aas':
        return getSeaasDomainContext(requiredData);
      case 'aas':
        return getAasDomainContext(requiredData);
      default:
        return getSeaasDomainContext(requiredData);
    }
  }

  async function getCopilotDomainContext(requiredData?: RequiredDataSignals): Promise<CopilotDomainContext> {
    const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();
    const emptyRes = { data: [] as any[] };
    const skipVelocity = requiredData ? !requiredData.needsVelocityData : false;
    const skipBottleneck = requiredData ? !requiredData.needsBottleneckData : false;
    const skipEntityLinks = requiredData ? !requiredData.needsEntityLinks : false;
    const skipSignals = requiredData ? !requiredData.needsSignals : false;

    const [velocityRes, bottleneckRes, entityLinksRes, signalsRes] = await Promise.all([
      skipVelocity ? Promise.resolve(emptyRes) :
      Promise.resolve(supabase
        .from('velocity_snapshots')
        .select('prs_merged, mean_pr_cycle_time_hours, pr_cycle_time_variance, open_pr_count, prs_per_engineer, snapshot_date')
        .eq('organization_id', organizationId)
        .order('snapshot_date', { ascending: false })
        .limit(1)
      ).catch(() => ({ data: [] as any[] })),

      skipBottleneck ? Promise.resolve(emptyRes) :
      Promise.resolve(supabase
        .from('bottleneck_snapshots')
        .select('bottleneck_risk_score, risk_level, reviewer_gini_coefficient, reviewer_hhi, top_reviewer_share, max_betweenness_centrality')
        .eq('organization_id', organizationId)
        .order('snapshot_date', { ascending: false })
        .limit(1)
      ).catch(() => ({ data: [] as any[] })),

      skipEntityLinks ? Promise.resolve(emptyRes) :
      Promise.resolve(supabase
        .from('entity_links')
        .select('source_entity_id, target_entity_id, link_type, confidence, source_domain, target_domain')
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false })
        .limit(100)
      ).catch(() => ({ data: [] as any[] })),

      skipSignals ? Promise.resolve(emptyRes) :
      Promise.resolve(supabase
        .from('cross_domain_signals')
        .select('signal_type, signal_value, signal_metadata, created_at, source_domain, signal_strength')
        .eq('organization_id', organizationId)
        .gte('created_at', sevenDaysAgo)
        .order('signal_strength', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false })
        .limit(50)
      ).catch(() => ({ data: [] as any[] })),
    ]);

    const signals = (signalsRes.data || []) as SignalRow[];

    return {
      velocity: (velocityRes.data?.[0] as VelocityRow) || null,
      bottleneck: (bottleneckRes.data?.[0] as BottleneckRow) || null,
      entityLinks: (entityLinksRes.data || []) as EntityLinkRow[],
      recentSignals: signals.slice(0, 20),
      signalCount: signals.length,
    };
  }

  async function getSeaasDomainContext(requiredData?: RequiredDataSignals): Promise<SeaasDomainContext> {
    const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();
    const emptyRes = { data: [] as any[] };
    const skipVelocity = requiredData ? !requiredData.needsVelocityData : false;
    const skipBottleneck = requiredData ? !requiredData.needsBottleneckData : false;
    const skipSignals = requiredData ? !requiredData.needsSignals : false;
    const skipEntityLinks = requiredData ? !requiredData.needsEntityLinks : false;

    // BRAIN NUTRITION: SE-aaS now gets entity links (was: only Copilot had them)
    // Cross-system PR→Jira→Slack→Deploy connections are critical for:
    //   - incident-diagnosis: "which PR caused this Jira spike?"
    //   - impact-analysis: "what does this code change affect across systems?"
    //   - pr-review: "related Jira context for this PR"
    const [velocityRes, bottleneckRes, signalsRes, entityLinksRes, symbolsRes] = await Promise.all([
      skipVelocity ? Promise.resolve(emptyRes) :
      Promise.resolve(supabase
        .from('velocity_snapshots')
        .select('prs_merged, mean_pr_cycle_time_hours, pr_cycle_time_variance, open_pr_count, prs_per_engineer, snapshot_date')
        .eq('organization_id', organizationId)
        .order('snapshot_date', { ascending: false })
        .limit(1)
      ).catch(() => ({ data: [] as any[] })),

      skipBottleneck ? Promise.resolve(emptyRes) :
      Promise.resolve(supabase
        .from('bottleneck_snapshots')
        .select('bottleneck_risk_score, risk_level, reviewer_gini_coefficient, reviewer_hhi, top_reviewer_share, max_betweenness_centrality')
        .eq('organization_id', organizationId)
        .order('snapshot_date', { ascending: false })
        .limit(1)
      ).catch(() => ({ data: [] as any[] })),

      skipSignals ? Promise.resolve(emptyRes) :
      Promise.resolve(supabase
        .from('cross_domain_signals')
        .select('signal_type, signal_value, signal_metadata, created_at, source_domain, signal_strength')
        .eq('organization_id', organizationId)
        .like('source_domain', 'engineering%')
        .gte('created_at', sevenDaysAgo)
        .order('signal_strength', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false })
        .limit(50)
      ).catch(() => ({ data: [] as any[] })),

      // BRAIN NUTRITION: Entity links for SE-aaS domains
      skipEntityLinks ? Promise.resolve(emptyRes) :
      Promise.resolve(supabase
        .from('entity_links')
        .select('source_entity_id, target_entity_id, link_type, confidence, source_domain, target_domain')
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false })
        .limit(50)
      ).catch(() => ({ data: [] as any[] })),

      // CODE INTELLIGENCE: top exported symbols (NB-017/NB-018)
      // When branch is configured: scoped to that branch via metadata->>'branch' filter.
      // When branch is null (pre-OAuth, demo, or cold-start): fall back to unfiltered query
      // so pre-seeded symbols still inject into prompts — graceful degradation.
      branch
        ? Promise.resolve(supabase
            .from('entity_embeddings')
            .select('entity_id, content, metadata, importance_score')
            .eq('organization_id', organizationId)
            .eq('entity_type', 'code_symbol')
            .eq('metadata->>branch', branch)
            .eq('metadata->>isExported', 'true')
            .order('importance_score', { ascending: false })
            .limit(50)
          ).catch(() => ({ data: [] as any[] }))
        : Promise.resolve(supabase
            .from('entity_embeddings')
            .select('entity_id, content, metadata, importance_score')
            .eq('organization_id', organizationId)
            .eq('entity_type', 'code_symbol')
            .order('importance_score', { ascending: false })
            .limit(50)
          ).catch(() => ({ data: [] as any[] })),
    ]);

    const signals = (signalsRes.data || []) as SignalRow[];

    // Build code intelligence context — either branch-scoped or fallback (pre-OAuth / demo)
    let codeIntelligence: CodeIntelligenceContext | null = null;
    const rawSymbolsData = (symbolsRes.data || []) as Array<{
      entity_id: string;
      content: string;
      metadata: Record<string, any>;
      importance_score: number;
    }>;

    if (branch) {
      // Branch configured: build full code intelligence with dependency graph
      const [depGraph, totalCountRes] = await Promise.all([
        buildCodeDependencyGraph(supabase, organizationId, branch).catch(
          () => ({ branch, dependencies: {}, dependents: {}, edgeCount: 0, fileCount: 0 }) as CodeDependencyGraph
        ),
        // COUNT query — no rows returned, just the total (head:true)
        Promise.resolve(
          supabase
            .from('entity_embeddings')
            .select('*', { count: 'exact', head: true })
            .eq('organization_id', organizationId)
            .eq('entity_type', 'code_symbol')
            .eq('metadata->>branch', branch)
        ).catch(() => ({ count: null })),
      ]);

      const topSymbols = rawSymbolsData.slice(0, 20).map(row => ({
        name: row.metadata?.name ?? row.entity_id,
        kind: row.metadata?.kind ?? 'unknown',
        filePath: row.metadata?.filePath ?? '',
        signature: (row.metadata?.signature as string | null) ?? undefined,
        isExported: row.metadata?.isExported === true,
        language: row.metadata?.language ?? 'unknown',
      }));

      const symbolCount = (totalCountRes as any)?.count ?? rawSymbolsData.length;

      codeIntelligence = {
        branch,
        symbolCount,
        topSymbols,
        dependencyGraphSummary: summariseCodeDependencyGraph(depGraph),
        dependencyGraph: depGraph,
      };
    } else if (rawSymbolsData.length > 0) {
      // No branch configured but pre-seeded symbols exist (demo / pre-OAuth cold-start).
      // Build lightweight codeIntelligence without dependency graph so the AI Worker
      // still gets code symbol context injected into prompts.
      const topSymbols = rawSymbolsData.slice(0, 20).map(row => ({
        name: row.metadata?.name ?? row.entity_id,
        kind: row.metadata?.kind ?? 'unknown',
        filePath: row.metadata?.filePath ?? '',
        signature: (row.metadata?.signature as string | null) ?? undefined,
        isExported: row.metadata?.isExported === true,
        language: row.metadata?.language ?? 'unknown',
      }));

      const emptyDepGraph: CodeDependencyGraph = {
        branch: 'default',
        dependencies: {},
        dependents: {},
        edgeCount: 0,
        fileCount: 0,
      };

      codeIntelligence = {
        branch: 'default',
        symbolCount: rawSymbolsData.length,
        topSymbols,
        dependencyGraphSummary: '',
        dependencyGraph: emptyDepGraph,
      };
    }

    return {
      velocity: (velocityRes.data?.[0] as VelocityRow) || null,
      bottleneck: (bottleneckRes.data?.[0] as BottleneckRow) || null,
      recentSignals: signals.slice(0, 20),
      signalCount: signals.length,
      entityLinks: (entityLinksRes.data || []) as EntityLinkRow[],
      codeIntelligence,
    };
  }

  async function getAasDomainContext(requiredData?: RequiredDataSignals): Promise<AasDomainContext> {
    const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();
    const emptyRes = { data: [] as any[] };
    const skipAccountingPatterns = requiredData ? !requiredData.needsAccountingPatterns : false;
    const skipFinancialEdges = requiredData ? !requiredData.needsFinancialEdges : false;
    const skipSignals = requiredData ? !requiredData.needsSignals : false;

    const [accountingPatternsRes, financialEdgesRes, accountingSignalsRes] = await Promise.all([
      // Accounting-specific patterns the Brain has learned
      skipAccountingPatterns ? Promise.resolve(emptyRes) :
      Promise.resolve(supabase
        .from('ai_memory')
        .select('content, memory_type, domain, importance, source, created_at')
        .eq('organization_id', organizationId)
        .in('memory_type', ['insight', 'pattern', 'prediction'])
        .or('domain.eq.finance,domain.eq.accounting,domain.eq.revenue')
        .order('importance', { ascending: false })
        .limit(10)
      ).catch(() => ({ data: [] as any[] })),

      // Causal edges involving financial domains
      skipFinancialEdges ? Promise.resolve(emptyRes) :
      Promise.resolve(supabase
        .from('causal_relationships_statistical')
        .select('source_signal, target_signal, strength, confidence, lag, p_value, source_domain, target_domain, effect_size, evidence_weight')
        .eq('organization_id', organizationId)
        .or('source_domain.like.%finance%,source_domain.like.%revenue%,target_domain.like.%finance%,target_domain.like.%revenue%')
        .order('updated_at', { ascending: false })
        .limit(20)
      ).catch(() => ({ data: [] as any[] })),

      // Recent accounting/finance signals — prioritise aas.* over generic finance signals
      // aas.finance signals (acc_*) come from AAS trainer and are authoritative accounting rules.
      // Plain 'finance' signals are macroeconomic (GDP, CPI) and should NOT crowd out acc_* rules.
      skipSignals ? Promise.resolve(emptyRes) :
      Promise.resolve(supabase
        .from('cross_domain_signals')
        .select('signal_type, signal_value, signal_metadata, created_at, source_domain, signal_strength')
        .eq('organization_id', organizationId)
        .or('source_domain.like.aas%,source_domain.like.accounting%')
        .gte('created_at', new Date(Date.now() - 30 * 86400000).toISOString()) // 30 days (AAS retrains daily)
        .order('signal_strength', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false })
        .limit(50)
      ).catch(() => ({ data: [] as any[] })),
    ]);

    return {
      accountingPatterns: (accountingPatternsRes.data || []) as MemoryRow[],
      financialCausalEdges: (financialEdgesRes.data || []) as CausalEdgeRow[],
      recentAccountingSignals: (accountingSignalsRes.data || []) as SignalRow[],
    };
  }

  // ── Layer 3: Intent-Driven Context ──────────────────────────────────────

  function getIntentContext(query: string, interpretation?: QueryInterpretation): Promise<IntentContext> {
    if (interpretation) {
      // Use LLM interpretation directly — much richer than regex dispatch
      // Convert QueryInterpretation → DispatchAssessment for backward compatibility
      const assessment: DispatchAssessment = {
        intent: interpretation.intent,
        domains: interpretation.domains,
        primaryDomain: interpretation.primaryDomain,
        route: interpretation.complexity.route,
        confidence: interpretation.confidence,
        complexityScore: interpretation.complexity.score,
        complexityFactors: {
          domainCount: interpretation.domains.length,
          requiresTemporal: interpretation.entities?.some(e => e.type === 'date_range') ?? false,
          requiresCausal: interpretation.requiredData.needsCausalEdges,
          requiresCounterfactual: interpretation.intent === 'simulate',
          requiresMultiStep: interpretation.complexity.route === 'agent_orchestration',
          hasSpecificMetrics: interpretation.entities?.some(e => e.type === 'metric') ?? false,
          isComparison: interpretation.intent === 'compare',
          estimatedTokens: interpretation.tokenBudget?.total ?? totalTokenBudget,
        },
        requiredCapabilities: [],
        needsLLM: true,
        needsAction: interpretation.complexity.route === 'action_domain' || interpretation.complexity.route === 'agent_orchestration',
        latencyMs: interpretation.latencyMs,
      };
      // Use the interpretation's adaptive token budget if available
      const tokenBudget = interpretation.tokenBudget ?? computeTokenBudget(interpretation.intent, totalTokenBudget);
      return Promise.resolve({ assessment, tokenBudget });
    }
    // Fallback: regex dispatch
    const assessment = dispatchAssessor.assess(query);
    const tokenBudget = computeTokenBudget(assessment.intent, totalTokenBudget);
    return Promise.resolve({ assessment, tokenBudget });
  }

  // ── Full Assembly ───────────────────────────────────────────────────────

  async function assemble(query: string, serviceType: ServiceType, interpretation?: QueryInterpretation): Promise<AssembledBrainContext> {
    // Extract requiredData from interpretation for targeted DB retrieval
    const requiredData = interpretation?.requiredData;

    // Run all 3 layers in parallel — with optional skip signals for selective loading
    const [universal, domain, intent] = await Promise.all([
      getUniversalContext(requiredData),
      getDomainContext(serviceType, requiredData),
      getIntentContext(query, interpretation),
    ]);

    // Extract domain-specific fields
    const isAas = serviceType === 'aas';
    const isCopilot = serviceType === 'copilot';

    // Build engineering cross-domain context (shared by copilot + se-aas)
    let velocity: VelocityRow | null = null;
    let bottleneck: BottleneckRow | null = null;
    let recentSignals: SignalRow[] = [];
    let signalCount = 0;
    let entityLinks: EntityLinkRow[] | undefined;

    let codeIntelligence: CodeIntelligenceContext | null | undefined;

    if (isCopilot) {
      const ctx = domain as CopilotDomainContext;
      velocity = ctx.velocity;
      bottleneck = ctx.bottleneck;
      recentSignals = ctx.recentSignals;
      signalCount = ctx.signalCount;
      entityLinks = ctx.entityLinks;
    } else if (serviceType === 'se-aas') {
      const ctx = domain as SeaasDomainContext;
      velocity = ctx.velocity;
      bottleneck = ctx.bottleneck;
      recentSignals = ctx.recentSignals;
      signalCount = ctx.signalCount;
      // BRAIN NUTRITION: SE-aaS now gets entity links (was: only Copilot had them)
      entityLinks = ctx.entityLinks;
      // CODE INTELLIGENCE: code dependency graph + symbol index (NB-017/NB-018)
      codeIntelligence = ctx.codeIntelligence;
    }

    // AAS-specific context
    let accountingPatterns: MemoryRow[] | undefined;
    let financialCausalEdges: CausalEdgeRow[] | undefined;

    if (isAas) {
      const ctx = domain as AasDomainContext;
      accountingPatterns = ctx.accountingPatterns;
      financialCausalEdges = ctx.financialCausalEdges;
      // For AAS, use accounting signals as recentSignals
      recentSignals = ctx.recentAccountingSignals;
      signalCount = ctx.recentAccountingSignals.length;
    }

    // Org patterns (richest source — human-readable insights)
    const orgPatterns = universal.patterns.filter(m => m.memory_type === 'pattern');

    // Cold-start detection
    const hasRealData =
      universal.causalEdges.length > 0 ||
      orgPatterns.length > 0 ||
      signalCount > 0;

    // ── Phase 3: Token Budget Enforcement ────────────────────────────────
    // The token budget determines HOW MUCH data to include in the assembled context.
    // Without enforcement, skipping DB queries (via requiredData flags) reduces the
    // number of queries but the loaded data is still unbounded.
    // With enforcement: 80K tokens → 10-15K tokens (targeted retrieval + pruning).
    const budget = intent.tokenBudget;

    // Prune each data category to fit its budget allocation
    const prunedCausalEdges = pruneArrayToTokenBudget(
      universal.causalEdges as unknown as Array<Record<string, unknown>>,
      budget.causal,
    ) as unknown as CausalEdgeRow[];

    const prunedPatterns = pruneArrayToTokenBudget(
      universal.patterns as unknown as Array<Record<string, unknown>>,
      budget.patterns,
    ) as unknown as MemoryRow[];

    const prunedCascadeRules = pruneArrayToTokenBudget(
      universal.cascadeRules as unknown as Array<Record<string, unknown>>,
      budget.rules,
    ) as unknown as CascadeRuleRow[];

    // Signals pruned from domain budget
    const signalBudget = Math.floor(budget.domain * 0.4); // 40% of domain budget for signals
    const entityLinkBudget = Math.floor(budget.domain * 0.3); // 30% for entity links
    const domainPatternBudget = Math.floor(budget.domain * 0.3); // 30% for domain-specific patterns

    const prunedSignals = pruneArrayToTokenBudget(
      recentSignals as unknown as Array<Record<string, unknown>>,
      signalBudget,
    ) as unknown as SignalRow[];

    const prunedEntityLinks = entityLinks
      ? pruneArrayToTokenBudget(
          entityLinks as unknown as Array<Record<string, unknown>>,
          entityLinkBudget,
        ) as unknown as EntityLinkRow[]
      : undefined;

    const prunedAccountingPatterns = accountingPatterns
      ? pruneArrayToTokenBudget(
          accountingPatterns as unknown as Array<Record<string, unknown>>,
          domainPatternBudget,
        ) as unknown as MemoryRow[]
      : undefined;

    const prunedFinancialEdges = financialCausalEdges
      ? pruneArrayToTokenBudget(
          financialCausalEdges as unknown as Array<Record<string, unknown>>,
          Math.floor(budget.causal * 0.3), // 30% of causal budget for financial-specific edges
        ) as unknown as CausalEdgeRow[]
      : undefined;

    const prunedOrgPatterns = pruneArrayToTokenBudget(
      orgPatterns as unknown as Array<Record<string, unknown>>,
      Math.floor(budget.patterns * 0.6), // 60% of pattern budget for org patterns
    ) as unknown as MemoryRow[];

    return {
      organizationId,
      serviceType,

      // Layer 1 — pruned to token budget
      causalEdges: prunedCausalEdges,
      patterns: prunedPatterns,
      cascadeRules: prunedCascadeRules,
      brainEvolution: universal.brainEvolution,
      userCorrections: universal.userCorrections,
      brainAccuracy: universal.brainAccuracy,
      cognitiveStackAvailable: hasRealData,

      // Layer 2 — pruned to token budget
      crossDomainContext: {
        engineering: {
          velocity,
          bottleneck,
          recentSignals: prunedSignals.slice(0, 20),
          signalCount,
        },
      },
      orgPatterns: prunedOrgPatterns,
      brainInsights: prunedPatterns.slice(0, 8),

      // Layer 3
      intent: intent.assessment.intent,
      domains: intent.assessment.domains,

      // Service-specific — pruned to token budget
      accountingPatterns: prunedAccountingPatterns,
      financialCausalEdges: prunedFinancialEdges,
      entityLinks: prunedEntityLinks,

      // CODE INTELLIGENCE: code dependency graph + top symbols (NB-017/NB-018)
      // Not token-pruned — the graph is already compact (adjacency map not serialised into prompt).
      // formatBrainContextForDomain() injects only the summary string + top symbol list.
      codeIntelligence,

      // BRAIN NUTRITION: LEAP context (deep brain reasoning from sleep cycles)
      // Shared across ALL services — curiosity, imagination, self-model, experiments, etc.
      leapContext: universal.leapContext,

      // Phase 3: Expose token budget for downstream consumers
      tokenBudget: budget,
    };
  }

  // ── Cache Invalidation ──────────────────────────────────────────────────

  function invalidateCache(): void {
    universalCache.delete(organizationId);
  }

  return {
    getUniversalContext,
    getDomainContext,
    getIntentContext,
    assemble,
    invalidateCache,
  };
}

// ============================================================================
// BATCH-SCOPED MESH — Context Caching for Multi-Agent Batch Runs (Week 7)
// ============================================================================
//
// When running 10+ domain agents in a batch, each agent calling assemble()
// would hit the DB 7+ times × 10 agents = 70+ queries. The batch-scoped mesh
// caches Layer 1 (universal) context for the ENTIRE batch duration, reducing
// DB queries from 70+ to ~7 (one set of queries, shared by all agents).
//
// Usage:
//   const batchMesh = createBatchScopedMesh(config);
//   for (const domain of domains) {
//     const ctx = await batchMesh.assemble(query, serviceType);
//     runAgent(domain, ctx);
//   }
//   batchMesh.dispose();
// ============================================================================

export interface BatchScopedMeshConfig extends BrainContextMeshConfig {
  /** Cache TTL in ms (default: 300000 = 5 minutes — covers a full batch run) */
  cacheTtlMs?: number;
}

export interface BatchScopedMeshInstance extends BrainContextMeshInstance {
  /** Dispose the batch cache (call after batch completes) */
  dispose(): void;
  /** Get cache stats for observability */
  getCacheStats(): { hits: number; misses: number; cached: boolean };
}

export function createBatchScopedMesh(config: BatchScopedMeshConfig): BatchScopedMeshInstance {
  const batchCacheTtl = config.cacheTtlMs ?? 300_000; // 5 min default

  let batchUniversalCtx: UniversalBrainContext | null = null;
  let batchCtxExpiry = 0;
  let cacheHits = 0;
  let cacheMisses = 0;

  // Create the underlying mesh
  const mesh = createBrainContextMesh(config);

  // Wrap getUniversalContext with batch-level caching
  const batchGetUniversalContext = async (
    requiredData?: RequiredDataSignals
  ): Promise<UniversalBrainContext> => {
    if (batchUniversalCtx && Date.now() < batchCtxExpiry) {
      cacheHits++;
      return batchUniversalCtx;
    }

    cacheMisses++;
    const ctx = await mesh.getUniversalContext(requiredData);
    batchUniversalCtx = ctx;
    batchCtxExpiry = Date.now() + batchCacheTtl;
    return ctx;
  };

  // Wrap assemble to use batch-cached universal context
  const batchAssemble = async (
    query: string,
    serviceType: ServiceType,
    interpretation?: QueryInterpretation
  ): Promise<AssembledBrainContext> => {
    // Pre-warm the batch cache
    await batchGetUniversalContext();
    // Delegate to original assemble (which will hit the in-memory cache)
    return mesh.assemble(query, serviceType, interpretation);
  };

  return {
    getUniversalContext: batchGetUniversalContext,
    getDomainContext: mesh.getDomainContext,
    getIntentContext: mesh.getIntentContext,
    assemble: batchAssemble,
    invalidateCache: () => {
      batchUniversalCtx = null;
      batchCtxExpiry = 0;
      mesh.invalidateCache();
    },
    dispose: () => {
      batchUniversalCtx = null;
      batchCtxExpiry = 0;
      mesh.invalidateCache();
    },
    getCacheStats: () => ({
      hits: cacheHits,
      misses: cacheMisses,
      cached: batchUniversalCtx !== null,
    }),
  };
}
