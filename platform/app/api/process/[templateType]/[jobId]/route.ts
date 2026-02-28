/**
 * Process Engine — GET /api/process/[templateType]/[jobId]
 * =========================================================
 * Poll the status of a running or completed process job.
 *
 * Auth (two modes):
 *   1. Bearer <SE_AAS_WORKER_SECRET>  — M2M service account
 *   2. Bearer <supabase-jwt>          — user auth
 *
 * Returns: {
 *   jobId, templateType,
 *   status: agent_queue.status,
 *   currentState: bpaas_process_instances.current_state,
 *   stateHistory: bpaas_process_instances.state_history,
 *   outputResult: agent_queue.result,
 *   errorMessage: agent_queue.error_message,
 *   startedAt: agent_queue.started_at,
 *   completedAt: agent_queue.completed_at,
 *   approvalId: pending hitl_approvals row id (if any)
 * }
 */

import { NextRequest, NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

// ── Static env capture (Amplify SSR Lambda requires static member access) ───
const _SE_AAS_WORKER_SECRET = process.env.SE_AAS_WORKER_SECRET;

// ── Auth helper ──────────────────────────────────────────────────────────────

async function authenticate(request: NextRequest): Promise<{
  userId: string;
  isWorker: boolean;
} | null> {
  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";

  if (!token) return null;

  // Mode 1: SE_AAS_WORKER_SECRET (M2M)
  if (_SE_AAS_WORKER_SECRET && token === _SE_AAS_WORKER_SECRET) {
    return { userId: "process-worker", isWorker: true };
  }

  // Mode 2: Supabase JWT (user auth)
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.getUser(token);
    if (!error && data.user) {
      return { userId: data.user.id, isWorker: false };
    }
  } catch (err: unknown) {
    logger.warn("[process/[templateType]/[jobId]] createClient/getUser threw", {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return null;
}

// ── GET ──────────────────────────────────────────────────────────────────────

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ templateType: string; jobId: string }> }
) {
  try {
    const { templateType, jobId } = await params;

    const auth = await authenticate(request);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const admin = getAdminClient();

    // Fetch the agent_queue job — existence check proves templateType is valid
    const { data: job, error: jobError } = await admin
      .from("agent_queue")
      .select(
        "id, organization_id, agent_type, task_type, status, payload, result, error_message, started_at, completed_at, created_at"
      )
      .eq("id", jobId)
      .eq("agent_type", "bpaas")
      .eq("task_type", templateType)
      .maybeSingle();

    if (jobError) {
      logger.error("[process/[templateType]/[jobId] GET] agent_queue query failed", {
        error: jobError.message,
        jobId,
      });
      return NextResponse.json({ error: "Failed to fetch job" }, { status: 500 });
    }

    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    // For non-worker auth, verify org membership
    if (!auth.isWorker) {
      const { data: membership } = await admin
        .from("org_members")
        .select("role")
        .eq("user_id", auth.userId)
        .eq("organization_id", job.organization_id)
        .maybeSingle();

      if (!membership) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    // Fetch the process instance (may not exist if insert failed at creation time)
    const { data: instance } = await admin
      .from("bpaas_process_instances")
      .select("id, current_state, state_history, fsm_state, status, policy_outcome, escalation_level, completed_at")
      .eq("agent_job_id", jobId)
      .maybeSingle();

    // Fetch any pending HITL approval for this job
    const { data: approval } = await admin
      .from("hitl_approvals")
      .select("id, gate_type, summary, status, requested_at, expires_at")
      .eq("job_id", jobId)
      .eq("status", "pending")
      .maybeSingle();

    return NextResponse.json({
      jobId: job.id,
      templateType: job.task_type,
      status: job.status,
      currentState: instance?.current_state ?? null,
      stateHistory: instance?.state_history ?? [],
      fsmState: instance?.fsm_state ?? {},
      instanceStatus: instance?.status ?? null,
      policyOutcome: instance?.policy_outcome ?? null,
      escalationLevel: instance?.escalation_level ?? null,
      outputResult: job.result,
      errorMessage: job.error_message,
      startedAt: job.started_at,
      completedAt: job.completed_at ?? instance?.completed_at ?? null,
      createdAt: job.created_at,
      approvalId: approval?.id ?? null,
      approval: approval
        ? {
            id: approval.id,
            gateType: approval.gate_type,
            summary: approval.summary,
            status: approval.status,
            requestedAt: approval.requested_at,
            expiresAt: approval.expires_at,
          }
        : null,
    });
  } catch (err: unknown) {
    logger.error("[process/[templateType]/[jobId] GET] Unexpected error", {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
