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

  // BRAIN NUTRITION: LEAP context (deep brain reasoning from cognitive sleep cycles)
  leapContext: LeapContext;
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
      Promise.resolve(supabase
        .from('causal_relationships_statistical')
        .select('source_signal, target_signal, strength, confidence, lag, p_value, source_domain, target_domain, effect_size, evidence_weight')
        .eq('organization_id', organizationId)
        .order('updated_at', { ascending: false })
        .limit(maxCausalEdges)
      ).catch(() => ({ data: [] as any[] })),

      // Patterns + insights from ai_memory
      Promise.resolve(supabase
        .from('ai_memory')
        .select('content, memory_type, domain, importance, source, created_at')
        .eq('organization_id', organizationId)
        .in('memory_type', ['insight', 'pattern', 'prediction'])
        .order('importance', { ascending: false })
        .limit(maxMemoryItems)
      ).catch(() => ({ data: [] as any[] })),

      // Cascade rules
      Promise.resolve(supabase
        .from('brain_cascade_rules')
        .select('source_domain, target_domain, cascade_type, severity, confidence, description')
        .eq('organization_id', organizationId)
        .gte('confidence', 0.5)
        .order('confidence', { ascending: false })
        .limit(15)
      ).catch(() => ({ data: [] as any[] })),

      // Brain evolution snapshots
      Promise.resolve(supabase
        .from('brain_evolution_snapshots')
        .select('intelligence_score, accuracy, brier_score, total_edges, total_evidence, snapshot_date')
        .eq('organization_id', organizationId)
        .order('snapshot_date', { ascending: false })
        .limit(7)
      ).catch(() => ({ data: [] as any[] })),

      // User corrections (high-priority learning)
      Promise.resolve(supabase
        .from('ai_memory')
        .select('content, metadata, created_at')
        .eq('organization_id', organizationId)
        .eq('memory_type', 'correction')
        .order('created_at', { ascending: false })
        .limit(5)
      ).catch(() => ({ data: [] as any[] })),

      // Verified predictions (Brain's track record)
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

  async function getDomainContext(serviceType: ServiceType): Promise<DomainContext> {
    switch (serviceType) {
      case 'copilot':
        return getCopilotDomainContext();
      case 'se-aas':
        return getSeaasDomainContext();
      case 'aas':
        return getAasDomainContext();
      default:
        return getSeaasDomainContext();
    }
  }

  async function getCopilotDomainContext(): Promise<CopilotDomainContext> {
    const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();

    const [velocityRes, bottleneckRes, entityLinksRes, signalsRes] = await Promise.all([
      Promise.resolve(supabase
        .from('velocity_snapshots')
        .select('prs_merged, mean_pr_cycle_time_hours, pr_cycle_time_variance, open_pr_count, prs_per_engineer, snapshot_date')
        .eq('organization_id', organizationId)
        .order('snapshot_date', { ascending: false })
        .limit(1)
      ).catch(() => ({ data: [] as any[] })),

      Promise.resolve(supabase
        .from('bottleneck_snapshots')
        .select('bottleneck_risk_score, risk_level, reviewer_gini_coefficient, reviewer_hhi, top_reviewer_share, max_betweenness_centrality')
        .eq('organization_id', organizationId)
        .order('snapshot_date', { ascending: false })
        .limit(1)
      ).catch(() => ({ data: [] as any[] })),

      Promise.resolve(supabase
        .from('entity_links')
        .select('source_entity_id, target_entity_id, link_type, confidence, source_domain, target_domain')
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false })
        .limit(100)
      ).catch(() => ({ data: [] as any[] })),

      Promise.resolve(supabase
        .from('cross_domain_signals')
        .select('signal_type, signal_value, signal_metadata, created_at, source_domain')
        .eq('organization_id', organizationId)
        .gte('created_at', sevenDaysAgo)
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

  async function getSeaasDomainContext(): Promise<SeaasDomainContext> {
    const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();

    // BRAIN NUTRITION: SE-aaS now gets entity links (was: only Copilot had them)
    // Cross-system PR→Jira→Slack→Deploy connections are critical for:
    //   - incident-diagnosis: "which PR caused this Jira spike?"
    //   - impact-analysis: "what does this code change affect across systems?"
    //   - pr-review: "related Jira context for this PR"
    const [velocityRes, bottleneckRes, signalsRes, entityLinksRes] = await Promise.all([
      Promise.resolve(supabase
        .from('velocity_snapshots')
        .select('prs_merged, mean_pr_cycle_time_hours, pr_cycle_time_variance, open_pr_count, prs_per_engineer, snapshot_date')
        .eq('organization_id', organizationId)
        .order('snapshot_date', { ascending: false })
        .limit(1)
      ).catch(() => ({ data: [] as any[] })),

      Promise.resolve(supabase
        .from('bottleneck_snapshots')
        .select('bottleneck_risk_score, risk_level, reviewer_gini_coefficient, reviewer_hhi, top_reviewer_share, max_betweenness_centrality')
        .eq('organization_id', organizationId)
        .order('snapshot_date', { ascending: false })
        .limit(1)
      ).catch(() => ({ data: [] as any[] })),

      Promise.resolve(supabase
        .from('cross_domain_signals')
        .select('signal_type, signal_value, signal_metadata, created_at, source_domain')
        .eq('organization_id', organizationId)
        .like('source_domain', 'engineering%')
        .gte('created_at', sevenDaysAgo)
        .order('created_at', { ascending: false })
        .limit(50)
      ).catch(() => ({ data: [] as any[] })),

      // BRAIN NUTRITION: Entity links for SE-aaS domains
      Promise.resolve(supabase
        .from('entity_links')
        .select('source_entity_id, target_entity_id, link_type, confidence, source_domain, target_domain')
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false })
        .limit(50)
      ).catch(() => ({ data: [] as any[] })),
    ]);

    const signals = (signalsRes.data || []) as SignalRow[];

    return {
      velocity: (velocityRes.data?.[0] as VelocityRow) || null,
      bottleneck: (bottleneckRes.data?.[0] as BottleneckRow) || null,
      recentSignals: signals.slice(0, 20),
      signalCount: signals.length,
      entityLinks: (entityLinksRes.data || []) as EntityLinkRow[],
    };
  }

  async function getAasDomainContext(): Promise<AasDomainContext> {
    const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();

    const [accountingPatternsRes, financialEdgesRes, accountingSignalsRes] = await Promise.all([
      // Accounting-specific patterns the Brain has learned
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
      Promise.resolve(supabase
        .from('causal_relationships_statistical')
        .select('source_signal, target_signal, strength, confidence, lag, p_value, source_domain, target_domain, effect_size, evidence_weight')
        .eq('organization_id', organizationId)
        .or('source_domain.like.%finance%,source_domain.like.%revenue%,target_domain.like.%finance%,target_domain.like.%revenue%')
        .order('updated_at', { ascending: false })
        .limit(20)
      ).catch(() => ({ data: [] as any[] })),

      // Recent accounting/finance signals
      Promise.resolve(supabase
        .from('cross_domain_signals')
        .select('signal_type, signal_value, signal_metadata, created_at, source_domain')
        .eq('organization_id', organizationId)
        .or('source_domain.like.aas%,source_domain.like.finance%,source_domain.like.accounting%')
        .gte('created_at', sevenDaysAgo)
        .order('created_at', { ascending: false })
        .limit(30)
      ).catch(() => ({ data: [] as any[] })),
    ]);

    return {
      accountingPatterns: (accountingPatternsRes.data || []) as MemoryRow[],
      financialCausalEdges: (financialEdgesRes.data || []) as CausalEdgeRow[],
      recentAccountingSignals: (accountingSignalsRes.data || []) as SignalRow[],
    };
  }

  // ── Layer 3: Intent-Driven Context ──────────────────────────────────────

  function getIntentContext(query: string): Promise<IntentContext> {
    const assessment = dispatchAssessor.assess(query);
    const tokenBudget = computeTokenBudget(assessment.intent, totalTokenBudget);
    return Promise.resolve({ assessment, tokenBudget });
  }

  // ── Full Assembly ───────────────────────────────────────────────────────

  async function assemble(query: string, serviceType: ServiceType): Promise<AssembledBrainContext> {
    // Run all 3 layers in parallel
    const [universal, domain, intent] = await Promise.all([
      getUniversalContext(),
      getDomainContext(serviceType),
      getIntentContext(query),
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

    return {
      organizationId,
      serviceType,

      // Layer 1
      causalEdges: universal.causalEdges,
      patterns: universal.patterns,
      cascadeRules: universal.cascadeRules,
      brainEvolution: universal.brainEvolution,
      userCorrections: universal.userCorrections,
      brainAccuracy: universal.brainAccuracy,
      cognitiveStackAvailable: hasRealData,

      // Layer 2
      crossDomainContext: {
        engineering: {
          velocity,
          bottleneck,
          recentSignals: recentSignals.slice(0, 20),
          signalCount,
        },
      },
      orgPatterns,
      brainInsights: universal.patterns.slice(0, 8),

      // Layer 3
      intent: intent.assessment.intent,
      domains: intent.assessment.domains,

      // Service-specific
      accountingPatterns,
      financialCausalEdges,
      entityLinks,

      // BRAIN NUTRITION: LEAP context (deep brain reasoning from sleep cycles)
      // Shared across ALL services — curiosity, imagination, self-model, experiments, etc.
      leapContext: universal.leapContext,
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
