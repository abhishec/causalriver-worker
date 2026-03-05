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

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
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
    .order("created_at", { ascending: false })
    .limit(20);

  if (idsParam) {
    const ids = idsParam.split(",").map((s) => s.trim()).filter(Boolean);
    if (ids.length === 0) return NextResponse.json({ jobs: [] });
    query = query.in("id", ids);
  } else {
    query = query.in("status", ["pending", "running"]);
  }

  const { data: jobs, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ jobs: jobs ?? [] });
}
