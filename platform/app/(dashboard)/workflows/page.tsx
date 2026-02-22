import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getCurrentWorkspaceId } from "@/lib/workspace-helpers";
import { WorkflowsClient } from "./workflows-client";
import { logger } from "@/lib/logger";

export const metadata = { title: "Workflows" };

export default async function WorkflowsPage() {
  const supabase = await createClient();
  const workspaceId = await getCurrentWorkspaceId();
  const { data: { user } } = await supabase.auth.getUser();

  const safe = <T,>(p: PromiseLike<{ data: T | null; error: any }>): Promise<{ data: T | null; error: any }> =>
    Promise.resolve(p).catch((err) => {
      logger.warn("[Workflows] Query failed:", err);
      return { data: null as T | null, error: err };
    });

  const [workflowsResult, runsResult] = await Promise.all([
    safe(supabase
      .from("workflows")
      .select("*")
      .eq("organization_id", workspaceId)
      .neq("status", "archived")
      .order("updated_at", { ascending: false })),
    safe(supabase
      .from("workflow_runs")
      .select("id, workflow_id, status, current_step, total_steps, started_at, completed_at, duration_ms")
      .eq("organization_id", workspaceId)
      .order("created_at", { ascending: false })
      .limit(20)),
  ]);

  const workflows = workflowsResult.data || [];
  const recentRuns = runsResult.data || [];

  // Stats
  const runningCount = recentRuns.filter(r => r.status === "running" || r.status === "paused").length;
  const totalCompleted = recentRuns.filter(r => r.status === "completed").length;
  const totalFailed = recentRuns.filter(r => r.status === "failed").length;

  return (
    <WorkflowsClient
      workflows={workflows}
      recentRuns={recentRuns}
      stats={{ total: workflows.length, running: runningCount, completed: totalCompleted, failed: totalFailed }}
      workspaceId={workspaceId}
      userId={user?.id || ""}
    />
  );
}
