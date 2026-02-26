export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";

/**
 * GET /api/workspace/service-templates
 *
 * Returns all available service templates (SE-aaS, AaaS, PM-aaS)
 * with their full domain list, commands, and artifact schemas.
 *
 * Optional: ?workspaceId=xxx — includes activation status for that workspace.
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const workspaceId = req.nextUrl.searchParams.get("workspaceId");
    const admin = getAdminClient();

    // Fetch all active service templates
    const { data: templates, error } = await admin
      .from("service_templates")
      .select("*")
      .eq("is_active", true)
      .order("sort_order", { ascending: true });

    if (error) {
      logger.error("[/api/workspace/service-templates] query error:", error);
      return NextResponse.json({ error: "Failed to load templates" }, { status: 500 });
    }

    // If workspaceId provided, fetch activation status
    let activations: Record<string, unknown>[] = [];
    if (workspaceId) {
      // Verify membership
      const { data: membership } = await supabase
        .from("org_members")
        .select("role")
        .eq("user_id", user.id)
        .eq("organization_id", workspaceId)
        .maybeSingle();

      if (!membership) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }

      const { data: activationData } = await admin
        .from("workspace_service_activations")
        .select("service_type, custom_commands, custom_config, activated_at")
        .eq("workspace_id", workspaceId);

      activations = (activationData ?? []) as Record<string, unknown>[];
    }

    // Merge activation status into templates
    const activationMap = new Map(activations.map((a) => [a.service_type as string, a]));
    const enrichedTemplates = (templates ?? []).map((t) => ({
      ...t,
      is_activated: activationMap.has(t.service_type),
      activation: activationMap.get(t.service_type) ?? null,
    }));

    return NextResponse.json({ templates: enrichedTemplates });
  } catch (err) {
    logger.error("[/api/workspace/service-templates] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
