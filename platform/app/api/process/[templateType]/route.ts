/**
 * Process Engine — POST /api/process/[templateType]
 * ==================================================
 * Queue any registered process template as a bpaas job.
 *
 * Auth (two modes):
 *   1. Bearer <SE_AAS_WORKER_SECRET>  — M2M service account
 *   2. Bearer <supabase-jwt>          — user auth (+ X-Workspace-Id header)
 *
 * Body: { inputPayload: Record<string,unknown>, userId?: string, priority?: 'low'|'normal'|'high' }
 *
 * Returns 202: { jobId, instanceId, templateType, status: 'queued', message }
 */

import { NextRequest, NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { isProcessTemplate } from "@/lib/process-engine/templates";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

// ── Static env capture (Amplify SSR Lambda requires static member access) ───
const _SE_AAS_WORKER_SECRET = process.env.SE_AAS_WORKER_SECRET;

// ── Priority map: string → numeric agent_queue priority ─────────────────────
const PRIORITY_MAP: Record<string, number> = {
  low: 1,
  normal: 5,
  high: 10,
};

// ── Auth helper ──────────────────────────────────────────────────────────────

async function authenticate(request: NextRequest): Promise<{
  userId: string;
  isWorker: boolean;
  organizationId?: string;
} | null> {
  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";

  if (!token) return null;

  // Mode 1: SE_AAS_WORKER_SECRET (M2M)
  if (_SE_AAS_WORKER_SECRET && token === _SE_AAS_WORKER_SECRET) {
    const workspaceId = request.headers.get("x-workspace-id") ?? undefined;
    return { userId: "process-worker", isWorker: true, organizationId: workspaceId };
  }

  // Mode 2: Supabase JWT (user auth)
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.getUser(token);
    if (!error && data.user) {
      return { userId: data.user.id, isWorker: false };
    }
  } catch (err: unknown) {
    logger.warn("[process/[templateType]] createClient/getUser threw — Lambda cold-start or missing env", {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return null;
}

// ── POST ─────────────────────────────────────────────────────────────────────

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ templateType: string }> }
) {
  try {
    const { templateType } = await params;

    // Validate templateType against the registered process templates
    if (!isProcessTemplate(templateType)) {
      return NextResponse.json(
        {
          error: `Unknown process template: ${templateType}. Use GET /api/process/templates to list valid templates.`,
        },
        { status: 400 }
      );
    }

    const auth = await authenticate(request);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let body: {
      inputPayload?: Record<string, unknown>;
      userId?: string;
      priority?: "low" | "normal" | "high";
      organizationId?: string;
    };

    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const inputPayload = body.inputPayload ?? {};
    const priority = PRIORITY_MAP[body.priority ?? "normal"] ?? 5;

    // Resolve organizationId: M2M passes X-Workspace-Id header, user auth uses body or header
    const organizationId =
      auth.organizationId ??
      body.organizationId ??
      request.headers.get("x-workspace-id") ??
      null;

    if (!organizationId) {
      return NextResponse.json(
        {
          error:
            "Missing organizationId. Pass it in the request body (user auth) or X-Workspace-Id header (M2M).",
        },
        { status: 400 }
      );
    }

    const admin = getAdminClient();

    // For non-worker auth, verify org membership
    if (!auth.isWorker) {
      const { data: membership } = await admin
        .from("org_members")
        .select("role")
        .eq("user_id", auth.userId)
        .eq("organization_id", organizationId)
        .maybeSingle();

      if (!membership) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    // All 17 built-in process templates use DECOMPOSE as their initial FSM state.
    // getProcessTemplate() is async (DB lookup) — using the hardcoded constant here
    // avoids an extra DB round-trip in the hot path. If custom templates are added
    // with a different initial state, update this lookup.
    const initialState = "DECOMPOSE";

    // 1. Insert to agent_queue
    const queueRow: Record<string, unknown> = {
      organization_id: organizationId,
      agent_type: "bpaas",
      task_type: templateType,
      priority,
      payload: {
        ...inputPayload,
        source: "process-api",
        userId: auth.userId,
      },
      status: "pending",
    };

    const { data: job, error: jobError } = await admin
      .from("agent_queue")
      .insert(queueRow)
      .select("id, created_at")
      .single();

    if (jobError || !job) {
      logger.error("[process/[templateType] POST] Failed to insert agent_queue row", {
        error: jobError?.message,
        templateType,
        organizationId,
      });
      return NextResponse.json(
        { error: "Failed to queue process job" },
        { status: 500 }
      );
    }

    // 2. Insert to bpaas_process_instances
    const instanceRow: Record<string, unknown> = {
      organization_id: organizationId,
      process_type: templateType,
      agent_job_id: job.id,
      current_state: initialState,
      status: "running",
      input_payload: inputPayload,
      initiated_by: "process-api",
      created_by: auth.isWorker ? null : auth.userId,
    };

    const { data: instance, error: instanceError } = await admin
      .from("bpaas_process_instances")
      .insert(instanceRow)
      .select("id")
      .single();

    if (instanceError || !instance) {
      logger.error("[process/[templateType] POST] Failed to insert bpaas_process_instances row", {
        error: instanceError?.message,
        jobId: job.id,
        templateType,
      });
      // Job is queued — return partial success so caller can still poll
      return NextResponse.json(
        {
          jobId: job.id,
          instanceId: null,
          templateType,
          status: "queued",
          message: `Process queued (instance tracking unavailable). Poll /api/process/${templateType}/${job.id} for status.`,
          warning: "bpaas_process_instances insert failed — execution will still proceed",
        },
        { status: 202 }
      );
    }

    logger.warn(
      `[process/[templateType] POST] Queued: job=${job.id} instance=${instance.id} template=${templateType} org=${organizationId}`
    );

    return NextResponse.json(
      {
        jobId: job.id,
        instanceId: instance.id,
        templateType,
        status: "queued",
        message: `Process queued. Poll /api/process/${templateType}/${job.id} for status.`,
      },
      { status: 202 }
    );
  } catch (err: unknown) {
    logger.error("[process/[templateType] POST] Unexpected error", {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
