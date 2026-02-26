/**
 * Brain Agents — Run a Specific Agent Definition
 * ================================================
 *
 * POST /api/brain/agents/[id]/run
 *   Trigger an async SE-aaS job for a stored agent definition.
 *   Reads the definition from se_aas_artifacts, enqueues to agent_queue,
 *   and returns the jobId for polling.
 *
 *   Body (all optional — override the definition defaults):
 *     payload?: Record<string,unknown>  // merged with definition's defaultPayload
 *     priority?: number                 // 1-10, default 5
 */

import { createClient } from "@/lib/supabase/server";
import { getAdminClient, verifyWorkspaceMembership } from "@/lib/supabase/admin";
import { getCurrentWorkspaceId } from "@/lib/workspace-helpers";
import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const workspaceId = await getCurrentWorkspaceId();
    if (!workspaceId) {
      return NextResponse.json({ error: "No workspace found" }, { status: 400 });
    }

    const member = await verifyWorkspaceMembership(user.id, workspaceId);
    if (!member) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const admin = getAdminClient();

    // Load the agent definition
    const { data: row, error: fetchError } = await admin
      .from("se_aas_artifacts")
      .select("id, organization_id, domain_type, artifact_data")
      .eq("id", id)
      .eq("organization_id", workspaceId)
      .eq("domain_type", "agent-definition")
      .maybeSingle();

    if (fetchError) {
      logger.error(`[POST /api/brain/agents/${id}/run] DB fetch error:`, fetchError);
      return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }

    if (!row) {
      return NextResponse.json({ error: "Agent not found" }, { status: 404 });
    }

    const def = row.artifact_data ?? {};

    // Check agent is active
    if (def.status === "archived") {
      return NextResponse.json(
        { error: "Cannot run an archived agent. Restore it first." },
        { status: 400 }
      );
    }

    // Parse optional body overrides
    let body: { payload?: Record<string, unknown>; priority?: number } = {};
    try {
      body = await req.json();
    } catch {
      // Body is optional — empty body is fine
    }

    const resolvedPriority = typeof body.priority === "number"
      ? Math.min(Math.max(Math.round(body.priority), 1), 10)
      : 5;

    // Merge default payload from definition + request overrides
    const resolvedPayload: Record<string, unknown> = {
      ...(def.defaultPayload ?? {}),
      ...(body.payload ?? {}),
      // Always include these for downstream domain executors
      agentDefinitionId: id,
      userId: user.id,
      triggeredBy: "management-panel",
    };

    // Enqueue to agent_queue
    const { data: job, error: insertError } = await admin
      .from("agent_queue")
      .insert({
        organization_id: workspaceId,
        agent_type: "se-aas",
        task_type: def.domain ?? "custom",
        priority: resolvedPriority,
        payload: resolvedPayload,
        status: "pending",
      })
      .select("id")
      .single();

    if (insertError || !job) {
      logger.error(`[POST /api/brain/agents/${id}/run] Queue insert error:`, insertError);
      return NextResponse.json({ error: "Failed to enqueue agent run" }, { status: 500 });
    }

    logger.warn(
      `[POST /api/brain/agents/${id}/run] Enqueued job ${job.id} for agent "${def.name}" (domain: ${def.domain}) in org ${workspaceId}`
    );

    return NextResponse.json(
      {
        success: true,
        jobId: job.id,
        agentId: id,
        domain: def.domain,
        status: "pending",
        message: `Agent "${def.name}" queued. Poll /api/brain/agents/${id}/run?jobId=${job.id} for status.`,
      },
      { status: 202 }
    );
  } catch (err) {
    logger.error("[POST /api/brain/agents/[id]/run] Unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ── GET — Poll job status ─────────────────────────────────────────────────────

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const workspaceId = await getCurrentWorkspaceId();
    if (!workspaceId) {
      return NextResponse.json({ error: "No workspace found" }, { status: 400 });
    }

    const member = await verifyWorkspaceMembership(user.id, workspaceId);
    if (!member) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const jobId = req.nextUrl.searchParams.get("jobId");
    if (!jobId) {
      // Return all recent runs for this agent definition
      const admin = getAdminClient();
      const { data: runs, error } = await admin
        .from("agent_queue")
        .select("id, status, started_at, completed_at, error_message, created_at, result")
        .eq("organization_id", workspaceId)
        .filter("payload->agentDefinitionId", "eq", id)
        .order("created_at", { ascending: false })
        .limit(10);

      if (error) {
        return NextResponse.json({ error: "Failed to fetch runs" }, { status: 500 });
      }

      return NextResponse.json({ runs: runs ?? [] });
    }

    // Poll specific job
    const admin = getAdminClient();
    const { data: job, error } = await admin
      .from("agent_queue")
      .select("id, status, started_at, completed_at, error_message, created_at, result")
      .eq("id", jobId)
      .eq("organization_id", workspaceId)
      .maybeSingle();

    if (error || !job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    return NextResponse.json({
      jobId: job.id,
      status: job.status,
      startedAt: job.started_at,
      completedAt: job.completed_at,
      errorMessage: job.error_message,
      result: job.status === "success" ? job.result : null,
    });
  } catch (err) {
    logger.error("[GET /api/brain/agents/[id]/run] Unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
