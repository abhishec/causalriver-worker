/**
 * GET /api/brain/templates
 *
 * Returns process templates for the authenticated user's workspace.
 * Includes:
 *   - Templates owned by the current org (source: 'discovered' | 'manual' | 'imported')
 *   - Public/global templates visible to all orgs (is_public = true)
 *
 * Templates are sorted by success_rate DESC so the highest-quality
 * domain sequences surface first.
 *
 * Query params:
 *   ?limit=10    — max templates to return (default 10, max 50)
 *   ?orgId=<id>  — explicit org override (must be a member)
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminClient, verifyWorkspaceMembership } from "@/lib/supabase/admin";
import { getCurrentWorkspaceId } from "@/lib/workspace-helpers";
import { getTopTemplates } from "@/lib/brain/process-templates";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  // ── Auth: isolate createClient() AND getUser() failures so they return 401, never 500 ──
  let supabase;
  let user = null;
  try {
    supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    user = data?.user;
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!user || !supabase) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const url = new URL(request.url);
    const requestedOrgId = url.searchParams.get("orgId");
    const limitParam = url.searchParams.get("limit");
    const limit = Math.min(Math.max(parseInt(limitParam ?? "10", 10) || 10, 1), 50);

    let admin;
    try {
      admin = getAdminClient();
    } catch {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let organizationId: string | null = null;

    if (requestedOrgId) {
      // Verify the authenticated user is actually a member of the requested org
      const membership = await verifyWorkspaceMembership(user.id, requestedOrgId);
      if (!membership) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      organizationId = requestedOrgId;
    } else {
      // No orgId param — fall back to user's current workspace
      organizationId = (await getCurrentWorkspaceId()) || null;
      if (organizationId) {
        const membership = await verifyWorkspaceMembership(user.id, organizationId);
        if (!membership) {
          organizationId = null;
        }
      }
    }

    if (!organizationId) {
      return NextResponse.json({ templates: [] }, { status: 200 });
    }

    const templates = await getTopTemplates(admin, organizationId, limit);

    logger.warn(
      `[/api/brain/templates] org=${organizationId} returned=${templates.length} limit=${limit}`
    );

    return NextResponse.json({ templates });
  } catch (err) {
    logger.error("[/api/brain/templates] error:", {
      error: (err as Error)?.message ?? String(err),
      route: "/api/brain/templates",
    });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
