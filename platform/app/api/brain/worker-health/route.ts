export const dynamic = "force-dynamic";
/**
 * GET /api/brain/worker-health
 *
 * Returns current job queue health stats for the authenticated org.
 * Used by AgentLiveMonitor dashboard card.
 *
 * Response:
 *   {
 *     pendingJobs: number;
 *     runningJobs: number;
 *     succeededLast1h: number;
 *     failedLast1h: number;
 *     recentJobs: Array<{
 *       id, taskType, status, createdAt, completedAt, durationMs, hasArtifact
 *     }>;
 *   }
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { getCurrentWorkspaceId } from "@/lib/workspace-helpers";
import { logger } from "@/lib/logger";

export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const workspaceId = await getCurrentWorkspaceId();
    if (!workspaceId) {
      return NextResponse.json({
        pendingJobs: 0,
        runningJobs: 0,
        succeededLast1h: 0,
        failedLast1h: 0,
        recentJobs: [],
      });
    }

    const admin = getAdminClient();
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

    // Pending count — guard against missing agent_queue table
    let pendingCount = 0;
    try {
      const { count, error } = await admin
        .from("agent_queue")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", workspaceId)
        .eq("status", "pending");
      if (!error) pendingCount = count ?? 0;
      else logger.warn("[worker-health] pending query error:", error.message);
    } catch (e) {
      logger.warn("[worker-health] agent_queue (pending) unavailable:", e);
    }

    // Running count
    let runningCount = 0;
    try {
      const { count, error } = await admin
        .from("agent_queue")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", workspaceId)
        .eq("status", "running");
      if (!error) runningCount = count ?? 0;
      else logger.warn("[worker-health] running query error:", error.message);
    } catch (e) {
      logger.warn("[worker-health] agent_queue (running) unavailable:", e);
    }

    // Recent jobs (last 10)
    type QueueRow = {
      id: string;
      task_type: string;
      status: string;
      created_at: string;
      started_at: string | null;
      completed_at: string | null;
    };
    let recentRows: QueueRow[] = [];
    try {
      const { data, error } = await admin
        .from("agent_queue")
        .select("id, task_type, status, created_at, started_at, completed_at")
        .eq("organization_id", workspaceId)
        .order("created_at", { ascending: false })
        .limit(10);
      if (!error) recentRows = (data ?? []) as QueueRow[];
      else logger.warn("[worker-health] recent jobs query error:", error.message);
    } catch (e) {
      logger.warn("[worker-health] agent_queue (recent) unavailable:", e);
    }

    // Artifact job IDs — guard against missing se_aas_artifacts table
    let jobsWithArtifacts = new Set<string>();
    try {
      const { data, error } = await admin
        .from("se_aas_artifacts")
        .select("job_id")
        .eq("organization_id", workspaceId)
        .gte("created_at", oneHourAgo);
      if (!error) {
        jobsWithArtifacts = new Set(
          (data ?? []).map((a: { job_id: string | null }) => a.job_id).filter(Boolean) as string[]
        );
      } else {
        logger.warn("[worker-health] se_aas_artifacts query error:", error.message);
      }
    } catch (e) {
      logger.warn("[worker-health] se_aas_artifacts unavailable:", e);
    }

    const recentJobs = recentRows.map((j) => {
      const durationMs =
        j.completed_at && j.started_at
          ? new Date(j.completed_at).getTime() - new Date(j.started_at).getTime()
          : null;
      return {
        id: j.id,
        taskType: j.task_type,
        status: j.status,
        createdAt: j.created_at,
        completedAt: j.completed_at ?? null,
        durationMs,
        hasArtifact: jobsWithArtifacts.has(j.id),
      };
    });

    const succeededLast1h = recentRows.filter(
      (j) => j.status === "success" && j.completed_at && j.completed_at >= oneHourAgo
    ).length;
    const failedLast1h = recentRows.filter(
      (j) => j.status === "error" && j.completed_at && j.completed_at >= oneHourAgo
    ).length;

    return NextResponse.json({
      pendingJobs: pendingCount,
      runningJobs: runningCount,
      succeededLast1h,
      failedLast1h,
      recentJobs,
    });
  } catch (err) {
    logger.error("[worker-health] Error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
