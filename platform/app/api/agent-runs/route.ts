import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspaceId } from "@/lib/workspace-helpers";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const workspaceId = await getCurrentWorkspaceId();
    const { searchParams } = new URL(request.url);
    const hours = parseInt(searchParams.get("hours") || "72");
    const agentFilter = searchParams.get("agent") || null;

    const since = new Date(Date.now() - hours * 3600 * 1000).toISOString();

    // Fetch all data sources in parallel
    const [
      activityResult,
      agentRunsResult,
      scheduledJobsResult,
      queueResult,
      consolidationResult,
      obsAgentResult,
    ] = await Promise.all([
      // 1. ai_agent_activity — general agent activity log
      supabase
        .from("ai_agent_activity")
        .select(
          "id, agent_type, run_id, action_type, input_summary, output_summary, tokens_used, duration_ms, status, metadata, created_at"
        )
        .eq("organization_id", workspaceId)
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(200),

      // 2. agent_run_history — progressive learning runs
      supabase
        .from("agent_run_history")
        .select(
          "id, agent_name, agent_version, status, signals_stored, packs_processed, discoveries, run_mode, completed_at, created_at"
        )
        .eq("organization_id", workspaceId)
        .gte("created_at", since)
        .order("completed_at", { ascending: false })
        .limit(100),

      // 3. scheduled_jobs — job schedules and next runs
      supabase
        .from("scheduled_jobs")
        .select(
          "id, job_name, job_type, schedule, enabled, last_run_at, next_run_at, run_count, error_count, last_error, config"
        )
        .eq("organization_id", workspaceId)
        .order("job_name"),

      // 4. agent_queue — pending/running tasks
      supabase
        .from("agent_queue")
        .select(
          "id, agent_type, task_type, priority, status, error_message, started_at, completed_at, created_at"
        )
        .eq("organization_id", workspaceId)
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(50),

      // 5. consolidation_runs — brain sleep cycles
      supabase
        .from("consolidation_runs")
        .select(
          "id, is_core_brain, started_at, completed_at, total_duration_ms, status, report, errors"
        )
        .eq("organization_id", workspaceId)
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(20),

      // 6. obs_agent_executions — detailed observability
      supabase
        .from("obs_agent_executions")
        .select(
          "id, agent_type, agent_level, agent_run_id, trigger_type, causal_edges_used, patterns_used, memories_retrieved, actions_generated, motor_commands_issued, predictions_made, status, output_summary, error_message, execution_latency_ms, tokens_consumed, llm_calls_made, cost_usd, started_at, completed_at"
        )
        .eq("organization_id", workspaceId)
        .gte("created_at", since)
        .order("started_at", { ascending: false })
        .limit(200),
    ]);

    // Build unified run timeline by merging all sources
    const runs = buildUnifiedTimeline(
      activityResult.data || [],
      agentRunsResult.data || [],
      consolidationResult.data || [],
      obsAgentResult.data || []
    );

    // Apply agent filter if specified
    const filteredRuns = agentFilter
      ? runs.filter(
          (r) =>
            r.agentType.toLowerCase().includes(agentFilter.toLowerCase())
        )
      : runs;

    // Compute summary stats
    const stats = computeStats(filteredRuns);

    // Build agent-level summaries
    const agentSummaries = buildAgentSummaries(
      filteredRuns,
      scheduledJobsResult.data || []
    );

    return NextResponse.json({
      runs: filteredRuns.slice(0, 100),
      stats,
      agentSummaries,
      scheduledJobs: scheduledJobsResult.data || [],
      queuedTasks: queueResult.data || [],
      timeRange: { since, hours },
    });
  } catch (error: any) {
    logger.error("Agent runs API error:", error);
    return NextResponse.json(
      { error: error.message || "Internal error" },
      { status: 500 }
    );
  }
}

interface UnifiedRun {
  id: string;
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
  source: "activity" | "run_history" | "consolidation" | "observability";
}

function buildUnifiedTimeline(
  activities: any[],
  runHistory: any[],
  consolidations: any[],
  obsExecutions: any[]
): UnifiedRun[] {
  const runs: UnifiedRun[] = [];
  const seen = new Set<string>();

  // Obs executions are the richest source — use them first
  for (const obs of obsExecutions) {
    const key = `${obs.agent_type}-${obs.started_at}`;
    if (seen.has(key)) continue;
    seen.add(key);

    runs.push({
      id: obs.id,
      agentType: obs.agent_type,
      status: obs.status,
      startedAt: obs.started_at,
      completedAt: obs.completed_at,
      durationMs: obs.execution_latency_ms,
      tokensUsed: obs.tokens_consumed || 0,
      costUsd: obs.cost_usd ? parseFloat(obs.cost_usd) : null,
      outputSummary: obs.output_summary,
      errorMessage: obs.error_message,
      signalsGenerated: obs.actions_generated || 0,
      discoveries: obs.predictions_made || 0,
      source: "observability",
    });
  }

  // Agent activity log
  for (const act of activities) {
    const key = `${act.agent_type}-${act.created_at}`;
    if (seen.has(key)) continue;
    seen.add(key);

    runs.push({
      id: act.id,
      agentType: act.agent_type,
      status: act.status || "success",
      startedAt: act.created_at,
      completedAt: act.created_at,
      durationMs: act.duration_ms,
      tokensUsed: act.tokens_used || 0,
      costUsd: null,
      outputSummary: act.output_summary,
      errorMessage:
        act.metadata?.errors?.[0] || null,
      signalsGenerated:
        act.metadata?.signalsGenerated || 0,
      discoveries: 0,
      source: "activity",
    });
  }

  // Run history
  for (const rh of runHistory) {
    const key = `${rh.agent_name}-${rh.completed_at}`;
    if (seen.has(key)) continue;
    seen.add(key);

    runs.push({
      id: rh.id,
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

  // Consolidation runs
  for (const cr of consolidations) {
    const key = `consolidation-${cr.started_at}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const report = cr.report || {};
    runs.push({
      id: cr.id,
      agentType: "consolidation",
      status: cr.status,
      startedAt: cr.started_at,
      completedAt: cr.completed_at,
      durationMs: cr.total_duration_ms,
      tokensUsed: 0,
      costUsd: null,
      outputSummary: report.narrative || `Consolidation ${cr.status}`,
      errorMessage:
        cr.errors?.length > 0 ? cr.errors[0]?.message : null,
      signalsGenerated: 0,
      discoveries: report.newEdgesDiscovered || 0,
      source: "consolidation",
    });
  }

  // Sort by most recent first
  runs.sort(
    (a, b) =>
      new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
  );

  return runs;
}

function computeStats(runs: UnifiedRun[]) {
  const total = runs.length;
  const successful = runs.filter((r) => r.status === "success").length;
  const failed = runs.filter((r) => r.status === "failed").length;
  const partial = runs.filter((r) => r.status === "partial").length;

  const avgDuration =
    runs.filter((r) => r.durationMs).reduce((sum, r) => sum + (r.durationMs || 0), 0) /
    (runs.filter((r) => r.durationMs).length || 1);

  const totalTokens = runs.reduce((sum, r) => sum + r.tokensUsed, 0);
  const totalCost = runs
    .filter((r) => r.costUsd)
    .reduce((sum, r) => sum + (r.costUsd || 0), 0);

  const totalSignals = runs.reduce((sum, r) => sum + r.signalsGenerated, 0);
  const totalDiscoveries = runs.reduce((sum, r) => sum + r.discoveries, 0);

  const successRate = total > 0 ? Math.round((successful / total) * 100) : 0;

  return {
    total,
    successful,
    failed,
    partial,
    successRate,
    avgDurationMs: Math.round(avgDuration),
    totalTokens,
    totalCost: Math.round(totalCost * 1000) / 1000,
    totalSignals,
    totalDiscoveries,
  };
}

function buildAgentSummaries(runs: UnifiedRun[], scheduledJobs: any[]) {
  const byAgent = new Map<string, UnifiedRun[]>();
  for (const run of runs) {
    const existing = byAgent.get(run.agentType) || [];
    existing.push(run);
    byAgent.set(run.agentType, existing);
  }

  const summaries = [];
  for (const [agentType, agentRuns] of byAgent.entries()) {
    const successful = agentRuns.filter((r) => r.status === "success").length;
    const failed = agentRuns.filter((r) => r.status === "failed").length;
    const lastRun = agentRuns[0];
    const durations = agentRuns
      .filter((r) => r.durationMs)
      .map((r) => r.durationMs!);
    const avgDuration =
      durations.length > 0
        ? durations.reduce((a, b) => a + b, 0) / durations.length
        : null;

    // Find matching scheduled job
    const job = scheduledJobs.find(
      (j) =>
        j.job_name.includes(agentType) ||
        agentType.includes(j.job_name)
    );

    summaries.push({
      agentType,
      totalRuns: agentRuns.length,
      successful,
      failed,
      successRate:
        agentRuns.length > 0
          ? Math.round((successful / agentRuns.length) * 100)
          : 0,
      lastRun: lastRun
        ? {
            status: lastRun.status,
            startedAt: lastRun.startedAt,
            durationMs: lastRun.durationMs,
            errorMessage: lastRun.errorMessage,
          }
        : null,
      avgDurationMs: avgDuration ? Math.round(avgDuration) : null,
      totalTokens: agentRuns.reduce((s, r) => s + r.tokensUsed, 0),
      nextRun: job?.next_run_at || null,
      schedule: job?.schedule || null,
      enabled: job?.enabled ?? true,
    });
  }

  // Sort by most recent run
  summaries.sort((a, b) => {
    const aTime = a.lastRun ? new Date(a.lastRun.startedAt).getTime() : 0;
    const bTime = b.lastRun ? new Date(b.lastRun.startedAt).getTime() : 0;
    return bTime - aTime;
  });

  return summaries;
}
