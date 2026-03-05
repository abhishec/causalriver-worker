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

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { getCurrentWorkspaceId } from "@/lib/workspace-helpers";
import { logger } from "@/lib/logger";

export async function GET(req: NextRequest) {
  try {
    // ── Auth: isolate createClient() failures so env var errors return 401, never 500 ──
    let supabase;
    try {
      supabase = await createClient();
    } catch {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    let user = null;
    try {
      const { data } = await supabase.auth.getUser();
      user = data.user;
    } catch {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Accept organizationId as a query param (from AgentLiveMonitor / cockpit)
    // so this route works even when the workspace cookie isn't set server-side.
    const queryOrgId = req.nextUrl.searchParams.get("organizationId");

    // SECURITY: Verify the requesting user is a member of the queried org (IDOR prevention)
    if (queryOrgId) {
      const { data: membership } = await supabase
        .from("org_members")
        .select("organization_id")
        .eq("user_id", user.id)
        .eq("organization_id", queryOrgId)
        .maybeSingle();
      if (!membership) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    const workspaceId = queryOrgId || (await getCurrentWorkspaceId());
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

    // ── Batch fetch: 2 queries instead of 5 separate COUNT queries ───────────
    // Query 1: Recent jobs (last 10) — gives us status breakdown for recents
    // Query 2: Artifact IDs for those jobs
    // Counts for pending/running derived from rows in-memory; succeeded/failed
    // counts for the 1h window require a separate query since recentRows is
    // capped at 10 and may not cover the full 1h window.

    type QueueRow = {
      id: string;
      task_type: string;
      status: string;
      created_at: string;
      started_at: string | null;
      completed_at: string | null;
    };

    // Query 1a: Count by status for pending/running (all time, no date filter)
    // and for success/error in the last 1h — single query with status + date
    // We need 4 counts: pending (all), running (all), success (1h), error (1h).
    // Supabase doesn't support GROUP BY in JS client, so we use 2 targeted queries:
    //   - Query A: pending + running counts in one go using .in("status", [...])
    //   - Query B: success + error counts in last 1h using .in("status", [...]) + .gte
    // This reduces 5 queries → 3 queries (A + B + recent rows).

    let pendingCount = 0;
    let runningCount = 0;
    let succeededLast1h = 0;
    let failedLast1h = 0;
    let recentRows: QueueRow[] = [];

    // Query A: active status counts (pending + running) — no date filter
    try {
      const { data: activeRows, error } = await admin
        .from("agent_queue")
        .select("status")
        .eq("organization_id", workspaceId)
        .in("status", ["pending", "running"]);
      if (!error && activeRows) {
        for (const row of activeRows) {
          if (row.status === "pending") pendingCount++;
          else if (row.status === "running") runningCount++;
        }
      } else if (error) {
        logger.warn("[worker-health] active status query error:", error.message);
      }
    } catch (e) {
      logger.warn("[worker-health] agent_queue (active counts) unavailable:", e);
    }

    // Query B: completed/failed counts in last 1h
    try {
      const { data: completedRows, error } = await admin
        .from("agent_queue")
        .select("status")
        .eq("organization_id", workspaceId)
        .in("status", ["success", "completed", "error", "failed"])
        .gte("completed_at", oneHourAgo);
      if (!error && completedRows) {
        for (const row of completedRows) {
          if (row.status === "success" || row.status === "completed") succeededLast1h++;
          else if (row.status === "error" || row.status === "failed") failedLast1h++;
        }
      } else if (error) {
        logger.warn("[worker-health] completed status query error:", error.message);
      }
    } catch (e) {
      logger.warn("[worker-health] agent_queue (completed counts) unavailable:", e);
    }

    // Query C: Recent jobs (last 10)
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

    return NextResponse.json({
      pendingJobs: pendingCount,
      runningJobs: runningCount,
      succeededLast1h,
      failedLast1h,
      recentJobs,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    logger.error("[worker-health] Error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
