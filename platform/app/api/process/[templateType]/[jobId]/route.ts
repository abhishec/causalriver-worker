/**
 * Process Engine — GET /api/process/[templateType]/[jobId]
 *
 * Status polling endpoint. Returns current FSM state, state history,
 * output result, policy outcome, and approval/escalation info.
 *
 * Auth: Supabase JWT or x-worker-secret M2M (same rules as POST endpoint)
 */

import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { isProcessTemplate } from "@/lib/process-engine";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ templateType: string; jobId: string }> }
) {
  try {
    const { templateType, jobId } = await params;

    if (!isProcessTemplate(templateType)) {
      return NextResponse.json(
        { error: "Invalid process template type" },
        { status: 400 }
      );
    }

    // ── Auth: M2M skips JWT check ─────────────────────────────────────────────
    const workerSecret = request.headers.get("x-worker-secret");
    const isM2M =
      !!process.env.SE_AAS_WORKER_SECRET &&
      workerSecret === process.env.SE_AAS_WORKER_SECRET;

    // M2M uses service client (bypasses RLS, no user session needed);
    // user calls use createClient which is RLS-scoped to the authenticated user.
    let supabase;
    try {
      supabase = isM2M ? await createServiceClient() : await createClient();
    } catch {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!isM2M) {
      let user = null;
      try {
        const { data } = await supabase.auth.getUser();
        user = data?.user;
      } catch {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    }

    // ── Query agent_queue for job status ──────────────────────────────────────
    const { data: job, error: jobError } = await supabase
      .from("agent_queue")
      .select(
        "id, status, result, error_message, started_at, completed_at, payload, created_at"
      )
      .eq("id", jobId)
      .eq("agent_type", "bpaas")
      .single();

    if (jobError || !job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    // ── Fetch process instance for FSM state details ──────────────────────────
    const payload = job.payload as Record<string, unknown> | null;
    const processInstanceId = payload?.processInstanceId as string | undefined;

    type ProcessInstanceRow = {
      id: string;
      current_state: string;
      fsm_state: Record<string, unknown>;
      status: string;
      state_history: unknown[];
      output_result: Record<string, unknown> | null;
      policy_outcome: string | null;
      escalation_level: string | null;
    };

    let processInstance: ProcessInstanceRow | null = null;

    if (processInstanceId) {
      const { data } = await supabase
        .from("bpaas_process_instances")
        .select(
          "id, current_state, fsm_state, status, state_history, output_result, policy_outcome, escalation_level"
        )
        .eq("id", processInstanceId)
        .single();
      processInstance = data as ProcessInstanceRow | null;
    }

    // ── Map agent_queue status → Process Engine status ────────────────────────
    const statusMap: Record<string, string> = {
      pending: "queued",
      running: "processing",
      completed: "completed",
      failed: "failed",
      awaiting_hitl: "awaiting_approval",
      paused: "escalated",
    };

    const jobStatus = job.status as string;
    const engineStatus = statusMap[jobStatus] ?? jobStatus;
    const jobResult = job.result as Record<string, unknown> | null;

    return NextResponse.json({
      jobId: job.id,
      templateType,
      status: engineStatus,
      currentState: processInstance?.current_state ?? null,
      stateHistory: processInstance?.state_history ?? [],
      outputResult:
        jobResult?.outputResult ??
        processInstance?.output_result ??
        null,
      policyOutcome: processInstance?.policy_outcome ?? null,
      escalationLevel: processInstance?.escalation_level ?? null,
      approvalId: jobResult?.approvalId ?? null,
      errorMessage: (job.error_message as string | null) ?? null,
      startedAt: job.started_at,
      completedAt: job.completed_at,
      createdAt: job.created_at,
    });
  } catch (err) {
    logger.warn("[/api/process/[jobId]] GET threw", {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
