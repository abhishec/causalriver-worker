export const dynamic = "force-dynamic";
/**
 * PATCH  /api/connectors/writeback/rules/[id]
 * DELETE /api/connectors/writeback/rules/[id]
 *
 * Update (toggle enabled, change config, rename) or delete a specific
 * write-back rule. All mutations are scoped to the authenticated user's
 * workspace via organization_id check.
 *
 * PATCH response:  { rule: WritebackRule }
 * DELETE response: { success: true }
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspaceId } from "@/lib/workspace-helpers";
import { logger } from "@/lib/logger";
import { requireOrgRole } from "@/lib/auth/check-org-role";

// ---------------------------------------------------------------------------
// PATCH /api/connectors/writeback/rules/[id]
// ---------------------------------------------------------------------------

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let supabase: Awaited<ReturnType<typeof createClient>>;
  try {
    supabase = await createClient();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  let user = null;
  try {
    const { data: _routeAuthData } = await supabase.auth.getUser();
    user = _routeAuthData.user;
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {

    const workspaceId = await getCurrentWorkspaceId();
    if (!workspaceId) {
      return NextResponse.json({ error: "No workspace found" }, { status: 403 });
    }

    // Only admin or owner may update write-back rules
    const { allowed: patchAllowed } = await requireOrgRole(supabase, user.id, workspaceId, ["admin", "owner"]);
    if (!patchAllowed) {
      return NextResponse.json(
        { error: "Only workspace admins can manage write-back rules" },
        { status: 403 }
      );
    }

    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "Rule ID is required" }, { status: 400 });
    }

    // Verify the rule belongs to this org before modifying
    const { data: existing, error: fetchError } = await supabase
      .from("connector_writeback_rules")
      .select("id, organization_id")
      .eq("id", id)
      .eq("organization_id", workspaceId)
      .maybeSingle();

    if (fetchError) {
      logger.warn("[writeback/rules/[id]/PATCH] Fetch error:", fetchError.message);
      return NextResponse.json({ error: "Failed to fetch rule" }, { status: 500 });
    }

    if (!existing) {
      return NextResponse.json({ error: "Rule not found" }, { status: 404 });
    }

    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    // Build a partial update — only include fields present in body
    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (body.name !== undefined) {
      if (typeof body.name !== "string" || !body.name.trim()) {
        return NextResponse.json({ error: "name must be a non-empty string" }, { status: 400 });
      }
      updates.name = String(body.name).trim();
    }

    if (body.description !== undefined) {
      updates.description = body.description ? String(body.description).trim() : null;
    }

    if (body.enabled !== undefined) {
      updates.enabled = Boolean(body.enabled);
    }

    if (body.domain_type !== undefined) {
      const validDomains = [
        "pod-match",
        "scope-creep",
        "early-warning",
        "incident-diagnosis",
        "pr-review",
        "delivery-intelligence",
      ];
      if (!validDomains.includes(body.domain_type as string)) {
        return NextResponse.json(
          { error: `Invalid domain_type. Must be one of: ${validDomains.join(", ")}` },
          { status: 400 }
        );
      }
      updates.domain_type = body.domain_type;
    }

    if (body.connector_type !== undefined) {
      const validConnectors = ["slack", "jira", "github"];
      if (!validConnectors.includes(body.connector_type as string)) {
        return NextResponse.json(
          { error: `Invalid connector_type. Must be one of: ${validConnectors.join(", ")}` },
          { status: 400 }
        );
      }
      updates.connector_type = body.connector_type;
    }

    if (body.action_type !== undefined) {
      const validActions = ["post_message", "create_ticket", "create_issue", "add_pr_comment"];
      if (!validActions.includes(body.action_type as string)) {
        return NextResponse.json(
          { error: `Invalid action_type. Must be one of: ${validActions.join(", ")}` },
          { status: 400 }
        );
      }
      updates.action_type = body.action_type;
    }

    if (body.action_config !== undefined) {
      if (typeof body.action_config !== "object" || Array.isArray(body.action_config)) {
        return NextResponse.json(
          { error: "action_config must be a JSON object" },
          { status: 400 }
        );
      }
      updates.action_config = body.action_config;
    }

    if (body.condition_filter !== undefined) {
      // Allow null to clear the filter
      if (
        body.condition_filter !== null &&
        (typeof body.condition_filter !== "object" || Array.isArray(body.condition_filter))
      ) {
        return NextResponse.json(
          { error: "condition_filter must be a JSON object or null" },
          { status: 400 }
        );
      }
      updates.condition_filter = body.condition_filter;
    }

    // Reject patches that only contain updated_at (no real changes)
    if (Object.keys(updates).length === 1) {
      return NextResponse.json(
        { error: "No updatable fields provided" },
        { status: 400 }
      );
    }

    const { data: updated, error: updateError } = await supabase
      .from("connector_writeback_rules")
      .update(updates)
      .eq("id", id)
      .eq("organization_id", workspaceId)
      .select(
        "id, organization_id, name, description, domain_type, connector_type, action_type, action_config, condition_filter, enabled, created_by, created_at, updated_at"
      )
      .single();

    if (updateError || !updated) {
      logger.error("[writeback/rules/[id]/PATCH] Update error:", updateError?.message);
      return NextResponse.json(
        { error: updateError?.message ?? "Failed to update rule" },
        { status: 500 }
      );
    }

    logger.warn(
      `[writeback/rules/[id]/PATCH] Updated rule "${updated.name}" (${id}) for org ${workspaceId}`
    );

    return NextResponse.json({ rule: updated });
  } catch (err) {
    logger.error("[writeback/rules/[id]/PATCH] Unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// DELETE /api/connectors/writeback/rules/[id]
// ---------------------------------------------------------------------------

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let supabase: Awaited<ReturnType<typeof createClient>>;
  try {
    supabase = await createClient();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  let user = null;
  try {
    const { data: _routeAuthData } = await supabase.auth.getUser();
    user = _routeAuthData.user;
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {

    const workspaceId = await getCurrentWorkspaceId();
    if (!workspaceId) {
      return NextResponse.json({ error: "No workspace found" }, { status: 403 });
    }

    // Only admin or owner may delete write-back rules
    const { allowed: deleteAllowed } = await requireOrgRole(supabase, user.id, workspaceId, ["admin", "owner"]);
    if (!deleteAllowed) {
      return NextResponse.json(
        { error: "Only workspace admins can manage write-back rules" },
        { status: 403 }
      );
    }

    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "Rule ID is required" }, { status: 400 });
    }

    // Verify the rule belongs to this org before deleting
    const { data: existing, error: fetchError } = await supabase
      .from("connector_writeback_rules")
      .select("id, name, organization_id")
      .eq("id", id)
      .eq("organization_id", workspaceId)
      .maybeSingle();

    if (fetchError) {
      logger.warn("[writeback/rules/[id]/DELETE] Fetch error:", fetchError.message);
      return NextResponse.json({ error: "Failed to fetch rule" }, { status: 500 });
    }

    if (!existing) {
      return NextResponse.json({ error: "Rule not found" }, { status: 404 });
    }

    const { error: deleteError } = await supabase
      .from("connector_writeback_rules")
      .delete()
      .eq("id", id)
      .eq("organization_id", workspaceId);

    if (deleteError) {
      logger.error("[writeback/rules/[id]/DELETE] Delete error:", deleteError.message);
      return NextResponse.json(
        { error: deleteError.message ?? "Failed to delete rule" },
        { status: 500 }
      );
    }

    logger.warn(
      `[writeback/rules/[id]/DELETE] Deleted rule "${existing.name}" (${id}) for org ${workspaceId}`
    );

    return NextResponse.json({ success: true });
  } catch (err) {
    logger.error("[writeback/rules/[id]/DELETE] Unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
