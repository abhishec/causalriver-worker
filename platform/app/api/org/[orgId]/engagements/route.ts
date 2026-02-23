import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { NextResponse, type NextRequest } from "next/server";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * GET /api/org/[orgId]/engagements
 *
 * Returns all engagements for the given organization.
 * Used by Delivery Intelligence, Pod Match, and Scope Creep command gathering.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ orgId: string }> },
) {
  try {
    const { orgId } = await params;

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verify user is a member of this org
    const admin = getAdminClient();
    const { data: membership } = await admin
      .from("org_members")
      .select("organization_id")
      .eq("user_id", user.id)
      .eq("organization_id", orgId)
      .maybeSingle();

    if (!membership) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Fetch all engagements for this org
    const { data: rows, error } = await admin
      .from("engagements")
      .select("id, engagement_name, client_name, github_repos, jira_projects, slack_channels, pod_id, pod_name, status, start_date, target_end_date, tech_stack")
      .eq("organization_id", orgId)
      .order("status", { ascending: true })
      .order("engagement_name", { ascending: true });

    if (error) {
      logger.error("[/api/org/[orgId]/engagements] query error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Map to value/label pairs expected by the gathering UI
    const engagements = (rows ?? []).map((e) => ({
      value: e.id,
      label: `${e.engagement_name} (${e.client_name})${e.status !== "active" ? ` [${e.status}]` : ""}`,
      engagement_name: e.engagement_name,
      client_name: e.client_name,
      github_repos: e.github_repos,
      jira_projects: e.jira_projects,
      slack_channels: e.slack_channels,
      pod_name: e.pod_name,
      status: e.status,
      start_date: e.start_date,
      target_end_date: e.target_end_date,
      tech_stack: e.tech_stack,
    }));

    return NextResponse.json({ engagements });
  } catch (err) {
    logger.error("[/api/org/[orgId]/engagements] error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 },
    );
  }
}
