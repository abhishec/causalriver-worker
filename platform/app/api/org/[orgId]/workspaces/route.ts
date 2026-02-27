import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { NextResponse, type NextRequest } from "next/server";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * GET /api/org/[orgId]/workspaces
 *
 * Returns engagements with Git repos configured for the given organization.
 * Used by the Early Warning command gathering step to select a workspace.
 * "Workspace" in this context = engagement with at least one github_repo.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ orgId: string }> },
) {
    const { orgId } = await params;
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
    const { orgId } = await params;

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

    // Fetch engagements with Git repos configured (github_repos is non-empty)
    const { data: rows, error } = await admin
      .from("engagements")
      .select("id, engagement_name, client_name, github_repos, jira_projects, status, pod_name, tech_stack")
      .eq("organization_id", orgId)
      .filter("github_repos", "neq", "{}")
      .order("engagement_name", { ascending: true });

    if (error) {
      logger.error("[/api/org/[orgId]/workspaces] query error:", error);
      return NextResponse.json({ error: "Internal error" }, { status: 500 });
    }

    // Map to value/label pairs expected by the gathering UI
    const workspaces = (rows ?? []).map((e) => ({
      value: e.id,
      label: `${e.engagement_name} (${e.client_name})`,
      engagement_name: e.engagement_name,
      client_name: e.client_name,
      github_repos: e.github_repos,
      jira_projects: e.jira_projects,
      status: e.status,
      pod_name: e.pod_name,
      tech_stack: e.tech_stack,
    }));

    return NextResponse.json({ workspaces });
  } catch (err) {
    logger.error("[/api/org/[orgId]/workspaces] error:", err);
    return NextResponse.json(
      { error: "Internal error" },
      { status: 500 },
    );
  }
}
