/**
 * SE-aaS Domain Executor (Brain-Integrated)
 * ============================================
 *
 * ARCHITECTURE COMPLIANCE:
 * All P1 SE-aaS domains execute through the Brain's Action Domain Registry.
 * Brain context (causal edges, patterns, trained knowledge) is assembled by
 * BrainContextBuilder and passed to each domain for cognitive-stack-aware execution.
 *
 * Wrapper that:
 * 1. Creates ActionDomainContext from API request
 * 2. Assembles Brain context (causal edges, patterns, rules) for cognitive enrichment
 * 3. Calls the domain's execute() function with full Brain context
 * 4. Saves result as artifact
 * 5. Returns result + artifactId
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { saveArtifact } from "./job-queue";

// Import all 12 SE-aaS domains (8 original + 4 P1 gap closure)
import {
  testDataGeneratorDomain,
  sqlAnalyzerDomain,
  testCaseGeneratorDomain,
  tddCodeGeneratorDomain,
  incidentDiagnosisDomain,
  impactAnalysisDomain,
  dataLineageDomain,
  logQueryDomain,
  // P1 Gap Closure: 4 missing domains from CTO spec
  dependencyUpgradeDomain,
  designDocGeneratorDomain,
  performanceProfilerDomain,
  deadCodeDetectorDomain,
  // Brain Evolution Engine — feedback loop integration
  runBrainEvolutionCycle,
  // Brain Observability Bridge — domain execution audit trail
  createBrainObservabilityBridge,
} from "@nexus-ai/memory-stack";

// ============================================================================
// DOMAIN REGISTRY — All 12 SE-aaS Brain-Augmented Domains
// ============================================================================

const DOMAIN_MAP: Record<string, { domain: any; sync: boolean }> = {
  // === Sprint 1-3 (Original 8) ===
  "test-data-generator": { domain: testDataGeneratorDomain, sync: true },
  "sql-analyzer": { domain: sqlAnalyzerDomain, sync: true },
  "test-case-generator": { domain: testCaseGeneratorDomain, sync: false },
  "tdd-code-generator": { domain: tddCodeGeneratorDomain, sync: false },
  "incident-diagnosis": { domain: incidentDiagnosisDomain, sync: false },
  "impact-analysis": { domain: impactAnalysisDomain, sync: false },
  "data-lineage": { domain: dataLineageDomain, sync: true },
  "log-query": { domain: logQueryDomain, sync: false },
  // === P1 Gap Closure (4 new from CTO spec) ===
  "dependency-upgrade": { domain: dependencyUpgradeDomain, sync: false },
  "design-doc-generator": { domain: designDocGeneratorDomain, sync: false },
  "performance-profiler": { domain: performanceProfilerDomain, sync: false },
  "dead-code-detector": { domain: deadCodeDetectorDomain, sync: true },
};

export function getDomainInfo(domainType: string): { domain: any; sync: boolean } | null {
  return DOMAIN_MAP[domainType] ?? null;
}

export function isSync(domainType: string): boolean {
  return DOMAIN_MAP[domainType]?.sync ?? false;
}

// ============================================================================
// DOMAIN EXECUTION
// ============================================================================

export interface ExecuteDomainParams {
  domainType: string;
  request: Record<string, unknown>;
  organizationId: string;
  userId: string;
  anthropicApiKey?: string;
}

export interface ExecuteDomainResult {
  result: Record<string, unknown>;
  artifactId: string;
}

/**
 * Execute an SE-aaS domain and persist the result as an artifact.
 */
export async function executeDomain(
  supabase: SupabaseClient,
  params: ExecuteDomainParams
): Promise<ExecuteDomainResult> {
  const info = getDomainInfo(params.domainType);
  if (!info) {
    throw new Error(`Unknown domain: ${params.domainType}`);
  }

  // Build ActionDomainContext with Brain context for cognitive enrichment
  // Brain context provides causal edges, patterns, and trained knowledge
  // so domains can leverage the 15-layer cognitive stack
  const brainContext = await assembleBrainContext(supabase, params.organizationId);

  const ctx = {
    organizationId: params.organizationId,
    userId: params.userId,
    input: {
      ...params.request,
      anthropicApiKey: params.anthropicApiKey,
    },
    brain: brainContext,
    supabase,
  };

  const startMs = Date.now();
  const result = await info.domain.execute(ctx);
  const durationMs = Date.now() - startMs;

  // Save artifact
  const { artifactId } = await saveArtifact(supabase, {
    organizationId: params.organizationId,
    domainType: params.domainType,
    artifactData: result,
    metadata: {
      durationMs,
      userId: params.userId,
      claudePowered: result.data?.claudePowered ?? false,
      brainAugmented: result.data?.brainAugmented ?? brainContext.cognitiveStackAvailable,
      brainCausalEdgesUsed: brainContext.causalEdges?.length ?? 0,
      brainPatternsUsed: brainContext.patterns?.length ?? 0,
    },
    createdBy: params.userId,
  });

  // ============================================================================
  // BRAIN FEEDBACK LOOP — Every Execution Teaches the Brain
  // ============================================================================
  // This is THE differentiator. Every SE-aaS domain execution:
  // 1. Emits a signal → Brain observes
  // 2. Records prediction (if domain generated one) → Brain verifies later
  // 3. Triggers lightweight evolution cycle → Brain weights update in real-time
  //
  // Result: The more you use NexusBrain, the smarter it gets. This is a MOAT.
  await feedBrainFromExecution(supabase, params, result, brainContext, durationMs).catch(() => {
    // Non-blocking: feedback failure should NEVER break domain execution
  });

  // ============================================================================
  // OBSERVABILITY WIRE — Record domain execution to obs_* tables
  // ============================================================================
  // This AUGMENTS the feedback loop above by also writing to observability tables.
  // The bridge records to obs_agent_executions AND emits cross_domain_signals
  // so the dashboard shows every SE-aaS execution with timing, Claude usage, etc.
  try {
    const bridge = createBrainObservabilityBridge({
      supabase,
      organizationId: params.organizationId,
    });
    await bridge.recordDomainExecution(
      params.domainType,
      durationMs,
      (result as any).data?.claudePowered ?? false,
      brainContext.cognitiveStackAvailable ?? false,
      brainContext.causalEdges?.length ?? 0,
      brainContext.patterns?.length ?? 0,
    );
  } catch {
    // Non-blocking: observability failure should NEVER break domain execution
  }

  return {
    result: { ...result, timing: { totalMs: durationMs } },
    artifactId,
  };
}

// ============================================================================
// BRAIN FEEDBACK LOOP — The Learning Circuit
// ============================================================================

/**
 * After every SE-aaS domain execution, feed the result back into the Brain.
 *
 * This closes the loop:
 *   User request → Brain-augmented Claude → Result → Brain learns → Better next time
 *
 * THREE feedback channels:
 * 1. SIGNAL: Domain execution emitted as cross_domain_signal (Brain observes activity)
 * 2. PREDICTION: If result contains a prediction/confidence → stored for later verification
 * 3. EVOLUTION: Lightweight Brain evolution cycle triggered (Bayesian weight updates)
 */
async function feedBrainFromExecution(
  supabase: SupabaseClient,
  params: ExecuteDomainParams,
  result: Record<string, unknown>,
  brainContext: Record<string, any>,
  durationMs: number
): Promise<void> {
  const { organizationId, domainType, userId } = params;

  // Channel 1: SIGNAL — Brain observes this domain execution
  await supabase.from("cross_domain_signals").insert({
    organization_id: organizationId,
    source_domain: `se-aas.${domainType}`,
    signal_type: "domain_execution",
    signal_value: (result as any).confidence ?? 0.5,
    entity_type: "se_aas_artifact",
    entity_id: `${domainType}_${Date.now()}`,
    signal_metadata: {
      domainType,
      claudePowered: (result as any).data?.claudePowered ?? false,
      brainAugmented: brainContext.cognitiveStackAvailable,
      causalEdgesUsed: brainContext.causalEdges?.length ?? 0,
      durationMs,
      userId,
      interventionsCount: ((result as any).interventions ?? []).length,
      hasNarrative: !!(result as any).narrative,
    },
  });

  // Channel 2: PREDICTION — If domain generated predictions, store for verification
  const interventions = (result as any).interventions ?? [];
  if (interventions.length > 0) {
    for (const intervention of interventions.slice(0, 5)) {
      await supabase.from("prediction_records").insert({
        organization_id: organizationId,
        domain: domainType,
        predicted_outcome: intervention.description,
        predicted_value: null,
        confidence: (result as any).confidence ?? 0.5,
        entity_type: "se_aas_intervention",
        entity_id: intervention.type ?? domainType,
        source_rule_id: null,
      });
    }
  }

  // Channel 3: EVOLUTION — Trigger lightweight Brain evolution cycle
  // (verifies past predictions + Bayesian weight updates)
  // Only trigger every ~10 executions to avoid overhead
  const { count: recentExecs } = await supabase
    .from("cross_domain_signals")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .eq("source_domain", `se-aas.${domainType}`)
    .gte("created_at", new Date(Date.now() - 3600000).toISOString());

  if ((recentExecs ?? 0) % 10 === 0) {
    await runBrainEvolutionCycle(supabase, organizationId, "lightweight").catch(() => {});
  }
}

// ============================================================================
// BRAIN CONTEXT ASSEMBLY
// ============================================================================

/**
 * Assemble Brain context for SE-aaS domain execution.
 *
 * THE CRITICAL DIFFERENTIATOR: This is what makes NexusBrain's P1 domains
 * "Brain-augmented Claude" instead of "stateless Claude".
 *
 * THE WORLD'S MOST COMPREHENSIVE BRAIN CONTEXT — 10 parallel queries:
 * - L4: Causal edges (what causes what in THIS organization)
 * - L5: Grammar rules / discovered patterns
 * - P0: Velocity snapshots + bottleneck risk
 * - L1: Recent cross-domain engineering signals
 * - Brain insights: Recent AI-generated organizational insights
 * - Cascade rules: Known cascade chains the Brain has learned
 * - Dependency graph: Code/module dependency relationships (structural intelligence)
 * - Brain evolution: Latest intelligence score, accuracy, learning velocity
 * - User corrections: Recent user corrections (high-priority learning)
 * - Brain predictions: Recent verified predictions (accuracy context)
 *
 * Every domain gets the FULL Brain context. This is NEVER stateless Claude.
 */
async function assembleBrainContext(
  supabase: SupabaseClient,
  organizationId: string
): Promise<Record<string, any>> {
  try {
    // Parallel load: FULL cognitive stack for Brain-augmented Claude (10 queries)
    const [
      causalEdgesRes,
      patternsRes,
      velocityRes,
      bottleneckRes,
      recentSignalsRes,
      brainInsightsRes,
      cascadeRulesRes,
      evolutionRes,
      correctionsRes,
      verifiedPredictionsRes,
    ] = await Promise.all([
      // L4: Causal relationships Brain has learned
      supabase
        .from('causal_relationships_statistical')
        .select('source_signal, target_signal, strength, confidence, lag, p_value, source_domain, target_domain, effect_size, evidence_weight')
        .eq('organization_id', organizationId)
        .order('updated_at', { ascending: false })
        .limit(50),

      // L5: Grammar rules / patterns Brain has discovered
      supabase
        .from('brain_grammar_rules')
        .select('rule_name, rule_body, confidence, domain')
        .eq('organization_id', organizationId)
        .gte('confidence', 0.5)
        .order('confidence', { ascending: false })
        .limit(20),

      // Cross-domain: latest velocity snapshot (P0 engineering metrics)
      supabase
        .from('velocity_snapshots')
        .select('prs_merged, mean_pr_cycle_time_hours, pr_cycle_time_variance, open_pr_count, prs_per_engineer, snapshot_date')
        .eq('organization_id', organizationId)
        .order('snapshot_date', { ascending: false })
        .limit(1),

      // Cross-domain: latest bottleneck snapshot (P0 bottleneck risk)
      supabase
        .from('bottleneck_snapshots')
        .select('bottleneck_risk_score, risk_level, reviewer_gini_coefficient, reviewer_hhi, top_reviewer_share, max_betweenness_centrality')
        .eq('organization_id', organizationId)
        .order('snapshot_date', { ascending: false })
        .limit(1),

      // Cross-domain: recent engineering signals (for incident diagnosis context)
      supabase
        .from('cross_domain_signals')
        .select('signal_type, signal_value, signal_metadata, created_at')
        .eq('organization_id', organizationId)
        .like('source_domain', 'engineering%')
        .gte('created_at', new Date(Date.now() - 7 * 86400000).toISOString())
        .order('created_at', { ascending: false })
        .limit(50),

      // Brain insights: Recent AI-generated organizational insights (from ai_memory)
      supabase
        .from('ai_memory')
        .select('content, memory_type, cognitive_layer, metadata, created_at')
        .eq('organization_id', organizationId)
        .in('memory_type', ['insight', 'pattern', 'prediction'])
        .gte('created_at', new Date(Date.now() - 30 * 86400000).toISOString())
        .order('created_at', { ascending: false })
        .limit(10),

      // Cascade rules: Known cascade chains the Brain has learned
      supabase
        .from('brain_cascade_rules')
        .select('source_domain, target_domain, cascade_type, severity, confidence, description')
        .eq('organization_id', organizationId)
        .gte('confidence', 0.5)
        .order('confidence', { ascending: false })
        .limit(15),

      // Brain Evolution: Latest intelligence score (THE differentiator visualization)
      supabase
        .from('brain_evolution_snapshots')
        .select('intelligence_score, accuracy, brier_score, total_edges, total_evidence, snapshot_date')
        .eq('organization_id', organizationId)
        .order('snapshot_date', { ascending: false })
        .limit(7),

      // User corrections: High-priority learning from feedback (most recent)
      supabase
        .from('ai_memory')
        .select('content, metadata, created_at')
        .eq('organization_id', organizationId)
        .eq('memory_type', 'correction')
        .order('created_at', { ascending: false })
        .limit(5),

      // Verified predictions: Brain's track record (accuracy context for domains)
      supabase
        .from('prediction_records')
        .select('domain, predicted_outcome, was_correct, confidence, verified_at')
        .eq('organization_id', organizationId)
        .not('was_correct', 'is', null)
        .order('verified_at', { ascending: false })
        .limit(20),
    ]);

    // Compute Brain accuracy from verified predictions
    const verifiedPreds = verifiedPredictionsRes.data || [];
    const correctPreds = verifiedPreds.filter(p => p.was_correct);
    const brainAccuracy = verifiedPreds.length > 0
      ? correctPreds.length / verifiedPreds.length
      : 0;

    // Get latest evolution snapshot
    const latestEvolution = evolutionRes.data?.[0] || null;

    return {
      organizationId,
      causalEdges: causalEdgesRes.data || [],
      patterns: patternsRes.data || [],
      cognitiveStackAvailable: true,
      // Cross-domain context for SE-aaS domains
      crossDomainContext: {
        engineering: {
          velocity: velocityRes.data?.[0] || null,
          bottleneck: bottleneckRes.data?.[0] || null,
          recentSignals: (recentSignalsRes.data || []).slice(0, 20),
          signalCount: recentSignalsRes.data?.length || 0,
        },
      },
      // Brain insights (recent organizational intelligence)
      brainInsights: (brainInsightsRes.data || []).slice(0, 5),
      // Cascade rules (cross-domain chains)
      cascadeRules: cascadeRulesRes.data || [],
      // Brain Evolution state (THE NEVER-EXISTED-BEFORE FEATURE)
      brainEvolution: {
        intelligenceScore: latestEvolution?.intelligence_score ?? 0,
        accuracy: latestEvolution?.accuracy ?? 0,
        brierScore: latestEvolution?.brier_score ?? 0.25,
        totalEdges: latestEvolution?.total_edges ?? 0,
        totalEvidence: latestEvolution?.total_evidence ?? 0,
        recentSnapshots: (evolutionRes.data || []).slice(0, 7),
        isLearning: (latestEvolution?.total_evidence ?? 0) > 0,
      },
      // Brain accuracy (from real prediction verification)
      brainAccuracy: {
        totalPredictions: verifiedPreds.length,
        correctPredictions: correctPreds.length,
        accuracy: brainAccuracy,
        recentTrackRecord: verifiedPreds.slice(0, 5).map(p => ({
          domain: p.domain,
          outcome: p.predicted_outcome,
          wasCorrect: p.was_correct,
          confidence: p.confidence,
        })),
      },
      // User corrections (highest-priority learning from feedback loop)
      userCorrections: (correctionsRes.data || []).map(c => ({
        correction: c.content,
        learnedAt: c.created_at,
        source: (c.metadata as any)?.source ?? 'unknown',
      })),
    };
  } catch {
    // Non-blocking: domains work without Brain context (degraded mode)
    return {
      organizationId,
      causalEdges: [],
      patterns: [],
      cognitiveStackAvailable: false,
      crossDomainContext: {},
      brainInsights: [],
      cascadeRules: [],
      brainEvolution: null,
      brainAccuracy: { totalPredictions: 0, correctPredictions: 0, accuracy: 0, recentTrackRecord: [] },
      userCorrections: [],
    };
  }
}
