/**
 * Autonomous Cognitive Planner
 * =============================
 *
 * The proactive self-driving orchestrator for BrainOS.
 * Runs every 30 minutes via the cognitive-cycle cron without human input.
 *
 * Architecture inspired by:
 * - Reflexion (Shinn 2023)  — episodic verbal reflection + memory
 * - CoALA (Sumers 2023)     — working/episodic/semantic memory distinction
 * - Voyager (Wang 2023)     — skill curriculum + self-improvement loop
 * - Generative Agents (Park 2023) — reflection + planning + memory retrieval
 *
 * 5-Phase Loop:
 *   Phase 0 — PRIME     Retrieve past reflections from episodic memory
 *   Phase 1 — ASSESS    Gap detection + RL signal analysis + stuck-domain detection
 *   Phase 2 — PLAN      One Claude Haiku call to decide which domains to run
 *   Phase 3 — EXECUTE   Dedup check + queue jobs to agent_queue
 *   Phase 4 — RECORD    Store this cycle's working memory for next cycle
 *   Phase 5 — REFLECT   (Start of each run) Verbal reflection on prior cycle outcomes
 */

import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/lib/logger";
import { pullCorePatterns } from "@/lib/brain/se-aas-federation";
import { logDecision } from "@/lib/brain/decision-log";
import { retrieveRelevantMemories } from "@/lib/brain/memory-retrieval";
import { logAuditEvent, AuditAction } from "@/lib/audit";
import { routeCallType } from "@/lib/brain/call-type-router";
import { captureStreamedResponse as _captureStreamedResponse } from "@/lib/brain/claude-learning-capture";
import { selectStrategy, recordOutcome as recordBanditOutcome } from "@/lib/brain/strategy-bandit";

// ── Types ────────────────────────────────────────────────────────────────────

type BrainProgressSnapshot = {
  timestamp: string;
  totalCyclesRun: number;
  avgPlanConfidence: number;
  domainsExcludedGlobally: string[];
  domainsExcludedByOrg: number; // count
  reflectionsStored: number;
  learningVelocity: number; // avg confidence delta vs prior snapshot
  lastUpdatedBy: string; // orgId that triggered last update
};

export interface PlannerDecision {
  domain: string;
  priority: "high" | "normal" | "low";
  rationale: string;
}

export interface PlannerState {
  coverageGaps: string[];
  poorQualityDomains: string[];
  goodQualityDomains: string[];
  stuckDomains: string[];
  highDemandDomains: string[];   // domains users queried most in last 24h
  recoveryMode: boolean;         // true when recovery-agent has fired recently
  engagementCount: number;
  processBottlenecks?: Array<{ processType: string; state: string; failRate: number }>;
}

export interface CognitivePlannerResult {
  cycleId: string;
  decisionsQueued: number;
  decisions: PlannerDecision[];
  coverageGaps: string[];
  poorQualityDomains: string[];
  stuckDomains: string[];
  highDemandDomains: string[];
  recoveryMode: boolean;
  reflected: boolean;
}

export interface ReflectionSchema {
  domain: string;
  failureType: "error" | "unknown";
  rootCause: string;
  suggestedFix: string;
  confidence: number;
  avoidPattern: string;
}

// ── Config ────────────────────────────────────────────────────────────────────

/**
 * B5: Configurable planner thresholds — loaded from ai_worker_config.cognitive_planner_config.
 * Falls back to defaults silently on any error.
 */
export interface CognitivePlannerConfig {
  qualityFloor: number;           // default 0.4 — domains below this avg quality are "poor quality"
  coverageGapHours: number;       // default 6  — how old before a domain is "missing coverage"
  maxDomainsPerCycle: number;     // default 3  — max decisions per non-recovery cycle
  stuckDomainThreshold: number;   // default 5  — failure count to mark domain stuck
}

const DEFAULT_PLANNER_CONFIG: CognitivePlannerConfig = {
  qualityFloor: 0.4,
  coverageGapHours: 6,
  maxDomainsPerCycle: 3,
  stuckDomainThreshold: 5,
};

async function loadPlannerConfig(
  supabase: SupabaseClient,
  orgId: string
): Promise<CognitivePlannerConfig> {
  try {
    const { data } = await supabase
      .from("ai_worker_config")
      .select("cognitive_planner_config")
      .eq("organization_id", orgId)
      .maybeSingle();

    const saved = (data?.cognitive_planner_config ?? {}) as Partial<CognitivePlannerConfig>;
    return {
      qualityFloor: typeof saved.qualityFloor === "number" ? saved.qualityFloor : DEFAULT_PLANNER_CONFIG.qualityFloor,
      coverageGapHours: typeof saved.coverageGapHours === "number" ? saved.coverageGapHours : DEFAULT_PLANNER_CONFIG.coverageGapHours,
      maxDomainsPerCycle: typeof saved.maxDomainsPerCycle === "number" ? saved.maxDomainsPerCycle : DEFAULT_PLANNER_CONFIG.maxDomainsPerCycle,
      stuckDomainThreshold: typeof saved.stuckDomainThreshold === "number" ? saved.stuckDomainThreshold : DEFAULT_PLANNER_CONFIG.stuckDomainThreshold,
    };
  } catch {
    return { ...DEFAULT_PLANNER_CONFIG };
  }
}

// ── Global Circuit Breaker ────────────────────────────────────────────────────

/**
 * Per-domain metadata returned by the enhanced circuit breaker.
 */
export interface CircuitBreakerStatus {
  domain: string;
  failureCount: number;
  orgCount: number;          // how many distinct orgs are contributing failures
  isPoisoned: boolean;       // true if >80% of failures come from a single org
  poisoningOrgId?: string;   // the org responsible for poisoning (if isPoisoned)
  overriddenByOrg?: string;  // if the requesting org has bypassed this exclusion
}

/**
 * Returns domains that have failed >10 times across ALL orgs in the last 2 hours
 * (confidence < 0.3), with enhanced poisoning detection and per-org overrides.
 *
 * Poisoning protection: if >80% of failures come from a single org, the domain
 * is NOT added to the broken list — one badly-configured org cannot block everyone.
 *
 * Per-org override: if requestingOrgId has stored a bypass override in ai_memory,
 * the domain is excluded from that org's broken list only.
 */
export async function getGloballyBrokenDomains(
  supabase: SupabaseClient,
  requestingOrgId?: string
): Promise<{ broken: string[]; status: CircuitBreakerStatus[] }> {
  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from("prediction_records")
    .select("domain, organization_id")
    .lt("confidence", 0.3)
    .gte("created_at", twoHoursAgo)
    .not("domain", "is", null)
    .limit(500);

  if (error || !data?.length) return { broken: [], status: [] };

  // Group by domain — track total failures and per-org breakdown
  const byDomain = new Map<string, { total: number; byOrg: Map<string, number> }>();
  for (const row of data) {
    const typedRow = row as { domain: string | null; organization_id: string | null };
    const domain = typedRow.domain;
    const orgId = typedRow.organization_id;
    if (!domain) continue;
    if (!byDomain.has(domain)) {
      byDomain.set(domain, { total: 0, byOrg: new Map() });
    }
    const entry = byDomain.get(domain)!;
    entry.total++;
    if (orgId) {
      entry.byOrg.set(orgId, (entry.byOrg.get(orgId) ?? 0) + 1);
    }
  }

  // Load per-org overrides once (bulk fetch for requesting org)
  const overriddenDomains = new Set<string>();
  if (requestingOrgId) {
    try {
      const { data: overrides } = await supabase
        .from("ai_memory")
        .select("content")
        .eq("organization_id", requestingOrgId)
        .eq("domain", "brain-config")
        .eq("memory_type", "circuit-breaker-override")
        .limit(100);
      if (overrides?.length) {
        for (const row of overrides) {
          try {
            const parsed = JSON.parse(row.content as string) as { domain?: string; action?: string };
            if (parsed.domain && parsed.action === "bypass") {
              overriddenDomains.add(parsed.domain);
            }
          } catch { /* skip malformed entries */ }
        }
      }
    } catch { /* non-fatal — proceed without overrides */ }
  }

  const status: CircuitBreakerStatus[] = [];
  const broken: string[] = [];

  for (const [domain, stats] of byDomain.entries()) {
    if (stats.total < 10) continue;

    // Poisoning detection: >80% from a single org
    let maxByOrg = 0;
    let maxOrgId: string | undefined;
    for (const [org, count] of stats.byOrg.entries()) {
      if (count > maxByOrg) {
        maxByOrg = count;
        maxOrgId = org;
      }
    }
    const isPoisoned = maxByOrg / stats.total > 0.8;

    const hasOrgOverride = overriddenDomains.has(domain);

    status.push({
      domain,
      failureCount: stats.total,
      orgCount: stats.byOrg.size,
      isPoisoned,
      poisoningOrgId: isPoisoned ? maxOrgId : undefined,
      overriddenByOrg: hasOrgOverride ? requestingOrgId : undefined,
    });

    // Exclude from global broken list if poisoned OR requesting org has an override
    if (!isPoisoned && !hasOrgOverride) {
      broken.push(domain);
    }
  }

  return { broken, status };
}

// ── Brain Progress Tracker ────────────────────────────────────────────────────

async function updateBrainProgress(
  supabase: SupabaseClient,
  orgId: string,
  cycleData: {
    planConfidence: number;
    globallyBrokenDomains: Set<string>;
    orgExcludedCount: number;
    reflectionsStored: number;
  }
): Promise<void> {
  try {
    // Read existing snapshot
    const { data: existing } = await supabase
      .from('ai_memory')
      .select('id, content')
      .eq('domain', 'brain-system')
      .eq('memory_type', 'brain-progress')
      .eq('organization_id', orgId)
      .maybeSingle();

    const prior: BrainProgressSnapshot | null = existing?.content
      ? (() => { try { return JSON.parse(existing.content as string) as BrainProgressSnapshot; } catch { return null; } })()
      : null;

    const snapshot: BrainProgressSnapshot = {
      timestamp: new Date().toISOString(),
      totalCyclesRun: (prior?.totalCyclesRun ?? 0) + 1,
      avgPlanConfidence: cycleData.planConfidence,
      domainsExcludedGlobally: Array.from(cycleData.globallyBrokenDomains),
      domainsExcludedByOrg: cycleData.orgExcludedCount,
      reflectionsStored: cycleData.reflectionsStored,
      learningVelocity: prior ? cycleData.planConfidence - prior.avgPlanConfidence : 0,
      lastUpdatedBy: orgId,
    };

    if (existing?.id) {
      await supabase
        .from('ai_memory')
        .update({ content: JSON.stringify(snapshot), updated_at: new Date().toISOString() })
        .eq('id', existing.id);
    } else {
      await supabase
        .from('ai_memory')
        .insert({ domain: 'brain-system', memory_type: 'brain-progress', organization_id: orgId, content: JSON.stringify(snapshot) });
    }
  } catch (err) {
    logger.warn('[CognitivePlanner] Failed to update brain progress', { err });
  }
}

// ── Constants ────────────────────────────────────────────────────────────────

const SE_AAS_DOMAINS = [
  "pod-match",
  "early-warning",
  "scope-creep",
  "delivery-intelligence",
  "tdd-code-generator",
  "pr-review",
  "incident-diagnosis",
  "impact-analysis",
  "dead-code-detector",
  "dependency-upgrade",
  "boilerplate-scaffold",
];

const AAS_DOMAINS = [
  "accounting-analysis",
  "tax-advisory",
  "financial-close",
  "reconciliation",
  "accounts-payable",
  "accounts-receivable",
];

/** Domains that are only Brain/general — no service-specific domains needed. */
const BRAIN_ONLY_DOMAINS: string[] = [];

/**
 * Returns the allowed domain list for a worker based on its service_type.
 * Workers with no service_type can only schedule Brain/general tasks (empty list = no domain jobs).
 */
function getAllowedDomainsForWorker(serviceType: string | null | undefined): string[] {
  if (serviceType === "se-aas") return SE_AAS_DOMAINS;
  if (serviceType === "aas") return AAS_DOMAINS;
  // pm-aas process templates are user-triggered only — planner does not schedule them
  return BRAIN_ONLY_DOMAINS;
}

const PLANNER_MODEL = routeCallType("context-agent").model;

// ── Reflection Helper ─────────────────────────────────────────────────────────

async function generateReflection(
  anthropic: Anthropic,
  priorDecisions: {
    decisions?: Array<{ domain: string; rationale: string }>;
    cycleId?: string;
  },
  jobs: Array<{ task_type: string; status: string; error_message?: string | null; result: unknown }>,
  successes: number,
  failures: number
): Promise<string> {
  // B3: Build error summary from failed jobs so the planner knows WHY things fail
  const errorSummary = jobs
    .filter((j) => j.status === "error" && j.error_message)
    .map((j) => `${j.task_type}: ${(j.error_message ?? "").slice(0, 120)}`)
    .join("; ");

  try {
    const response = await anthropic.messages.create({
      model: PLANNER_MODEL,
      max_tokens: 200,
      messages: [
        {
          role: "user",
          content: `You are reflecting on past agent planning decisions for BrainOS.

Planned: ${JSON.stringify(priorDecisions.decisions?.map((d) => d.domain))}
Actual outcomes: ${successes} succeeded, ${failures} failed
Jobs: ${JSON.stringify(jobs.map((j) => ({ type: j.task_type, status: j.status })))}${errorSummary ? `\nFailure details: ${errorSummary}` : ""}

Write a 2-3 sentence verbal reflection: what worked, what failed, and one specific lesson for next time. Be concrete.`,
        },
      ],
    });

    const firstBlock = response.content[0];
    return firstBlock.type === "text" ? firstBlock.text : "No reflection generated.";
  } catch (err) {
    logger.warn("[CognitivePlanner] generateReflection failed:", err);
    return "Reflection unavailable due to API error.";
  }
}

// ── Worker Config ─────────────────────────────────────────────────────────────

export interface WorkerPlannerConfig {
  service_type: string | null | undefined;
}

// ── Main Entry Point ──────────────────────────────────────────────────────────

/**
 * Run one full cognitive planning cycle for a single AI Worker.
 * Never throws — all errors are caught and logged internally.
 *
 * @param supabase      Service-role Supabase client
 * @param orgId         The workspace/organization ID the worker belongs to
 * @param aiWorkerId    The specific AI Worker to plan for (jobs will be scoped to this worker)
 * @param workerConfig  Worker metadata (service_type drives which domains are considered)
 */
export async function runCognitivePlanner(
  supabase: SupabaseClient,
  orgId: string,
  aiWorkerId?: string,
  workerConfig?: WorkerPlannerConfig
): Promise<CognitivePlannerResult> {
  const cycleId = crypto.randomUUID();
  const anthropic = new Anthropic();

  // Outer safety net — planners should never crash the cron
  try {
    return await _runCognitivePlannerInner(supabase, orgId, cycleId, anthropic, aiWorkerId, workerConfig);
  } catch (err) {
    logger.warn(`[CognitivePlanner] Fatal error for org=${orgId} worker=${aiWorkerId ?? "unscoped"} cycle=${cycleId}:`, err);
    return {
      cycleId,
      decisionsQueued: 0,
      decisions: [],
      coverageGaps: [],
      poorQualityDomains: [],
      stuckDomains: [],
      highDemandDomains: [],
      recoveryMode: false,
      reflected: false,
    };
  }
}

// ── Inner Implementation ──────────────────────────────────────────────────────

async function _runCognitivePlannerInner(
  supabase: SupabaseClient,
  orgId: string,
  cycleId: string,
  anthropic: Anthropic,
  aiWorkerId?: string,
  workerConfig?: WorkerPlannerConfig
): Promise<CognitivePlannerResult> {
  // B5: Load configurable thresholds — falls back to defaults silently
  const plannerConfig = await loadPlannerConfig(supabase, orgId);

  // Bandit selection for this cycle — assigned in Phase 2, recorded in Phase 5 of the NEXT cycle
  let _banditSelection: { strategy: "five_phase" | "direct" | "moa"; confidence: number; explorationBonus: number; isExploring: boolean } = { strategy: "five_phase", confidence: 0.5, explorationBonus: 0, isExploring: true };

  // Determine allowed domains based on the worker's service_type (ADR-012)
  const allowedDomains = getAllowedDomainsForWorker(workerConfig?.service_type);

  logger.warn(
    `[CognitivePlanner] Starting cycle=${cycleId} org=${orgId} worker=${aiWorkerId ?? "unscoped"} ` +
      `serviceType=${workerConfig?.service_type ?? "none"} allowedDomains=${allowedDomains.length} ` +
      `qualityFloor=${plannerConfig.qualityFloor} coverageGapHours=${plannerConfig.coverageGapHours} ` +
      `maxDomainsPerCycle=${plannerConfig.maxDomainsPerCycle} stuckThreshold=${plannerConfig.stuckDomainThreshold}`
  );

  // If this worker has no allowed domains (e.g. no service_type), skip domain scheduling.
  // Brain-only workers still run the full reflection/assessment loop for Brain context,
  // but exit early before queuing any domain jobs.
  if (allowedDomains.length === 0) {
    logger.warn(
      `[CognitivePlanner] Worker ${aiWorkerId ?? "unscoped"} has no service_type — skipping domain job scheduling`
    );
    return {
      cycleId,
      decisionsQueued: 0,
      decisions: [],
      coverageGaps: [],
      poorQualityDomains: [],
      stuckDomains: [],
      highDemandDomains: [],
      recoveryMode: false,
      reflected: false,
    };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PHASE 5 — REFLECT (runs at start, reflects on PRIOR cycle outcomes)
  // Reflexion episodic buffer: bounded verbal reflection on past decisions
  // ══════════════════════════════════════════════════════════════════════════

  let reflected = false;

  try {
    const { data: priorCycle } = await supabase
      .from("ai_memory")
      .select("id, content, metadata")
      .eq("organization_id", orgId)
      .eq("domain", "cognitive-planner")
      .eq("memory_type", "working")
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (priorCycle && !(priorCycle.metadata as Record<string, unknown> | null)?.reflected) {
      let priorDecisions: {
        decisions?: Array<{ domain: string; rationale: string }>;
        cycleId?: string;
      } = {};
      try {
        priorDecisions = JSON.parse(priorCycle.content as string) as typeof priorDecisions;
      } catch {
        logger.warn("[CognitivePlanner] Failed to parse prior cycle content");
      }

      const priorDomains = priorDecisions.decisions?.map((d) => d.domain) ?? [];

      if (priorDomains.length > 0) {
        // B3: SELECT error_message so reflection knows WHY jobs failed
        const { data: priorJobs } = await supabase
          .from("agent_queue")
          .select("task_type, status, error_message, result")
          .eq("organization_id", orgId)
          .in("task_type", priorDomains)
          .gte("created_at", new Date(Date.now() - 60 * 60 * 1000).toISOString())
          .limit(50);

        if (priorJobs && priorJobs.length > 0) {
          const successCount = priorJobs.filter((j) => j.status === "success").length;
          const failCount = priorJobs.filter((j) => j.status === "error").length;

          // B3: Build error summary from failed jobs for reflection context
          const typedJobs = priorJobs as Array<{ task_type: string; status: string; error_message?: string | null; result: unknown }>;
          const errorSummary = typedJobs
            .filter((j) => j.status === "error" && j.error_message)
            .map((j) => `${j.task_type}: ${(j.error_message ?? "").slice(0, 100)}`)
            .join("; ");

          const reflection = await generateReflection(
            anthropic,
            priorDecisions,
            typedJobs,
            successCount,
            failCount
          );

          // Capture the reflection as a learning signal (fire-and-forget)
          _captureStreamedResponse(reflection, 0, {
            supabase,
            organizationId: orgId,
            domain: 'cognitive-planner.reflection',
            aiWorkerId,
            inputSummary: priorDomains.join(', ').slice(0, 200),
            qualityThreshold: 0.4,
          });

          // Store as episodic memory (Reflexion episodic buffer, bounded at 10)
          // B3: Store structured ReflectionSchema JSON so Phase 0 can extract avoidPatterns
          const reflectionSchema: ReflectionSchema = {
            domain: priorDomains.length > 0 ? priorDomains.join(", ") : orgId,
            failureType: errorSummary ? "error" : "unknown",
            rootCause: errorSummary || "No error data available",
            suggestedFix: reflection,
            confidence: 0.6,
            avoidPattern: errorSummary
              ? `Avoid: ${errorSummary.slice(0, 200)}`
              : "No specific pattern identified",
          };
          const structuredContent = JSON.stringify(reflectionSchema);

          await supabase.from("ai_memory").insert({
            organization_id: orgId,
            domain: "cognitive-planner",
            memory_type: "episodic",
            content: structuredContent,
            importance: 0.8,
            metadata: {
              cycleId: priorDecisions.cycleId,
              successCount,
              failCount,
              errorSummary: errorSummary || null,
              structured: true,
            },
          });

          // SOC2 Audit: log brain episodic memory write (fire-and-forget)
          void logAuditEvent({
            organizationId: orgId,
            action: AuditAction.DATA_CREATE,
            resourceType: "ai_memory",
            resourceId: orgId,
            newValue: {
              domain: "cognitive-planner",
              memory_type: "episodic",
              cycleId: priorDecisions.cycleId,
              successCount,
              failCount,
            },
          }).catch(() => {/* non-fatal */});

          // Mark prior cycle as reflected — use the stable row id (not content) to avoid
          // fragile large-string equality matches that can silently fail on long JSON blobs.
          await supabase
            .from("ai_memory")
            .update({
              metadata: {
                ...(priorCycle.metadata as Record<string, unknown> | null ?? {}),
                reflected: true,
              },
            })
            .eq("id", (priorCycle as unknown as { id: string }).id)
            .eq("organization_id", orgId);

          // Bound episodic memory at 10 entries (Reflexion: Ω=3-10)
          const { data: allReflections } = await supabase
            .from("ai_memory")
            .select("id, created_at")
            .eq("organization_id", orgId)
            .eq("domain", "cognitive-planner")
            .eq("memory_type", "episodic")
            .order("created_at", { ascending: false })
            .limit(20); // bound at 2× the episodic buffer cap (10) to safely identify overflow

          if (allReflections && allReflections.length > 10) {
            const toDelete = allReflections.slice(10).map((r: { id: string }) => r.id);
            await supabase.from("ai_memory").delete().in("id", toDelete);
          }

          reflected = true;
          logger.warn(
            `[CognitivePlanner] Reflected on prior cycle: ${successCount} successes, ${failCount} failures`
          );

          // Record bandit outcome for the prior cycle using the prior domain as task category
          const _priorTaskCategory = priorDomains[0] ?? 'general';
          const _priorOutcomeQuality = (successCount + failCount) > 0
            ? successCount / (successCount + failCount)
            : 0.5;
          void recordBanditOutcome(
            _priorTaskCategory,
            aiWorkerId ?? 'default',
            _banditSelection.strategy,
            _priorOutcomeQuality,
            supabase
          ).catch(() => {});
        }
      }
    }
  } catch (err) {
    logger.warn("[CognitivePlanner] Phase 5 (reflect) failed:", err);
    // Non-fatal — continue to planning
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PHASE 0 — PRIME (episodic memory retrieval)
  // Read the last 3 planner reflections to inform this cycle
  // ══════════════════════════════════════════════════════════════════════════

  let pastReflectionsText = "No prior planning history.";

  try {
    // Semantic memory retrieval: 3 buckets (recent, low-confidence failures, domain-matched)
    // with 90-day lookback — replaces the simple .limit(3) time-only query.
    // Note: currentDomains is undefined at Phase 0 because stuckDomains are computed in Phase 1
    // (which runs after). Buckets 1+2 (recent + low-confidence failures) are always active.
    // Domain-matched bucket activates on subsequent cycles via Phase 5 stored reflections.
    const relevantMemories = await retrieveRelevantMemories(supabase, orgId, {
      lookbackDays: 90,
      limit: 15,
    });

    if (relevantMemories.length > 0) {
      // Format with date + confidence badge so planner knows how old and how reliable each memory is
      pastReflectionsText = relevantMemories
        .map(
          (m) =>
            `[${new Date(m.created_at).toLocaleDateString()}${
              m.confidence !== undefined
                ? ` conf:${m.confidence.toFixed(2)}`
                : ""
            }] ${m.content}`
        )
        .join("\n\n");

      // Extract structured avoidPatterns from JSON reflections
      const avoidPatterns: string[] = [];
      for (const m of relevantMemories) {
        try {
          const parsed = JSON.parse(m.content);
          // Handle array of ReflectionSchema
          if (Array.isArray(parsed)) {
            for (const entry of parsed) {
              if (entry.avoidPattern && typeof entry.avoidPattern === "string") {
                avoidPatterns.push(entry.avoidPattern);
              }
            }
          } else if (parsed.avoidPattern) {
            avoidPatterns.push(parsed.avoidPattern as string);
          }
        } catch {
          // freetext fallback — skip avoidPattern extraction
        }
      }

      if (avoidPatterns.length > 0) {
        pastReflectionsText += `\n\n⚠️ AVOID THESE PATTERNS (do NOT repeat):\n${avoidPatterns.map((p) => `- ${p}`).join("\n")}`;
      }
    }

    // Also read brain-progress snapshot and inject into state context
    const { data: progressData } = await supabase
      .from('ai_memory')
      .select('content')
      .eq('domain', 'brain-system')
      .eq('memory_type', 'brain-progress')
      .eq('organization_id', orgId)
      .maybeSingle();

    if (progressData?.content) {
      try {
        const progress: BrainProgressSnapshot = JSON.parse(progressData.content as string);
        pastReflectionsText += `\nBrain Progress: ${progress.totalCyclesRun} cycles run, learning velocity: ${progress.learningVelocity > 0 ? '+' : ''}${progress.learningVelocity.toFixed(3)}, globally excluded: ${progress.domainsExcludedGlobally.join(', ') || 'none'}`;
      } catch { /* ignore */ }
    }

    // Pull cross-org federated patterns from CORE brain
    try {
      const corePatterns = await pullCorePatterns(supabase, orgId);
      if (corePatterns.length > 0) {
        const patternText = corePatterns
          .map(p => `${p.domainSequence.join('->'  )}: ${Math.round(p.successRate * 100)}% success (cross-org)`)
          .join('\n');
        pastReflectionsText += `\n\nCross-org proven sequences:\n${patternText}`;
      }
    } catch { /* non-fatal */ }
  } catch (err) {
    logger.warn("[CognitivePlanner] Phase 0 (prime) failed:", err);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PHASE 1 — ASSESS (gap detection + RL signal)
  // ══════════════════════════════════════════════════════════════════════════

  // Pre-flight: fetch globally broken domains (cross-org circuit breaker)
  // Pass orgId so per-org overrides and poisoning detection are applied
  let globallyBrokenDomains: Set<string> = new Set();
  let circuitBreakerStatus: CircuitBreakerStatus[] = [];
  try {
    const cbResult = await getGloballyBrokenDomains(supabase, orgId);
    globallyBrokenDomains = new Set(cbResult.broken);
    circuitBreakerStatus = cbResult.status;
    if (globallyBrokenDomains.size > 0) {
      logger.warn(
        "[CognitivePlanner] Global circuit breaker active — domains excluded fleet-wide:",
        { domains: [...globallyBrokenDomains], orgId }
      );
      for (const domain of globallyBrokenDomains) {
        void logDecision(supabase, {
          organizationId: orgId,
          decisionType: "circuit_breaker",
          inputContext: { domain, scope: "global" },
          decisionMade: { excluded: true, reason: "global_circuit_breaker" },
          rationale: "Domain excluded by global circuit breaker (>10 failures/2h)",
          domain,
        }).catch((e: unknown) => logger.warn("[CognitivePlanner] logDecision (circuit_breaker) failed:", e));
      }
    }
    // Log poisoning warnings — these domains are filtered to protect the fleet
    for (const s of circuitBreakerStatus) {
      if (s.isPoisoned) {
        logger.warn(
          "[CognitivePlanner] Circuit breaker POISONING detected — single org >80% failures, NOT excluding fleet-wide:",
          { domain: s.domain, failureCount: s.failureCount, orgCount: s.orgCount, poisoningOrgId: s.poisoningOrgId }
        );
      }
    }
  } catch (err) {
    logger.warn("[CognitivePlanner] getGloballyBrokenDomains failed (non-fatal):", err);
  }
  let coverageGaps: string[] = [...allowedDomains];
  let poorQualityDomains: string[] = [];
  let goodQualityDomains: string[] = [];
  let stuckDomains: string[] = [];
  let highDemandDomains: string[] = [];
  let recoveryMode = false;
  let engagementCount: number = 0;

  // 1a. Coverage gaps — what domains haven't run recently (last 6h)
  try {
    const since1a = new Date(Date.now() - plannerConfig.coverageGapHours * 60 * 60 * 1000).toISOString();
    // Build base query then optionally scope to the specific AI Worker (ADR-012 LRU)
    let recentJobsQuery = supabase
      .from("agent_queue")
      .select("task_type, status, completed_at, created_at")
      .eq("organization_id", orgId)
      .in("status", ["success", "running", "pending"])
      .gte("created_at", since1a)
      .order("created_at", { ascending: false })
      .limit(200); // cap to prevent full-table scan on busy orgs

    if (aiWorkerId) {
      recentJobsQuery = recentJobsQuery.eq("ai_worker_id", aiWorkerId) as typeof recentJobsQuery;
    }

    const { data: recentJobs } = await recentJobsQuery;
    const recentlyRunDomains = new Set((recentJobs ?? []).map((j: { task_type: string }) => j.task_type));
    coverageGaps = allowedDomains.filter((d) => !recentlyRunDomains.has(d));
  } catch (err) {
    logger.warn("[CognitivePlanner] Phase 1a (coverage gaps) failed:", err);
  }

  // 1b. RL quality summary — per-domain avg quality over last 24h
  // NOTE: prediction_records uses "confidence" column (not "quality_score")
  try {
    const { data: qualityRows } = await supabase
      .from("prediction_records")
      .select("domain, confidence")
      .eq("organization_id", orgId)
      .gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      .order("created_at", { ascending: false })
      .limit(100);

    const domainQuality: Record<string, { sum: number; count: number }> = {};
    for (const row of qualityRows ?? []) {
      const domain = (row as { domain: string | null }).domain ?? "unknown";
      if (!domainQuality[domain]) domainQuality[domain] = { sum: 0, count: 0 };
      domainQuality[domain].sum += (row as { confidence: number | null }).confidence ?? 0;
      domainQuality[domain].count++;
    }

    const domainAvgQuality: Record<string, number> = {};
    for (const [domain, { sum, count }] of Object.entries(domainQuality)) {
      domainAvgQuality[domain] = count > 0 ? sum / count : 0.5;
    }

    poorQualityDomains = Object.entries(domainAvgQuality)
      .filter(([, avg]) => avg < plannerConfig.qualityFloor)
      .map(([domain]) => domain);

    goodQualityDomains = Object.entries(domainAvgQuality)
      .filter(([, avg]) => avg >= 0.7)
      .map(([domain]) => domain);
  } catch (err) {
    logger.warn("[CognitivePlanner] Phase 1b (RL quality) failed:", err);
  }

  // 1c. Active engagement count — are there engagements to serve?
  try {
    const { count } = await supabase
      .from("engagements")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId)
      .eq("status", "active");
    engagementCount = count ?? 0;
  } catch (err) {
    logger.warn("[CognitivePlanner] Phase 1c (engagement count) failed:", err);
  }

  // 1d. Stuck domain detection — domains with 5+ consecutive failures last 2h
  // Reflexion stuck-detection: don't keep retrying domains that are broken
  try {
    const { data: recentFailures } = await supabase
      .from("prediction_records")
      .select("domain, confidence")
      .eq("organization_id", orgId)
      .lt("confidence", 0.3)
      .gte("created_at", new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString())
      .order("created_at", { ascending: false })
      .limit(50);

    const failureCounts: Record<string, number> = {};
    for (const row of recentFailures ?? []) {
      const domain = (row as { domain: string | null }).domain ?? "unknown";
      failureCounts[domain] = (failureCounts[domain] ?? 0) + 1;
    }

    stuckDomains = Object.entries(failureCounts)
      .filter(([, count]) => count >= plannerConfig.stuckDomainThreshold)
      .map(([domain]) => domain);
  } catch (err) {
    logger.warn("[CognitivePlanner] Phase 1d (stuck domains) failed:", err);
  }

  // 1e. Demand signals — which domains are users actually querying?
  // Count prediction_records per domain in last 24h: high count = real user demand
  // This makes strategy demand-driven (not just coverage-driven)
  try {
    const { data: demandRows } = await supabase
      .from("prediction_records")
      .select("domain")
      .eq("organization_id", orgId)
      .gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      .limit(300);

    const demandCounts: Record<string, number> = {};
    for (const row of demandRows ?? []) {
      const domain = (row as { domain: string | null }).domain ?? "unknown";
      if (domain !== "unknown") demandCounts[domain] = (demandCounts[domain] ?? 0) + 1;
    }

    highDemandDomains = Object.entries(demandCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([domain, count]) => `${domain}(${count}x)`);
  } catch (err) {
    logger.warn("[CognitivePlanner] Phase 1e (demand signals) failed:", err);
  }

  // 1f. Recovery mode check — if recovery-agent wrote a marker recently, go conservative
  // Prevents planner from flooding a domain that's already failing
  try {
    const { count: recoveryCount } = await supabase
      .from("ai_memory")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId)
      .eq("memory_type", "recovery_mode")
      .gte("created_at", new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString());
    recoveryMode = (recoveryCount ?? 0) > 0;
    if (recoveryMode) {
      logger.warn(`[CognitivePlanner] Recovery mode active for org=${orgId} — reducing to 1 decision`);
    }
  } catch (err) {
    logger.warn("[CognitivePlanner] Phase 1f (recovery mode check) failed:", err);
  }

  // ── Phase 1h: Process bottleneck detection ────────────────────────────────
  // Reads state-level fail rates from service_health to surface process
  // templates that need policy knowledge enrichment.
  // Non-blocking — failure here must NOT prevent planning from proceeding.
  let processBottlenecks: Array<{ processType: string; state: string; failRate: number }> = [];
  try {
    // service_health not yet in generated Supabase types — cast required for runtime access
    const processHealthRow = await (supabase as any)
      .from("service_health")
      .select("summary, context_string")
      .eq("organization_id", orgId)
      .eq("service_type", "pm-aas")
      .maybeSingle();

    interface StateBottleneck {
      processType: string;
      state: string;
      failRate: number;
      sampleSize?: number;
    }

    const summaryData = processHealthRow?.data?.summary as
      | {
          statePatterns?: Array<{
            processType: string;
            state: string;
            failRate: number;
            sampleSize?: number;
          }>;
        }
      | null
      | undefined;

    if (summaryData?.statePatterns) {
      for (const pattern of summaryData.statePatterns) {
        if (pattern.failRate > 0.5) {
          processBottlenecks.push({
            processType: pattern.processType,
            state: pattern.state,
            failRate: pattern.failRate,
          });
        }
      }
    }

    logger.warn(`[CognitivePlanner] Phase 1h: ${processBottlenecks.length} process bottleneck(s) detected for org=${orgId}`);
  } catch (err) {
    logger.warn("[CognitivePlanner] Phase 1h (process bottlenecks) failed:", err);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PHASE 2 — PLAN (one Claude Haiku call)
  // ══════════════════════════════════════════════════════════════════════════

  const maxDecisions = recoveryMode ? 1 : plannerConfig.maxDomainsPerCycle;
  const processBottleneckSummary = processBottlenecks.length > 0
    ? processBottlenecks
        .map((b) => `${b.processType} at ${b.state}: ${Math.round(b.failRate * 100)}% fail rate`)
        .join(", ")
    : "none";
  const stateSnapshot = `## Current State
- Active engagements: ${engagementCount}
- Domains not run in >${plannerConfig.coverageGapHours}h (coverage gaps): ${coverageGaps.join(", ") || "none"}
- High user demand domains (queried today): ${highDemandDomains.join(", ") || "none"}
- Poor quality domains (avg < ${plannerConfig.qualityFloor} last 24h): ${poorQualityDomains.join(", ") || "none"}
- Good quality domains (avg >= 0.7 last 24h): ${goodQualityDomains.join(", ") || "none"}
- Stuck domains (${plannerConfig.stuckDomainThreshold}+ failures last 2h): ${stuckDomains.join(", ") || "none"}
- Globally broken domains (>10 failures across all orgs in 2h — NEVER schedule): ${[...globallyBrokenDomains].join(", ") || "none"}
- Recovery mode active: ${recoveryMode ? "YES — limit to 1 decision maximum" : "no"}
- IMPORTANT: These domains are user-triggered ONLY — do NOT schedule them: code-agent, overnight-orchestrator, spec-decomposition

## Past Planning Decisions and Lessons
${pastReflectionsText}`;

  let decisions: PlannerDecision[] = [];

  // ── Bandit selection (UCB1 strategy) ───────────────────────────────────────
  const _taskCategory = coverageGaps[0] ?? workerConfig?.service_type ?? 'general';
  _banditSelection = await selectStrategy(_taskCategory, aiWorkerId ?? 'default', supabase).catch(() => ({ strategy: 'five_phase' as const, confidence: 0.5, explorationBonus: 0, isExploring: true }));
  logger.warn(`[CognitivePlanner] Bandit selected: ${_banditSelection.strategy} (exploring: ${_banditSelection.isExploring})`);

  try {
    const response = await anthropic.messages.create({
      model: PLANNER_MODEL,
      max_tokens: 400,
      system:
        "You are BrainOS's autonomous cognitive planner. You decide which agent domains to run next for an engineering organization. Be concise and practical. Never queue stuck domains. Output ONLY valid JSON.",
      messages: [
        {
          role: "user",
          content:
            stateSnapshot +
            `\n\nGiven this state, output a JSON array of at most ${maxDecisions} decisions:\n[{"domain": "domain-name", "priority": "high|normal|low", "rationale": "one sentence"}]\n\nRules:\n- Skip any domain in stuck list\n- PRIORITIZE domains with high user demand (users need these results now)\n- Then prefer domains in coverage gaps\n- Skip domains with avg quality < ${plannerConfig.qualityFloor} unless >12h since last run\n- If recovery mode is active, output at most 1 decision\n- Max ${maxDecisions} decisions total` +
            (processBottlenecks.length > 0
              ? `\n\nProcess Intelligence: The following process FSM states are experiencing high failure rates and may need policy knowledge enrichment: ${processBottleneckSummary}. Consider scheduling policy enrichment for these templates.`
              : "") +
            `\n\nRecommended execution strategy for this task type: ${_banditSelection.strategy}`,
        },
      ],
    });

    const firstBlock = response.content[0];
    const rawText = firstBlock.type === "text" ? firstBlock.text.trim() : "[]";

    // Capture the planning decision as a learning signal (fire-and-forget)
    if (rawText && rawText !== "[]") {
      _captureStreamedResponse(rawText, 0, {
        supabase,
        organizationId: orgId,
        domain: 'cognitive-planner.schedule',
        aiWorkerId,
        inputSummary: stateSnapshot.slice(0, 200),
        qualityThreshold: 0.4,
      });
    }

    try {
      // Strip markdown code fences if present
      const jsonText = rawText
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```$/, "")
        .trim();
      const parsed = JSON.parse(jsonText) as unknown;

      if (Array.isArray(parsed)) {
        decisions = parsed
          .filter(
            (d): d is PlannerDecision =>
              typeof d === "object" &&
              d !== null &&
              typeof (d as Record<string, unknown>).domain === "string" &&
              typeof (d as Record<string, unknown>).rationale === "string"
          )
          .map((d) => ({
            domain: d.domain,
            priority: (["high", "normal", "low"] as const).includes(
              d.priority as "high" | "normal" | "low"
            )
              ? (d.priority as "high" | "normal" | "low")
              : "normal",
            rationale: d.rationale,
          }))
          .filter((d) => {
            if (globallyBrokenDomains.has(d.domain)) {
              logger.warn(
                "[CognitivePlanner] Global circuit breaker: excluding domain globally",
                { domain: d.domain, orgId }
              );
              return false;
            }
            return true;
          })
          .slice(0, maxDecisions);
      }
    } catch (parseErr) {
      logger.warn("[CognitivePlanner] Phase 2 JSON parse failed, using coverage gap fallback:", parseErr);
      // Fallback: top coverage gap domains (1 if in recovery, 2 otherwise)
      decisions = coverageGaps
        .filter((d) => !stuckDomains.includes(d) && !globallyBrokenDomains.has(d))
        .slice(0, recoveryMode ? 1 : 2)
        .map((domain) => ({
          domain,
          priority: "normal" as const,
          rationale: "Coverage gap: domain has not run in >6h (fallback plan)",
        }));
    }

    logger.warn(
      `[CognitivePlanner] Phase 2 planned ${decisions.length} decisions for org=${orgId}`
    );
  } catch (err) {
    logger.warn("[CognitivePlanner] Phase 2 (plan) Haiku call failed:", err);
    // Fallback to coverage gaps
    decisions = coverageGaps
      .filter((d) => !stuckDomains.includes(d) && !globallyBrokenDomains.has(d))
      .slice(0, 2)
      .map((domain) => ({
        domain,
        priority: "normal" as const,
        rationale: "Coverage gap: domain has not run in >6h (error fallback plan)",
      }));
  }

  // ── EU AI Act Article 13: log planner dispatch decision ──────────────────
  // Fire-and-forget — supabase here is the service client passed from cron route.
  void logDecision(supabase, {
    organizationId: orgId,
    decisionType: "agent_dispatch",
    inputContext: {
      phase: "plan",
      orgId,
      cycleId,
      coverageGaps: coverageGaps.slice(0, 10),
      stuckDomains,
      recoveryMode,
      engagementCount,
    },
    decisionMade: {
      decisionsCount: decisions.length,
      domains: decisions.map((d) => d.domain),
      priorities: decisions.map((d) => d.priority),
    },
    rationale: decisions.map((d) => `${d.domain}: ${d.rationale}`).join(" | ") || undefined,
    confidence: decisions.length > 0
      ? decisions.reduce((sum, d) => sum + (goodQualityDomains.includes(d.domain) ? 0.7 : poorQualityDomains.includes(d.domain) ? 0.3 : 0.5), 0) / decisions.length
      : 0.5,
    modelUsed: PLANNER_MODEL,
    domain: decisions[0]?.domain ?? undefined,
  }).catch((e: unknown) => logger.warn("[CognitivePlanner] logDecision (agent_dispatch) failed:", e));

  // ══════════════════════════════════════════════════════════════════════════
  // PHASE 3 — EXECUTE (dedup + queue)
  // ══════════════════════════════════════════════════════════════════════════

  let decisionsQueued = 0;

  // ENT-7: Heavy domains that are expensive and require strict scheduling limits.
  // Only 1 max per cognitive cycle, and only if fewer than 2 jobs queued so far.
  const HEAVY_DOMAINS = new Set(["tdd-code-generator", "pr-review", "full-audit", "causal-analysis"]);

  for (const decision of decisions) {
    try {
      // ENT-7: Guard heavy domains — at most 1 per cycle and only if low queue pressure
      if (HEAVY_DOMAINS.has(decision.domain)) {
        const heavyAlreadyQueued = decisions
          .slice(0, decisions.indexOf(decision))
          .some((d) => HEAVY_DOMAINS.has(d.domain));
        if (heavyAlreadyQueued || decisionsQueued >= 2) {
          logger.warn("[CognitivePlanner] Skipping heavy domain (time budget guard)", {
            domain: decision.domain,
            decisionsQueued,
            orgId,
          });
          continue;
        }
      }

      // Process Intelligence (internal FSM) is user-triggered only — never schedule autonomously.
      // Guard against bpaas.* and process.* domains appearing in suggestions.
      if (decision.domain.startsWith("bpaas.") || decision.domain.startsWith("process.")) {
        logger.warn("[CognitivePlanner] Skipping internal process-intelligence domain", {
          domain: decision.domain,
          orgId,
        });
        continue;
      }

      // Domain must be in the worker's allowed list (service_type guard — ADR-012)
      if (!allowedDomains.includes(decision.domain)) {
        logger.warn("[CognitivePlanner] Skipping domain not allowed for worker's service_type", {
          domain: decision.domain,
          serviceType: workerConfig?.service_type,
          aiWorkerId,
        });
        continue;
      }

      // ── Dedup check (two layers) ─────────────────────────────────────────
      //
      // Layer 1: ai_memory dedup marker — 2-hour cooldown per domain per org.
      // This is the primary dedup mechanism. The marker is written AFTER a
      // successful agent_queue insert and survives up to 2h.
      //
      // Layer 2: in-flight agent_queue check — guards against the case where
      // the 2h marker has expired but a prior cycle's job is still running or
      // queued. Without this second layer, a long-running job (>2h) would get
      // a duplicate queued at the 2h mark.
      //
      // Note on serverless safety: both checks query the database directly.
      // Module-level in-process state (e.g. a Map) is NOT a reliable dedup
      // mechanism on serverless because each Lambda invocation is an isolated
      // process — concurrent cron invocations running in different Lambdas share
      // no in-process state. The database IS the shared, durable state store.
      const dedupKey = `cognitive-planner:${decision.domain}:${orgId}`;
      const { count: existingMarker } = await supabase
        .from("ai_memory")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", orgId)
        .eq("domain", "cognitive-planner")
        .eq("memory_type", "dedup")
        .eq("content", dedupKey)
        .gte("created_at", new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString());

      if ((existingMarker ?? 0) > 0) {
        logger.warn(
          `[CognitivePlanner] DEDUP skip — ${decision.domain} already queued in last 2h (ai_memory marker)`
        );
        continue;
      }

      // Layer 2: check agent_queue for in-flight jobs for this domain + org.
      // Statuses 'pending' and 'running' mean a job is actively being executed
      // or is waiting to be picked up. Skip insertion to avoid duplication.
      const { count: inFlightCount } = await supabase
        .from("agent_queue")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", orgId)
        .eq("task_type", decision.domain)
        .in("status", ["pending", "running"]);

      if ((inFlightCount ?? 0) > 0) {
        logger.warn(
          `[CognitivePlanner] DEDUP skip — ${decision.domain} has ${inFlightCount} in-flight job(s) (pending/running in agent_queue)`,
          { orgId, domain: decision.domain }
        );
        continue;
      }

      // Determine agent_type from the worker's service_type (ADR-012)
      const agentType = workerConfig?.service_type === "aas" ? "aas" : "se-aas";

      // Insert to agent_queue — scoped to the specific AI Worker (ADR-012)
      const queueRow: Record<string, unknown> = {
        organization_id: orgId,
        agent_type: agentType,
        task_type: decision.domain,
        priority: decision.priority === "high" ? "high" : "normal",
        status: "pending",
        payload: {
          triggeredBy: "cognitive-planner",
          rationale: decision.rationale,
          plannerCycleId: cycleId,
          coverageGap: coverageGaps.includes(decision.domain),
        },
      };
      // Only set ai_worker_id if provided — preserves backward compat for legacy unscoped calls
      if (aiWorkerId) {
        queueRow.ai_worker_id = aiWorkerId;
      }
      const { error: queueError } = await supabase.from("agent_queue").insert(queueRow);

      if (queueError) {
        logger.warn(
          `[CognitivePlanner] agent_queue insert failed for ${decision.domain}:`,
          queueError
        );
        continue;
      }

      // Write dedup marker
      await supabase.from("ai_memory").insert({
        organization_id: orgId,
        domain: "cognitive-planner",
        memory_type: "dedup",
        content: dedupKey,
        importance: 0.1,
        metadata: { decision, cycleId },
      });

      decisionsQueued++;
      logger.warn(
        `[CognitivePlanner] Queued ${decision.domain} (priority=${decision.priority}) for org=${orgId}`
      );
    } catch (err) {
      logger.warn(`[CognitivePlanner] Phase 3 failed for domain=${decision.domain}:`, err);
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PHASE 4 — RECORD CYCLE (working memory for next cycle's Phase 5)
  // ══════════════════════════════════════════════════════════════════════════

  try {
    await supabase.from("ai_memory").insert({
      organization_id: orgId,
      domain: "cognitive-planner",
      memory_type: "working",
      content: JSON.stringify({
        cycleId,
        decisions,
        assessedAt: new Date().toISOString(),
        coverageGaps,
        poorQualityDomains,
      }),
      importance: 0.6,
      metadata: {
        cycleId,
        decisionCount: decisions.length,
        reflected: false,
      },
    });
  } catch (err) {
    logger.warn("[CognitivePlanner] Phase 4 (record cycle) failed:", err);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PHASE POST — UPDATE BRAIN PROGRESS (persistent learning velocity tracker)
  // ══════════════════════════════════════════════════════════════════════════

  // Compute avg plan confidence from decisions: good quality = 0.7, normal = 0.5, fallback = 0.5
  const planConfidence = decisions.length > 0
    ? decisions.reduce((sum, d) => {
        if (goodQualityDomains.includes(d.domain)) return sum + 0.7;
        if (poorQualityDomains.includes(d.domain)) return sum + 0.3;
        return sum + 0.5;
      }, 0) / decisions.length
    : 0.5;

  await updateBrainProgress(supabase, orgId, {
    planConfidence,
    globallyBrokenDomains,
    orgExcludedCount: stuckDomains.length,
    reflectionsStored: reflected ? 1 : 0,
  });

  logger.warn("[CognitivePlanner] Cycle complete", {
    cycleId,
    orgId,
    decisionsQueued,
    decisionsCount: decisions.length,
    decisions: decisions.map((d) => ({ domain: d.domain, priority: d.priority })),
    coverageGapCount: coverageGaps.length,
    stuckDomainCount: stuckDomains.length,
    poorQualityCount: poorQualityDomains.length,
    recoveryMode,
    reflected,
  });

  return {
    cycleId,
    decisionsQueued,
    decisions,
    coverageGaps,
    poorQualityDomains,
    stuckDomains,
    highDemandDomains,
    recoveryMode,
    reflected,
  };
}
