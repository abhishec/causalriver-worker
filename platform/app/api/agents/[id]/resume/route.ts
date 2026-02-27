/**
 * POST /api/agents/:id/resume
 * ============================
 * Resumes a paused agent_queue job that is in awaiting_approval status.
 *
 * Body: { response: string }
 *   response — the human's answer to the escalation question
 *
 * Flow:
 *   1. Auth: must be org member
 *   2. Verify job belongs to caller's org and is in awaiting_approval status
 *   3. Call resume_agent_job() RPC → marks original job "resumed", creates
 *      new "pending" continuation job with checkpoint + human response
 *   4. Return { ok, originalJobId, newJobId }
 *
 * The new job will be picked up by the next job-worker poll cycle.
 * Use loadResumeCheckpoint() in domain-executor to restore investigation state.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Auth
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: jobId } = await params;
  if (!jobId) {
    return NextResponse.json({ error: "Job ID required" }, { status: 400 });
  }

  let body: { response?: string };
  try {
    body = (await req.json()) as { response?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const humanResponse = body.response?.trim();
  if (!humanResponse) {
    return NextResponse.json({ error: '"response" field is required' }, { status: 400 });
  }

  try {
    const service = await createServiceClient();

    // Verify the job belongs to one of the caller's orgs
    const { data: members } = await supabase
      .from("org_members")
      .select("organization_id")
      .eq("user_id", user.id);

    const orgIds = (members ?? []).map((m: { organization_id: string }) => m.organization_id);

    if (orgIds.length === 0) {
      return NextResponse.json({ error: "Access denied — no org membership" }, { status: 403 });
    }

    const { data: job } = await service
      .from("agent_queue")
      .select("id, organization_id, status, escalation_question, checkpoint_phase")
      .eq("id", jobId)
      .in("organization_id", orgIds)
      .maybeSingle();

    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    if (job.status !== "awaiting_approval") {
      return NextResponse.json(
        { error: `Job status is "${job.status}" — only awaiting_approval jobs can be resumed` },
        { status: 409 }
      );
    }

    // Call the DB function to atomically mark original job + create continuation job
    const { data: newJobId, error: rpcError } = await service.rpc("resume_agent_job", {
      p_job_id: jobId,
      p_human_response: humanResponse,
    });

    if (rpcError) {
      logger.error("resume_agent_job RPC failed", { jobId, rpcError });
      return NextResponse.json({ error: "Failed to resume job" }, { status: 500 });
    }

    logger.warn("Agent job resumed by human", {
      originalJobId: jobId,
      newJobId,
      phase: job.checkpoint_phase,
      userId: user.id,
      orgId: job.organization_id,
    });

    return NextResponse.json({
      ok: true,
      originalJobId: jobId,
      newJobId,
      message: `Continuation job ${newJobId} queued. It will be picked up in the next worker cycle.`,
    });
  } catch (err) {
    logger.error("POST /api/agents/[id]/resume failed", { jobId, err });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
