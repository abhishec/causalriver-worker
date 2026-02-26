import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getCurrentWorkspaceId } from "@/lib/workspace-helpers";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * POST /api/integrations/jira
 *
 * Validate credentials and store a Jira connector for the current org.
 *
 * Body: {
 *   baseUrl:      string   — Jira Cloud base URL (e.g. "your-company.atlassian.net")
 *   apiToken:     string   — Atlassian API token
 *   projectKey?:  string   — Optional Jira project key to scope sync
 *   displayName?: string   — Optional human-readable name for this connector
 * }
 */
export async function POST(request: NextRequest) {
  try {
    // 1. Auth check
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 2. Workspace membership
    const workspaceId = await getCurrentWorkspaceId();
    if (!workspaceId) {
      return NextResponse.json({ error: "No workspace found" }, { status: 400 });
    }

    // 3. Parse body
    const body = await request.json();
    const { baseUrl, apiToken, projectKey, displayName } = body as {
      baseUrl: string;
      apiToken: string;
      projectKey?: string;
      displayName?: string;
    };

    if (!baseUrl || !apiToken) {
      return NextResponse.json({ error: "baseUrl and apiToken are required" }, { status: 400 });
    }

    // 4. Normalise base URL
    const normalUrl = baseUrl.startsWith("http")
      ? baseUrl.replace(/\/+$/, "")
      : `https://${baseUrl.replace(/\/+$/, "")}`;

    // SSRF protection
    try {
      const parsed = new URL(normalUrl);
      if (/^(127\.|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|169\.254\.|0\.|localhost|::1)/i.test(parsed.hostname)) {
        return NextResponse.json({ error: "Private/internal domains are not allowed" }, { status: 400 });
      }
    } catch {
      return NextResponse.json({ error: "Invalid baseUrl" }, { status: 400 });
    }

    // 5. Validate Jira credentials
    const auth = Buffer.from(`${user.email}:${apiToken}`).toString("base64");
    const myselfRes = await fetch(`${normalUrl}/rest/api/3/myself`, {
      headers: { Authorization: `Basic ${auth}`, Accept: "application/json" },
    });

    if (!myselfRes.ok) {
      if (myselfRes.status === 401) {
        return NextResponse.json({ error: "Invalid Jira credentials. Check API token." }, { status: 400 });
      }
      return NextResponse.json({ error: `Jira API error (${myselfRes.status})` }, { status: 400 });
    }

    const jiraUser = await myselfRes.json();

    // 6. Store in org_connectors
    const service = await createServiceClient();
    const siteName = normalUrl.replace(/^https?:\/\//, "").replace(/\/+$/, "");

    const credentials = { auth_type: "basic", email: user.email, api_token: apiToken, site_url: normalUrl };
    const config: Record<string, any> = { site_url: normalUrl, site_name: siteName, auth_type: "basic" };
    if (projectKey) config.projectKey = projectKey;

    const metadata = {
      site_url: normalUrl,
      site_name: siteName,
      jira_user_display_name: jiraUser.displayName || user.email,
      jira_account_id: jiraUser.accountId || null,
      connected_at: new Date().toISOString(),
      connection_method: "api_token",
    };

    const { data: existing } = await service
      .from("org_connectors")
      .select("id")
      .eq("organization_id", workspaceId)
      .eq("connector_type", "jira")
      .eq("instance_name", siteName)
      .maybeSingle();

    let connectorId: string;

    if (existing) {
      const { error } = await service
        .from("org_connectors")
        .update({ status: "active", display_name: displayName || siteName, config, credentials, metadata, error_message: null })
        .eq("id", existing.id);
      if (error) throw error;
      connectorId = existing.id;
    } else {
      const { data: inserted, error } = await service
        .from("org_connectors")
        .insert({
          organization_id: workspaceId,
          connector_type: "jira",
          instance_name: siteName,
          display_name: displayName || siteName,
          status: "active",
          config,
          credentials,
          metadata,
          signals_count: 0,
        })
        .select("id")
        .maybeSingle();
      if (error || !inserted) throw error || new Error("Insert returned no rows");
      connectorId = inserted.id;
    }

    return NextResponse.json({
      success: true,
      connector_id: connectorId,
      jiraUser: jiraUser.displayName || user.email,
    });
  } catch (err: any) {
    logger.error("[integrations/jira/POST]", err);
    return NextResponse.json({ error: err.message || "Internal error" }, { status: 500 });
  }
}
