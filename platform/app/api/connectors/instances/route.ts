import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getCurrentWorkspaceId } from "@/lib/workspace-helpers";

export const dynamic = "force-dynamic";

// ============================================================================
// Validation helpers — test credentials against external APIs
// ============================================================================

async function validateJira(domain: string, email: string, apiToken: string) {
  const baseUrl = domain.includes("://") ? domain.replace(/\/+$/, "") : `https://${domain}`;
  const auth = Buffer.from(`${email}:${apiToken}`).toString("base64");
  const res = await fetch(`${baseUrl}/rest/api/3/myself`, {
    headers: { Authorization: `Basic ${auth}`, Accept: "application/json" },
  });
  if (!res.ok) {
    if (res.status === 401) throw new Error("Invalid Jira credentials. Check email and API token.");
    throw new Error(`Jira API error (${res.status})`);
  }
  const user = await res.json();
  return { baseUrl, userName: user.displayName || email, accountId: user.accountId };
}

async function validateGitHub(token: string, owner: string, repo: string) {
  const res = await fetch(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github.v3+json",
      "User-Agent": "NexusBrain-Platform",
    },
  });
  if (!res.ok) {
    if (res.status === 401) throw new Error("Invalid GitHub token.");
    if (res.status === 404) throw new Error(`Repository ${owner}/${repo} not found.`);
    throw new Error(`GitHub API error (${res.status})`);
  }
  return await res.json();
}

async function validateSlack(botToken: string) {
  const res = await fetch("https://slack.com/api/auth.test", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${botToken}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
  });
  const data = await res.json();
  if (!data.ok) throw new Error(`Slack auth failed: ${data.error}`);
  return { teamName: data.team, teamId: data.team_id, userId: data.user_id, botId: data.bot_id };
}

async function validateFreshdesk(domain: string, apiKey: string) {
  const baseUrl = `https://${domain}.freshdesk.com`;
  const auth = Buffer.from(`${apiKey}:X`).toString("base64");
  const res = await fetch(`${baseUrl}/api/v2/settings/helpdesk`, {
    headers: { Authorization: `Basic ${auth}`, Accept: "application/json" },
  });
  if (!res.ok) {
    if (res.status === 401) throw new Error("Invalid Freshdesk API key.");
    throw new Error(`Freshdesk API error (${res.status})`);
  }
  const data = await res.json();
  return { name: data.name || domain, baseUrl };
}

// ============================================================================
// GET /api/connectors/instances?type=github
// Returns all instances of a connector type for the current org
// ============================================================================

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const workspaceId = await getCurrentWorkspaceId();
    const type = request.nextUrl.searchParams.get("type");

    const service = await createServiceClient();
    let query = service
      .from("org_connectors")
      .select("id, connector_type, instance_name, display_name, status, last_sync_at, config, metadata, signals_count, error_message, created_at")
      .eq("organization_id", workspaceId)
      .order("created_at", { ascending: true });

    if (type) query = query.eq("connector_type", type);

    const { data, error } = await query;
    if (error) throw error;

    // Mask credentials — never expose full secrets to the client
    const masked = (data || []).map((c: any) => ({
      ...c,
      credentialHint: c.config?.tokenHint || (c.metadata?.site_name ? "configured" : null),
    }));

    return NextResponse.json({ instances: masked });
  } catch (err: any) {
    console.error("[instances/GET]", err);
    return NextResponse.json({ error: err.message || "Internal error" }, { status: 500 });
  }
}

// ============================================================================
// POST /api/connectors/instances
// Create a new connector instance (validates credentials first)
// ============================================================================

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const workspaceId = await getCurrentWorkspaceId();
    const body = await request.json();
    const { connectorType, displayName } = body;

    if (!connectorType) {
      return NextResponse.json({ error: "connectorType is required" }, { status: 400 });
    }

    const service = await createServiceClient();
    let instanceName: string;
    let credentials: Record<string, any>;
    let config: Record<string, any>;
    let metadata: Record<string, any> = {};

    switch (connectorType) {
      case "jira": {
        const { domain, email, apiToken } = body;
        if (!domain || !email || !apiToken) {
          return NextResponse.json({ error: "domain, email, and apiToken are required for Jira" }, { status: 400 });
        }
        const result = await validateJira(domain, email, apiToken);
        instanceName = domain.replace(/^https?:\/\//, "").replace(/\/+$/, "");
        credentials = { auth_type: "basic", email, api_token: apiToken, site_url: result.baseUrl };
        config = { site_url: result.baseUrl, site_name: instanceName, auth_type: "basic" };
        metadata = {
          site_url: result.baseUrl,
          site_name: instanceName,
          jira_user_display_name: result.userName,
          jira_account_id: result.accountId,
          connected_at: new Date().toISOString(),
          connection_method: "basic_auth",
        };
        break;
      }

      case "github": {
        const { token, owner, repo } = body;
        if (!token || !owner || !repo) {
          return NextResponse.json({ error: "token, owner, and repo are required for GitHub" }, { status: 400 });
        }
        const repoData = await validateGitHub(token, owner, repo);
        instanceName = repoData.full_name || `${owner}/${repo}`;
        credentials = { token, access_token: token };
        config = {
          owner,
          repo,
          repoFullName: repoData.full_name,
          repoSize: repoData.size,
          defaultBranch: repoData.default_branch,
          repoLanguage: repoData.language,
          repoStars: repoData.stargazers_count,
          repoDescription: repoData.description,
          isPrivate: repoData.private,
          tokenHint: `****${token.slice(-4)}`,
          connectedAt: new Date().toISOString(),
          connectedBy: user.id,
        };
        break;
      }

      case "slack": {
        const { botToken, webhookUrl, defaultChannel } = body;
        if (!botToken) {
          return NextResponse.json({ error: "botToken is required for Slack" }, { status: 400 });
        }
        const slackInfo = await validateSlack(botToken);
        instanceName = slackInfo.teamName || slackInfo.teamId || "default";
        credentials = { bot_token: botToken, webhook_url: webhookUrl || null };
        config = { default_channel: defaultChannel || "#general", webhook_url: webhookUrl || null };
        metadata = {
          team_name: slackInfo.teamName,
          team_id: slackInfo.teamId,
          bot_id: slackInfo.botId,
          connected_at: new Date().toISOString(),
        };
        break;
      }

      case "freshdesk": {
        const { domain, apiKey } = body;
        if (!domain || !apiKey) {
          return NextResponse.json({ error: "domain and apiKey are required for Freshdesk" }, { status: 400 });
        }
        const fdInfo = await validateFreshdesk(domain, apiKey);
        instanceName = domain;
        credentials = { api_key: apiKey, domain };
        config = { domain, base_url: fdInfo.baseUrl, helpdesk_name: fdInfo.name };
        metadata = { domain, helpdesk_name: fdInfo.name, connected_at: new Date().toISOString() };
        break;
      }

      default:
        return NextResponse.json({ error: `Unsupported connector type: ${connectorType}` }, { status: 400 });
    }

    // Check if this exact instance already exists
    const { data: existing } = await service
      .from("org_connectors")
      .select("id")
      .eq("organization_id", workspaceId)
      .eq("connector_type", connectorType)
      .eq("instance_name", instanceName)
      .maybeSingle();

    let connectorId: string;

    if (existing) {
      const { error } = await service
        .from("org_connectors")
        .update({
          status: "active",
          display_name: displayName || instanceName,
          config,
          credentials,
          metadata,
          error_message: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id);
      if (error) throw error;
      connectorId = existing.id;
    } else {
      const { data: inserted, error } = await service
        .from("org_connectors")
        .insert({
          organization_id: workspaceId,
          connector_type: connectorType,
          instance_name: instanceName,
          display_name: displayName || instanceName,
          status: "active",
          config,
          credentials,
          metadata,
          signals_count: 0,
        })
        .select("id")
        .single();
      if (error) throw error;
      connectorId = inserted.id;
    }

    return NextResponse.json({
      success: true,
      connectorId,
      instanceName,
      displayName: displayName || instanceName,
    });
  } catch (err: any) {
    console.error("[instances/POST]", err);
    return NextResponse.json({ error: err.message || "Validation failed" }, { status: 400 });
  }
}

// ============================================================================
// PUT /api/connectors/instances  (body: { id, displayName, config? })
// Update an existing connector instance
// ============================================================================

export async function PUT(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const workspaceId = await getCurrentWorkspaceId();
    const body = await request.json();
    const { id, displayName, config: configUpdates } = body;

    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

    const service = await createServiceClient();

    const updates: Record<string, any> = { updated_at: new Date().toISOString() };
    if (displayName !== undefined) updates.display_name = displayName;
    if (configUpdates) updates.config = configUpdates;

    const { error } = await service
      .from("org_connectors")
      .update(updates)
      .eq("id", id)
      .eq("organization_id", workspaceId);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("[instances/PUT]", err);
    return NextResponse.json({ error: err.message || "Update failed" }, { status: 500 });
  }
}

// ============================================================================
// DELETE /api/connectors/instances  (body: { id })
// Remove a connector instance
// ============================================================================

export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const workspaceId = await getCurrentWorkspaceId();
    const body = await request.json();
    const { id } = body;

    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

    const service = await createServiceClient();

    const { error } = await service
      .from("org_connectors")
      .delete()
      .eq("id", id)
      .eq("organization_id", workspaceId);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("[instances/DELETE]", err);
    return NextResponse.json({ error: err.message || "Delete failed" }, { status: 500 });
  }
}
