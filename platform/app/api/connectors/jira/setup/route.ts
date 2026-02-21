import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getCurrentWorkspaceId } from "@/lib/workspace-helpers";
import { logger } from "@/lib/logger";

/**
 * POST /api/connectors/jira/setup
 *
 * Validates Jira credentials (email + API token), fetches accessible projects,
 * and persists the connector config + credentials in org_connectors.
 *
 * Called by JiraSetupModal "Token + Projects" flow before triggering sync.
 *
 * Body: {
 *   siteUrl:          string   — e.g. "yourcompany.atlassian.net"
 *   email:            string   — Atlassian account email
 *   apiToken:         string   — Atlassian API token
 *   trackedProjects:  string[] — Jira project keys to ingest
 *   dataLookback:     string   — "3m"|"6m"|"1y"|"2y"|"all"
 *   fixVersionFilter?:string   — optional fix version scope
 * }
 */
export async function POST(request: Request) {
  try {
    // 1. Auth check
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 2. Get current org
    const workspaceId = await getCurrentWorkspaceId();

    // 3. Parse body
    const body = await request.json();
    const { siteUrl, email, apiToken, trackedProjects, dataLookback, fixVersionFilter } = body as {
      siteUrl: string;
      email: string;
      apiToken: string;
      trackedProjects: string[];
      dataLookback: string;
      fixVersionFilter?: string;
    };

    if (!siteUrl || !email || !apiToken) {
      return NextResponse.json(
        { error: "siteUrl, email, and apiToken are required" },
        { status: 400 }
      );
    }

    // 4. Normalise site URL
    let normalSiteUrl = siteUrl.trim().replace(/\/$/, "");
    if (!normalSiteUrl.startsWith("http")) {
      normalSiteUrl = `https://${normalSiteUrl}`;
    }

    // 5. Validate credentials by calling Jira API
    const basicAuth = Buffer.from(`${email}:${apiToken}`).toString("base64");

    const myselfRes = await fetch(`${normalSiteUrl}/rest/api/3/myself`, {
      headers: {
        Authorization: `Basic ${basicAuth}`,
        Accept: "application/json",
      },
    });

    if (!myselfRes.ok) {
      const errText = await myselfRes.text().catch(() => myselfRes.statusText);
      if (myselfRes.status === 401) {
        return NextResponse.json(
          { error: "Invalid credentials — check your email and API token" },
          { status: 401 }
        );
      }
      if (myselfRes.status === 403) {
        return NextResponse.json(
          { error: "Access denied — make sure your token has read:jira-data scope" },
          { status: 403 }
        );
      }
      return NextResponse.json(
        { error: `Jira validation failed (${myselfRes.status}): ${errText}` },
        { status: 400 }
      );
    }

    const jiraUser = await myselfRes.json();

    // 6. Fetch accessible projects for metadata
    let projects: { key: string; name: string }[] = [];
    try {
      const projectsRes = await fetch(
        `${normalSiteUrl}/rest/api/3/project/search?maxResults=50`,
        {
          headers: {
            Authorization: `Basic ${basicAuth}`,
            Accept: "application/json",
          },
        }
      );
      if (projectsRes.ok) {
        const projectsData = await projectsRes.json();
        projects = (projectsData.values || []).map((p: any) => ({
          key: p.key,
          name: p.name,
        }));
      }
    } catch {
      // Non-fatal — projects list is informational
    }

    // 7. Save connector config (service client to bypass RLS)
    const service = await createServiceClient();
    const siteName = normalSiteUrl.replace(/^https?:\/\//, "");

    const credentials = {
      auth_type: "basic",
      email,
      api_token: apiToken,
      site_url: normalSiteUrl,
    };

    const metadata = {
      site_url: normalSiteUrl,
      site_name: siteName,
      jira_user_display_name: jiraUser.displayName || email,
      jira_account_id: jiraUser.accountId || null,
      available_projects: projects,
      connected_at: new Date().toISOString(),
      connected_by: user.id,
      connection_method: "basic_auth",
    };

    const config = {
      site_url: normalSiteUrl,
      site_name: siteName,
      auth_type: "basic",
      ...(trackedProjects && trackedProjects.length > 0 ? { projectKeys: trackedProjects } : {}),
      ...(fixVersionFilter ? { fixVersionFilter } : {}),
      ...(dataLookback ? { dataLookback } : {}),
    };

    // Check if connector already exists for this org + instance
    const { data: existing } = await service
      .from("org_connectors")
      .select("id")
      .eq("organization_id", workspaceId)
      .eq("connector_type", "jira")
      .eq("instance_name", siteName)
      .maybeSingle();

    let saveError;
    if (existing) {
      const { error } = await service
        .from("org_connectors")
        .update({
          status: "active",
          config,
          credentials,
          metadata,
          display_name: siteName,
          error_message: null,
        })
        .eq("id", existing.id);
      saveError = error;
    } else {
      const { error } = await service
        .from("org_connectors")
        .insert({
          organization_id: workspaceId,
          connector_type: "jira",
          instance_name: siteName,
          display_name: siteName,
          status: "active",
          config,
          credentials,
          metadata,
          signals_count: 0,
        });
      saveError = error;
    }

    if (saveError) {
      logger.error("[Jira setup] Failed to save connector:", saveError);
      return NextResponse.json(
        { error: "Failed to save connector configuration" },
        { status: 500 }
      );
    }

    // 8. Return success
    return NextResponse.json({
      success: true,
      siteUrl: normalSiteUrl,
      siteName,
      jiraUser: jiraUser.displayName || email,
      projectsFound: projects.length,
      projects: projects.slice(0, 10),
    });
  } catch (err: any) {
    logger.error("[Jira setup] Error:", err);
    return NextResponse.json(
      { error: err.message || "Internal server error" },
      { status: 500 }
    );
  }
}
