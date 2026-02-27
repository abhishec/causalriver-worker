/**
 * GET /api/brain/decisions
 *
 * Returns paginated AI decision audit log for the current workspace.
 * EU AI Act Article 13 compliance endpoint — full explainability of every
 * autonomous brain decision (domain routing, model selection, agent dispatch).
 *
 * Query params:
 *   ?limit=50           — max entries (default: 50, max: 200)
 *   ?domain=pod-match   — filter by domain
 *   ?type=domain_routing — filter by decision_type
 *   ?since=2026-01-01   — filter by created_at >= date
 *
 * Auth: org membership required. Uses admin client for read to bypass RLS
 *   recursion on org_members, but still scopes to organization_id.
 */

export const dynamic = "force-dynamic";

import { createClient } from "@/lib/supabase/server";
import { getAdminClient, verifyWorkspaceMembership } from "@/lib/supabase/admin";
import { getCurrentWorkspaceId } from "@/lib/workspace-helpers";
import { getDecisionLog, type DecisionType } from "@/lib/brain/decision-log";
import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger";

export async function GET(request: NextRequest) {
  // ── Auth: isolate createClient() AND getUser() each in try/catch (500→401 Lambda pattern) ──
  let supabase;
  let user = null;
  try {
    supabase = await createClient();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const { data } = await supabase.auth.getUser();
    user = data?.user;
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!user || !supabase) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let admin;
  try {
    admin = getAdminClient();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // ── Resolve workspace ────────────────────────────────────────────────────
    const url = request.nextUrl;
    const requestedOrgId = url.searchParams.get("orgId");

    let organizationId: string | null = null;

    if (requestedOrgId) {
      const membership = await verifyWorkspaceMembership(user.id, requestedOrgId);
      if (!membership) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      organizationId = requestedOrgId;
    } else {
      organizationId = (await getCurrentWorkspaceId()) || null;
      if (organizationId) {
        const membership = await verifyWorkspaceMembership(user.id, organizationId);
        if (!membership) organizationId = null;
      }
    }

    if (!organizationId) {
      return NextResponse.json({ decisions: [] }, { status: 200 });
    }

    // ── Parse query params ──────────────────────────────────────────────────
    const rawLimit = parseInt(url.searchParams.get("limit") ?? "50", 10);
    const limit = isNaN(rawLimit) || rawLimit < 1 ? 50 : Math.min(rawLimit, 200);

    const domain = url.searchParams.get("domain") ?? undefined;
    const decisionType = url.searchParams.get("type") as DecisionType | null ?? undefined;

    let since: Date | undefined;
    const sinceParam = url.searchParams.get("since");
    if (sinceParam) {
      const parsed = new Date(sinceParam);
      if (!isNaN(parsed.getTime())) since = parsed;
    }

    // ── Query ───────────────────────────────────────────────────────────────
    // Use admin client — it bypasses RLS recursion on org_members while still
    // scoping to organizationId via the getDecisionLog query filter.
    const decisions = await getDecisionLog(admin, organizationId, {
      limit,
      domain,
      decisionType,
      since,
    });

    return NextResponse.json({ decisions });
  } catch (err) {
    logger.warn("[brain/decisions] Unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
