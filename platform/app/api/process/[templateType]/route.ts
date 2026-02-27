/**
 * Process Engine — POST /api/process/[templateType]
 *
 * Enqueues a new process instance for any workspace.
 * No service activation check required — Process Engine is core AI Worker
 * infrastructure available to all workspaces (Brain L28, Tier 9).
 *
 * Auth: Supabase JWT (browser/user calls) OR x-worker-secret M2M (AgentX, cron, A2A calls)
 * DB: agent_type='bpaas' in agent_queue (internal, backward compat)
 * API: /api/process/[templateType] (public framing)
 */

import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { isProcessTemplate, PROCESS_ENGINE_TEMPLATES } from "@/lib/process-engine";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ templateType: string }> }
) {
  try {
    const { templateType } = await params;

    // Validate process template type
    if (!isProcessTemplate(templateType)) {
      return NextResponse.json(
        {
          error: "Invalid process template type",
          validTemplates: PROCESS_ENGINE_TEMPLATES,
        },
        { status: 400 }
      );
    }

    // ── Auth: M2M (x-worker-secret) ─────────────────────────────────────────
    const workerSecret = request.headers.get("x-worker-secret");
    const isM2M =
      !!process.env.SE_AAS_WORKER_SECRET &&
      workerSecret === process.env.SE_AAS_WORKER_SECRET;

    if (isM2M) {
      let body: Record<string, unknown>;
      try {
        body = (await request.json()) as Record<string, unknown>;
      } catch {
        return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
      }

      const organizationId = body.organizationId as string | undefined;
      if (!organizationId) {
        return NextResponse.json(
          { error: "organizationId required for M2M calls" },
          { status: 400 }
        );
      }

      const userId = (body.userId as string | undefined) ?? null;
      const inputPayload =
        (body.inputPayload as Record<string, unknown> | undefined) ?? {};

      return await enqueueProcess(templateType, organizationId, userId, inputPayload, "m2m");
    }

    // ── Auth: Supabase JWT ────────────────────────────────────────────────────
    let supabase;
    try {
      supabase = await createClient();
    } catch {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

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

    // Resolve org membership — scopes this process to the caller's workspace
    const { data: membership } = await supabase
      .from("org_members")
      .select("organization_id")
      .eq("user_id", user.id)
      .limit(1)
      .single();

    if (!membership) {
      return NextResponse.json(
        { error: "No workspace membership found" },
        { status: 403 }
      );
    }

    let body: Record<string, unknown>;
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      body = {};
    }

    const inputPayload =
      (body.inputPayload as Record<string, unknown> | undefined) ?? {};

    return await enqueueProcess(
      templateType,
      membership.organization_id as string,
      user.id,
      inputPayload,
      "user"
    );
  } catch (err) {
    logger.warn("[/api/process] POST threw", {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ── Internal: create instance + enqueue job ───────────────────────────────────

async function enqueueProcess(
  templateType: string,
  organizationId: string,
  userId: string | null,
  inputPayload: Record<string, unknown>,
  source: "user" | "m2m"
): Promise<NextResponse> {
  // M2M calls must use service client (no user session); user calls use createClient (RLS-scoped)
  let supabase;
  try {
    supabase = source === "m2m" ? await createServiceClient() : await createClient();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ── Create bpaas_process_instances row ──────────────────────────────────────
  // Column notes from migration:
  //   current_state TEXT — the named FSM state (e.g. "DECOMPOSE")
  //   fsm_state     JSONB — working memory for FSM (not the state name)
  //   initiated_by  TEXT — 'user' | 'm2m' | 'copilot' | 'cron' | 'a2a'
  //   created_by    UUID — user_id (nullable)
  const { data: instance, error: instanceError } = await supabase
    .from("bpaas_process_instances")
    .insert({
      organization_id: organizationId,
      process_type: templateType,
      current_state: "DECOMPOSE",
      fsm_state: {},
      input_payload: inputPayload,
      state_history: [],
      status: "running",
      initiated_by: source,
      created_by: userId ?? undefined,
    })
    .select("id")
    .single();

  if (instanceError || !instance) {
    logger.warn("[/api/process] Failed to create process instance", {
      error: instanceError?.message,
      templateType,
      organizationId,
    });
    return NextResponse.json(
      { error: "Failed to create process instance" },
      { status: 500 }
    );
  }

  // ── Enqueue agent_queue job ──────────────────────────────────────────────────
  // agent_type stays 'bpaas' (DB internal value, backward compat with worker)
  const { data: job, error: jobError } = await supabase
    .from("agent_queue")
    .insert({
      organization_id: organizationId,
      agent_type: "bpaas",
      task_type: templateType,
      priority: "normal",
      payload: {
        processType: templateType,
        organizationId,
        inputPayload,
        processInstanceId: instance.id,
        userId,
      },
      status: "pending",
    })
    .select("id")
    .single();

  if (jobError || !job) {
    logger.warn("[/api/process] Failed to enqueue job", {
      error: jobError?.message,
      templateType,
      processInstanceId: instance.id,
    });
    return NextResponse.json(
      { error: "Failed to enqueue process job" },
      { status: 500 }
    );
  }

  // Update process instance with the agent_queue job id now that we have it
  void supabase
    .from("bpaas_process_instances")
    .update({ agent_job_id: job.id })
    .eq("id", instance.id);

  logger.warn("[/api/process] Process enqueued", {
    templateType,
    jobId: job.id,
    processInstanceId: instance.id,
    organizationId,
    source,
  });

  const estimatedStates = [
    "DECOMPOSE",
    "ASSESS",
    "COMPUTE",
    "POLICY_CHECK",
    "APPROVAL_GATE",
    "MUTATE",
    "SCHEDULE_NOTIFY",
    "COMPLETE",
  ];

  return NextResponse.json({
    jobId: job.id,
    processInstanceId: instance.id,
    templateType,
    status: "queued",
    estimatedStates,
    pollUrl: `/api/process/${templateType}/${job.id}`,
  });
}
