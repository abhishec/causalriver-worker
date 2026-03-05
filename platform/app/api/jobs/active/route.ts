/**
 * GET /api/jobs/active
 *
 * Returns active (pending|running) jobs for the current user's org,
 * filtered by an optional comma-separated list of job IDs.
 *
 * Used by useBackgroundTasks to resume tracking on page load.
 *
 * Query params:
 *   ids — comma-separated job IDs to look up (optional)
 *         When omitted, returns all pending/running jobs for the org (max 20)
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Resolve org from membership
    const { data: membership } = await supabase
      .from("org_members")
      .select("organization_id")
      .eq("user_id", user.id)
      .limit(1)
      .single();

    if (!membership?.organization_id) {
      return NextResponse.json({ jobs: [] });
    }

    const orgId = membership.organization_id;
    const { searchParams } = request.nextUrl;
    const idsParam = searchParams.get("ids");

    let query = supabase
      .from("agent_queue")
      .select("id, task_type, agent_type, status, created_at, started_at, payload")
      .eq("organization_id", orgId)
      .order("created_at", { ascending: false });

    if (idsParam) {
      const ids = idsParam.split(",").map((s) => s.trim()).filter(Boolean);
      if (ids.length === 0) return NextResponse.json({ jobs: [] });
      // When specific IDs are requested, no limit — we need all of them
      query = query.in("id", ids).limit(100);
    } else {
      query = query.in("status", ["pending", "running"]).limit(20);
    }

    const { data: jobs, error } = await query;
    if (error) {
      logger.error("[/api/jobs/active] DB query failed:", error.code);
      return NextResponse.json({ jobs: [] }); // Graceful fallback — don't break background task resume
    }

    return NextResponse.json({ jobs: jobs ?? [] });
  } catch (err) {
    logger.error("[/api/jobs/active] Unhandled error:", err);
    return NextResponse.json({ jobs: [] }); // Graceful fallback — don't break background task resume
  }
}
