export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";

/**
 * POST /api/integrations/github
 *
 * Lightweight GitHub connector entry-point.
 * Validates auth, validates org membership, stores credentials in org_connectors.
 *
 * Body: { token: string, repoUrl: string, organizationId: string }
 */
export async function POST(request: Request) {
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

    // 2. Parse and validate body
    let body: { token?: string; repoUrl?: string; organizationId?: string };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const { token, repoUrl, organizationId } = body;

    if (!token || typeof token !== "string" || !token.trim()) {
      return NextResponse.json({ error: "token is required" }, { status: 400 });
    }
    if (!repoUrl || typeof repoUrl !== "string" || !repoUrl.trim()) {
      return NextResponse.json({ error: "repoUrl is required" }, { status: 400 });
    }
    if (!organizationId || typeof organizationId !== "string" || !organizationId.trim()) {
      return NextResponse.json({ error: "organizationId is required" }, { status: 400 });
    }

    // 3. Validate org membership — user must be a member of the given org
    const { data: membership, error: memberError } = await supabase
      .from("org_members")
      .select("id, role")
      .eq("org_id", organizationId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (memberError) {
      logger.warn("[integrations/github] Membership check error:", memberError);
      return NextResponse.json({ error: "Failed to verify org membership" }, { status: 500 });
    }
    if (!membership) {
      return NextResponse.json({ error: "Not a member of this organization" }, { status: 403 });
    }

    // 4. Parse owner/repo from repoUrl (supports https://github.com/owner/repo and owner/repo forms)
    const normalizedUrl = repoUrl.trim().replace(/\.git$/, "");
    let owner: string;
    let repo: string;

    const httpMatch = normalizedUrl.match(/github\.com\/([^/]+)\/([^/]+)/);
    if (httpMatch) {
      owner = httpMatch[1];
      repo = httpMatch[2];
    } else {
      // Assume "owner/repo" shorthand
      const parts = normalizedUrl.split("/").filter(Boolean);
      if (parts.length < 2) {
        return NextResponse.json(
          { error: "repoUrl must be a GitHub URL or owner/repo" },
          { status: 400 }
        );
      }
      owner = parts[parts.length - 2];
      repo = parts[parts.length - 1];
    }

    // 5. Store connector using service client (bypasses RLS)
    const service = await createServiceClient();
    const instanceName = `${owner}/${repo}`;
    const connectorConfig = {
      owner,
      repo,
      repoUrl: normalizedUrl,
      tokenHint: `****${token.trim().slice(-4)}`,
      connectedAt: new Date().toISOString(),
      connectedBy: user.id,
    };
    const connectorCredentials = { token: token.trim(), access_token: token.trim() };

    // Upsert: update if connector for this org+instance already exists
    const { data: existing } = await service
      .from("org_connectors")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("connector_type", "github")
      .eq("instance_name", instanceName)
      .maybeSingle();

    let saveError;
    if (existing) {
      const { error } = await service
        .from("org_connectors")
        .update({
          status: "active",
          config: connectorConfig,
          credentials: connectorCredentials,
          display_name: instanceName,
          error_message: null,
        })
        .eq("id", existing.id);
      saveError = error;
    } else {
      const { error } = await service.from("org_connectors").insert({
        organization_id: organizationId,
        connector_type: "github",
        instance_name: instanceName,
        display_name: instanceName,
        status: "active",
        config: connectorConfig,
        credentials: connectorCredentials,
        signals_count: 0,
      });
      saveError = error;
    }

    if (saveError) {
      logger.error("[integrations/github] Failed to save connector:", saveError);
      return NextResponse.json({ error: "Failed to save connector" }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      connector: {
        type: "github",
        instanceName,
        owner,
        repo,
        organizationId,
        status: "active",
      },
    });
  } catch (err: unknown) {
    logger.error("[integrations/github] Unexpected error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
