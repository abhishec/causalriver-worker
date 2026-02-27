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
import { startJobHeartbeat, stopJobHeartbeat } from "./job-heartbeat";
import { recordAgentOutcome, computeAgentQuality } from "@/lib/brain/agent-rl";
import { getCaseLogContext, logAgentRetro } from "@/lib/brain/rl-agent-loop";
import { selectModelForDomain, routeModelWithIq } from "./model-router";
import {
  buildAgentCommsPayload,
  buildIntroSpeech,
  buildCompletionSpeech,
  buildErrorSpeech,
} from "@/lib/agents/agent-comms";
import type { AgentCommsPayload } from "@/lib/agents/agent-comms";

// Import all 15 SE-aaS domains (8 original + 4 P1 gap closure + 3 SWE gap closure = 17 capabilities)
import { logger } from "@/lib/logger";
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
  // Federated Causal Learning — ORG → CORE delta promotion (NB-063)
  snapshotCausalWeights,
  computeAndPromoteCausalDeltas,
  // Federated Brain — CORE → ORG real-time injection (NB-065)
  pushCoreInsightsToOrg,
  // SE-aaS Delivery Intelligence — Pod Match (Sprint 5 WOW Artifact #3)
  podMatchDomain,
  // P1-15 Architecture Extractor — NEW
  architectureExtractorDomain,
} from "@nexus-ai/memory-stack";

// ── NB-065: CORE → ORG TTL guard ──────────────────────────────────────────
// Tracks when we last pushed CORE priors DOWN to each org. Prevents hammering
// the CORE table on every domain call — we only push once per TTL window.
// Module-level so it persists across requests within the same process instance.
const _corePushLastMs = new Map<string, number>();
const CORE_PUSH_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes

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
  // Alias: DOMAIN_CATALOGUE id is 'tdd', DOMAIN_MAP key is 'tdd-code-generator'.
  // Both must resolve so slash commands (id='tdd') and regex routing ('tdd-code-generator') both work.
  "tdd": { domain: tddCodeGeneratorDomain, sync: false },
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
  // === SE-aaS Delivery Intelligence (Sprint 5 — WOW Artifacts) ===
  "pod-match": { domain: podMatchDomain, sync: true },
  // "delivery-intelligence" is handled by the dedicated API endpoint,
  // but can also be invoked via copilot as a pod-match + health score composite
  "delivery-intelligence": { domain: podMatchDomain, sync: true },
  // P0 domains: early-warning + scope-creep also use podMatchDomain for the
  // delivery context mesh. Full data comes from /api/se-aas/engagement-health
  // which is fetched in the copilot route's DELIVERY_DOMAINS handler.
  "early-warning": { domain: podMatchDomain, sync: true },
  "scope-creep": { domain: podMatchDomain, sync: true },
  // P1-15 Architecture Extractor
  "architecture-extractor": { domain: architectureExtractorDomain, sync: false },
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
  /** Optional: job queue ID for heartbeat — prevents stale-job watchdog from killing long-running jobs */
  jobId?: string;
  anthropicApiKey?: string;
  /** Phase 3: LLM query interpretation for targeted context retrieval */
  interpretation?: import("@nexus-ai/memory-stack").QueryInterpretation;
  /**
   * Agent Communication Protocol callback.
   * Called at key execution milestones with Heart/Mind/Speech payloads
   * so the frontend can render live agent state updates.
   */
  onComms?: (payload: AgentCommsPayload) => void;
}

export interface ExecuteDomainResult {
  result: Record<string, unknown>;
  /** Artifact ID — null if persistence failed (non-blocking) */
  artifactId: string | null;
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

  // ── Agent Communication Protocol setup ──────────────────────────────────
  const agentId = `${params.domainType}_${params.organizationId.slice(0, 8)}_${Date.now()}`;
  const agentType = `se-aas:${params.domainType}`;
  const executionStartMs = Date.now();

  const SE_AAS_PLAN_STEPS = [
    "Step 0: Booting up — loading case-log priors and brain context",
    "Step 1: Assembling brain context mesh",
    "Step 2: Building domain execution context",
    "Step 3: Executing domain analysis",
    "Step 4: Saving artifact to workspace",
    "Step 5: Running brain feedback loop",
    "Step 6: Applying domain-specific side effects",
    "Step 7: Federating causal learning to core brain",
    "Step 8: Recording RL outcome and retro",
  ];

  // Emit intro comms — agent announces itself at startup
  if (params.onComms) {
    try {
      params.onComms(buildAgentCommsPayload({
        agentId,
        agentType,
        orgId: params.organizationId,
        completedSteps: 0,
        totalSteps: SE_AAS_PLAN_STEPS.length,
        currentStepName: SE_AAS_PLAN_STEPS[0],
        completedStepNames: [],
        planSteps: SE_AAS_PLAN_STEPS,
        progress: 5,
        hasError: false,
        elapsedMs: Date.now() - executionStartMs,
        speech: buildIntroSpeech(agentType, params.request),
      }));
    } catch {
      // Non-fatal — comms failure must never block domain execution
    }
  }

  // ── Step -1: RL Context Priming — inject learned patterns from case-log ──
  // Non-blocking: if case-log read fails, execution continues unaffected.
  try {
    const caseLogContext = await getCaseLogContext({
      agentType: params.domainType ?? '',
      prompt: JSON.stringify(params.request ?? {}).slice(0, 200),
      orgId: params.organizationId ?? '',
    });
    if (caseLogContext) {
      // Inject into request so domain Claude prompts can reference past patterns
      (params.request as Record<string, unknown>)["_caseLogContext"] = caseLogContext;
    }
  } catch {
    // Non-fatal — case-log priming failure must never block domain execution
  }

  // ── Step -1b: Brain Context Priming — inject live brain state into every domain ──
  // Non-blocking: if getBrainContext fails, domain execution continues unaffected.
  let brainContextStr = "";
  try {
    const { getBrainContext } = await import("@/lib/brain/brain-context");
    const brainCtx = await getBrainContext(supabase, params.organizationId);
    brainContextStr = brainCtx.contextSummary;
    if (brainContextStr) {
      (params.request as Record<string, unknown>)["_brainContextStr"] = brainContextStr;
    }
  } catch {
    // non-fatal — domain proceeds without brain context enrichment
  }

  // ── Step 0: Snapshot causal weights BEFORE execution for federation delta ─
  // NB-063: Mirrors AAS executor Step 0. We capture the org's causal graph
  // state RIGHT NOW, before the domain runs and before the feedback bus fires
  // (bus.triggerEvolution may update edge weights). At the end (Step 6) we
  // compute only what CHANGED and promote deltas to CORE via FedAvg.
  // This is fire-and-forget safe — if it fails we still run the domain.
  let causalWeightsBefore: Map<string, number> = new Map();
  const federationCycleId = `seas_${params.domainType}_${params.organizationId.slice(0, 8)}_${Date.now()}`;
  try {
    causalWeightsBefore = await snapshotCausalWeights(supabase, params.organizationId);
  } catch {
    // Non-fatal — federation is best-effort, never blocks domain execution
  }

  // ── Step 0.5: CORE → ORG real-time injection (NB-065) ───────────────────
  // pushCoreInsightsToOrg writes strong CORE causal priors (evidence_weight ≥ 10,
  // effect_size ≥ 0.7) into the ORG's own causal_relationships_statistical rows.
  // We AWAIT this before mesh.assemble() so the priors are in the DB when the
  // mesh queries causal edges for this org. Conflict resolution is already in
  // pushCoreInsightsToOrg: org's own strong data always wins; CORE only fills
  // gaps or blends with weak org data (0.7 × CORE + 0.3 × org).
  //
  // TTL guard prevents hammering on every request — at most once per 10 minutes
  // per org per process instance. Fire-and-forget on failure (non-fatal).
  if ((Date.now() - (_corePushLastMs.get(params.organizationId) ?? 0)) >= CORE_PUSH_INTERVAL_MS) {
    _corePushLastMs.set(params.organizationId, Date.now()); // set before await to avoid races
    try {
      await pushCoreInsightsToOrg(params.organizationId, supabase as any);
    } catch {
      // Non-fatal — if CORE push fails, org continues with its own causal edges
    }
  }

  // ── Step 1: Assemble Brain Context via Mesh ─────────────────────────────
  // Branch scoping: the request payload may include a `branch` field (e.g. 'release/6.3.4').
  // When present, the mesh loads the code dependency graph + symbol index for that branch
  // and injects them into every SE-aaS Claude prompt (NB-017/NB-018 Phase 2).
  // When absent (cold-start or org has no GitHub connector), code intelligence is skipped.
  const branch = typeof params.request.branch === 'string' && params.request.branch
    ? params.request.branch
    : undefined;

  const mesh = createBrainContextMesh({
    supabase,
    organizationId: params.organizationId,
    branch,
  });
  const brainContext = await mesh.assemble(
    `se-aas ${params.domainType} execution`,
    'se-aas',
    params.interpretation,
  );

  // ── Step 2: Build ActionDomainContext ────────────────────────────────────
  // Gap 4 (NB-064): Explicitly surface leapContext and entityLinks so SE-AAS
  // domain execute() functions can access deep brain reasoning without having
  // to dig into ctx.brain internals. Mirrors the AAS executor pattern where
  // both are unpacked directly into the ctx for easy agent consumption.
  //
  // Brain IQ gate: downgrade to Haiku when Brain IQ < 10 (not enough signal
  // for heavy reasoning). brainEvolution.intelligenceScore is 0–1; multiply
  // by 100 to convert to the 0–100 IQ scale routeModelWithIq expects.
  const rawIntelligenceScore = brainContext.brainEvolution?.intelligenceScore ?? 0;
  const brainIqForRouting = Math.round(rawIntelligenceScore * 100);
  const modelDecision = routeModelWithIq(params.domainType, brainIqForRouting);
  const selectedModel = modelDecision.model;
  if (modelDecision.brainCaveat) {
    logger.debug(`[domain-executor] ${params.domainType}: ${modelDecision.brainCaveat}`);
  }

  const ctx = {
    organizationId: params.organizationId,
    userId: params.userId,
    input: {
      ...params.request,
      anthropicApiKey: params.anthropicApiKey,
      model: selectedModel,  // domains use ctx.input.model ?? 'claude-sonnet-4-6'
    },
    brain: brainContext,
    // LEAP context: deep brain reasoning from cognitive sleep cycles
    // (curiosity hypotheses, self-model, imagination scenarios)
    leapContext: brainContext.leapContext ?? null,
    // Entity links: cross-system connections (PR→Jira→Slack→Deploy)
    // loaded by the mesh's Layer 2 SE-AAS domain context (getSeaasDomainContext)
    entityLinks: (brainContext.entityLinks ?? []).slice(0, 20).map(l => ({
      source: `${l.source_domain ?? ''}:${l.source_entity_id}`,
      target: `${l.target_domain ?? ''}:${l.target_entity_id}`,
      type: l.link_type,
      confidence: l.confidence,
    })),
    supabase,
  };

  // ── Step 3: Execute the domain ──────────────────────────────────────────
  // Emit mid-execution comms — domain analysis is running
  if (params.onComms) {
    try {
      params.onComms(buildAgentCommsPayload({
        agentId,
        agentType,
        orgId: params.organizationId,
        completedSteps: 3,
        totalSteps: SE_AAS_PLAN_STEPS.length,
        currentStepName: SE_AAS_PLAN_STEPS[3],
        completedStepNames: SE_AAS_PLAN_STEPS.slice(0, 3),
        planSteps: SE_AAS_PLAN_STEPS,
        progress: 35,
        hasError: false,
        elapsedMs: Date.now() - executionStartMs,
        speech: {
          format: "intro",
          headline: "Analyzing now.",
          body: "Domain analysis is running with brain context.",
          tone: "analytical",
        },
      }));
    } catch {
      // Non-fatal
    }
  }

  const startMs = Date.now();
  let result: Record<string, unknown>;
  let domainError: string | null = null;
  // ── Heartbeat: prevent stale-job watchdog from killing long-running jobs ──
  // Emits a heartbeat every 30s. The watchdog threshold is 120s, so we get
  // 3 grace beats. Always stopped in finally — interval never leaks.
  const heartbeatHandle = params.jobId
    ? startJobHeartbeat(supabase, params.jobId)
    : null;
  try {
    result = await info.domain.execute(ctx);
  } catch (domainExecErr: any) {
    domainError = domainExecErr?.message ?? "Unknown domain execution error";
    // Emit error comms before re-throwing
    if (params.onComms) {
      try {
        params.onComms(buildAgentCommsPayload({
          agentId,
          agentType,
          orgId: params.organizationId,
          completedSteps: 3,
          totalSteps: SE_AAS_PLAN_STEPS.length,
          currentStepName: SE_AAS_PLAN_STEPS[3],
          completedStepNames: SE_AAS_PLAN_STEPS.slice(0, 3),
          planSteps: SE_AAS_PLAN_STEPS,
          progress: 35,
          hasError: true,
          elapsedMs: Date.now() - executionStartMs,
          speech: buildErrorSpeech(agentType, domainError ?? "Unknown error", SE_AAS_PLAN_STEPS.slice(0, 3)),
        }));
      } catch {
        // Non-fatal
      }
    }
    throw domainExecErr;
  } finally {
    if (heartbeatHandle !== null) {
      stopJobHeartbeat(heartbeatHandle);
    }
  }
  const durationMs = Date.now() - startMs;

  // Emit domain-complete comms — result ready, about to save artifact
  if (params.onComms) {
    try {
      params.onComms(buildAgentCommsPayload({
        agentId,
        agentType,
        orgId: params.organizationId,
        completedSteps: 4,
        totalSteps: SE_AAS_PLAN_STEPS.length,
        currentStepName: SE_AAS_PLAN_STEPS[4],
        completedStepNames: SE_AAS_PLAN_STEPS.slice(0, 4),
        planSteps: SE_AAS_PLAN_STEPS,
        progress: 60,
        hasError: false,
        elapsedMs: Date.now() - executionStartMs,
        speech: {
          format: "intro",
          headline: "Domain answer ready. Saving artifact.",
          body: "Analysis complete. Persisting the result to your workspace.",
          tone: "analytical",
        },
      }));
    } catch {
      // Non-fatal
    }
  }

  // ── Step 4: Save artifact (non-blocking — artifact failure MUST NOT kill domain result) ──
  let artifactId: string | null = null;
  try {
    const saved = await saveArtifact(supabase, {
      organizationId: params.organizationId,
      domainType: params.domainType,
      artifactData: result,
      metadata: {
        durationMs,
        userId: params.userId,
        claudePowered: (result.data as Record<string, unknown>)?.claudePowered ?? false,
        brainAugmented: (result.data as Record<string, unknown>)?.brainAugmented ?? brainContext.cognitiveStackAvailable,
        brainCausalEdgesUsed: brainContext.causalEdges?.length ?? 0,
        brainPatternsUsed: brainContext.patterns?.length ?? 0,
      },
      createdBy: params.userId,
    });
    artifactId = saved.artifactId;
  } catch (artifactErr: any) {
    logger.warn("[domain-executor] Artifact save failed (non-blocking):", artifactErr?.message);
    // Domain result is returned regardless — artifact persistence is best-effort
  }

  // ── Step 5: Brain Feedback Loop via Bus ─────────────────────────────────
  // All 5 channels in one shot — signal, prediction, evolution, observability
  const bus = createBrainFeedbackBus({ supabase, organizationId: params.organizationId });
  const interventions = (result as any).interventions ?? [];
  const confidence = (result as any).confidence ?? 0.5;

  await Promise.all([
    // Channel 1: Signal — Brain observes this domain execution
    bus.emitSignal({
      sourceDomain: `se-aas.${params.domainType}`,
      signalType: 'domain_execution',
      signalValue: confidence,
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
          confidence,
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

  // Channel 5: Push insight for cross-service propagation (Gap 3 — NB-064)
  // If SE-AAS found actionable interventions, broadcast them as a structured
  // insight signal so Copilot and AAS pick it up via their next Mesh
  // recentSignals query. Mirrors the AAS executor's pushInsight pattern.
  if (interventions.length > 0) {
    bus.pushInsight({
      type: 'anomaly',
      domains: ['engineering', 'se-aas', params.domainType],
      content: `SE-AAS domain "${params.domainType}" flagged ${interventions.length} intervention(s): ${interventions[0]?.description ?? 'See artifact for details'}`,
      importance: confidence,
    }).catch(() => {
      // Non-blocking: insight push failure should NEVER break domain execution
    });
  }

  // ── Step 6: Domain-Specific Side Effects (DB-direct, non-blocking) ───────
  // Previously in event-bus-wiring.ts (initializeSeAaSEventBusWiring) which was
  // never called in production. Migrated here to run on every domain execution.
  _runDomainSideEffects(supabase, params.organizationId, params.domainType, result, confidence, durationMs).catch(() => {
    // Non-blocking: side-effect failure should NEVER break domain execution
  });

  // ── Step 7: Federated Causal Learning — ORG → CORE delta promotion ───────
  // NB-063: This was the missing piece in SE-AAS vs AAS. AAS had this since
  // NB-059; SE-AAS was learning internally (bus.triggerEvolution updates the
  // org's own causal graph) but those learnings NEVER reached the CORE brain.
  //
  // Now: after the feedback bus fires (Step 5) and has potentially updated
  // the org's causal edge weights via triggerEvolution(), we compute what
  // CHANGED vs the Step 0 snapshot and promote only the deltas to CORE.
  //
  // Privacy guarantee: only delta effect sizes (not raw data, not absolute
  // weights, not org identifiers) leave the org boundary. Deltas are clipped
  // to [-0.15, +0.15] to prevent any single org from dominating CORE.
  //
  // Fire-and-forget: wrapping in an IIFE that is NOT awaited ensures this
  // NEVER slows down the domain response returned to the user.
  (async () => {
    try {
      if (causalWeightsBefore.size === 0) return; // No baseline — nothing to diff
      const federationResult = await computeAndPromoteCausalDeltas(
        supabase,
        params.organizationId,
        causalWeightsBefore,
        federationCycleId,
        {
          fedAvgLearningRate: 0.3,  // New deltas get 30% weight vs existing CORE
          maxDelta: 0.15,           // Max effect-size change per cycle (outlier clip)
          minDelta: 0.01,           // Ignore noise — only promote meaningful changes
          minSampleSize: 10,        // Only promote if enough observations back it up
          maxPairsPerRun: 20,       // Limit CORE updates per domain run
        },
      );
      logger.debug(
        `[SE-AAS federation] org=${params.organizationId.slice(0, 8)} domain=${params.domainType} ` +
        `applied=${federationResult.deltasApplied} filtered=${federationResult.deltasFiltered} ` +
        `newPairs=${federationResult.newPairsAdded} updatedPairs=${federationResult.existingPairsUpdated} ` +
        `took=${federationResult.durationMs}ms`
      );
    } catch (err: any) {
      // Federation is best-effort — never block domain execution or the response
      logger.warn('[SE-AAS federation] Delta promotion failed (non-fatal):', err?.message);
    }
  })();

  // ── Step 8: RL Outcome Recording ─────────────────────────────────────────
  // Record task quality to prediction_records + cross_domain_signals.
  // Also log a retro entry so the system accumulates learning history.
  // Both are fire-and-forget — NEVER block the domain response.
  const rlQuality = computeAgentQuality(JSON.stringify(result), null, durationMs, params.domainType);
  const rlTaskId = `${params.domainType}_${params.organizationId.slice(0, 8)}_${Date.now()}`;

  recordAgentOutcome(supabase, {
    agentId: rlTaskId,
    domain: params.domainType,
    taskDescription: JSON.stringify(params.request).slice(0, 200),
    resultSummary: JSON.stringify(result).slice(0, 500),
    quality: rlQuality,
    executionMs: durationMs,
    organizationId: params.organizationId,
    userId: params.userId,
  }).catch(() => {/* non-fatal */});

  logAgentRetro({
    taskId: rlTaskId,
    agentType: params.domainType,
    prompt: JSON.stringify(params.request).slice(0, 100),
    status: rlQuality >= 0.5 ? "completed" : "partial",
    durationMs,
    modelUsed: "claude-sonnet-4-6",
    outputSummary: JSON.stringify(result).slice(0, 200),
  }).catch(() => {/* non-fatal */});

  // ── Final: Emit completion comms — full heart/mind/speech payload ─────────
  // This is the most important comms emission: it gives the user the human-voice
  // summary of what the agent found and a pointer to the artifact.
  if (params.onComms) {
    try {
      const totalElapsed = Date.now() - executionStartMs;
      const completionSpeech = buildCompletionSpeech(
        agentType,
        result,
        artifactId ? [artifactId] : [],
        totalElapsed,
      );
      params.onComms(buildAgentCommsPayload({
        agentId,
        agentType,
        orgId: params.organizationId,
        completedSteps: SE_AAS_PLAN_STEPS.length,
        totalSteps: SE_AAS_PLAN_STEPS.length,
        currentStepName: SE_AAS_PLAN_STEPS[SE_AAS_PLAN_STEPS.length - 1],
        completedStepNames: [...SE_AAS_PLAN_STEPS],
        planSteps: SE_AAS_PLAN_STEPS,
        progress: 100,
        hasError: false,
        elapsedMs: totalElapsed,
        speech: completionSpeech,
      }));
    } catch {
      // Non-fatal — final comms must never block return
    }
  }

  return {
    result: { ...result, timing: { totalMs: durationMs } },
    artifactId,
  };
}

// ============================================================================
// DOMAIN SIDE EFFECTS — DB-direct, non-blocking
// Previously wired via initializeSeAaSEventBusWiring() (event-bus-wiring.ts)
// which was never called in the production API path. Migrated here so these
// writes happen on every domain execution without needing an in-process event bus.
// ============================================================================

async function _runDomainSideEffects(
  supabase: SupabaseClient,
  organizationId: string,
  domainType: string,
  result: Record<string, unknown>,
  confidence: number,
  durationMs: number,
): Promise<void> {
  const claudePowered = (result as any).data?.claudePowered ?? false;
  const now = new Date().toISOString();

  // 1. Execution metrics row (se_aas_metrics)
  await supabase.from('se_aas_metrics').insert({
    organization_id: organizationId,
    domain_type: domainType,
    confidence,
    execution_time_ms: durationMs,
    claude_powered: claudePowered,
    created_at: now,
  });

  // 2. Domain-specific auto-actions
  switch (domainType) {
    case 'incident-diagnosis': {
      // High-confidence incident → create alert
      if (confidence > 0.85) {
        await supabase.from('alerts').insert({
          organization_id: organizationId,
          alert_type: 'incident',
          severity: 'high',
          title: `Incident detected: ${(result as any).rootCause || 'Unknown'}`,
          description: (result as any).narrative as string | undefined,
          metadata: result,
          status: 'open',
        });
      }
      break;
    }

    case 'impact-analysis': {
      // High-risk change → notify org admins
      const riskScore = (result as any).riskScore as number | undefined;
      if (riskScore && riskScore > 0.7) {
        const { data: members } = await supabase
          .from('org_members')
          .select('user_id')
          .eq('organization_id', organizationId)
          .in('role', ['admin', 'owner']);

        if (members && members.length > 0) {
          await supabase.from('notifications').insert(
            members.map((m: { user_id: string }) => ({
              user_id: m.user_id,
              organization_id: organizationId,
              notification_type: 'high_risk_change',
              title: 'High-risk code change detected',
              message: `Risk score: ${riskScore}. ${(result as any).summary || 'Review required.'}`,
              metadata: result,
              read: false,
            }))
          );
        }
      }
      break;
    }

    case 'log-query': {
      // Error clusters detected → auto-create monitoring rules
      const errorClusters = (result as any).errorClusters as Array<{
        pattern: string;
        count: number;
        severity: string;
      }> | undefined;

      if (errorClusters && errorClusters.length > 0) {
        const rulesToInsert = errorClusters
          .filter((c) => c.severity === 'high' || c.count > 10)
          .map((c) => ({
            organization_id: organizationId,
            rule_type: 'log_pattern',
            pattern: c.pattern,
            threshold: c.count,
            severity: c.severity,
            auto_created: true,
            created_from: 'log-query-domain',
          }));

        if (rulesToInsert.length > 0) {
          await supabase.from('monitoring_rules').insert(rulesToInsert);
        }
      }
      break;
    }
  }
}

// ============================================================================
// NOTE: assembleBrainContext() and feedBrainFromExecution() have been replaced
// by the shared Brain Context Mesh and Brain Feedback Bus from @nexus-ai/memory-stack.
// All services (Copilot, SE-aaS, AAS) now share one unified brain context layer.
// ============================================================================
