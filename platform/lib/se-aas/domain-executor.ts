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
import { recordAgentOutcome, computeAgentQuality, recordStepOutcome } from "@/lib/brain/agent-rl";
import { getCaseLogContext, logAgentRetro } from "@/lib/brain/rl-agent-loop";
import { recordRlvrPrediction } from "@/lib/brain/rlvr-verifier";
import { recordBrainLearning } from "@/lib/brain/engagement-flywheel";
import { selectModelForDomain, routeModelWithIq, routeCallType } from "./model-router";
import { captureStreamedResponse } from "@/lib/brain/claude-learning-capture";
import {
  buildAgentCommsPayload,
  buildIntroSpeech,
  buildCompletionSpeech,
  buildErrorSpeech,
} from "@/lib/agents/agent-comms";
import type { AgentCommsPayload } from "@/lib/agents/agent-comms";
import {
  pauseJobAtDecisionGate,
  sendEscalationNotification,
  loadResumeCheckpoint,
} from "@/lib/se-aas/agent-checkpoint";
import { getConnectorCredentials } from "@/lib/connectors/get-credentials";
import {
  createGitHubBranch,
  commitFilesToBranch,
  createGitHubPR,
} from "@/lib/connectors/writeback/github";
import type { GitHubFileToCommit } from "@/lib/connectors/writeback/github";
import { getCachedPlan, setCachedPlan, normaliseQueryKey } from "@/lib/brain/plan-cache";
import { checkHitlGate } from "@/lib/brain/hitl-gate";
import { logAuditEvent, AuditAction } from "@/lib/audit";
import { extractAndStoreKnowledge } from "@/lib/brain/knowledge-extractor";

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

// ── Inline domain: decompose-spec ─────────────────────────────────────────
// Decomposes a feature spec into actionable engineering tickets via Claude.
// Registered inline rather than as a memory-stack module because it owns no
// structured DB data — all logic is Anthropic-call + artifact write-back.
const DECOMPOSE_SPEC_SYSTEM_PROMPT = `You are a senior software architect decomposing a feature spec into actionable engineering tickets.

Given a spec, return a JSON array of tickets. Each ticket has:
- title: string (max 80 chars, imperative: "Add X", "Fix Y", "Implement Z")
- description: string (acceptance criteria, 2-5 bullet points)
- type: "feature" | "bug" | "task" | "test"
- priority: "high" | "medium" | "low"
- estimate: "small" | "medium" | "large" (S=<4h, M=<2d, L=<1w)
- dependencies: string[] (titles of tickets this depends on, empty if none)
- domain: "frontend" | "backend" | "database" | "devops" | "testing"

Rules:
- Max 10 tickets per spec
- Start with infrastructure/DB tickets, then backend, then frontend, then tests
- Each ticket must be independently completable (no ambiguous requirements)
- Include a test ticket for every feature ticket

Return ONLY valid JSON — no markdown, no explanation. The response must be a JSON array.`;

const decomposeSpecDomain = {
  async execute(ctx: any): Promise<Record<string, unknown>> {
    const Anthropic = (await import("@anthropic-ai/sdk")).default;
    const apiKey =
      (ctx.input?.anthropicApiKey as string | undefined) ?? process.env.ANTHROPIC_API_KEY ?? "";
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY not available for decompose-spec domain");

    const spec = (ctx.input?.spec as string | undefined) ?? "";
    if (!spec.trim()) throw new Error("decompose-spec: spec is required in request");

    const repoOwner = ctx.input?.repoOwner as string | undefined;
    const repoName = ctx.input?.repoName as string | undefined;

    const userContent =
      repoOwner && repoName
        ? `Repository: ${repoOwner}/${repoName}\n\nSpec:\n${spec.trim()}`
        : `Spec:\n${spec.trim()}`;

    const anthropic = new Anthropic({ apiKey });
    const response = await anthropic.messages.create({
      model: ctx.input?.model ?? routeCallType("agent-compose").model,
      max_tokens: 4096,
      system: DECOMPOSE_SPEC_SYSTEM_PROMPT,
      messages: [{ role: "user", content: userContent }],
    });

    const rawText =
      response.content[0]?.type === "text" ? response.content[0].text : "[]";

    // Strip markdown code fences if present
    const stripped = rawText
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```\s*$/i, "")
      .trim();

    let tickets: unknown[] = [];
    try {
      const parsed = JSON.parse(stripped);
      if (Array.isArray(parsed)) tickets = parsed;
    } catch {
      logger.warn("[decompose-spec domain] Failed to parse Claude response:", rawText.slice(0, 300));
    }

    return {
      tickets,
      spec: spec.trim(),
      repoOwner: repoOwner ?? null,
      repoName: repoName ?? null,
      model: ctx.input?.model ?? routeCallType("agent-compose").model,
    };
  },
};

// ── Inline domain: overnight-orchestrator ─────────────────────────────────
// Passthrough domain that returns the parent job status + child job summary.
// Allows the SE-aaS router to answer "what's the status of my overnight run?"
// without requiring a dedicated endpoint.
const overnightOrchestratorPassthroughDomain = {
  async execute(ctx: any): Promise<Record<string, unknown>> {
    const supabase = ctx.supabase as import("@supabase/supabase-js").SupabaseClient;
    const orgId = ctx.input?.organizationId as string | undefined;
    const parentJobId = ctx.input?.parentJobId as string | undefined;

    if (!supabase || !orgId) {
      return { status: "unknown", message: "No org context available" };
    }

    // Query recent overnight-orchestrator jobs for this org
    let query = supabase
      .from("agent_queue")
      .select("id, status, payload, started_at, completed_at, error_message, created_at")
      .eq("organization_id", orgId)
      .eq("task_type", "overnight-orchestrator")
      .order("created_at", { ascending: false })
      .limit(5);

    if (parentJobId) {
      query = supabase
        .from("agent_queue")
        .select("id, status, payload, started_at, completed_at, error_message, created_at")
        .eq("organization_id", orgId)
        .eq("id", parentJobId)
        .limit(1);
    }

    const { data: jobs } = await query;
    const parentJobs = jobs ?? [];

    if (parentJobs.length === 0) {
      return {
        status: "no_jobs",
        message: "No overnight orchestrator jobs found for this workspace",
      };
    }

    // For each parent job, count child jobs
    const summaries = await Promise.all(
      parentJobs.map(async (job: Record<string, unknown>) => {
        const { data: childJobs, count } = await supabase
          .from("agent_queue")
          .select("id, status", { count: "exact" })
          .eq("parent_job_id", job.id as string)
          .eq("task_type", "code-agent");

        const children = childJobs ?? [];
        const childSummary = {
          total: count ?? 0,
          pending: children.filter((c: Record<string, unknown>) => c.status === "pending").length,
          running: children.filter((c: Record<string, unknown>) => c.status === "running").length,
          success: children.filter((c: Record<string, unknown>) => c.status === "success").length,
          error: children.filter((c: Record<string, unknown>) => c.status === "error").length,
        };

        const payload = job.payload as Record<string, unknown> | null;
        return {
          parentJobId: job.id,
          status: job.status,
          repo: payload ? `${payload.repoOwner}/${payload.repoName}` : null,
          ticketCount: (payload as Record<string, unknown> | null)?.ticketCount ?? null,
          startedAt: job.started_at,
          completedAt: job.completed_at,
          childJobs: childSummary,
        };
      })
    );

    return {
      status: summaries[0]?.status ?? "unknown",
      message: `Overnight orchestrator: ${summaries[0]?.childJobs.success ?? 0} PRs opened, ${summaries[0]?.childJobs.pending ?? 0} pending`,
      jobs: summaries,
    };
  },
};

// ── Inline domain: early-warning ──────────────────────────────────────────
// Queries engineer_health_snapshots for the current week to produce a
// flight-risk / overallocation / velocity summary for this org.
// Registered inline because the delivery handler (buildDeliveryIntelligenceResult)
// enriches the result with the full engagement-health panel after execution.
const earlyWarningDomain = {
  async execute(ctx: any): Promise<Record<string, unknown>> {
    const supabase = ctx.supabase as import("@supabase/supabase-js").SupabaseClient;
    const orgId = ctx.organizationId as string;

    if (!supabase || !orgId) {
      return { domain: "early-warning", engineers: [], summary: null, error: "No org context available" };
    }

    // ISO Monday for current week — matches the week_start column in engineer_health_snapshots
    const thisWeek = new Date();
    thisWeek.setDate(thisWeek.getDate() - thisWeek.getDay() + 1);
    const weekStart = thisWeek.toISOString().split("T")[0];

    let { data: snapshots, error } = await supabase
      .from("engineer_health_snapshots")
      .select("github_login, review_burden, velocity_index, flight_risk_score, overallocation_flag, week_start")
      .eq("organization_id", orgId)
      .gte("week_start", weekStart)
      .order("flight_risk_score", { ascending: false })
      .limit(50);

    // Schema drift recovery: retry with select("*") if column doesn't exist
    if (error?.message?.includes("does not exist")) {
      logger.warn(`[early-warning] Schema drift detected: ${error.message}. Retrying with select("*")`);
      const fallback = await supabase.from("engineer_health_snapshots").select("*")
        .eq("organization_id", orgId).gte("week_start", weekStart).limit(50);
      snapshots = fallback.data; error = fallback.error;
    }

    if (error) {
      logger.warn("[early-warning domain] engineer_health_snapshots query failed:", error.message);
    }

    const engineers = snapshots ?? [];
    const atRisk = engineers.filter((e: Record<string, unknown>) => (e.flight_risk_score as number ?? 0) > 50);
    const overallocated = engineers.filter((e: Record<string, unknown>) => e.overallocation_flag);
    const avgVelocity = engineers.length > 0
      ? Math.round(engineers.reduce((sum: number, e: Record<string, unknown>) => sum + ((e.velocity_index as number) ?? 0), 0) / engineers.length)
      : 0;

    return {
      domain: "early-warning",
      week_start: weekStart,
      engineers,
      summary: {
        total_engineers: engineers.length,
        at_risk_count: atRisk.length,
        overallocated_count: overallocated.length,
        avg_velocity_index: avgVelocity,
        high_flight_risk: atRisk.slice(0, 5).map((e: Record<string, unknown>) => ({
          github_login: e.github_login,
          flight_risk_score: e.flight_risk_score,
          overallocation_flag: e.overallocation_flag,
        })),
      },
      narrative: engineers.length > 0
        ? `${atRisk.length} of ${engineers.length} engineers are at flight risk this week. ${overallocated.length} are overallocated. Average velocity index: ${avgVelocity}.`
        : "No engineer health data available for this week. Connect GitHub to start tracking sprint velocity and review burden.",
    };
  },
};

// ── Inline domain: scope-creep ─────────────────────────────────────────────
// Queries scope_creep_alerts for this org to produce a scope drift summary.
// Registered inline because the delivery handler (buildDeliveryIntelligenceResult)
// enriches the result with the full engagement-health panel after execution.
const scopeCreepDomain = {
  async execute(ctx: any): Promise<Record<string, unknown>> {
    const supabase = ctx.supabase as import("@supabase/supabase-js").SupabaseClient;
    const orgId = ctx.organizationId as string;

    if (!supabase || !orgId) {
      return { domain: "scope-creep", alerts: [], summary: null, error: "No org context available" };
    }

    let { data: alerts, error } = await supabase
      .from("scope_creep_alerts")
      .select("id, engagement_id, severity, drift_percent, description, created_at, acknowledged, engagements(engagement_name, client_name)")
      .eq("organization_id", orgId)
      .order("created_at", { ascending: false })
      .limit(20);

    // Schema drift recovery: retry with select("*") if column doesn't exist
    if (error?.message?.includes("does not exist")) {
      logger.warn(`[scope-creep] Schema drift detected: ${error.message}. Retrying with select("*")`);
      const fallback = await supabase.from("scope_creep_alerts").select("*")
        .eq("organization_id", orgId).order("created_at", { ascending: false }).limit(20);
      alerts = fallback.data; error = fallback.error;
    }

    if (error) {
      logger.warn("[scope-creep domain] scope_creep_alerts query failed:", error.message);
    }

    const allAlerts = alerts ?? [];
    const unacknowledged = allAlerts.filter((a: Record<string, unknown>) => !a.acknowledged);
    const critical = unacknowledged.filter((a: Record<string, unknown>) => a.severity === "critical" || a.severity === "high");
    const avgDrift = unacknowledged.length > 0
      ? Math.round(unacknowledged.reduce((sum: number, a: Record<string, unknown>) => sum + ((a.drift_percent as number) ?? 0), 0) / unacknowledged.length)
      : 0;

    return {
      domain: "scope-creep",
      alerts: allAlerts,
      unacknowledged_alerts: unacknowledged,
      summary: {
        total_alerts: allAlerts.length,
        unacknowledged_count: unacknowledged.length,
        critical_count: critical.length,
        avg_drift_percent: avgDrift,
      },
      narrative: unacknowledged.length > 0
        ? `${unacknowledged.length} active scope creep alerts (${critical.length} critical/high). Average drift: ${avgDrift}%. Immediate attention required on ${critical.length} engagement(s).`
        : allAlerts.length > 0
          ? "All scope creep alerts have been acknowledged. No active drift detected."
          : "No scope creep alerts found. Connect Jira to start tracking story point drift and sprint boundary changes.",
    };
  },
};

// ── Inline domain: delivery-intelligence ──────────────────────────────────
// Composite snapshot across ALL four delivery intelligence tables:
//   1. engagement_health_latest  — bottom-5 engagements by health_score
//   2. engineer_health_snapshots — engineers with flight_risk_score > 50
//   3. scope_creep_alerts        — unacknowledged alerts
//   4. pod_match_history         — latest 3 pod recommendations
//
// This is the ONLY handler that should be bound to the "delivery-intelligence"
// domain key in DOMAIN_MAP. Do NOT route this to podMatchDomain — that handler
// only touches pod_match_history and produces incorrect RL signals for the
// broader delivery-intelligence use case.
const deliveryIntelligenceDomain = {
  async execute(ctx: any): Promise<Record<string, unknown>> {
    const supabase = ctx.supabase as import("@supabase/supabase-js").SupabaseClient;
    const orgId = ctx.organizationId as string;

    if (!supabase || !orgId) {
      return {
        domain: "delivery-intelligence",
        engagements: [],
        engineers: [],
        alerts: [],
        pod_recommendations: [],
        summary: null,
        error: "No org context available",
      };
    }

    // ── 1. engagement_health_latest — bottom 5 by health_score ─────────────
    let { data: engagementsRaw, error: engErr } = await supabase
      .from("engagement_health_latest")
      .select("engagement_id, health_score, computed_at, client_name, engagement_name, status, forecast_at_risk, forecast_days_remaining, delivery_velocity, jira_resolution_rate, scope_drift")
      .eq("organization_id", orgId)
      .order("health_score", { ascending: true })
      .limit(5);

    // Schema drift recovery: retry with select("*") if column doesn't exist
    if (engErr?.message?.includes("does not exist")) {
      logger.warn(`[delivery-intelligence] Schema drift on engagement_health_latest: ${engErr.message}. Retrying with select("*")`);
      const fallback = await supabase.from("engagement_health_latest").select("*")
        .eq("organization_id", orgId).limit(5);
      engagementsRaw = fallback.data; engErr = fallback.error;
    }

    if (engErr) {
      logger.warn("[delivery-intelligence domain] engagement_health_latest query failed:", engErr.message);
    }
    const engagements = engagementsRaw ?? [];

    // ── 2. engineer_health_snapshots — flight_risk_score > 50 ──────────────
    const thisWeek = new Date();
    thisWeek.setDate(thisWeek.getDate() - thisWeek.getDay() + 1);
    const weekStart = thisWeek.toISOString().split("T")[0];

    const { data: engineersRaw, error: engSnapshotErr } = await supabase
      .from("engineer_health_snapshots")
      .select("github_login, flight_risk_score, velocity_index, overallocation_flag, review_burden, week_start")
      .eq("organization_id", orgId)
      .gte("week_start", weekStart)
      .gt("flight_risk_score", 50)
      .order("flight_risk_score", { ascending: false })
      .limit(20);

    if (engSnapshotErr) {
      logger.warn("[delivery-intelligence domain] engineer_health_snapshots query failed:", engSnapshotErr.message);
    }
    const engineers = engineersRaw ?? [];

    // ── 3. scope_creep_alerts — unresolved alerts ───────────────────────────
    const { data: alertsRaw, error: alertErr } = await supabase
      .from("scope_creep_alerts")
      .select("id, engagement_id, severity, delta_pct, sprint_name, alert_message, created_at, acknowledged")
      .eq("organization_id", orgId)
      .eq("acknowledged", false)
      .order("created_at", { ascending: false })
      .limit(20);

    if (alertErr) {
      logger.warn("[delivery-intelligence domain] scope_creep_alerts query failed:", alertErr.message);
    }
    const alerts = alertsRaw ?? [];

    // ── 4. pod_match_history — latest 3 recommendations ────────────────────
    const { data: podRaw, error: podErr } = await supabase
      .from("pod_match_history")
      .select("id, engagement_id, recommended_pod_name, confidence, rank, was_accepted, created_at")
      .eq("organization_id", orgId)
      .order("created_at", { ascending: false })
      .limit(3);

    if (podErr) {
      logger.warn("[delivery-intelligence domain] pod_match_history query failed:", podErr.message);
    }
    const podRecommendations = podRaw ?? [];

    // ── Build summary ───────────────────────────────────────────────────────
    const criticalEngagements = engagements.filter(
      (e: Record<string, unknown>) => (e.health_score as number ?? 100) < 40
    );
    const avgHealthScore =
      engagements.length > 0
        ? Math.round(
            engagements.reduce(
              (sum: number, e: Record<string, unknown>) => sum + ((e.health_score as number) ?? 0),
              0
            ) / engagements.length
          )
        : null;
    const criticalAlerts = alerts.filter(
      (a: Record<string, unknown>) => a.severity === "critical"
    );
    const atRiskEngineers = engineers.filter(
      (e: Record<string, unknown>) => (e.flight_risk_score as number ?? 0) > 70
    );

    const narrativeParts: string[] = [];
    if (engagements.length > 0) {
      narrativeParts.push(
        `${criticalEngagements.length} of ${engagements.length} engagements are in critical health (score < 40). Average health score across bottom-5: ${avgHealthScore ?? "N/A"}.`
      );
    }
    if (engineers.length > 0) {
      narrativeParts.push(
        `${atRiskEngineers.length} engineer(s) at high flight risk this week (score > 70 of ${engineers.length} flagged).`
      );
    }
    if (alerts.length > 0) {
      narrativeParts.push(
        `${alerts.length} unacknowledged scope creep alert(s) including ${criticalAlerts.length} critical.`
      );
    }
    if (podRecommendations.length > 0) {
      const topPod = podRecommendations[0] as Record<string, unknown>;
      narrativeParts.push(
        `Latest pod recommendation: ${topPod.recommended_pod_name ?? "Unknown"} (confidence: ${typeof topPod.confidence === "number" ? Math.round((topPod.confidence as number) * 100) : "N/A"}%).`
      );
    }
    const narrative =
      narrativeParts.length > 0
        ? narrativeParts.join(" ")
        : "No delivery intelligence data available. Connect GitHub, Jira, and Slack to start tracking engagement health.";

    return {
      domain: "delivery-intelligence",
      week_start: weekStart,
      engagements,
      engineers,
      alerts,
      pod_recommendations: podRecommendations,
      summary: {
        engagement_count: engagements.length,
        critical_engagement_count: criticalEngagements.length,
        avg_health_score: avgHealthScore,
        at_risk_engineer_count: engineers.length,
        high_flight_risk_engineer_count: atRiskEngineers.length,
        unacknowledged_alert_count: alerts.length,
        critical_alert_count: criticalAlerts.length,
        pod_recommendation_count: podRecommendations.length,
        top_pod_recommendation: podRecommendations.length > 0
          ? (podRecommendations[0] as Record<string, unknown>).recommended_pod_name ?? null
          : null,
      },
      narrative,
    };
  },
};

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
  // delivery-intelligence: composite snapshot across all 4 delivery intel tables
  // (engagement_health_latest, engineer_health_snapshots, scope_creep_alerts, pod_match_history).
  // MUST point to deliveryIntelligenceDomain — NOT podMatchDomain.
  // Routing to podMatchDomain corrupts RL signals for both domains.
  "delivery-intelligence": { domain: deliveryIntelligenceDomain, sync: true },
  // P0 Delivery Intelligence domains — each uses its own correct handler:
  // early-warning queries engineer_health_snapshots (flight risk, velocity, overallocation)
  // scope-creep queries scope_creep_alerts (drift %, severity, unacknowledged count)
  "early-warning": { domain: earlyWarningDomain, sync: true },
  "scope-creep": { domain: scopeCreepDomain, sync: true },
  // P1-15 Architecture Extractor
  "architecture-extractor": { domain: architectureExtractorDomain, sync: false },
  // Spec Decomposition Engine — inline domain, no memory-stack module needed
  "decompose-spec": { domain: decomposeSpecDomain, sync: false },
  // Overnight Orchestrator — passthrough that returns parent job status
  // Allows Copilot to query overnight job progress via SE-aaS routing
  "overnight-orchestrator": { domain: overnightOrchestratorPassthroughDomain, sync: true },
};

export function getDomainInfo(domainType: string): { domain: any; sync: boolean } | null {
  return DOMAIN_MAP[domainType] ?? null;
}

export function isSync(domainType: string): boolean {
  return DOMAIN_MAP[domainType]?.sync ?? false;
}

// ============================================================================
// DOMAIN MoA — Mixture of Agents for high-stakes domains
// ============================================================================

/**
 * High-stakes domains that get 3-angle MoA synthesis.
 * Only early-warning and delivery-intelligence — these carry the highest
 * decision weight and benefit most from multi-perspective analysis.
 */
const DOMAIN_MOA_ENABLED = new Set(["early-warning", "delivery-intelligence"]);

/**
 * Run Domain MoA: 3 parallel Haiku calls with different analytical angles,
 * then one Sonnet synthesis call.
 *
 * Angles:
 *  1. Analytical   — data-driven, focus on numbers and trends
 *  2. Risk-focused — surface risks, red flags, and worst-case scenarios
 *  3. Trend-focused — identify patterns, velocity changes, trajectory
 *
 * The synthesizer merges the best insights from all 3.
 * Falls back gracefully — returns null on any error (non-blocking).
 */
async function runDomainMoA(
  domainType: string,
  domainResult: Record<string, unknown>,
  originalRequest: Record<string, unknown>,
  supabase?: SupabaseClient,
  organizationId?: string
): Promise<string | null> {
  if (!DOMAIN_MOA_ENABLED.has(domainType)) return null;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  const HAIKU_MODEL = routeCallType("context-agent").model;
  const SONNET_MODEL = routeCallType("self-moa").model;

  // Compact result to avoid token bloat — trim to relevant fields only
  const resultJson = JSON.stringify(domainResult, null, 0).slice(0, 4000);
  const requestJson = JSON.stringify(originalRequest, null, 0).slice(0, 500);

  const dataBlock = `Domain: ${domainType}
Request context: ${requestJson}
Analysis result data:
${resultJson}`;

  const ANGLES = [
    {
      name: "analytical",
      system: `You are a data-driven analyst reviewing ${domainType} results.
Focus: numbers, percentages, absolute values, time comparisons.
Be precise and factual. Lead with the most significant metric.
Keep response under 150 words. No preamble.`,
    },
    {
      name: "risk-focused",
      system: `You are a risk assessment expert reviewing ${domainType} results.
Focus: risks, red flags, deteriorating signals, worst-case implications.
Prioritize the highest-severity items. Be direct about consequences.
Keep response under 150 words. No preamble.`,
    },
    {
      name: "trend-focused",
      system: `You are a trend analyst reviewing ${domainType} results.
Focus: patterns over time, velocity changes, trajectory, what's accelerating or decelerating.
Connect current data points to future trajectory.
Keep response under 150 words. No preamble.`,
    },
  ];

  try {
    const Anthropic = (await import("@anthropic-ai/sdk")).default;
    const anthropic = new Anthropic({ apiKey });
    const _moaStartMs = Date.now();

    // Run all 3 Haiku angles in parallel for minimal latency
    const [analyticalResp, riskResp, trendResp] = await Promise.all(
      ANGLES.map((angle) =>
        anthropic.messages.create({
          model: HAIKU_MODEL,
          max_tokens: 256,
          system: angle.system,
          messages: [{ role: "user", content: dataBlock }],
        })
      )
    );

    const analytical =
      analyticalResp.content[0]?.type === "text" ? analyticalResp.content[0].text : "";
    const risk =
      riskResp.content[0]?.type === "text" ? riskResp.content[0].text : "";
    const trend =
      trendResp.content[0]?.type === "text" ? trendResp.content[0].text : "";

    if (!analytical && !risk && !trend) return null;

    // Sonnet synthesis: merge the three perspectives into one coherent answer
    const synthesisPrompt = `Three expert perspectives on the same ${domainType} data:

[ANALYTICAL VIEW]
${analytical}

[RISK VIEW]
${risk}

[TREND VIEW]
${trend}

Synthesize these into a single, coherent 150-200 word summary that:
1. Opens with the most critical finding
2. Incorporates the strongest insights from all three perspectives
3. Ends with the single most important action item
4. Avoids redundancy — no "the data shows" or "as noted above" framing
Return ONLY the synthesis — no meta-commentary, no labels.`;

    const synthesisResp = await anthropic.messages.create({
      model: SONNET_MODEL,
      max_tokens: 400,
      messages: [{ role: "user", content: synthesisPrompt }],
    });

    const synthesized =
      synthesisResp.content[0]?.type === "text" ? synthesisResp.content[0].text : null;

    if (synthesized) {
      logger.debug(
        `[domain-moa] ${domainType} synthesis complete — ` +
          `analytical=${analytical.length}c risk=${risk.length}c trend=${trend.length}c → ${synthesized.length}c`
      );
      // Capture MoA synthesis to federated_knowledge (fire-and-forget)
      if (supabase && organizationId) {
        captureStreamedResponse(synthesized, Date.now() - _moaStartMs, {
          supabase,
          organizationId,
          domain: `se-aas.moa.${domainType}`,
        });
      }
    }

    return synthesized;
  } catch (moaErr: any) {
    // MoA is enhancement only — never block domain result delivery
    logger.warn("[domain-moa] MoA failed (non-blocking):", moaErr?.message);
    return null;
  }
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
  /**
   * Optional: AI worker UUID from ai_workers table (ADR-020).
   * When provided, written to RL tables to enable per-worker threshold adaptation.
   */
  aiWorkerId?: string;
  /**
   * ADR-031 Phase 5: Pre-resolved working memory context (RL primer, worker memory,
   * tool library, entity context, etc.). Resolved before service routing so domain
   * executors get the same GATHER context as the copilot LLM.
   */
  workingMemoryContext?: string;
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

  // ── Decision Gate C: Resume from checkpoint (human-in-the-loop continuation) ──
  // If this job was paused at a decision gate and a human has responded, the
  // payload will contain checkpoint_data + human_response. We load those and
  // inject the human decision into the request so the domain continues from
  // exactly where it stopped — skipping the initial data-fetch steps.
  // Only fires for queued jobs (jobId present) — direct Copilot calls never pause.
  if (params.jobId && params.request && typeof params.request === "object") {
    const checkpoint = loadResumeCheckpoint(params.request);
    if (checkpoint) {
      const { checkpointData, humanResponse, phase, resumePrompt } = checkpoint;
      logger.warn("[domain-executor] Resuming from decision gate checkpoint", {
        jobId: params.jobId,
        phase,
        humanResponse: humanResponse.slice(0, 100),
      });
      // Enrich the request with human decision so domain prompts can reference it
      (params.request as Record<string, unknown>)["_resumeFromCheckpoint"] = true;
      (params.request as Record<string, unknown>)["_checkpointPhase"] = phase;
      (params.request as Record<string, unknown>)["_humanDecision"] = humanResponse;
      (params.request as Record<string, unknown>)["_partialResults"] = checkpointData;
      (params.request as Record<string, unknown>)["_resumePrompt"] = resumePrompt;
    }
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
  {
    const stepStart = Date.now();
    let stepSuccess = true;
    let stepError: string | undefined;
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
    } catch (err: unknown) {
      stepSuccess = false;
      stepError = err instanceof Error ? err.message : String(err);
      // Non-fatal — case-log priming failure must never block domain execution
    }
    void recordStepOutcome(supabase, {
      organizationId: params.organizationId,
      domain: params.domainType,
      stepName: "case-log-prime",
      stepIndex: 0,
      success: stepSuccess,
      durationMs: Date.now() - stepStart,
      ...(stepError ? { errorMessage: stepError } : {}),
    });
  }

  // ── Step -1b: Brain Context Priming — inject live brain state into every domain ──
  // Non-blocking: if getBrainContext fails, domain execution continues unaffected.
  let brainContextStr = "";
  {
    const stepStart = Date.now();
    let stepSuccess = true;
    let stepError: string | undefined;
    try {
      const { getBrainContext } = await import("@/lib/brain/brain-context");
      const brainCtx = await getBrainContext(supabase, params.organizationId);
      brainContextStr = brainCtx.contextSummary;
      // ADR-031 Phase 5: Append working memory to brain context string
      // so it flows through the mesh assembly query AND into ctx.input._brainContextStr
      // for all 17 domain execute() functions without modifying each one.
      if (params.workingMemoryContext) {
        brainContextStr = (brainContextStr || "")
          + "\n\n## WORKING MEMORY (session context — RL patterns, worker memory, tools)\n"
          + params.workingMemoryContext;
      }
      if (brainContextStr) {
        (params.request as Record<string, unknown>)["_brainContextStr"] = brainContextStr;
      }
    } catch (err: unknown) {
      stepSuccess = false;
      stepError = err instanceof Error ? err.message : String(err);
      // non-fatal — domain proceeds without brain context enrichment
    }
    void recordStepOutcome(supabase, {
      organizationId: params.organizationId,
      domain: params.domainType,
      stepName: "brain-context",
      stepIndex: 1,
      success: stepSuccess,
      durationMs: Date.now() - stepStart,
      ...(stepError ? { errorMessage: stepError } : {}),
    });
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
    // Cap Map size to prevent unbounded OOM growth (one entry per unique org)
    if (_corePushLastMs.size > 2000) {
      const firstKey = _corePushLastMs.keys().next().value;
      if (firstKey) _corePushLastMs.delete(firstKey);
    }
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

  // ── Step 1b: HITL gate for high-confidence actions ────────────────────────
  // EU AI Act Article 14 — human oversight is opt-out by default.
  // When the brain context signals high confidence (>0.9) on this domain action,
  // require a human approval before proceeding with LLM execution.
  const preflightConfidence = (brainContext as any)?.confidence ?? (params.interpretation as any)?.confidence;
  if (preflightConfidence && preflightConfidence > 0.9) {
    try {
      const { blocked, approvalId } = await checkHitlGate(supabase, {
        orgId: params.organizationId,
        gateType: "high_confidence_action",
        summary: `High-confidence domain action: ${params.domainType}`,
        details: { domain: params.domainType, confidence: preflightConfidence },
      });
      if (blocked) {
        return { result: { status: "pending_approval", approvalId, domain: params.domainType }, artifactId: null };
      }
    } catch (hitlErr) {
      // Non-blocking: HITL check failure should not prevent domain execution.
      // Log and continue — failing open is safer than deadlocking the system.
      logger.warn("[domain-executor] HITL gate check failed — failing open", {
        domain: params.domainType,
        orgId: params.organizationId,
        error: hitlErr instanceof Error ? hitlErr.message : String(hitlErr),
      });
    }
  }

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

  // ── PlanCache: short-circuit on repeated identical requests ────────────────
  // Only cache non-queued (direct Copilot) calls — jobId calls are unique
  // queue runs and must not be deduplicated. queryKey is derived from the
  // user-facing message/query field, normalised to first 100 lowercase chars.
  const _cacheQueryRaw =
    (typeof params.request.message === "string" ? params.request.message : null) ??
    (typeof params.request.query === "string" ? params.request.query : null) ??
    params.domainType;
  const _cacheQueryKey = normaliseQueryKey(_cacheQueryRaw);
  if (!params.jobId) {
    const cachedResult = await getCachedPlan<Record<string, unknown>>(
      params.organizationId,
      params.domainType,
      _cacheQueryKey,
      supabase
    );
    if (cachedResult) {
      logger.warn("[domain-executor] PlanCache HIT — returning cached result", {
        domain: params.domainType,
        queryKey: _cacheQueryKey,
        orgId: params.organizationId,
      });
      return { result: { ...cachedResult, _cached: true }, artifactId: null };
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

    // ── Domain MoA: 3-angle Haiku synthesis + Sonnet for high-stakes domains ──
    // Runs for early-warning and delivery-intelligence only, AND only when
    // Brain IQ >= 50. Below IQ 50 the brain hasn't accumulated enough signal
    // for multi-angle synthesis to be meaningful — skip to save 4 LLM calls.
    if (DOMAIN_MOA_ENABLED.has(params.domainType) && brainIqForRouting >= 50) {
      const moaSynthesis = await runDomainMoA(params.domainType, result, params.request, supabase, params.organizationId);
      if (moaSynthesis) {
        result = { ...result, moaSynthesis, moaEnabled: true };
      }
    }

    // ── PlanCache: store fresh result for next identical request ─────────────
    if (!params.jobId) {
      setCachedPlan(params.organizationId, params.domainType, _cacheQueryKey, result);
    }
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

  // ── Step 3 outcome: record execute step signal (fire-and-forget) ─────────
  void recordStepOutcome(supabase, {
    organizationId: params.organizationId,
    domain: params.domainType,
    stepName: "execute",
    stepIndex: 2,
    success: true,
    durationMs,
  });

  // ── Decision Gate A: early-warning — flight risk / health score threshold ──
  // Only fires for queued jobs (jobId present). If any engineer has
  // flight_risk_score > 0.7 OR engagement health_score < 40, we pause the job
  // and ask a human whether to escalate externally or proceed with internal mitigation.
  if (params.jobId && params.domainType === "early-warning") {
    try {
      const resultData = (result as Record<string, unknown>)?.data as Record<string, unknown> | undefined;
      // Support both single-engineer result and array of engineers in the result
      const engineers: Record<string, unknown>[] = [];
      if (Array.isArray((resultData as any)?.engineers)) {
        engineers.push(...((resultData as any).engineers as Record<string, unknown>[]));
      } else if (resultData) {
        engineers.push(resultData);
      }

      const criticalEngineers = engineers.filter(
        (e) => typeof e.flight_risk_score === "number" && (e.flight_risk_score as number) > 0.7
      );
      const healthScore = typeof (resultData as any)?.health_score === "number"
        ? ((resultData as any).health_score as number)
        : null;
      const engagementId =
        (typeof (resultData as any)?.engagement_id === "string" ? (resultData as any).engagement_id : null) ??
        (typeof params.request.engagement_id === "string" ? params.request.engagement_id : null);

      const hasCriticalFlight = criticalEngineers.length > 0;
      const hasCriticalHealth = healthScore !== null && healthScore < 40;

      if (hasCriticalFlight || hasCriticalHealth) {
        const topRiskScore = hasCriticalFlight
          ? Math.max(...criticalEngineers.map((e) => e.flight_risk_score as number))
          : null;
        const escalationQuestion = hasCriticalFlight
          ? `Flight risk is critical (score: ${topRiskScore?.toFixed(2)}). Should I escalate to the client now or proceed with internal mitigation plan?`
          : `Engagement health is LOW (score: ${healthScore}/100). Should I escalate to the client now or proceed with internal mitigation plan?`;
        const partialSummary = `${criticalEngineers.length} critical engineer(s) flagged.${healthScore !== null ? ` Engagement health: ${healthScore}/100.` : ""}`;

        const gateResultA = await pauseJobAtDecisionGate(supabase, params.jobId, params.organizationId, {
          phase: "risk_assessment",
          entityIds: engagementId ? [engagementId] : [],
          partialResults: { criticalEngineers, healthScore, engineersAnalyzed: engineers.length },
          escalationQuestion,
          resumeInstruction: `Continue early-warning analysis with human decision: {human_response}`,
        });
        if (!gateResultA) {
          throw new Error("HITL gate (early-warning) failed to persist — aborting for safety");
        }

        await sendEscalationNotification(
          supabase,
          params.organizationId,
          params.jobId,
          escalationQuestion,
          "risk_assessment",
          partialSummary
        );

        // Return early — Lambda exits cleanly, state preserved in DB
        return {
          result: {
            ...result,
            paused: true,
            pauseReason: "decision_gate",
            escalationQuestion,
            timing: { totalMs: durationMs },
          },
          artifactId: null,
        };
      }
    } catch (gateErr: any) {
      // Non-fatal — gate failure must never block domain result delivery
      logger.warn("[domain-executor] Decision Gate A (early-warning) threw (non-fatal):", gateErr?.message);
    }
  }

  // ── Decision Gate B: delivery-intelligence — critical health score ─────────
  // Only fires for queued jobs (jobId present). If engagement health_score < 30
  // (critical red), we pause and ask whether to draft a client communication.
  if (params.jobId && params.domainType === "delivery-intelligence") {
    try {
      const resultData = (result as Record<string, unknown>)?.data as Record<string, unknown> | undefined;
      const healthScore = typeof (resultData as any)?.health_score === "number"
        ? ((resultData as any).health_score as number)
        : null;

      if (healthScore !== null && healthScore < 30) {
        const escalationQuestion = `Engagement health is CRITICAL (score: ${healthScore}/100). Immediate escalation required — should I draft a client communication now?`;
        const engagementId =
          (typeof (resultData as any)?.engagement_id === "string" ? (resultData as any).engagement_id : null) ??
          (typeof params.request.engagement_id === "string" ? params.request.engagement_id : null);

        const gateResultB = await pauseJobAtDecisionGate(supabase, params.jobId, params.organizationId, {
          phase: "health_assessment",
          entityIds: engagementId ? [engagementId] : [],
          partialResults: { healthScore, deliverySnapshot: resultData ?? {} },
          escalationQuestion,
          resumeInstruction: `Continue delivery-intelligence analysis with human decision: {human_response}`,
        });
        if (!gateResultB) {
          throw new Error("HITL gate (delivery-intelligence) failed to persist — aborting for safety");
        }

        await sendEscalationNotification(
          supabase,
          params.organizationId,
          params.jobId,
          escalationQuestion,
          "health_assessment",
          `Engagement health CRITICAL: ${healthScore}/100`
        );

        // Return early — Lambda exits cleanly, state preserved in DB
        return {
          result: {
            ...result,
            paused: true,
            pauseReason: "decision_gate",
            escalationQuestion,
            timing: { totalMs: durationMs },
          },
          artifactId: null,
        };
      }
    } catch (gateErr: any) {
      // Non-fatal — gate failure must never block domain result delivery
      logger.warn("[domain-executor] Decision Gate B (delivery-intelligence) threw (non-fatal):", gateErr?.message);
    }
  }

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
  ]).catch((e: unknown) => {
    // Non-blocking: feedback failure should NEVER break domain execution
    logger.warn("[domain-executor] Brain feedback bus failed (non-fatal):", e);
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

  // ── Step 6c: Mutation Verifier — fire-and-forget write verification ────
  // Verifies that domain side-effect writes actually landed in the DB.
  // Catches silent write failures (RLS denials, schema drift, constraint violations).
  void import("@/lib/brain/mutation-verifier").then(({ verifyWriteback }) =>
    verifyWriteback(
      { type: 'database_record', entityType: params.domainType, metadata: { operation: 'domain_side_effect' } },
      { organizationId: params.organizationId, domainType: params.domainType, confidence },
      supabase,
    )
  ).catch((e: unknown) => logger.warn("[se-aas/domain-executor] verifyWriteback failed (non-fatal):", e));

  // ── Step 6b: Boilerplate-scaffold → GitHub PR write-back (non-blocking) ──
  // If the caller provided repoOwner + repoName in the request and the
  // boilerplate domain generated files, create a GitHub branch + commit + PR.
  // Uses the org's GitHub connector credentials (decrypted via RPC).
  if (params.domainType === "boilerplate-scaffold") {
    _runBoilerplateGitHubWriteback(supabase, params.organizationId, params.request, result).catch(() => {
      // Non-blocking: GitHub write-back failure MUST NOT block the domain result
    });
  }

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

  void recordAgentOutcome(supabase, {
    agentId: rlTaskId,
    domain: params.domainType,
    taskDescription: JSON.stringify(params.request).slice(0, 200),
    resultSummary: JSON.stringify(result).slice(0, 500),
    quality: rlQuality,
    executionMs: durationMs,
    organizationId: params.organizationId,
    userId: params.userId,
    modelId: selectedModel,
    aiWorkerId: params.aiWorkerId ?? undefined,
  }).catch(() => {/* non-fatal */});

  void logAgentRetro({
    taskId: rlTaskId,
    agentType: params.domainType,
    prompt: JSON.stringify(params.request).slice(0, 100),
    status: rlQuality >= 0.5 ? "completed" : "partial",
    durationMs,
    modelUsed: "claude-sonnet-4-6",
    outputSummary: JSON.stringify(result).slice(0, 200),
  }).catch(() => {/* non-fatal */});

  // ── SOC2 Audit: log domain execution outcome (fire-and-forget) ──────────
  void logAuditEvent({
    organizationId: params.organizationId,
    userId: params.userId,
    action: AuditAction.DATA_CREATE,
    resourceType: "domain_execution",
    resourceId: params.jobId ?? params.organizationId,
    newValue: {
      domain: params.domainType,
      status: (result as Record<string, unknown>).success ? "completed" : "failed",
      quality: rlQuality,
      durationMs,
    },
  }).catch(() => {/* non-fatal */});

  // ADR-025: Record brain learning for ALL domains (no whitelist)
  void recordBrainLearning(supabase, {
    organizationId: params.organizationId,
    aiWorkerId: params.aiWorkerId,
    domain: params.domainType,
    taskDescription: `SE-aaS domain execution: ${params.domainType}`,
    qualityScore: rlQuality,
    executionMs: Date.now() - executionStartMs,
    result,
    outcomeLabel: rlQuality >= 0.7 ? "success" : rlQuality >= 0.4 ? "partial" : "failed",
  }).catch((err: unknown) =>
    logger.warn("[domain-executor] recordBrainLearning failed (non-fatal)", { err: String(err) })
  );

  // ── Step 9: RLVR Prediction Registration (fire-and-forget) ────────────
  // For early-warning results with high flight risk, record a prediction for
  // ground-truth verification 45 days later. The RLVR cron at 3 AM UTC will
  // re-measure actual outcomes and emit verified RL signals to cross_domain_signals.
  if (params.domainType === 'early-warning') {
    try {
      const resultObj = result as Record<string, unknown>;
      const flightRisk = (resultObj?.data as Record<string, unknown>)?.flight_risk_score;
      const engineerLogin = (resultObj?.data as Record<string, unknown>)?.engineer_login;
      if (typeof flightRisk === 'number' && flightRisk > 0.5) {
        void recordRlvrPrediction(supabase, params.organizationId, {
          domainType: 'early-warning',
          entityId: typeof engineerLogin === 'string' && engineerLogin ? engineerLogin : 'unknown',
          entityType: 'engineer',
          predictedValue: flightRisk,
          predictedOutcome: `Engineer flight risk at ${flightRisk.toFixed(2)} — may disengage within 45 days`,
          verifyAfterDays: 45,
          metadata: { rlTaskId, quality: rlQuality },
        });
      }
    } catch {
      // Non-fatal — RLVR recording must never block domain response
    }
  }

  // ── Step 10: Knowledge Extraction (ADR-019, ADR-026.2, fire-and-forget) ────────
  // After every domain execution with quality >= adaptive threshold, extract 1-2
  // reusable insights and store in federated_knowledge as workspace-specific rows.
  // Uses getDomainThreshold() for per-domain adaptive gating (replaces hardcoded 0.65).
  // Non-blocking — never delays or blocks the caller.
  let _kxThreshold = 0.65; // fallback default
  try {
    const { getDomainThreshold } = await import("@/lib/brain/agent-rl");
    _kxThreshold = await getDomainThreshold(
      params.domainType as any,
      params.organizationId,
      params.domainType
    );
  } catch {
    // Fallback to 0.65 if threshold lookup fails (non-fatal)
  }

  if (rlQuality >= _kxThreshold) {
    extractAndStoreKnowledge(supabase, {
      domain: params.domainType,
      taskType: params.domainType,
      inputSummary: JSON.stringify(params.request).slice(0, 200),
      outputSummary: JSON.stringify(result).slice(0, 200),
      qualityScore: rlQuality,
      orgId: params.organizationId,
      aiWorkerId: params.aiWorkerId ?? undefined,
    }).catch((err: unknown) =>
      logger.warn("[se-aas] knowledge extraction failed (non-fatal)", { error: String(err) })
    );
  }

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
  // Wrapped in try-catch: RLS INSERT policy is service_role-only; user-scoped client
  // will fail silently here. Must not block downstream side effects.
  try {
    await supabase.from('se_aas_metrics').insert({
      organization_id: organizationId,
      domain_type: domainType,
      confidence,
      execution_time_ms: durationMs,
      claude_powered: claudePowered,
      created_at: now,
    });
  } catch {
    // se_aas_metrics write failed — non-blocking
  }

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
// BOILERPLATE-SCAFFOLD — GitHub PR write-back (Step 6b)
// Runs after the domain executor returns a result. If repoOwner + repoName
// are in the request and the domain produced files[], create a branch, commit,
// and open a PR. All failures are non-fatal — the domain result is already
// returned to the caller before this runs.
// ============================================================================

async function _runBoilerplateGitHubWriteback(
  supabase: SupabaseClient,
  organizationId: string,
  request: Record<string, unknown>,
  result: Record<string, unknown>
): Promise<void> {
  const repoOwner = typeof request.repoOwner === "string" ? request.repoOwner : null;
  const repoName = typeof request.repoName === "string" ? request.repoName : null;

  // Skip write-back if no repo info was provided in the request
  if (!repoOwner || !repoName) return;

  // Fetch GitHub token via RPC decryption (never read .credentials directly)
  const githubCreds = await getConnectorCredentials(supabase, organizationId, "github");
  const githubToken = (githubCreds?.access_token as string | undefined)
    ?? (githubCreds?.token as string | undefined);

  if (!githubToken) {
    logger.warn("[domain-executor] boilerplate-scaffold write-back: no GitHub token found (skipping)", {
      orgId: organizationId,
    });
    return;
  }

  // Extract generated files from domain result
  // boilerplateScaffoldDomain returns result.data.files: BoilerplateFile[]
  const resultData = (result as Record<string, unknown>).data as Record<string, unknown> | undefined;
  const rawFiles = resultData?.files as Array<{ path: string; content: string }> | undefined;

  if (!rawFiles || rawFiles.length === 0) {
    logger.warn("[domain-executor] boilerplate-scaffold write-back: no files in domain result (skipping)", {
      orgId: organizationId,
      repoOwner,
      repoName,
    });
    return;
  }

  const scaffoldName = typeof request.name === "string" ? request.name : "scaffold";
  const slugName = scaffoldName.toLowerCase().replace(/[^a-z0-9]/g, "-").replace(/-{2,}/g, "-").slice(0, 40);
  const branchName = `agent/scaffold-${slugName}-${Date.now().toString(36)}`;

  const filesToCommit: GitHubFileToCommit[] = rawFiles
    .filter((f) => typeof f.path === "string" && typeof f.content === "string")
    .slice(0, 10) // cap at 10 files
    .map((f) => ({ path: f.path, content: f.content }));

  try {
    await createGitHubBranch(githubToken, repoOwner, repoName, branchName);
    logger.warn("[domain-executor] boilerplate-scaffold write-back: branch created", {
      branchName,
      repo: `${repoOwner}/${repoName}`,
    });
  } catch (branchErr) {
    logger.warn("[domain-executor] boilerplate-scaffold write-back: branch creation failed (non-fatal)", {
      error: branchErr instanceof Error ? branchErr.message : String(branchErr),
    });
    return;
  }

  try {
    await commitFilesToBranch(
      githubToken,
      repoOwner,
      repoName,
      branchName,
      filesToCommit,
      `feat: ${scaffoldName} scaffold [agent-generated]`
    );
  } catch (commitErr) {
    logger.warn("[domain-executor] boilerplate-scaffold write-back: commit failed (non-fatal)", {
      error: commitErr instanceof Error ? commitErr.message : String(commitErr),
    });
    return;
  }

  try {
    const pr = await createGitHubPR(
      githubToken,
      repoOwner,
      repoName,
      `feat: ${scaffoldName} scaffold`,
      `## ${scaffoldName} Boilerplate Scaffold\n\nGenerated by [BrainOS SE-aaS Boilerplate Generator](https://platform.usebrainos.com).\n\n**Files committed:** ${filesToCommit.length}\n**Branch:** \`${branchName}\`\n\n> Auto-generated scaffold — please review before merging.`,
      branchName
    );
    logger.warn("[domain-executor] boilerplate-scaffold write-back: PR created", {
      prNumber: pr.number,
      prUrl: pr.url,
      repo: `${repoOwner}/${repoName}`,
    });
  } catch (prErr) {
    logger.warn("[domain-executor] boilerplate-scaffold write-back: PR creation failed (non-fatal)", {
      error: prErr instanceof Error ? prErr.message : String(prErr),
    });
  }
}

// ============================================================================
// NOTE: assembleBrainContext() and feedBrainFromExecution() have been replaced
// by the shared Brain Context Mesh and Brain Feedback Bus from @nexus-ai/memory-stack.
// All services (Copilot, SE-aaS, AAS) now share one unified brain context layer.
// ============================================================================
