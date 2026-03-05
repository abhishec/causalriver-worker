/**
 * GET /api/jobs/[jobId]/detail
 *
 * Returns full job detail including `result` JSONB for rendering in the
 * Jobs tab detail panel. Auth-scoped to user's org.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const { jobId } = await params;
    if (!jobId) {
      return NextResponse.json({ error: "Job ID required" }, { status: 400 });
    }

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
      return NextResponse.json({ error: "No workspace" }, { status: 403 });
    }

    const orgId = membership.organization_id;

    const { data: job, error } = await supabase
      .from("agent_queue")
      .select("id, agent_type, task_type, status, priority, result, error_message, payload, created_at, started_at, completed_at")
      .eq("id", jobId)
      .eq("organization_id", orgId)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: "Query failed" }, { status: 500 });
    }
    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    return NextResponse.json(job);
  } catch (err) {
    logger.error("[/api/jobs/detail] Unhandled error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
