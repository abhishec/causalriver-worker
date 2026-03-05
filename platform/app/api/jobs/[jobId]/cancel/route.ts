/**
 * POST /api/jobs/[jobId]/cancel
 *
 * Cancels a pending or running agent job.
 * Sets status = 'cancelled' in agent_queue.
 * Returns 409 if the job is already in a terminal state.
 *
 * Atomic: UPDATE uses WHERE status NOT IN terminal to prevent double-cancel race.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> },
) {
  try {
    const { jobId } = await params;

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Resolve org
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

    // Fetch job — must belong to same org
    const { data: job } = await supabase
      .from("agent_queue")
      .select("id, status, organization_id")
      .eq("id", jobId)
      .eq("organization_id", orgId)
      .single();

    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    const terminal = ["completed", "failed", "cancelled"];
    if (terminal.includes(job.status as string)) {
      return NextResponse.json({ error: "Job already in terminal state", status: job.status }, { status: 409 });
    }

    // Atomic cancel: WHERE clause on non-terminal status prevents double-cancel race
    const { error, data: updated } = await supabase
      .from("agent_queue")
      .update({ status: "cancelled", completed_at: new Date().toISOString() })
      .eq("id", jobId)
      .eq("organization_id", orgId)
      .not("status", "in", '("completed","failed","cancelled")')
      .select("id");
    const count = updated?.length ?? 0;

    if (error) {
      logger.error("[/api/jobs/cancel] DB update failed:", error.code);
      return NextResponse.json({ error: "Cancel failed" }, { status: 500 });
    }

    // count === 0 means job was already in terminal state (race — another request beat us)
    if (count === 0) {
      return NextResponse.json({ error: "Job already in terminal state" }, { status: 409 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    logger.error("[/api/jobs/cancel] Unhandled error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
