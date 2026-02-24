export const dynamic = "force-dynamic";

import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger";

const VALID_SERVICES = ["seaas", "aas", "general"];

/**
 * GET /api/workspace/services?workspaceId=xxx
 *
 * Returns active AI worker services for a workspace.
 * Reads from organizations.settings->>'active_services' JSONB.
 * Falls back to all services if not configured.
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const workspaceId = request.nextUrl.searchParams.get("workspaceId");
    if (!workspaceId) {
      return NextResponse.json({ error: "workspaceId required" }, { status: 400 });
    }

    const admin = getAdminClient();
    const { data, error } = await admin
      .from("organizations")
      .select("settings")
      .eq("id", workspaceId)
      .single();

    if (error) {
      logger.error("[/api/workspace/services] query error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const settings = (data?.settings as Record<string, unknown>) ?? {};
    const services = Array.isArray(settings.active_services)
      ? (settings.active_services as string[]).filter((s) => VALID_SERVICES.includes(s))
      : VALID_SERVICES; // default: all services available

    return NextResponse.json({ services });
  } catch (err) {
    logger.error("[/api/workspace/services] error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/workspace/services
 *
 * Updates active AI worker services for a workspace.
 * Stores in organizations.settings.active_services JSONB field.
 * Requires admin/owner role.
 */
export async function PUT(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json();
    const { workspaceId, services } = body as { workspaceId?: string; services?: string[] };

    if (!workspaceId || !Array.isArray(services)) {
      return NextResponse.json({ error: "workspaceId and services[] required" }, { status: 400 });
    }

    const validServices = services.filter((s) => VALID_SERVICES.includes(s));
    if (validServices.length === 0) {
      return NextResponse.json({ error: "At least one valid service required" }, { status: 400 });
    }

    // Verify user is admin/owner of this workspace
    const admin = getAdminClient();
    const { data: membership } = await admin
      .from("org_members")
      .select("role")
      .eq("user_id", user.id)
      .eq("organization_id", workspaceId)
      .single();

    if (!membership || !["admin", "owner"].includes(membership.role)) {
      return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
    }

    // Read current settings, merge active_services
    const { data: org } = await admin
      .from("organizations")
      .select("settings")
      .eq("id", workspaceId)
      .single();

    const currentSettings = (org?.settings as Record<string, unknown>) ?? {};
    const updatedSettings = { ...currentSettings, active_services: validServices };

    const { error: updateErr } = await admin
      .from("organizations")
      .update({ settings: updatedSettings })
      .eq("id", workspaceId);

    if (updateErr) {
      logger.error("[/api/workspace/services] update error:", updateErr);
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, services: validServices });
  } catch (err) {
    logger.error("[/api/workspace/services] error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}
