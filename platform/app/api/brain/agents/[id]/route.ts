/**
 * Brain Agents — Individual Agent Definition
 * ===========================================
 *
 * GET    /api/brain/agents/[id]  — Fetch a single agent definition
 * PATCH  /api/brain/agents/[id]  — Update name/description/domain/status/payload
 * DELETE /api/brain/agents/[id]  — Soft-delete (status = 'archived')
 */

import { createClient } from "@/lib/supabase/server";
import { getAdminClient, verifyWorkspaceMembership } from "@/lib/supabase/admin";
import { getCurrentWorkspaceId } from "@/lib/workspace-helpers";
import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { VALID_TASK_TYPES } from "../route";

export const dynamic = "force-dynamic";

// ── Shared: load + authorize an agent definition ────────────────────────────

async function loadAgent(
  userId: string,
  workspaceId: string,
  agentId: string
): Promise<{ row: any; error: NextResponse | null }> {
  const admin = getAdminClient();

  const { data: row, error } = await admin
    .from("se_aas_artifacts")
    .select("id, organization_id, domain_type, artifact_data, metadata, created_by, created_at")
    .eq("id", agentId)
    .eq("organization_id", workspaceId)
    .eq("domain_type", "agent-definition")
    .maybeSingle();

  if (error) {
    logger.error(`[/api/brain/agents/${agentId}] DB error:`, error);
    return { row: null, error: NextResponse.json({ error: "Internal server error" }, { status: 500 }) };
  }

  if (!row) {
    return { row: null, error: NextResponse.json({ error: "Agent not found" }, { status: 404 }) };
  }

  return { row, error: null };
}

function rowToDefinition(row: any) {
  const d = row.artifact_data ?? {};
  return {
    id: row.id,
    organizationId: row.organization_id,
    name: d.name ?? "Unnamed Agent",
    description: d.description ?? "",
    domain: d.domain ?? "custom",
    trigger: d.trigger ?? "manual",
    schedule: d.schedule ?? null,
    requiredInputs: d.requiredInputs ?? [],
    payload: d.defaultPayload ?? {},
    status: d.status ?? "active",
    brainEnabled: d.brainEnabled ?? true,
    rlEnabled: d.rlEnabled ?? true,
    memoryTracking: d.memoryTracking ?? true,
    createdBy: row.created_by ?? null,
    createdAt: row.created_at,
    lastRun: d.lastRun ?? null,
  };
}

// ── GET ───────────────────────────────────────────────────────────────────────

export async function GET(
  _req: NextRequest,
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

    const { row, error: rowError } = await loadAgent(user.id, workspaceId, id);
    if (rowError) return rowError;

    return NextResponse.json({ agent: rowToDefinition(row) });
  } catch (err) {
    logger.error("[GET /api/brain/agents/[id]] Unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ── PATCH ─────────────────────────────────────────────────────────────────────

export async function PATCH(
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

    const { row, error: rowError } = await loadAgent(user.id, workspaceId, id);
    if (rowError) return rowError;

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const existing = row.artifact_data ?? {};

    // Validate domain if being changed
    if (body.domain !== undefined && !VALID_TASK_TYPES.has(body.domain as string)) {
      return NextResponse.json(
        { error: `domain must be one of: ${Array.from(VALID_TASK_TYPES).join(", ")}` },
        { status: 400 }
      );
    }

    const validStatuses = ["active", "paused", "archived"];
    if (body.status !== undefined && !validStatuses.includes(body.status as string)) {
      return NextResponse.json(
        { error: "status must be: active, paused, or archived" },
        { status: 400 }
      );
    }

    const validTriggers = ["manual", "scheduled", "event"];

    // Merge patch into existing artifact_data
    const updated: Record<string, unknown> = { ...existing };
    if (body.name !== undefined) updated.name = String(body.name).trim();
    if (body.description !== undefined) updated.description = String(body.description).trim();
    if (body.domain !== undefined) updated.domain = body.domain;
    if (body.status !== undefined) updated.status = body.status;
    if (body.trigger !== undefined && validTriggers.includes(body.trigger as string)) {
      updated.trigger = body.trigger;
    }
    if (body.schedule !== undefined) updated.schedule = body.schedule;
    if (body.requiredInputs !== undefined && Array.isArray(body.requiredInputs)) {
      updated.requiredInputs = body.requiredInputs;
    }
    if (body.payload !== undefined && typeof body.payload === "object" && body.payload !== null) {
      updated.defaultPayload = body.payload;
    }
    if (body.brainEnabled !== undefined) updated.brainEnabled = Boolean(body.brainEnabled);
    if (body.rlEnabled !== undefined) updated.rlEnabled = Boolean(body.rlEnabled);
    if (body.memoryTracking !== undefined) updated.memoryTracking = Boolean(body.memoryTracking);

    const admin = getAdminClient();
    const { error: updateError } = await admin
      .from("se_aas_artifacts")
      .update({ artifact_data: updated })
      .eq("id", id)
      .eq("organization_id", workspaceId);

    if (updateError) {
      logger.error(`[PATCH /api/brain/agents/${id}] Update error:`, updateError);
      return NextResponse.json({ error: "Failed to update agent" }, { status: 500 });
    }

    return NextResponse.json({ success: true, agent: rowToDefinition({ ...row, artifact_data: updated }) });
  } catch (err) {
    logger.error("[PATCH /api/brain/agents/[id]] Unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ── DELETE ────────────────────────────────────────────────────────────────────

export async function DELETE(
  _req: NextRequest,
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

    const { row, error: rowError } = await loadAgent(user.id, workspaceId, id);
    if (rowError) return rowError;

    const existing = row.artifact_data ?? {};

    // Soft-delete: set status = 'archived' inside artifact_data
    const admin = getAdminClient();
    const { error: updateError } = await admin
      .from("se_aas_artifacts")
      .update({
        artifact_data: {
          ...existing,
          status: "archived",
          archivedAt: new Date().toISOString(),
          archivedBy: user.id,
        },
      })
      .eq("id", id)
      .eq("organization_id", workspaceId);

    if (updateError) {
      logger.error(`[DELETE /api/brain/agents/${id}] Archive error:`, updateError);
      return NextResponse.json({ error: "Failed to archive agent" }, { status: 500 });
    }

    logger.warn(`[DELETE /api/brain/agents/${id}] Agent archived by ${user.id}`);

    return NextResponse.json({ success: true, message: "Agent archived" });
  } catch (err) {
    logger.error("[DELETE /api/brain/agents/[id]] Unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
