/**
 * Brain Orchestrator API
 * ======================
 * GET  /api/brain/orchestrator  → OrgAgentState for the current workspace
 * POST /api/brain/orchestrator  → orchestrateJob() → insert to agent_queue + register dependency
 *
 * Response contracts:
 *
 * GET 200:
 *   { state: OrgAgentState }
 *
 * POST 202 (execute-now):
 *   { jobId: string, action: 'execute-now', reason: string }
 *
 * POST 202 (queue-waiting):
 *   { jobId: string, action: 'queue-waiting', waiting: true,
 *     reason: string, estimatedWaitMs?: number, blockingJobId?: string }
 *
 * POST 409 (reject):
 *   { error: string, action: 'reject', reason: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { getCurrentWorkspaceId } from "@/lib/workspace-helpers";
import {
  getOrgAgentState,
  orchestrateJob,
  registerDependency,
} from "@/lib/brain/agent-orchestrator";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

// ── Auth helper ──────────────────────────────────────────────────────────────

async function getAuthedUser() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();
    if (error || !user) return null;
    return user;
  } catch {
    return null;
  }
}

// ── GET /api/brain/orchestrator ──────────────────────────────────────────────

export async function GET(_req: NextRequest) {
  try {
    const user = await getAuthedUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const workspaceId = await getCurrentWorkspaceId();
    if (!workspaceId) {
      return NextResponse.json({ error: "No workspace found" }, { status: 400 });
    }

    let state;
    try {
      state = await getOrgAgentState(workspaceId);
    } catch {
      // getAdminClient() may throw if SUPABASE_SERVICE_ROLE_KEY is unavailable
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ state });
  } catch (err: any) {
    logger.error("[orchestrator/GET] Unexpected error:", err?.message);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// ── POST /api/brain/orchestrator ─────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthedUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const workspaceId = await getCurrentWorkspaceId();
    if (!workspaceId) {
      return NextResponse.json({ error: "No workspace found" }, { status: 400 });
    }

    const body = await req.json().catch(() => ({}));
    const { taskType, payload, priority } = body as {
      taskType?: string;
      payload?: Record<string, unknown>;
      priority?: "high" | "normal" | "low";
    };

    if (!taskType) {
      return NextResponse.json({ error: "taskType is required" }, { status: 400 });
    }

    let decision;
    try {
      decision = await orchestrateJob({
        orgId: workspaceId,
        taskType,
        payload: payload ?? {},
        priority,
      });
    } catch {
      // getAdminClient() inside orchestrateJob may throw if SUPABASE_SERVICE_ROLE_KEY is unavailable
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // ── Reject ───────────────────────────────────────────────────────────────
    if (decision.action === "reject") {
      return NextResponse.json(
        {
          error: decision.reason,
          action: "reject",
          reason: decision.reason,
          blockingJobId: decision.blockingJobId ?? null,
        },
        { status: 409 }
      );
    }

    // ── Map priority string → numeric value (agent_queue.priority is integer) ─
    const priorityNum =
      priority === "high" ? 10 : priority === "low" ? 1 : 5;

    // ── Insert job to agent_queue ─────────────────────────────────────────────
    // For 'queue-waiting', we insert with status='waiting' so the job worker
    // does NOT pick it up until checkAndStartWaitingJobs() unblocks it.
    let admin;
    try {
      admin = getAdminClient();
    } catch {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const jobStatus =
      decision.action === "queue-waiting" ? "waiting" : "pending";

    const { data: inserted, error: insertErr } = await admin
      .from("agent_queue")
      .insert({
        organization_id: workspaceId,
        agent_type: "se-aas",
        task_type: taskType,
        priority: priorityNum,
        payload: {
          ...(payload ?? {}),
          userId: user.id,
        },
        status: jobStatus,
      })
      .select("id")
      .single();

    if (insertErr || !inserted) {
      logger.error("[orchestrator/POST] Job insert failed:", insertErr?.message);
      return NextResponse.json(
        { error: "Failed to queue job" },
        { status: 500 }
      );
    }

    const jobId: string = inserted.id;

    // ── Register dependency if waiting ────────────────────────────────────────
    if (decision.action === "queue-waiting") {
      await registerDependency({
        orgId: workspaceId,
        jobId,
        dependsOnJobId: decision.blockingJobId,
        dependsOnType: decision.blockingJobType ?? "brain-population",
        autoStart: true,
      });

      return NextResponse.json({
        jobId,
        action: "queue-waiting",
        waiting: true,
        reason: decision.reason,
        estimatedWaitMs: decision.estimatedWaitMs ?? null,
        blockingJobId: decision.blockingJobId ?? null,
        queuePosition: decision.queuePosition ?? null,
      });
    }

    // ── Execute now ───────────────────────────────────────────────────────────
    return NextResponse.json({
      jobId,
      action: "execute-now",
      reason: decision.reason,
    });
  } catch (err: any) {
    logger.error("[orchestrator/POST] Unexpected error:", err?.message);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
