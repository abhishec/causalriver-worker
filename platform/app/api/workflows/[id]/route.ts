export const dynamic = "force-dynamic";
/**
 * Single Workflow API — Get, Update, Delete
 * ==========================================
 *
 * GET    /api/workflows/[id]  — Fetch workflow detail
 * PATCH  /api/workflows/[id]  — Update workflow (name, description, steps, status)
 * DELETE /api/workflows/[id]  — Archive workflow (soft delete)
 */

import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getCurrentWorkspaceId } from "@/lib/workspace-helpers";
import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger";

interface Props {
  params: Promise<{ id: string }>;
}

export async function GET(_request: NextRequest, { params }: Props) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const workspaceId = await getCurrentWorkspaceId();

    const { data: workflow, error } = await supabase
      .from("workflows")
      .select("*")
      .eq("id", id)
      .eq("organization_id", workspaceId)
      .single();

    if (error || !workflow) {
      return NextResponse.json({ error: "Workflow not found" }, { status: 404 });
    }

    // Also fetch recent runs for context
    const { data: recentRuns } = await supabase
      .from("workflow_runs")
      .select("id, status, current_step, total_steps, trigger_source, started_at, completed_at, duration_ms, created_at")
      .eq("workflow_id", id)
      .eq("organization_id", workspaceId)
      .order("created_at", { ascending: false })
      .limit(10);

    return NextResponse.json({
      workflow,
      recentRuns: recentRuns || [],
    });
  } catch (error: any) {
    logger.error("[Workflow] GET error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: Props) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const workspaceId = await getCurrentWorkspaceId();
    const service = await createServiceClient();

    // Verify workflow exists and belongs to this workspace
    const { data: existing } = await supabase
      .from("workflows")
      .select("id, created_by")
      .eq("id", id)
      .eq("organization_id", workspaceId)
      .single();

    if (!existing) {
      return NextResponse.json({ error: "Workflow not found" }, { status: 404 });
    }

    const body = await request.json();
    const allowedFields: Record<string, unknown> = {};

    if (body.name !== undefined) allowedFields.name = body.name;
    if (body.description !== undefined) allowedFields.description = body.description;
    if (body.steps !== undefined) {
      if (!Array.isArray(body.steps) || body.steps.length < 2) {
        return NextResponse.json({ error: "At least 2 steps are required" }, { status: 400 });
      }
      allowedFields.steps = body.steps;
    }
    if (body.service_vertical !== undefined) allowedFields.service_vertical = body.service_vertical;
    if (body.gathering_schema !== undefined) allowedFields.gathering_schema = body.gathering_schema;
    if (body.status !== undefined) {
      if (!["draft", "active", "archived"].includes(body.status)) {
        return NextResponse.json({ error: "Invalid status" }, { status: 400 });
      }
      allowedFields.status = body.status;
    }

    if (Object.keys(allowedFields).length === 0) {
      return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
    }

    allowedFields.updated_at = new Date().toISOString();

    const { data: updated, error } = await service
      .from("workflows")
      .update(allowedFields)
      .eq("id", id)
      .select("id, name, status, updated_at")
      .single();

    if (error) {
      logger.error("[Workflow] PATCH error:", error.message);
      return NextResponse.json({ error: "Failed to update workflow" }, { status: 500 });
    }

    return NextResponse.json({ workflow: updated });
  } catch (error: any) {
    logger.error("[Workflow] PATCH error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, { params }: Props) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const workspaceId = await getCurrentWorkspaceId();
    const service = await createServiceClient();

    // Verify workflow exists
    const { data: existing } = await supabase
      .from("workflows")
      .select("id, name")
      .eq("id", id)
      .eq("organization_id", workspaceId)
      .single();

    if (!existing) {
      return NextResponse.json({ error: "Workflow not found" }, { status: 404 });
    }

    // Check for active runs before archiving
    const { data: activeRuns } = await supabase
      .from("workflow_runs")
      .select("id")
      .eq("workflow_id", id)
      .in("status", ["pending", "running", "paused"])
      .limit(1);

    if (activeRuns && activeRuns.length > 0) {
      return NextResponse.json(
        { error: "Cannot archive workflow with active runs. Cancel them first." },
        { status: 409 }
      );
    }

    // Soft delete — set status to archived
    const { error } = await service
      .from("workflows")
      .update({
        status: "archived",
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (error) {
      logger.error("[Workflow] DELETE (archive) error:", error.message);
      return NextResponse.json({ error: "Failed to archive workflow" }, { status: 500 });
    }

    return NextResponse.json({ success: true, archived: id });
  } catch (error: any) {
    logger.error("[Workflow] DELETE error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
