/**
 * POST /api/jobs/[jobId]/cancel
 *
 * Cancels a pending or running agent job.
 * Sets status = 'cancelled' in agent_queue.
 * Returns 409 if the job is already in a terminal state.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> },
) {
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

  const { error } = await supabase
    .from("agent_queue")
    .update({ status: "cancelled", completed_at: new Date().toISOString() })
    .eq("id", jobId)
    .eq("organization_id", orgId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
