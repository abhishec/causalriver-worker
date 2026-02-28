/**
 * Worker-to-Worker Dispatch API
 * ==============================
 *
 * POST /api/ai-workers/[workerId]/dispatch
 *
 * Dispatches a task from [workerId] to a target worker in the same workspace.
 * The dispatch goes through agent_queue (same infrastructure), with the target
 * worker's ai_worker_id on both the agent and the job.
 *
 * Body:
 * {
 *   targetWorkerType?: 'se-aas' | 'aas' | 'pm-aas'  // resolve target by service_type
 *   targetWorkerId?: string                            // or target directly by ID
 *   taskType: string                                   // task to run on target worker
 *   payload?: Record<string, unknown>                  // task input
 *   agentName?: string                                 // optional agent name (default: auto)
 * }
 *
 * Returns 202:
 * {
 *   jobId: string
 *   agentId: string
 *   targetWorkerId: string
 *   status: 'queued'
 * }
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getCurrentWorkspaceId } from "@/lib/workspace-helpers";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

interface DispatchBody {
  targetWorkerType?: string;
  targetWorkerId?: string;
  taskType: string;
  payload?: Record<string, unknown>;
  agentName?: string;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ workerId: string }> }
) {
  const { workerId } = await params;

  // ── Auth ────────────────────────────────────────────────────────────────────
  let supabase;
  try {
    supabase = await createClient();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let user = null;
  try {
    const { data } = await supabase.auth.getUser();
    user = data.user;
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // ── Workspace ────────────────────────────────────────────────────────────────
  let orgId: string;
  try {
    orgId = await getCurrentWorkspaceId();
    if (!orgId) throw new Error("No workspace");
  } catch {
    return NextResponse.json({ error: "Workspace not found" }, { status: 400 });
  }

  // ── Service client ───────────────────────────────────────────────────────────
  let service;
  try {
    service = await createServiceClient();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ── Verify source worker exists in this org ──────────────────────────────────
  const { data: sourceWorker } = await service
    .from("ai_workers")
    .select("id, name, service_type")
    .eq("id", workerId)
    .eq("organization_id", orgId)
    .single();

  if (!sourceWorker) {
    return NextResponse.json({ error: "Source worker not found" }, { status: 404 });
  }

  // ── Parse body ───────────────────────────────────────────────────────────────
  let body: DispatchBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (!body.taskType) {
    return NextResponse.json({ error: "taskType is required" }, { status: 400 });
  }

  // ── Resolve target worker ────────────────────────────────────────────────────
  let targetWorkerId = body.targetWorkerId;

  if (!targetWorkerId && body.targetWorkerType) {
    const { data: found } = await service
      .from("ai_workers")
      .select("id")
      .eq("organization_id", orgId)
      .eq("service_type", body.targetWorkerType)
      .eq("status", "active")
      .limit(1)
      .single();

    if (!found) {
      return NextResponse.json(
        { error: `No active ${body.targetWorkerType} worker found in workspace` },
        { status: 404 }
      );
    }
    targetWorkerId = found.id;
  }

  if (!targetWorkerId) {
    return NextResponse.json(
      { error: "Either targetWorkerId or targetWorkerType is required" },
      { status: 400 }
    );
  }

  // ── Prevent self-dispatch ────────────────────────────────────────────────────
  if (targetWorkerId === workerId) {
    return NextResponse.json({ error: "Worker cannot dispatch to itself" }, { status: 400 });
  }

  // ── Dispatch: create agent + job under target worker ─────────────────────────
  try {
    const agentName = body.agentName ?? `${body.taskType}-dispatch-${Date.now()}`;

    // Create agent row scoped to TARGET worker
    const { data: agent, error: agentError } = await service
      .from("agents")
      .insert({
        organization_id: orgId,
        ai_worker_id: targetWorkerId,
        name: agentName,
        purpose: `Dispatched from worker ${workerId}: ${body.taskType}`,
        status: "active",
        created_by: "orchestrator",
      })
      .select()
      .single();

    if (agentError || !agent) {
      throw new Error(`Agent creation failed: ${agentError?.message}`);
    }

    // Determine agent_type from target worker's service_type
    const { data: targetWorkerData } = await service
      .from("ai_workers")
      .select("service_type")
      .eq("id", targetWorkerId)
      .single();

    const agentType = targetWorkerData?.service_type ?? "se-aas";

    // Create job in agent_queue scoped to TARGET worker
    const { data: job, error: jobError } = await service
      .from("agent_queue")
      .insert({
        organization_id: orgId,
        ai_worker_id: targetWorkerId,
        agent_id: agent.id,
        agent_type: agentType,
        task_type: body.taskType,
        priority: "normal",
        payload: {
          ...(body.payload ?? {}),
          _dispatched_from: workerId,
          _dispatch_agent_id: agent.id,
        },
        status: "pending",
      })
      .select()
      .single();

    if (jobError || !job) {
      throw new Error(`Job creation failed: ${jobError?.message}`);
    }

    logger.info("[w2w-dispatch] Task dispatched", {
      sourceWorkerId: workerId,
      targetWorkerId,
      taskType: body.taskType,
      jobId: job.id,
      agentId: agent.id,
    });

    return NextResponse.json(
      {
        jobId: job.id,
        agentId: agent.id,
        targetWorkerId,
        status: "queued",
      },
      { status: 202 }
    );
  } catch (err: unknown) {
    logger.error("[w2w-dispatch] Dispatch failed", { error: String(err) });
    return NextResponse.json({ error: "Dispatch failed" }, { status: 500 });
  }
}
