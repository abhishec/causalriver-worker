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

    // Run all queries in parallel
    const [pendingResult, runningResult, recentResult, artifactResult] = await Promise.all([
      // Pending count
      admin
        .from("agent_queue")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", workspaceId)
        .eq("status", "pending"),

      // Running count
      admin
        .from("agent_queue")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", workspaceId)
        .eq("status", "running"),

      // Recent jobs (last 10, including all statuses)
      admin
        .from("agent_queue")
        .select("id, task_type, status, created_at, started_at, completed_at")
        .eq("organization_id", workspaceId)
        .order("created_at", { ascending: false })
        .limit(10),

      // Artifact counts for recent jobs (keyed by job_id)
      admin
        .from("se_aas_artifacts")
        .select("job_id")
        .eq("organization_id", workspaceId)
        .gte("created_at", oneHourAgo),
    ]);

    const jobsWithArtifacts = new Set(
      (artifactResult.data ?? []).map((a: { job_id: string | null }) => a.job_id).filter(Boolean)
    );

    const recentJobs = (recentResult.data ?? []).map((j: {
      id: string;
      task_type: string;
      status: string;
      created_at: string;
      started_at: string | null;
      completed_at: string | null;
    }) => {
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

    const allRecent = recentResult.data ?? [];
    const succeededLast1h = allRecent.filter(
      (j: { status: string; completed_at: string | null }) =>
        j.status === "success" && j.completed_at && j.completed_at >= oneHourAgo
    ).length;
    const failedLast1h = allRecent.filter(
      (j: { status: string; completed_at: string | null }) =>
        j.status === "error" && j.completed_at && j.completed_at >= oneHourAgo
    ).length;

    return NextResponse.json({
      pendingJobs: pendingResult.count ?? 0,
      runningJobs: runningResult.count ?? 0,
      succeededLast1h,
      failedLast1h,
      recentJobs,
    });
  } catch (err) {
    logger.error("[worker-health] Error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
