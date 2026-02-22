import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getCurrentWorkspaceId } from "@/lib/workspace-helpers";
import { TaskQueueClient } from "./task-queue-client";
import { logger } from "@/lib/logger";

export const metadata = { title: "Task Queue" };

export default async function TaskQueuePage() {
  const supabase = await createClient();
  const workspaceId = await getCurrentWorkspaceId();
  const service = await createServiceClient();

  const safe = <T,>(p: PromiseLike<{ data: T | null; error: any }>): Promise<{ data: T | null; error: any }> =>
    Promise.resolve(p).catch((err) => {
      logger.warn("[TaskQueue] Query failed:", err);
      return { data: null as T | null, error: err };
    });

  // Fetch stats + recent tasks in parallel
  const [tasksResult, statsResult] = await Promise.all([
    safe(service
      .from("brain_agent_tasks")
      .select("id, prompt, agent_type, status, confidence_score, result_summary, result_artifacts, error_message, created_at, completed_at, started_at, result_metadata, proposed_action")
      .eq("organization_id", workspaceId)
      .order("created_at", { ascending: false })
      .limit(50)),
    safe(service
      .rpc("get_task_queue_stats", { org_id: workspaceId })
    ),
  ]);

  const tasks = tasksResult.data || [];

  // Compute stats client-side if RPC not available
  const stats = statsResult.data || {
    running: tasks.filter(t => t.status === "running").length,
    pending: tasks.filter(t => t.status === "pending").length,
    awaiting_approval: tasks.filter(t => t.status === "awaiting_approval").length,
    completed: tasks.filter(t => t.status === "completed").length,
    failed: tasks.filter(t => t.status === "failed").length,
  };

  return (
    <TaskQueueClient
      initialTasks={tasks}
      stats={stats}
      workspaceId={workspaceId}
    />
  );
}
