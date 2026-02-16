import { createServiceClient } from "@/lib/supabase/server";
import { SystemClient } from "./system-client";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "System Status",
};

/**
 * Real system health checks — queries Supabase, validates env vars,
 * checks scheduled jobs, and reports actual infrastructure state.
 */
export default async function AdminSystemPage() {
  const supabase = await createServiceClient();

  // ── Run all health checks in parallel ──────────────────────────────
  const [
    supabaseCheck,
    scheduledJobsResult,
    recentConsolidationsResult,
    recentAgentRunsResult,
    signalCountResult,
    edgeCountResult,
  ] = await Promise.all([
    // 1. Supabase connectivity: simple query
    supabase
      .from("organizations")
      .select("id", { count: "exact", head: true })
      .then(({ count, error }) => ({
        healthy: !error,
        detail: error ? error.message : `${count} organizations`,
      })),

    // 2. Scheduled jobs (from agent_queue or scheduled_jobs)
    supabase
      .from("scheduled_jobs")
      .select("id, job_type, schedule, last_run_at, next_run_at, status")
      .order("next_run_at", { ascending: true })
      .limit(20),

    // 3. Recent consolidation runs (real training activity)
    supabase
      .from("consolidation_runs")
      .select("id, status, started_at, completed_at, training_packs_applied, new_edges_discovered")
      .order("started_at", { ascending: false })
      .limit(5),

    // 4. Recent agent activity (real agent runs)
    supabase
      .from("obs_agent_executions")
      .select("id, agent_type, status, started_at, completed_at, error_message")
      .order("started_at", { ascending: false })
      .limit(10),

    // 5. Total signal count (data pipeline health)
    supabase
      .from("cross_domain_signals")
      .select("id", { count: "exact", head: true }),

    // 6. Total causal edge count (brain health)
    supabase
      .from("causal_relationships_statistical")
      .select("id", { count: "exact", head: true }),
  ]);

  // ── Env var validation (check if required keys are set) ────────────
  const envChecks = [
    { name: "NEXT_PUBLIC_SUPABASE_URL", set: !!process.env.NEXT_PUBLIC_SUPABASE_URL },
    { name: "SUPABASE_SERVICE_ROLE_KEY", set: !!process.env.SUPABASE_SERVICE_ROLE_KEY },
    { name: "NEXT_PUBLIC_SUPABASE_ANON_KEY", set: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY },
    { name: "ANTHROPIC_API_KEY", set: !!process.env.ANTHROPIC_API_KEY },
    { name: "OPENAI_API_KEY", set: !!process.env.OPENAI_API_KEY },
    { name: "NEXUS_WEBHOOK_SECRET", set: !!process.env.NEXUS_WEBHOOK_SECRET },
    { name: "NEXUS_INTERNAL_API_KEY", set: !!process.env.NEXUS_INTERNAL_API_KEY },
    { name: "GITHUB_APP_ID", set: !!process.env.GITHUB_APP_ID },
    { name: "FRED_API_KEY", set: !!process.env.FRED_API_KEY },
  ];

  // ── Build service health status ────────────────────────────────────
  const services = [
    {
      name: "Supabase",
      healthy: supabaseCheck.healthy,
      detail: supabaseCheck.detail,
    },
    {
      name: "Signals Pipeline",
      healthy: !signalCountResult.error,
      detail: signalCountResult.error
        ? signalCountResult.error.message
        : `${signalCountResult.count?.toLocaleString() || 0} total signals`,
    },
    {
      name: "Causal Brain",
      healthy: !edgeCountResult.error,
      detail: edgeCountResult.error
        ? edgeCountResult.error.message
        : `${edgeCountResult.count?.toLocaleString() || 0} causal edges`,
    },
    {
      name: "Agent Runtime",
      healthy: !recentAgentRunsResult.error,
      detail: recentAgentRunsResult.error
        ? recentAgentRunsResult.error.message
        : `${recentAgentRunsResult.data?.length || 0} recent runs`,
    },
    {
      name: "Training Pipeline",
      healthy: !recentConsolidationsResult.error,
      detail: recentConsolidationsResult.error
        ? recentConsolidationsResult.error.message
        : `${recentConsolidationsResult.data?.length || 0} recent consolidations`,
    },
  ];

  // ── Scheduled jobs ─────────────────────────────────────────────────
  const scheduledJobs = (scheduledJobsResult.data || []).map((job: any) => ({
    id: job.id,
    type: job.job_type,
    schedule: job.schedule,
    lastRun: job.last_run_at,
    nextRun: job.next_run_at,
    status: job.status,
  }));

  // ── Recent consolidations ──────────────────────────────────────────
  const recentConsolidations = (recentConsolidationsResult.data || []).map((run: any) => ({
    id: run.id,
    status: run.status,
    startedAt: run.started_at,
    completedAt: run.completed_at,
    packsApplied: run.training_packs_applied,
    edgesDiscovered: run.new_edges_discovered,
  }));

  // ── Recent agent runs ──────────────────────────────────────────────
  const recentAgentRuns = (recentAgentRunsResult.data || []).map((run: any) => ({
    id: run.id,
    agentType: run.agent_type,
    status: run.status,
    startedAt: run.started_at,
    completedAt: run.completed_at,
    error: run.error_message,
  }));

  return (
    <SystemClient
      services={services}
      envChecks={envChecks}
      scheduledJobs={scheduledJobs}
      recentConsolidations={recentConsolidations}
      recentAgentRuns={recentAgentRuns}
    />
  );
}
