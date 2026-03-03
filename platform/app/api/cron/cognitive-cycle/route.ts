/**
 * Cron: Cognitive Cycle Cache
 * ============================
 *
 * GET /api/cron/cognitive-cycle
 *   Runs L3-L15 cognitive stack for orgs with recent brain activity and
 *   persists key insights to ai_memory, where getUniversalContext() /
 *   createBrainContextBuilder() will pick them up automatically for every
 *   copilot query.
 *
 * Why this exists:
 *   Standard copilot queries only have L1-L7 data via getBrainContext().
 *   Running L3-L15 inline per request is too expensive (~500ms-2s per cycle).
 *   This cron runs the deep cognitive stack on a schedule and caches outputs
 *   in ai_memory so every copilot response benefits from the full cognitive
 *   stack without blocking the request path.
 *
 * Schedule recommendation:
 *   Every 30 minutes: GET /api/cron/cognitive-cycle
 *   (Add to Amplify scheduler or external cron — same pattern as /api/cron/evolution)
 *
 * Security: Protected by Bearer CRON_SECRET header.
 *
 * What it persists to ai_memory:
 *   - memory_type: 'insight'  domain: 'cognitive_cycle'
 *     → Top imagination insight from L8 Causal Imagination
 *   - memory_type: 'insight'  domain: 'cognitive_dream'
 *     → Deep dreaming associations from L3 (cross-domain connections found)
 *   - memory_type: 'insight'  domain: 'cognitive_curiosity'
 *     → Knowledge gaps and hypotheses from L5 Curiosity Engine
 *   - memory_type: 'insight'  domain: 'cognitive_planning'
 *     → Top recommendation from L14 Goal-Backward Planning
 *   - memory_type: 'pattern'  domain: 'cognitive_self_model'
 *     → Calibration score + weaknesses from L6 Self-Modifying Cognition
 *   - memory_type: 'insight'  domain: 'cognitive_narrative'
 *     → Narrative summary from L15 (executive communication layer)
 *
 * Conflict strategy: ON CONFLICT (organization_id, memory_type, domain) DO UPDATE
 *   → Bounded growth: only 6 rows per org, updated each cycle.
 */

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";
import { runCognitivePlanner } from "@/lib/brain/cognitive-planner";
import { runMonitoringReactions } from "@/lib/brain/monitoring-reactions";
import { runCausalDiscovery } from "@/lib/brain/causal-discovery";
import { extractProcessTemplates } from "@/lib/brain/process-templates";
import { promotePatternsToCore, promoteGabaPatternsToKnowledge } from "@/lib/brain/se-aas-federation";
import { ensureCoreBrain, checkCoreBrainHealth } from "@/lib/brain/core-brain";
import { promoteMemoryToFederatedKnowledge } from "@/lib/brain/memory-federator";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 minutes max — 5 orgs × ~30s each

// Max orgs to process per run — prevents Lambda timeout
const MAX_ORGS_PER_RUN = 5;

// Only process orgs with signals in the last 7 days (active orgs only)
const ACTIVE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export async function GET(request: NextRequest) {
  // ── Auth ──────────────────────────────────────────────────────────────
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startMs = Date.now();

  try {
    const service = await createServiceClient();

    // ── Ensure CORE brain org exists (auto-recover if deleted) ────────
    await ensureCoreBrain(service);

    // ── Check CORE brain health and log any issues ─────────────────────
    const coreBrainHealth = await checkCoreBrainHealth(service);
    if (!coreBrainHealth.healthy) {
      logger.warn("[CronCognitiveCycle] CORE brain health check failed", {
        issues: coreBrainHealth.issues,
        orgExists: coreBrainHealth.orgExists,
        templateCount: coreBrainHealth.templateCount,
      });
    }

    // ── Find orgs with recent brain activity ──────────────────────────
    // Query cross_domain_signals for distinct org IDs with signals in the last 7 days.
    // This ensures we only run the cognitive stack for orgs where the brain has data.
    const since = new Date(Date.now() - ACTIVE_WINDOW_MS).toISOString();

    const { data: activeOrgRows, error: orgError } = await service
      .from("cross_domain_signals")
      .select("organization_id")
      .gte("created_at", since)
      .limit(MAX_ORGS_PER_RUN * 20); // over-fetch to deduplicate

    if (orgError) {
      logger.error("[CronCognitiveCycle] Failed to fetch active orgs:", { error: orgError?.message ?? String(orgError), route: "/api/cron/cognitive-cycle" });
      return NextResponse.json({ error: "Failed to fetch active orgs" }, { status: 500 });
    }

    if (!activeOrgRows || activeOrgRows.length === 0) {
      logger.info("[CronCognitiveCycle] No orgs with recent brain activity — skipping");
      return NextResponse.json({ ok: true, processed: 0, skipped: 0, message: "No active orgs" });
    }

    // Deduplicate org IDs and cap at MAX_ORGS_PER_RUN
    const seenOrgIds = new Set<string>();
    const activeOrgIds: string[] = [];
    for (const row of activeOrgRows) {
      if (!seenOrgIds.has(row.organization_id) && activeOrgIds.length < MAX_ORGS_PER_RUN) {
        seenOrgIds.add(row.organization_id);
        activeOrgIds.push(row.organization_id);
      }
    }

    logger.info(
      `[CronCognitiveCycle] Running cognitive cycle for ${activeOrgIds.length} orgs` +
      ` (${activeOrgRows.length} total active signals found)`
    );

    // ── Import cognitive stack ────────────────────────────────────────
    const { createCognitiveStack } = await import("@nexus-ai/memory-stack");

    let processed = 0;
    let skipped = 0;
    const results: Array<{
      orgId: string;
      success: boolean;
      insightsPersisted: number;
      error?: string;
      durationMs: number;
    }> = [];

    // ── Process each org ──────────────────────────────────────────────
    for (const orgId of activeOrgIds) {
      const orgStart = Date.now();

      try {
        // ── Load signals (last 7 days, up to 500) ──────────────────
        const { data: rawSignals } = await service
          .from("cross_domain_signals")
          .select("id, source_domain, signal_type, entity_type, entity_id, signal_value, created_at, signal_metadata")
          .eq("organization_id", orgId)
          .gte("created_at", since)
          .order("created_at", { ascending: false })
          .limit(500);

        const signals = (rawSignals ?? []).map((s) => ({
          id: s.id,
          source: String(s.source_domain ?? "unknown"),
          domain: String(s.signal_type ?? "unknown"),
          entityType: String(s.entity_type ?? "unknown"),
          entityId: String(s.entity_id ?? "unknown"),
          value: typeof s.signal_value === "number" ? s.signal_value : 0,
          timestamp: new Date(s.created_at).getTime(),
          metadata: s.signal_metadata as Record<string, unknown> | undefined,
        }));

        if (signals.length === 0) {
          skipped++;
          results.push({ orgId, success: true, insightsPersisted: 0, durationMs: Date.now() - orgStart });
          continue;
        }

        // ── Load causal edges ───────────────────────────────────────
        const { data: edgeRows } = await service
          .from("causal_relationships_statistical")
          .select("source_domain, target_domain, effect_size, confidence_level")
          .eq("organization_id", orgId)
          .order("effect_size", { ascending: false })
          .limit(200);

        const causalEdges = (edgeRows ?? []).map((e) => ({
          source: String(e.source_domain ?? ""),
          target: String(e.target_domain ?? ""),
          weight: typeof e.effect_size === "number" ? e.effect_size : 0.5,
          confidence: typeof e.confidence_level === "number" ? e.confidence_level : 0.5,
        }));

        // ── Load patterns from brain_grammar_rules ──────────────────
        const { data: ruleRows } = await service
          .from("brain_grammar_rules")
          .select("rule_body")
          .eq("organization_id", orgId)
          .eq("is_active", true)
          .limit(100);

        const patterns = (ruleRows ?? []).map((r) => String(r.rule_body ?? "")).filter(Boolean);

        // ── Load pending predictions ────────────────────────────────
        const { data: predRows } = await service
          .from("prediction_records")
          .select("id, domain, predicted_outcome, confidence, evidence, method")
          .eq("organization_id", orgId)
          .is("was_correct", null)
          .limit(50);

        const predictions = (predRows ?? []).map((p) => ({
          id: String(p.id),
          domain: String(p.domain ?? "unknown"),
          claim: String(p.predicted_outcome ?? ""),
          confidence: typeof p.confidence === "number" ? p.confidence : 0.5,
          evidence: Array.isArray(p.evidence) ? (p.evidence as string[]) : [],
          method: String(p.method ?? "unknown"),
        }));

        // ── Run cognitive stack (L3-L15) ────────────────────────────
        const stack = createCognitiveStack({ organizationId: orgId });
        const result = stack.runCycle({
          signals,
          causalEdges,
          patterns,
          predictions,
          metrics: [],
        });

        // ── Extract insights to persist ─────────────────────────────
        // Each insight maps to a unique (organization_id, memory_type, domain)
        // so upsert with ON CONFLICT gives us bounded growth: 6 rows max per org.

        const insightRows: Array<{
          organization_id: string;
          memory_type: string;
          domain: string;
          content: string;
          importance: number;
          metadata: Record<string, unknown>;
        }> = [];

        // L8 Causal Imagination — top hypothesis/insight
        if (result.imagination.topInsight) {
          insightRows.push({
            organization_id: orgId,
            memory_type: "insight",
            domain: "cognitive_cycle",
            content: result.imagination.topInsight,
            importance: 0.75,
            metadata: {
              layer: 8,
              layerName: "Causal Imagination",
              hypothesesGenerated: result.imagination.hypothesesGenerated,
              scenariosPlanned: result.imagination.scenariosPlanned,
              analogiesFound: result.imagination.analogiesFound,
              cycleTimestamp: result.timestamp,
            },
          });
        }

        // L3 Deep Dreaming — cross-domain connections found
        if (result.dreaming.associationsFound > 0 || result.dreaming.surfacedInsights > 0) {
          insightRows.push({
            organization_id: orgId,
            memory_type: "insight",
            domain: "cognitive_dream",
            content: `Deep dreaming cycle: found ${result.dreaming.associationsFound} associations, ` +
              `surfaced ${result.dreaming.surfacedInsights} insights, ` +
              `${result.dreaming.crossDomainConnections} cross-domain connections.`,
            importance: Math.min(0.9, 0.5 + result.dreaming.surfacedInsights * 0.05),
            metadata: {
              layer: 3,
              layerName: "Deep Dreaming",
              associationsFound: result.dreaming.associationsFound,
              surfacedInsights: result.dreaming.surfacedInsights,
              crossDomainConnections: result.dreaming.crossDomainConnections,
              cycleTimestamp: result.timestamp,
            },
          });
        }

        // L5 Curiosity Engine — knowledge gaps and hypotheses
        if (result.curiosity.hypothesesGenerated > 0 || result.curiosity.knowledgeGaps > 0) {
          insightRows.push({
            organization_id: orgId,
            memory_type: "insight",
            domain: "cognitive_curiosity",
            content: `Curiosity cycle: generated ${result.curiosity.hypothesesGenerated} hypotheses, ` +
              `identified ${result.curiosity.knowledgeGaps} knowledge gaps ` +
              `(exploration budget used: ${Math.round(result.curiosity.explorationBudgetUsed * 100)}%).`,
            importance: 0.7,
            metadata: {
              layer: 5,
              layerName: "Curiosity Engine",
              hypothesesGenerated: result.curiosity.hypothesesGenerated,
              knowledgeGaps: result.curiosity.knowledgeGaps,
              explorationBudgetUsed: result.curiosity.explorationBudgetUsed,
              cycleTimestamp: result.timestamp,
            },
          });
        }

        // L14 Goal-Backward Planning — top recommendation
        if (result.planning.topRecommendation) {
          insightRows.push({
            organization_id: orgId,
            memory_type: "insight",
            domain: "cognitive_planning",
            content: result.planning.topRecommendation,
            importance: 0.8,
            metadata: {
              layer: 14,
              layerName: "Goal-Backward Planning",
              goalsPlanned: result.planning.goalsPlanned,
              feasiblePaths: result.planning.feasiblePaths,
              cycleTimestamp: result.timestamp,
            },
          });
        }

        // L6 Self-Modifying Cognition — calibration + weaknesses
        {
          const { calibrationScore, weaknesses, suggestedModifications } = result.selfModel;
          const weaknessSummary = weaknesses.length > 0
            ? `Identified weaknesses: ${weaknesses.slice(0, 3).join("; ")}.`
            : "No critical weaknesses detected.";

          insightRows.push({
            organization_id: orgId,
            memory_type: "pattern",
            domain: "cognitive_self_model",
            content: `Self-model calibration: ${Math.round(calibrationScore * 100)}% accurate. ` +
              weaknessSummary +
              ` Suggested ${suggestedModifications} cognitive modifications.`,
            importance: calibrationScore,
            metadata: {
              layer: 6,
              layerName: "Self-Modifying Cognition",
              calibrationScore,
              weaknesses,
              suggestedModifications,
              cycleTimestamp: result.timestamp,
            },
          });
        }

        // L15 Narrative Intelligence — executive summary (if generated)
        if (result.narrative) {
          const narrativeObj = result.narrative as unknown as Record<string, unknown>;
          const narrativeText = typeof result.narrative === "object" && result.narrative !== null
            ? (
                narrativeObj.executiveSummary as string ||
                narrativeObj.summary as string ||
                JSON.stringify(result.narrative).slice(0, 500)
              )
            : String(result.narrative).slice(0, 500);

          if (narrativeText) {
            insightRows.push({
              organization_id: orgId,
              memory_type: "insight",
              domain: "cognitive_narrative",
              content: narrativeText,
              importance: 0.85,
              metadata: {
                layer: 15,
                layerName: "Narrative Intelligence",
                cycleTimestamp: result.timestamp,
                durationMs: result.durationMs,
              },
            });
          }
        }

        // ── Batch upsert to ai_memory ───────────────────────────────
        // ON CONFLICT (organization_id, memory_type, domain) → UPDATE content + metadata.
        // This is bounded: max 6 rows per org, refreshed each cycle.
        // Batch all rows in one round-trip instead of N serial upserts.
        let insightsPersisted = 0;
        if (insightRows.length > 0) {
          const rowsWithTimestamp = insightRows.map((row) => ({
            ...row,
            updated_at: new Date().toISOString(),
          }));
          const { error: batchUpsertError } = await service
            .from("ai_memory")
            .upsert(rowsWithTimestamp, {
              onConflict: "organization_id,memory_type,domain",
              ignoreDuplicates: false,
            });

          if (batchUpsertError) {
            logger.warn(
              `[CronCognitiveCycle] Batch upsert failed for org=${orgId}:`,
              batchUpsertError
            );
          } else {
            insightsPersisted = insightRows.length;
          }
        }

        processed++;
        const orgDurationMs = Date.now() - orgStart;
        results.push({ orgId, success: true, insightsPersisted, durationMs: orgDurationMs });

        logger.info(
          `[CronCognitiveCycle] org=${orgId}: ` +
          `signals=${signals.length} ` +
          `insights=${insightsPersisted} ` +
          `dreaming=${result.dreaming.associationsFound} ` +
          `hypotheses=${result.curiosity.hypothesesGenerated} ` +
          `durationMs=${orgDurationMs}`
        );
      } catch (err) {
        const orgDurationMs = Date.now() - orgStart;
        logger.error(`[CronCognitiveCycle] org=${orgId} failed:`, { error: (err as Error)?.message ?? String(err), route: "/api/cron/cognitive-cycle", orgId: orgId?.slice(0, 8) });
        results.push({
          orgId,
          success: false,
          insightsPersisted: 0,
          error: err instanceof Error ? err.message : String(err),
          durationMs: orgDurationMs,
        });
        skipped++;
      }
    }

    const durationMs = Date.now() - startMs;

    // ── Cognitive Planner: autonomous proactive agent scheduling (ADR-012) ─
    // Runs per AI Worker (not per org) using LRU ordering — the worker whose
    // last job ran longest ago is scheduled first.
    // Cap: 50 workers per cron run. Per-worker 20s timeout.
    const MAX_WORKERS_PER_RUN = 50;
    const WORKER_TIMEOUT_MS = 20_000;

    /**
     * withTimeout: races a promise against a deadline.
     * Rejects with a descriptive message if the deadline fires first.
     */
    function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
      return Promise.race([
        promise,
        new Promise<T>((_, reject) =>
          setTimeout(() => reject(new Error(`[timeout] ${label} exceeded ${ms}ms`)), ms)
        ),
      ]);
    }

    const plannerResults: Array<{ workerId: string; orgId: string; result?: unknown; error?: string }> = [];
    try {
      // Fetch active workers in LRU order (least-recently-used job first)
      // Workers with no jobs at all sort first (COALESCE to created_at).
      const { data: workers, error: workersError } = await service
        .from("ai_workers")
        .select("id, organization_id, service_type, name, status, created_at")
        .eq("status", "active")
        .limit(MAX_WORKERS_PER_RUN);

      if (workersError) {
        logger.warn("[CognitiveCycle] Failed to fetch ai_workers for planner:", {
          error: workersError.message,
          route: "/api/cron/cognitive-cycle",
        });
      }

      const activeWorkers = workers ?? [];

      // Sort by last job time (LRU: oldest last_job_at = schedule first).
      // We do a separate query per-batch to get last_job_at rather than a join
      // (Supabase JS client doesn't support aggregating FK child rows in select).
      // For simplicity and to keep DB round-trips low, we use created_at as fallback
      // for workers with no jobs — they'll always sort to the front.
      const workerIds = activeWorkers.map((w) => w.id as string);

      // Fetch last job time per worker in one query
      const lastJobByWorker = new Map<string, string>();
      if (workerIds.length > 0) {
        try {
          const { data: lastJobRows } = await service
            .from("agent_queue")
            .select("ai_worker_id, created_at")
            .in("ai_worker_id", workerIds)
            .order("created_at", { ascending: false })
            .limit(workerIds.length * 5); // over-fetch to ensure we catch 1 row per worker

          for (const row of lastJobRows ?? []) {
            const wid = row.ai_worker_id as string | null;
            if (wid && !lastJobByWorker.has(wid)) {
              lastJobByWorker.set(wid, row.created_at as string);
            }
          }
        } catch {
          // Non-fatal — fallback to created_at ordering
        }
      }

      // Sort: workers with no recent jobs sort first (LRU)
      const sortedWorkers = [...activeWorkers].sort((a, b) => {
        const aLast = lastJobByWorker.get(a.id as string) ?? (a.created_at as string);
        const bLast = lastJobByWorker.get(b.id as string) ?? (b.created_at as string);
        return aLast < bLast ? -1 : aLast > bLast ? 1 : 0;
      });

      logger.info(
        `[CognitiveCycle] Planner running for ${sortedWorkers.length} active workers (LRU order)`
      );

      for (const worker of sortedWorkers) {
        const workerId = worker.id as string;
        const workerOrgId = worker.organization_id as string;
        try {
          const result = await withTimeout(
            runCognitivePlanner(service, workerOrgId, workerId, {
              service_type: worker.service_type as string | null,
            }),
            WORKER_TIMEOUT_MS,
            `planner-${workerId}`
          );
          plannerResults.push({ workerId, orgId: workerOrgId, result });

          // Fire-and-forget: promote SE-aaS patterns + extract FSM process templates
          // Await these calls and log their results for diagnostics
          const corePromotionResult = await promotePatternsToCore(service, workerOrgId).catch(
            (err: unknown) => {
              logger.warn('[CognitiveCycle] promotePatternsToCore failed (non-fatal)', { err, workerId });
              return null;
            }
          );

          const templateExtractionResult = await extractProcessTemplates(service, workerOrgId).catch(
            (err: unknown) => {
              logger.warn('[CognitiveCycle] extractProcessTemplates failed (non-fatal)', { err, workerId });
              return null;
            }
          );

          // Fix #1 (ADR-026): promote repeated gaba signals into federated_knowledge warnings
          const gabaPromotionCount = await promoteGabaPatternsToKnowledge(service, workerOrgId).catch((err: unknown) => {
            logger.warn('[CognitiveCycle] promoteGabaPatternsToKnowledge failed (non-fatal)', { err, workerId });
            return 0;
          });

          // Fix #4 (ADR-026): graduate high-quality structured-outcome ai_memory entries to federated_knowledge
          const memoryPromotionCount = await promoteMemoryToFederatedKnowledge(service, workerOrgId).catch((err: unknown) => {
            logger.warn('[CognitiveCycle] promoteMemoryToFederatedKnowledge failed (non-fatal)', { err, workerId });
            return 0;
          });

          // Log federation results for diagnostics
          if (gabaPromotionCount > 0 || memoryPromotionCount > 0) {
            logger.info('[CognitiveCycle] Federation metrics', {
              workerId,
              gabaPromotionCount,
              memoryPromotionCount,
            });
          }
        } catch (err) {
          const errMsg = (err as Error)?.message ?? String(err);
          logger.warn(`[CognitiveCycle] Planner failed/timed-out for worker=${workerId}:`, {
            error: errMsg,
            route: "/api/cron/cognitive-cycle",
            workerId: workerId.slice(0, 8),
          });
          plannerResults.push({ workerId, orgId: workerOrgId, error: errMsg });
        }
      }

      const totalQueued = plannerResults.reduce((sum, r) => {
        const res = r.result as { decisionsQueued?: number } | null;
        return sum + (res?.decisionsQueued ?? 0);
      }, 0);

      logger.info(
        `[CognitiveCycle] Planner ran for ${plannerResults.length} workers, ` +
          `queued ${totalQueued} total agent jobs`
      );
    } catch (err) {
      logger.warn("[CognitiveCycle] Planner phase failed:", { error: (err as Error)?.message ?? String(err), route: "/api/cron/cognitive-cycle" });
    }

    // ── Monitoring Reactions: autonomous corrective actions ─────────────────
    // Runs after the planner for each active org. Takes corrective actions
    // for: high-risk engagements, stalled agents, dead letter spikes, brain decay, domain blackouts.
    const monitoringReportsAll: Array<{ orgId: string; report: unknown }> = [];
    try {
      const { data: reactionOrgs } = await service
        .from("organizations")
        .select("id")
        .eq("is_core_brain", false)
        .limit(10);

      for (const org of reactionOrgs ?? []) {
        try {
          const report = await runMonitoringReactions(service, org.id as string);
          monitoringReportsAll.push({ orgId: org.id as string, report });
          if (report.totalActioned > 0) {
            logger.warn("[monitoring-reactions]", JSON.stringify(report));
          }
        } catch (err) {
          logger.warn(`[CognitiveCycle] Monitoring reactions failed for org ${org.id as string}:`, { error: (err as Error)?.message ?? String(err), route: "/api/cron/cognitive-cycle", orgId: (org.id as string)?.slice(0, 8) });
        }
      }

      const totalActioned = monitoringReportsAll.reduce((sum, r) => {
        const rep = r.report as { totalActioned?: number } | null;
        return sum + (rep?.totalActioned ?? 0);
      }, 0);

      logger.info(
        `[CognitiveCycle] Monitoring reactions ran for ${monitoringReportsAll.length} orgs, ` +
          `${totalActioned} total actions taken`
      );
    } catch (err) {
      logger.warn("[CognitiveCycle] Monitoring reactions phase failed:", { error: (err as Error)?.message ?? String(err), route: "/api/cron/cognitive-cycle" });
    }

    // ── Causal Discovery: L16 write-back (ai_memory + knowledge_chunks) ────────
    // Runs after monitoring reactions for each active org. Discovers correlations
    // between engineer health leading indicators and outcomes, then writes
    // findings to ai_memory (domain='causal-discovery') so that getBrainContext()
    // L16 surfaces them in every copilot response. Also writes to knowledge_chunks
    // for semantic RAG retrieval.
    const causalDiscoveryResults: Array<{ orgId: string; result: unknown }> = [];
    try {
      const { data: causalOrgs } = await service
        .from("organizations")
        .select("id")
        .eq("is_core_brain", false)
        .limit(10);

      for (const org of causalOrgs ?? []) {
        try {
          const causalResult = await runCausalDiscovery(service, org.id as string);
          causalDiscoveryResults.push({ orgId: org.id as string, result: causalResult });
        } catch (err) {
          logger.warn(`[CognitiveCycle] Causal discovery failed for org ${org.id as string}:`, { error: (err as Error)?.message ?? String(err), route: "/api/cron/cognitive-cycle", orgId: (org.id as string)?.slice(0, 8) });
        }
      }

      const totalFindings = causalDiscoveryResults.reduce((sum, r) => {
        const res = r.result as { findings?: unknown[] } | null;
        return sum + (res?.findings?.length ?? 0);
      }, 0);
      const totalMemories = causalDiscoveryResults.reduce((sum, r) => {
        const res = r.result as { memoriesWritten?: number } | null;
        return sum + (res?.memoriesWritten ?? 0);
      }, 0);

      logger.info(
        `[CognitiveCycle] Causal discovery ran for ${causalDiscoveryResults.length} orgs, ` +
        `${totalFindings} findings, ${totalMemories} memories written`
      );
    } catch (err) {
      logger.warn("[CognitiveCycle] Causal discovery phase failed:", err);
    }

    // ── ai_memory Maintenance: prune working memory + dedup markers ──────────
    // Prevents unbounded table growth from:
    //   - memory_type='working'  rows inserted every 30m by the cognitive planner
    //   - memory_type='dedup'    rows inserted every planning cycle (2h TTL)
    //   - memory_type='episodic' rows beyond the 10-row bound per org/domain
    let totalMaintenanceDeleted = 0;
    try {
      const maintenanceOrgIds = [...new Set([...activeOrgIds])];
      for (const orgId of maintenanceOrgIds) {
        try {
          const { data: pruneResult, error: pruneError } = await service.rpc(
            "prune_ai_memory",
            { p_organization_id: orgId }
          );
          if (pruneError) {
            // Function not deployed yet — fall back to inline DELETEs
            logger.warn(
              `[CronCognitiveCycle] prune_ai_memory RPC unavailable for org=${orgId}, using inline SQL:`,
              pruneError
            );
            await service
              .from("ai_memory")
              .delete()
              .eq("organization_id", orgId)
              .eq("memory_type", "working")
              .lt("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());
            await service
              .from("ai_memory")
              .delete()
              .eq("organization_id", orgId)
              .eq("memory_type", "dedup")
              .lt("created_at", new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString());
            const { data: workingRows } = await service
              .from("ai_memory")
              .select("id")
              .eq("organization_id", orgId)
              .eq("memory_type", "working")
              .order("created_at", { ascending: false })
              .range(50, 9999);
            if (workingRows && workingRows.length > 0) {
              const excessIds = workingRows.map((r: { id: string }) => r.id);
              await service.from("ai_memory").delete().in("id", excessIds);
            }
          } else {
            totalMaintenanceDeleted += (pruneResult as number | null) ?? 0;
          }
        } catch (err) {
          logger.warn(`[CronCognitiveCycle] Maintenance failed for org=${orgId}:`, {
            error: (err as Error)?.message ?? String(err),
          });
        }
      }
      if (totalMaintenanceDeleted > 0) {
        logger.info(
          `[CronCognitiveCycle] Maintenance: pruned ${totalMaintenanceDeleted} stale ai_memory rows across ${maintenanceOrgIds.length} orgs`
        );
      }
    } catch (err) {
      logger.warn("[CronCognitiveCycle] Maintenance phase failed:", {
        error: (err as Error)?.message ?? String(err),
      });
    }

    // ── Log run to scheduled_job_runs ─────────────────────────────────
    try {
      await service.from("scheduled_job_runs").insert({
        organization_id: activeOrgIds[0] ?? "system",
        job_name: "cron-cognitive-cycle",
        job_type: "cognitive_cycle",
        started_at: new Date(startMs).toISOString(),
        completed_at: new Date().toISOString(),
        status: skipped > 0 && processed === 0 ? "failed" : skipped > 0 ? "partial" : "success",
        result: JSON.stringify({ processed, skipped, activeOrgIds, results, plannerResults, causalDiscoveryResults, maintenanceDeleted: totalMaintenanceDeleted }),
        duration_ms: durationMs,
      });
    } catch {
      // Non-fatal: logging failure shouldn't break the cron
    }

    logger.info(
      `[CronCognitiveCycle] Complete: processed=${processed} skipped=${skipped} durationMs=${durationMs}`
    );

    return NextResponse.json({
      ok: true,
      processed,
      skipped,
      durationMs,
      results,
      plannerResults,
      causalDiscoveryResults,
    });
  } catch (err) {
    const durationMs = Date.now() - startMs;
    logger.error("[CronCognitiveCycle] Fatal error:", { error: (err as Error)?.message ?? String(err), route: "/api/cron/cognitive-cycle" });
    // Return 200 — cron schedulers that see 5xx may retry immediately (thundering herd)
    return NextResponse.json(
      { ok: false, error: "Cognitive cycle failed", durationMs },
      { status: 200 }
    );
  }
}
