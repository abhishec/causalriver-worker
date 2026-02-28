/**
 * GET /api/processes/instances
 *
 * Returns all bpaas_process_instances for the authenticated org,
 * joined with agent_queue for escalation_question and job metadata.
 *
 * Response: { instances: ProcessInstance[], counts: { total, running, completed, awaitingApproval } }
 */

import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getCurrentWorkspaceId } from "@/lib/workspace-helpers";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

export interface ProcessInstance {
  id: string;
  organization_id: string;
  agent_job_id: string;
  process_type: string;
  status: string;
  current_state: string;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  /** Duration in milliseconds (null if still running) */
  duration_ms: number | null;
  /** Escalation question from agent_queue (only present when suspended/awaiting_approval) */
  escalation_question: string | null;
  /** Job status from agent_queue */
  job_status: string | null;
}

export async function GET() {
  let supabase: Awaited<ReturnType<typeof createClient>>;
  try {
    supabase = await createClient();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let user = null;
  try {
    const { data } = await supabase.auth.getUser();
    user = data?.user ?? null;
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let workspaceId: string | null = null;
  try {
    workspaceId = await getCurrentWorkspaceId();
  } catch {
    // pass — workspaceId stays null, we return empty
  }

  if (!workspaceId) {
    return NextResponse.json({
      instances: [],
      counts: { total: 0, running: 0, completed: 0, awaitingApproval: 0 },
    });
  }

  try {
    let service: Awaited<ReturnType<typeof createServiceClient>>;
    try {
      service = await createServiceClient();
    } catch {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Fetch process instances for this org, most recent first
    const { data: instances, error: instancesErr } = await service
      .from("bpaas_process_instances")
      .select("id, organization_id, agent_job_id, process_type, status, current_state, created_at, updated_at, completed_at")
      .eq("organization_id", workspaceId)
      .order("created_at", { ascending: false })
      .limit(100);

    if (instancesErr) {
      logger.warn("[processes/instances/GET] Query error:", instancesErr.message);
      return NextResponse.json({
        instances: [],
        counts: { total: 0, running: 0, completed: 0, awaitingApproval: 0 },
      });
    }

    if (!instances || instances.length === 0) {
      return NextResponse.json({
        instances: [],
        counts: { total: 0, running: 0, completed: 0, awaitingApproval: 0 },
      });
    }

    // Fetch related agent_queue rows to get escalation_question and job_status
    const jobIds = instances.map((i) => i.agent_job_id).filter(Boolean);
    let jobMap: Record<string, { status: string; escalation_question: string | null }> = {};

    if (jobIds.length > 0) {
      const { data: jobs } = await service
        .from("agent_queue")
        .select("id, status, escalation_question")
        .in("id", jobIds);

      if (jobs) {
        for (const job of jobs) {
          jobMap[job.id] = {
            status: job.status,
            escalation_question: (job.escalation_question as string | null) ?? null,
          };
        }
      }
    }

    // Merge and compute duration
    const enriched: ProcessInstance[] = instances.map((inst) => {
      const job = jobMap[inst.agent_job_id] ?? null;
      const startMs = new Date(inst.created_at).getTime();
      const endMs = inst.completed_at ? new Date(inst.completed_at).getTime() : null;
      const duration_ms = endMs !== null ? endMs - startMs : null;

      return {
        id: inst.id,
        organization_id: inst.organization_id,
        agent_job_id: inst.agent_job_id,
        process_type: inst.process_type,
        status: inst.status,
        current_state: inst.current_state,
        created_at: inst.created_at,
        updated_at: inst.updated_at,
        completed_at: inst.completed_at ?? null,
        duration_ms,
        escalation_question: job?.escalation_question ?? null,
        job_status: job?.status ?? null,
      };
    });

    // Compute counts
    const counts = {
      total: enriched.length,
      running: enriched.filter((i) => i.status === "running").length,
      completed: enriched.filter((i) => i.status === "completed").length,
      awaitingApproval: enriched.filter(
        (i) => i.job_status === "suspended" || i.job_status === "awaiting_approval"
      ).length,
    };

    return NextResponse.json({ instances: enriched, counts });
  } catch (err) {
    logger.error("[processes/instances/GET] Error:", {
      error: (err as Error)?.message ?? String(err),
    });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
