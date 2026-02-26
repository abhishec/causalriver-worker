export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";

/**
 * POST /api/workspace/service-templates/activate
 *
 * Activates a service template for a workspace.
 * Creates a workspace_service_activations record and updates
 * organizations.settings.active_services for backward compatibility.
 *
 * Body: { workspaceId: string, serviceType: string }
 * Requires admin or owner role.
 *
 * DELETE /api/workspace/service-templates/activate
 * Deactivates a service for a workspace.
 * Body: { workspaceId: string, serviceType: string }
 */

const VALID_SERVICE_TYPES = ["se-aas", "aas", "pm-aas"];

// Map new service types to legacy active_services format
const SERVICE_TYPE_LEGACY_MAP: Record<string, string> = {
  "se-aas": "seaas",
  "aas": "aas",
  "pm-aas": "pmass",
};

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const { workspaceId, serviceType } = body as { workspaceId?: string; serviceType?: string };

    if (!workspaceId || !serviceType) {
      return NextResponse.json({ error: "workspaceId and serviceType required" }, { status: 400 });
    }
    if (!VALID_SERVICE_TYPES.includes(serviceType)) {
      return NextResponse.json({
        error: `Invalid serviceType. Valid: ${VALID_SERVICE_TYPES.join(", ")}`,
      }, { status: 400 });
    }

    const admin = getAdminClient();

    // Verify requester is admin/owner
    const { data: membership } = await supabase
      .from("org_members")
      .select("role, organization_id")
      .eq("user_id", user.id)
      .eq("organization_id", workspaceId)
      .maybeSingle();

    if (!membership || !["admin", "owner"].includes(membership.role)) {
      return NextResponse.json({ error: "Only workspace admins can activate services" }, { status: 403 });
    }

    // Verify workspace exists
    const { data: workspace } = await admin
      .from("ai_workspace")
      .select("id, organization_id")
      .eq("id", workspaceId)
      .maybeSingle();

    // If workspace not found, try organizations table (workspace may = org)
    const orgId = workspace?.organization_id ?? workspaceId;
    const resolvedWorkspaceId = workspace?.id ?? workspaceId;

    // Upsert activation record
    const { error: activationError } = await admin
      .from("workspace_service_activations")
      .upsert({
        workspace_id: resolvedWorkspaceId,
        organization_id: orgId,
        service_type: serviceType,
        activated_by: user.id,
        activated_at: new Date().toISOString(),
      }, { onConflict: "workspace_id,service_type" });

    if (activationError) {
      logger.error("[activate] upsert failed:", activationError);
      return NextResponse.json({ error: "Activation failed" }, { status: 500 });
    }

    // Also update legacy organizations.settings.active_services for backward compat
    const { data: org } = await admin
      .from("organizations")
      .select("settings")
      .eq("id", orgId)
      .maybeSingle();

    const currentSettings = (org?.settings as Record<string, unknown>) ?? {};
    const currentServices = Array.isArray(currentSettings.active_services)
      ? (currentSettings.active_services as string[])
      : [];
    const legacyKey = SERVICE_TYPE_LEGACY_MAP[serviceType] ?? serviceType;
    if (!currentServices.includes(legacyKey)) {
      await admin
        .from("organizations")
        .update({
          settings: { ...currentSettings, active_services: [...currentServices, legacyKey] },
        })
        .eq("id", orgId);
    }

    logger.warn(`[service-templates/activate] Activated ${serviceType} for workspace ${resolvedWorkspaceId}`);

    // Return the template details so UI can immediately show commands
    const { data: template } = await admin
      .from("service_templates")
      .select("*")
      .eq("service_type", serviceType)
      .maybeSingle();

    return NextResponse.json({
      ok: true,
      serviceType,
      template,
    });
  } catch (err) {
    logger.error("[service-templates/activate] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const { workspaceId, serviceType } = body as { workspaceId?: string; serviceType?: string };

    if (!workspaceId || !serviceType) {
      return NextResponse.json({ error: "workspaceId and serviceType required" }, { status: 400 });
    }

    const admin = getAdminClient();

    // Verify admin/owner
    const { data: membership } = await supabase
      .from("org_members")
      .select("role")
      .eq("user_id", user.id)
      .eq("organization_id", workspaceId)
      .maybeSingle();

    if (!membership || !["admin", "owner"].includes(membership.role)) {
      return NextResponse.json({ error: "Only workspace admins can deactivate services" }, { status: 403 });
    }

    await admin
      .from("workspace_service_activations")
      .delete()
      .eq("workspace_id", workspaceId)
      .eq("service_type", serviceType);

    return NextResponse.json({ ok: true, deactivated: serviceType });
  } catch (err) {
    logger.error("[service-templates/activate DELETE] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
