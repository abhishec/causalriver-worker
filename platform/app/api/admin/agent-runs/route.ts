import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * Admin-level agent runs API — shows ALL orgs (platform-wide view).
 * Requires platform admin access.
 */
export async function GET(request: NextRequest) {
  let supabase: Awaited<ReturnType<typeof createClient>>;
  try {
    supabase = await createClient();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  let user = null;
  try {
    const { data: _routeAuthData } = await supabase.auth.getUser();
    user = _routeAuthData.user;
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {

    // Verify platform admin
    const { data: member } = await supabase
      .from("org_members")
      .select("is_platform_admin")
      .eq("user_id", user.id)
      .eq("is_platform_admin", true)
      .maybeSingle();

    if (!member) {
      return NextResponse.json({ error: "Forbidden — platform admin required" }, { status: 403 });
    }

    // Use service/admin client for all cross-tenant queries — user-scoped client
    // has RLS enabled which would filter results to only the admin's own orgs.
    const adminClient = getAdminClient();

    const { searchParams } = new URL(request.url);
    const hours = parseInt(searchParams.get("hours") || "72", 10) || 72;
    const orgFilter = searchParams.get("org") || null;
    const agentFilter = searchParams.get("agent") || null;

    const since = new Date(Date.now() - hours * 3600 * 1000).toISOString();

    // Fetch orgs for display names
    const { data: orgs } = await adminClient
      .from("organizations")
      .select("id, name, slug, is_core_brain")
      .order("is_core_brain", { ascending: false });

    const orgMap = new Map(
      (orgs || []).map((o) => [o.id, { name: o.name, slug: o.slug, isCore: o.is_core_brain }])
    );

    // Build base queries — NO org filter (cross-org), unless orgFilter is set
    const addOrgFilter = (query: any) => {
      if (orgFilter) return query.eq("organization_id", orgFilter);
      return query;
    };

    const [
      activityResult,
      agentRunsResult,
      scheduledJobsResult,
      queueResult,
      consolidationResult,
      obsAgentResult,
    ] = await Promise.all([
      addOrgFilter(
        adminClient
          .from("ai_agent_activity")
          .select(
            "id, organization_id, agent_type, run_id, action_type, output_summary, tokens_used, duration_ms, status, metadata, created_at"
          )
          .gte("created_at", since)
          .order("created_at", { ascending: false })
          .limit(300)
      ),

      addOrgFilter(
        adminClient
          .from("agent_run_history")
          .select(
            "id, organization_id, agent_name, agent_version, status, signals_stored, packs_processed, discoveries, run_mode, completed_at, created_at"
          )
          .gte("created_at", since)
          .order("completed_at", { ascending: false })
          .limit(200)
      ),

      addOrgFilter(
        adminClient
          .from("scheduled_jobs")
          .select(
            "id, organization_id, job_name, job_type, schedule, enabled, last_run_at, next_run_at, run_count, error_count, last_error"
          )
          .order("job_name")
      ),

      addOrgFilter(
        adminClient
          .from("agent_queue")
          .select(
            "id, organization_id, agent_type, task_type, priority, status, error_message, started_at, completed_at, created_at"
          )
          .gte("created_at", since)
          .order("created_at", { ascending: false })
          .limit(50)
      ),

      addOrgFilter(
        adminClient
          .from("consolidation_runs")
          .select(
            "id, organization_id, is_core_brain, started_at, completed_at, total_duration_ms, status, report, errors"
          )
          .gte("created_at", since)
          .order("created_at", { ascending: false })
          .limit(30)
      ),

      addOrgFilter(
        adminClient
          .from("obs_agent_executions")
          .select(
            "id, organization_id, agent_type, agent_level, agent_run_id, trigger_type, status, output_summary, error_message, execution_latency_ms, tokens_consumed, llm_calls_made, cost_usd, started_at, completed_at"
          )
          .gte("created_at", since)
          .order("started_at", { ascending: false })
          .limit(300)
      ),
    ]);

    // Build unified timeline (same logic as org-scoped, but includes org info)
    const runs = buildAdminTimeline(
      activityResult.data || [],
      agentRunsResult.data || [],
      consolidationResult.data || [],
      obsAgentResult.data || [],
      orgMap
    );

    // Apply agent filter
    const filteredRuns = agentFilter
      ? runs.filter((r) => r.agentType.toLowerCase().includes(agentFilter.toLowerCase()))
      : runs;

    // Compute stats
    const stats = computeStats(filteredRuns);

    // Per-org breakdown
    const byOrg = buildOrgBreakdown(filteredRuns, orgMap);

    // Per-agent breakdown
    const byAgent = buildAgentBreakdown(filteredRuns, scheduledJobsResult.data || []);

    return NextResponse.json({
      runs: filteredRuns.slice(0, 150),
      stats,
      byOrg,
      byAgent,
      orgs: orgs || [],
      scheduledJobs: scheduledJobsResult.data || [],
      queuedTasks: queueResult.data || [],
      timeRange: { since, hours },
    });
  } catch (error: any) {
    logger.error("Admin agent runs API error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

interface AdminRun {
  id: string;
  orgId: string;
  orgName: string;
  orgSlug: string;
  isCoreBrain: boolean;
  agentType: string;
  status: "success" | "partial" | "failed";
  startedAt: string;
  completedAt: string | null;
  durationMs: number | null;
  tokensUsed: number;
  costUsd: number | null;
  outputSummary: string | null;
  errorMessage: string | null;
  signalsGenerated: number;
  discoveries: number;
  source: string;
}

function buildAdminTimeline(
  activities: any[],
  runHistory: any[],
  consolidations: any[],
  obsExecutions: any[],
  orgMap: Map<string, { name: string; slug: string; isCore: boolean }>
): AdminRun[] {
  const runs: AdminRun[] = [];
  const seen = new Set<string>();

  const getOrg = (orgId: string) =>
    orgMap.get(orgId) || { name: "Unknown", slug: "unknown", isCore: false };

  for (const obs of obsExecutions) {
    const key = `${obs.agent_type}-${obs.started_at}-${obs.organization_id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const org = getOrg(obs.organization_id);
    runs.push({
      id: obs.id,
      orgId: obs.organization_id,
      orgName: org.name,
      orgSlug: org.slug,
      isCoreBrain: org.isCore,
      agentType: obs.agent_type,
      status: obs.status,
      startedAt: obs.started_at,
      completedAt: obs.completed_at,
      durationMs: obs.execution_latency_ms,
      tokensUsed: obs.tokens_consumed || 0,
      costUsd: obs.cost_usd ? parseFloat(obs.cost_usd) : null,
      outputSummary: obs.output_summary,
      errorMessage: obs.error_message,
      signalsGenerated: 0,
      discoveries: 0,
      source: "observability",
    });
  }

  for (const act of activities) {
    const key = `${act.agent_type}-${act.created_at}-${act.organization_id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const org = getOrg(act.organization_id);
    runs.push({
      id: act.id,
      orgId: act.organization_id,
      orgName: org.name,
      orgSlug: org.slug,
      isCoreBrain: org.isCore,
      agentType: act.agent_type,
      status: act.status || "success",
      startedAt: act.created_at,
      completedAt: act.created_at,
      durationMs: act.duration_ms,
      tokensUsed: act.tokens_used || 0,
      costUsd: null,
      outputSummary: act.output_summary,
      errorMessage: act.metadata?.errors?.[0] || null,
      signalsGenerated: act.metadata?.signalsGenerated || 0,
      discoveries: 0,
      source: "activity",
    });
  }

  for (const rh of runHistory) {
    const key = `${rh.agent_name}-${rh.completed_at}-${rh.organization_id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const org = getOrg(rh.organization_id);
    runs.push({
      id: rh.id,
      orgId: rh.organization_id,
      orgName: org.name,
      orgSlug: org.slug,
      isCoreBrain: org.isCore,
      agentType: rh.agent_name,
      status: rh.status,
      startedAt: rh.created_at,
      completedAt: rh.completed_at,
      durationMs: null,
      tokensUsed: 0,
      costUsd: null,
      outputSummary: `${rh.signals_stored} signals, ${rh.packs_processed} packs, ${rh.discoveries} discoveries (${rh.run_mode})`,
      errorMessage: null,
      signalsGenerated: rh.signals_stored || 0,
      discoveries: rh.discoveries || 0,
      source: "run_history",
    });
  }

  for (const cr of consolidations) {
    const key = `consolidation-${cr.started_at}-${cr.organization_id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const org = getOrg(cr.organization_id);
    runs.push({
      id: cr.id,
      orgId: cr.organization_id,
      orgName: org.name,
      orgSlug: org.slug,
      isCoreBrain: org.isCore || cr.is_core_brain,
      agentType: "consolidation",
      status: cr.status,
      startedAt: cr.started_at,
      completedAt: cr.completed_at,
      durationMs: cr.total_duration_ms,
      tokensUsed: 0,
      costUsd: null,
      outputSummary: cr.report?.narrative || `Consolidation ${cr.status}`,
      errorMessage: cr.errors?.length > 0 ? cr.errors[0]?.message : null,
      signalsGenerated: 0,
      discoveries: cr.report?.newEdgesDiscovered || 0,
      source: "consolidation",
    });
  }

  runs.sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
  return runs;
}

function computeStats(runs: AdminRun[]) {
  const total = runs.length;
  const successful = runs.filter((r) => r.status === "success").length;
  const failed = runs.filter((r) => r.status === "failed").length;
  const partial = runs.filter((r) => r.status === "partial").length;
  const withDuration = runs.filter((r) => r.durationMs);
  const avgDuration = withDuration.reduce((s, r) => s + (r.durationMs || 0), 0) / (withDuration.length || 1);
  const totalTokens = runs.reduce((s, r) => s + r.tokensUsed, 0);
  const totalCost = runs.filter((r) => r.costUsd).reduce((s, r) => s + (r.costUsd || 0), 0);
  const uniqueOrgs = new Set(runs.map((r) => r.orgId)).size;
  const uniqueAgents = new Set(runs.map((r) => r.agentType)).size;

  return {
    total,
    successful,
    failed,
    partial,
    successRate: total > 0 ? Math.round((successful / total) * 100) : 0,
    avgDurationMs: Math.round(avgDuration),
    totalTokens,
    totalCost: Math.round(totalCost * 1000) / 1000,
    uniqueOrgs,
    uniqueAgents,
  };
}

function buildOrgBreakdown(
  runs: AdminRun[],
  orgMap: Map<string, { name: string; slug: string; isCore: boolean }>
) {
  const byOrg = new Map<string, AdminRun[]>();
  for (const run of runs) {
    const existing = byOrg.get(run.orgId) || [];
    existing.push(run);
    byOrg.set(run.orgId, existing);
  }

  return Array.from(byOrg.entries()).map(([orgId, orgRuns]) => {
    const org = orgMap.get(orgId) || { name: "Unknown", slug: "unknown", isCore: false };
    const successful = orgRuns.filter((r) => r.status === "success").length;
    return {
      orgId,
      orgName: org.name,
      orgSlug: org.slug,
      isCore: org.isCore,
      totalRuns: orgRuns.length,
      successful,
      failed: orgRuns.filter((r) => r.status === "failed").length,
      successRate: orgRuns.length > 0 ? Math.round((successful / orgRuns.length) * 100) : 0,
      lastRun: orgRuns[0]?.startedAt || null,
    };
  }).sort((a, b) => (b.isCore ? 1 : 0) - (a.isCore ? 1 : 0) || b.totalRuns - a.totalRuns);
}

function buildAgentBreakdown(runs: AdminRun[], scheduledJobs: any[]) {
  const byAgent = new Map<string, AdminRun[]>();
  for (const run of runs) {
    const existing = byAgent.get(run.agentType) || [];
    existing.push(run);
    byAgent.set(run.agentType, existing);
  }

  return Array.from(byAgent.entries()).map(([agentType, agentRuns]) => {
    const successful = agentRuns.filter((r) => r.status === "success").length;
    const durations = agentRuns.filter((r) => r.durationMs).map((r) => r.durationMs!);
    const avgDuration = durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : null;
    const orgs = new Set(agentRuns.map((r) => r.orgId));

    return {
      agentType,
      totalRuns: agentRuns.length,
      successful,
      failed: agentRuns.filter((r) => r.status === "failed").length,
      successRate: agentRuns.length > 0 ? Math.round((successful / agentRuns.length) * 100) : 0,
      avgDurationMs: avgDuration ? Math.round(avgDuration) : null,
      orgsActive: orgs.size,
      lastRun: agentRuns[0] ? { status: agentRuns[0].status, startedAt: agentRuns[0].startedAt, errorMessage: agentRuns[0].errorMessage } : null,
    };
  }).sort((a, b) => b.totalRuns - a.totalRuns);
}
