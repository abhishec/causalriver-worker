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

// Import all 15 SE-aaS domains (8 original + 4 P1 gap closure + 3 SWE gap closure = 17 capabilities)
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
  // SWE Gap Closure: 3 remaining capabilities to complete 17-capability spec
  prReviewDomain,
  boilerplateScaffoldDomain,
  codebaseQADomain,
  // Brain Context Mesh — Unified Brain Context SDK (replaces inline assembleBrainContext)
  createBrainContextMesh,
  // Brain Feedback Bus — Unified Learning Circuit (replaces inline feedBrainFromExecution)
  createBrainFeedbackBus,
} from "@nexus-ai/memory-stack";

// ============================================================================
// DOMAIN REGISTRY — All 15 SE-aaS Brain-Augmented Domains (17 capabilities)
// ============================================================================
// 2 P0 capabilities (velocity collapse + bottleneck) are handled by /api/early-warning
// 15 P1 capabilities are handled here via domain executor

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
  // === P1 Gap Closure (4 from CTO spec) ===
  "dependency-upgrade": { domain: dependencyUpgradeDomain, sync: false },
  "design-doc-generator": { domain: designDocGeneratorDomain, sync: false },
  "performance-profiler": { domain: performanceProfilerDomain, sync: false },
  "dead-code-detector": { domain: deadCodeDetectorDomain, sync: true },
  // === SWE Gap Closure (3 remaining to complete 17-capability spec) ===
  "pr-review": { domain: prReviewDomain, sync: false },
  "boilerplate-scaffold": { domain: boilerplateScaffoldDomain, sync: false },
  "codebase-qa": { domain: codebaseQADomain, sync: false },
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
  /** Phase 3: LLM query interpretation for targeted context retrieval */
  interpretation?: import("@nexus-ai/memory-stack").QueryInterpretation;
}

export interface ExecuteDomainResult {
  result: Record<string, unknown>;
  artifactId: string;
}

/**
 * Execute an SE-aaS domain and persist the result as an artifact.
 *
 * Uses the Brain Context Mesh for unified context assembly and
 * Brain Feedback Bus for unified learning circuit.
 */
export async function executeDomain(
  supabase: SupabaseClient,
  params: ExecuteDomainParams
): Promise<ExecuteDomainResult> {
  const info = getDomainInfo(params.domainType);
  if (!info) {
    throw new Error(`Unknown domain: ${params.domainType}`);
  }

  // ── Step 1: Assemble Brain Context via Mesh ─────────────────────────────
  // Phase 3: When interpretation is provided, mesh.assemble() uses requiredData
  // signals to skip unneeded DB queries (e.g., skip causal edges for simple lookups).
  const mesh = createBrainContextMesh({ supabase, organizationId: params.organizationId });
  const brainContext = await mesh.assemble(
    `se-aas ${params.domainType} execution`,
    'se-aas',
    params.interpretation,
  );

  // ── Step 2: Build ActionDomainContext ────────────────────────────────────
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

  // ── Step 3: Execute the domain ──────────────────────────────────────────
  const startMs = Date.now();
  const result = await info.domain.execute(ctx);
  const durationMs = Date.now() - startMs;

  // ── Step 4: Save artifact ───────────────────────────────────────────────
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

  // ── Step 5: Brain Feedback Loop via Bus ─────────────────────────────────
  // All 5 channels in one shot — signal, prediction, evolution, observability
  const bus = createBrainFeedbackBus({ supabase, organizationId: params.organizationId });
  const interventions = (result as any).interventions ?? [];

  await Promise.all([
    // Channel 1: Signal — Brain observes this domain execution
    bus.emitSignal({
      sourceDomain: `se-aas.${params.domainType}`,
      signalType: 'domain_execution',
      signalValue: (result as any).confidence ?? 0.5,
      entityType: 'se_aas_artifact',
      entityId: `${params.domainType}_${Date.now()}`,
      metadata: {
        domainType: params.domainType,
        claudePowered: (result as any).data?.claudePowered ?? false,
        brainAugmented: brainContext.cognitiveStackAvailable,
        causalEdgesUsed: brainContext.causalEdges?.length ?? 0,
        durationMs,
        userId: params.userId,
        interventionsCount: interventions.length,
        hasNarrative: !!(result as any).narrative,
      },
    }),

    // Channel 2: Predictions — store interventions for later verification
    interventions.length > 0
      ? bus.recordInterventionPredictions(
          interventions,
          params.domainType,
          (result as any).confidence ?? 0.5,
        )
      : Promise.resolve(),

    // Channel 3: Evolution — trigger Bayesian weight updates
    bus.triggerEvolution(),

    // Channel 4: Observability — audit trail
    bus.recordExecution({
      service: 'se-aas',
      domainType: params.domainType,
      durationMs,
      claudePowered: (result as any).data?.claudePowered ?? false,
      brainAugmented: brainContext.cognitiveStackAvailable,
      causalEdgesUsed: brainContext.causalEdges?.length ?? 0,
      patternsUsed: brainContext.patterns?.length ?? 0,
    }),
  ]).catch(() => {
    // Non-blocking: feedback failure should NEVER break domain execution
  });

  return {
    result: { ...result, timing: { totalMs: durationMs } },
    artifactId,
  };
}

// ============================================================================
// NOTE: assembleBrainContext() and feedBrainFromExecution() have been replaced
// by the shared Brain Context Mesh and Brain Feedback Bus from @nexus-ai/memory-stack.
// All services (Copilot, SE-aaS, AAS) now share one unified brain context layer.
// ============================================================================
