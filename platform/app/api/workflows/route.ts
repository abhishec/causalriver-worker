export const dynamic = "force-dynamic";
/**
 * Workflows API — List and Create
 * ================================
 *
 * GET /api/workflows — List org workflows
 * POST /api/workflows — Create a new workflow
 */

import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getCurrentWorkspaceId } from "@/lib/workspace-helpers";
import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger";

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const workspaceId = request.nextUrl.searchParams.get("organizationId") || await getCurrentWorkspaceId();

    const limit = Math.min(Number(request.nextUrl.searchParams.get("limit")) || 50, 200);

    const { data: workflows, error } = await supabase
      .from("workflows")
      .select("*")
      .eq("organization_id", workspaceId)
      .neq("status", "archived")
      .order("updated_at", { ascending: false })
      .limit(limit);

    if (error) {
      logger.error("[Workflows] List error:", error.message);
      return NextResponse.json({ error: "Failed to fetch workflows" }, { status: 500 });
    }

    return NextResponse.json({ workflows: workflows || [] });
  } catch (error: any) {
    logger.error("[Workflows] Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const workspaceId = await getCurrentWorkspaceId();
    const body = await request.json();
    const { name, description, steps, service_vertical, is_template, template_source, gathering_schema } = body;

    if (!name || !steps || !Array.isArray(steps) || steps.length < 2) {
      return NextResponse.json({ error: "name and at least 2 steps are required" }, { status: 400 });
    }

    const service = await createServiceClient();

    const { data: workflow, error } = await service
      .from("workflows")
      .insert({
        organization_id: workspaceId,
        created_by: user.id,
        name,
        description: description || null,
        service_vertical: service_vertical || "general",
        steps,
        is_template: is_template || false,
        template_source: template_source || null,
        gathering_schema: gathering_schema || null,
        status: "active",
      })
      .select("id, name")
      .single();

    if (error || !workflow) {
      logger.error("[Workflows] Insert error:", error?.message);
      return NextResponse.json({ error: "Failed to create workflow" }, { status: 500 });
    }

    return NextResponse.json({ workflow });
  } catch (error: any) {
    logger.error("[Workflows] Create error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
