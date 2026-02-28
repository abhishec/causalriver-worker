/**
 * A2A Task Status — GET /api/a2a/tasks/[taskId]
 * ===============================================
 * Poll the status of a specific A2A task by ID.
 *
 * Returns A2A-compliant TaskStatus with:
 *   - state: submitted | working | completed | failed | input-required
 *   - artifacts: result data (on completion) or error message (on failure)
 *   - history: full state transition log
 *
 * HITL (Human-in-the-Loop): if the job is suspended at a decision gate,
 * returns state=input-required with the escalation question and approval URL.
 *
 * Auth: Bearer token — accepts SE_AAS_WORKER_SECRET (M2M) or valid Supabase JWT.
 *
 * Reference: https://google.github.io/A2A/specification/
 */

import { NextRequest, NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { mapJobToA2ATask } from "../route";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

// ── Auth helper (same as tasks/route.ts) ─────────────────────────────────────

async function authenticateA2A(
  request: NextRequest
): Promise<{ userId: string; isWorker: boolean } | null> {
  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";

  if (!token) return null;

  // 1. Accept SE_AAS_WORKER_SECRET (machine-to-machine auth)
  const workerSecret = process.env.SE_AAS_WORKER_SECRET;
  if (workerSecret && token === workerSecret) {
    return { userId: "a2a-worker", isWorker: true };
  }

  // 2. Accept valid Supabase JWT (user auth)
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.getUser(token);
    if (!error && data.user) {
      return { userId: data.user.id, isWorker: false };
    }
  } catch {
    // Supabase client may throw on Lambda cold start — fall through to reject
  }

  return null;
}

// ── GET — Poll task status ────────────────────────────────────────────────────

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  try {
    const auth = await authenticateA2A(request);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { taskId } = await params;

    if (!taskId) {
      return NextResponse.json({ error: "Missing taskId in path" }, { status: 400 });
    }

    const admin = getAdminClient();

    // Fetch the A2A job — include both 'a2a' (SE-aaS skills) and 'bpaas'
    // (Process Engine skills submitted via A2A) agent types.
    // The payload.source = 'a2a' filter prevents cross-type leakage: only rows
    // that were submitted through the A2A endpoint will have source='a2a'.
    const { data: job, error } = await admin
      .from("agent_queue")
      .select(
        "id, organization_id, task_type, status, payload, result, error_message, created_at, started_at, completed_at, checkpoint_data, checkpoint_phase, escalation_question"
      )
      .eq("id", taskId)
      .in("agent_type", ["se-aas", "aas", "pm-aas"])
      .eq("payload->>source", "a2a")
      .maybeSingle();

    if (error) {
      logger.error("[A2A /tasks/:id GET] DB query failed", { error: error.message, taskId });
      return NextResponse.json({ error: "Failed to fetch task" }, { status: 500 });
    }

    if (!job) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    // For non-worker auth, verify the caller belongs to the task's organization
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

    // Build the A2A task response, enriching with checkpoint data for HITL state
    const jobForMapping = {
      ...job,
      // Merge checkpoint_data into result so mapJobToA2ATask can access escalation_question
      result: job.result ?? (job.checkpoint_data as Record<string, unknown> | null),
    };

    const task = mapJobToA2ATask(jobForMapping);

    // For input-required state, add explicit HITL metadata at top level for easy parsing
    if (task.status.state === "input-required") {
      return NextResponse.json({
        ...task,
        inputRequired: {
          question: (job.escalation_question as string) ?? "Human review required",
          phase: (job.checkpoint_phase as string) ?? null,
          approvalUrl: `https://platform.usebrainos.com/agents?taskId=${taskId}`,
          resumeUrl: `https://platform.usebrainos.com/api/agents/${taskId}/resume`,
        },
      });
    }

    return NextResponse.json(task);
  } catch (err: unknown) {
    logger.error("[A2A /tasks/:id GET] Unexpected error", {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
