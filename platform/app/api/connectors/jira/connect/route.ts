import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * POST /api/connectors/jira/connect
 *
 * Admin-only route: connects a Jira instance for any org using Basic Auth
 * (email + API token). Designed for design-partner onboarding where the OAuth
 * flow is impractical — credentials are supplied directly and stored securely.
 *
 * Body: {
 *   orgSlug:          string   — org slug to look up (e.g. "tookitaki")
 *   siteUrl:          string   — Jira site (e.g. "tookitaki.atlassian.net")
 *   email:            string   — Atlassian account email
 *   apiToken:         string   — Atlassian API token
 *   projectKeys?:     string[] — Optional: scope sync to these project keys
 *   fixVersionFilter?:string   — Optional: scope sync to this fix version
 *   dataLookback?:    string   — "30d"|"90d"|"6m"|"1y"|"all" (default: "90d")
 * }
 *
 * Security: requires x-admin-secret header matching ADMIN_SECRET env var.
 * Never expose this route publicly.
 */
export async function POST(request: NextRequest) {
  // ── 1. Admin secret guard ──────────────────────────────────────────────────
  const adminSecret = process.env.ADMIN_SECRET;
  const providedSecret = request.headers.get("x-admin-secret");

  if (!adminSecret || providedSecret !== adminSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const {
      orgSlug,
      siteUrl,
      email,
      apiToken,
      projectKeys,
      fixVersionFilter,
      dataLookback = "90d",
    } = body as {
      orgSlug: string;
      siteUrl: string;
      email: string;
      apiToken: string;
      projectKeys?: string[];
      fixVersionFilter?: string;
      dataLookback?: string;
    };

    // ── 2. Validate required fields ──────────────────────────────────────────
    if (!orgSlug || !siteUrl || !email || !apiToken) {
      return NextResponse.json(
        { error: "Missing required fields: orgSlug, siteUrl, email, apiToken" },
        { status: 400 }
      );
    }

    // ── 3. Normalise siteUrl ─────────────────────────────────────────────────
    const normalSiteUrl = siteUrl.startsWith("http")
      ? siteUrl.replace(/\/$/, "")
      : `https://${siteUrl.replace(/\/$/, "")}`;

    // ── 3a. SSRF guard — only allow Atlassian-hosted instances ───────────────
    const ATLASSIAN_PATTERN = /^https:\/\/[a-z0-9-]+\.atlassian\.net(\/.*)?$/i;
    if (!ATLASSIAN_PATTERN.test(normalSiteUrl)) {
      return NextResponse.json(
        { error: "Invalid Jira site URL. Must be an atlassian.net domain." },
        { status: 400 }
      );
    }

    // ── 4. Look up org by slug ────────────────────────────────────────────────
    const service = await createServiceClient();
    const { data: org, error: orgError } = await service
      .from("organizations")
      .select("id, name, slug")
      .eq("slug", orgSlug)
      .maybeSingle();

    if (orgError || !org) {
      return NextResponse.json(
        { error: `Organization not found for slug: "${orgSlug}"` },
        { status: 404 }
      );
    }

    const orgId = org.id;

    // ── 5. Validate Jira credentials ──────────────────────────────────────────
    const basicAuth = Buffer.from(`${email}:${apiToken}`).toString("base64");

    const myselfRes = await fetch(`${normalSiteUrl}/rest/api/3/myself`, {
      headers: {
        Authorization: `Basic ${basicAuth}`,
        Accept: "application/json",
      },
    });

    if (!myselfRes.ok) {
      const errText = await myselfRes.text().catch(() => myselfRes.statusText);
      return NextResponse.json(
        {
          error: `Jira credential validation failed (${myselfRes.status}): ${errText}`,
        },
        { status: 400 }
      );
    }

    const jiraUser = await myselfRes.json();

    // ── 6. Fetch accessible projects ──────────────────────────────────────────
    const projectsRes = await fetch(
      `${normalSiteUrl}/rest/api/3/project/search?maxResults=50`,
      {
        headers: {
          Authorization: `Basic ${basicAuth}`,
          Accept: "application/json",
        },
      }
    );

    let projects: { key: string; name: string }[] = [];
    if (projectsRes.ok) {
      const projectsData = await projectsRes.json();
      projects = (projectsData.values || []).map((p: any) => ({
        key: p.key,
        name: p.name,
      }));
    }

    // ── 7. Upsert org_connectors ──────────────────────────────────────────────
    const siteName = normalSiteUrl.replace("https://", "");

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
      connection_method: "basic_auth",
    };

    const config = {
      site_url: normalSiteUrl,
      site_name: siteName,
      auth_type: "basic",
      ...(projectKeys && projectKeys.length > 0 ? { projectKeys } : {}),
      ...(fixVersionFilter ? { fixVersionFilter } : {}),
      dataLookback,
    };

    const { data: connector, error: upsertError } = await service
      .from("org_connectors")
      .upsert(
        {
          organization_id: orgId,
          connector_type: "jira",
          instance_name: siteName,
          display_name: siteName,
          status: "active",
          credentials,
          metadata,
          config,
        },
        { onConflict: "organization_id,connector_type,instance_name" }
      )
      .select("id")
      .maybeSingle();

    if (upsertError || !connector) {
      logger.error("[Jira connect] Upsert error:", upsertError);
      return NextResponse.json(
        { error: "Failed to store connector" },
        { status: 500 }
      );
    }

    // ── 8. Return success ─────────────────────────────────────────────────────
    return NextResponse.json({
      success: true,
      orgId,
      orgName: org.name,
      connectorId: connector.id,
      jiraUser: jiraUser.displayName || email,
      siteUrl: normalSiteUrl,
      projectsFound: projects.length,
      projects: projects.slice(0, 10), // Preview first 10
      nextStep:
        "Connector is now active and visible in the UI. " +
        "To ingest data, log in as a Tookitaki user and click 'Sync Now' on the connectors page, " +
        "or call POST /api/connectors/jira/sync with the appropriate session cookie.",
      curlHint: projectKeys
        ? `Sync hint: POST /api/connectors/jira/sync with body: ${JSON.stringify({ projectKeys, fixVersionFilter, dataLookback })}`
        : "Sync hint: POST /api/connectors/jira/sync (no body needed — config saved to connector row)",
    });
  } catch (err: any) {
    logger.error("[Jira connect] Error:", err);
    return NextResponse.json(
      { error: "Internal error" },
      { status: 500 }
    );
  }
}
