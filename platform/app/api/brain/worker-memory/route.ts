import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspaceId } from "@/lib/workspace-helpers";
import { logger } from "@/lib/logger";

// Must be force-dynamic: reads auth cookies + workspace context per request
export const dynamic = "force-dynamic";

/**
 * GET /api/brain/worker-memory
 *
 * Returns memory/context usage estimates for all active AI worker tasks
 * belonging to the current org. Used by WorkerMemoryBanner to surface
 * workers that are approaching their context window limit.
 *
 * Response:
 *   {
 *     workers: Array<{
 *       taskId, agentType, status, startedAt,
 *       stepCount, estimatedTokens, usagePercent, needsCleanup
 *     }>,
 *     totalActiveWorkers: number,
 *     workersNeedingCleanup: number,
 *     systemMemoryPercent: number,   // average usagePercent across active workers
 *   }
 */

const AVG_TOKENS_PER_STEP = 800;
const MAX_TOKENS = 200_000;
const CLEANUP_THRESHOLD = 0.6; // 60%

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const workspaceId = await getCurrentWorkspaceId();

    // Fetch active tasks from the last 24 hours
    const { data: tasks, error: tasksError } = await supabase
      .from("brain_agent_tasks")
      .select("id, agent_type, prompt, status, started_at, created_at")
      .eq("organization_id", workspaceId)
      .in("status", ["running", "pending", "awaiting_approval"])
      .gte(
        "created_at",
        new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
      )
      .order("created_at", { ascending: false })
      .limit(20);

    if (tasksError) {
      logger.error("[worker-memory] Error fetching tasks:", tasksError);
      return NextResponse.json({ error: "Failed to fetch tasks" }, { status: 500 });
    }

    const activeTasks = tasks ?? [];

    // No tasks — return empty summary
    if (activeTasks.length === 0) {
      return NextResponse.json({
        workers: [],
        totalActiveWorkers: 0,
        workersNeedingCleanup: 0,
        systemMemoryPercent: 0,
      });
    }

    const taskIds = activeTasks.map((t) => t.id);

    // Count steps per task to estimate token usage
    const { data: stepCounts, error: stepsError } = await supabase
      .from("brain_agent_steps")
      .select("task_id, created_at")
      .in("task_id", taskIds);

    if (stepsError) {
      logger.error("[worker-memory] Error fetching steps:", stepsError);
    }

    // Group step data by task_id
    const stepsByTask = new Map<
      string,
      { count: number; lastStepAt: string | null }
    >();

    for (const row of stepCounts ?? []) {
      const existing = stepsByTask.get(row.task_id);
      if (!existing) {
        stepsByTask.set(row.task_id, { count: 1, lastStepAt: row.created_at });
      } else {
        existing.count += 1;
        if (
          row.created_at &&
          (!existing.lastStepAt || row.created_at > existing.lastStepAt)
        ) {
          existing.lastStepAt = row.created_at;
        }
      }
    }

    // Build per-worker memory estimates
    const workers = activeTasks.map((task) => {
      const steps = stepsByTask.get(task.id) ?? { count: 0, lastStepAt: null };
      const estimatedTokens = steps.count * AVG_TOKENS_PER_STEP;
      const usagePercent = Math.min(
        100,
        Math.round((estimatedTokens / MAX_TOKENS) * 100)
      );
      const needsCleanup = usagePercent >= CLEANUP_THRESHOLD * 100;

      return {
        taskId: task.id,
        agentType: task.agent_type ?? "unknown",
        status: task.status,
        startedAt: task.started_at ?? task.created_at,
        stepCount: steps.count,
        estimatedTokens,
        usagePercent,
        needsCleanup,
      };
    });

    const workersNeedingCleanup = workers.filter((w) => w.needsCleanup).length;
    const systemMemoryPercent =
      workers.length > 0
        ? Math.round(
            workers.reduce((sum, w) => sum + w.usagePercent, 0) / workers.length
          )
        : 0;

    return NextResponse.json({
      workers,
      totalActiveWorkers: workers.length,
      workersNeedingCleanup,
      systemMemoryPercent,
    });
  } catch (err) {
    logger.error("[worker-memory] Error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
