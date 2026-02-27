import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getCurrentWorkspaceId } from "@/lib/workspace-helpers";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * POST /api/integrations/confluence
 *
 * Validate credentials and store a Confluence connector for the current org.
 *
 * Body: {
 *   baseUrl:      string   — Confluence base URL (e.g. "your-company.atlassian.net/wiki")
 *   apiToken:     string   — Atlassian API token
 *   spaceKey?:    string   — Optional Confluence space key to scope sync
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
    const { baseUrl, apiToken, spaceKey, displayName } = body as {
      baseUrl: string;
      apiToken: string;
      spaceKey?: string;
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

    // 5. Validate Confluence credentials
    const auth = Buffer.from(`${user.email}:${apiToken}`).toString("base64");
    const currentUserRes = await fetch(`${normalUrl}/rest/api/user/current`, {
      headers: { Authorization: `Basic ${auth}`, Accept: "application/json" },
    });

    if (!currentUserRes.ok) {
      if (currentUserRes.status === 401) {
        return NextResponse.json({ error: "Invalid Confluence credentials. Check API token." }, { status: 400 });
      }
      return NextResponse.json({ error: `Confluence API error (${currentUserRes.status})` }, { status: 400 });
    }

    const confUser = await currentUserRes.json();

    // 6. Store in org_connectors
    const service = await createServiceClient();
    const siteName = normalUrl.replace(/^https?:\/\//, "").replace(/\/+$/, "");

    const credentials = { auth_type: "basic", email: user.email, api_token: apiToken, base_url: normalUrl };
    const config: Record<string, any> = { base_url: normalUrl, site_name: siteName, auth_type: "basic" };
    if (spaceKey) config.spaceKey = spaceKey;

    const metadata = {
      base_url: normalUrl,
      site_name: siteName,
      confluence_user_display_name: confUser.displayName || confUser.username || user.email,
      confluence_account_id: confUser.accountId || confUser.key || null,
      connected_at: new Date().toISOString(),
      connection_method: "api_token",
    };

    const { data: existing } = await service
      .from("org_connectors")
      .select("id")
      .eq("organization_id", workspaceId)
      .eq("connector_type", "confluence")
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
          connector_type: "confluence",
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
      confluenceUser: confUser.displayName || confUser.username || user.email,
    });
  } catch (err: any) {
    logger.error("[integrations/confluence/POST]", err);
    return NextResponse.json({ error: "Failed to connect Confluence. Please check your credentials and try again." }, { status: 500 });
  }
}
