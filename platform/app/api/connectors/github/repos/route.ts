export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getCurrentWorkspaceId } from "@/lib/workspace-helpers";
import { logger } from "@/lib/logger";

/**
 * GET /api/connectors/github/repos
 *
 * Returns repositories accessible to the connected GitHub user.
 * Uses stored OAuth token from org_connectors.
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const workspaceId = await getCurrentWorkspaceId();
    const service = await createServiceClient();

    // Load GitHub connector credentials
    const { data: connector } = await service
      .from("org_connectors")
      .select("credentials, config, status")
      .eq("organization_id", workspaceId)
      .eq("connector_type", "github")
      .maybeSingle();

    if (!connector || connector.status !== "active") {
      return NextResponse.json(
        { error: "GitHub is not connected. Please connect GitHub first." },
        { status: 404 }
      );
    }

    const creds = connector.credentials as Record<string, any>;
    const token = creds?.access_token || creds?.token;

    if (!token) {
      return NextResponse.json(
        { error: "No GitHub access token found" },
        { status: 400 }
      );
    }

    // Fetch repos from GitHub API (up to 100, sorted by recently updated)
    const ghResponse = await fetch(
      "https://api.github.com/user/repos?per_page=100&sort=updated&direction=desc",
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github.v3+json",
        },
      }
    );

    if (!ghResponse.ok) {
      const errorText = await ghResponse.text();
      logger.error("[GitHub/repos] API error:", ghResponse.status, errorText);
      return NextResponse.json(
        { error: "Failed to fetch repositories from GitHub" },
        { status: ghResponse.status }
      );
    }

    const repos = await ghResponse.json();

    // Return a clean subset of repo data
    const cleanRepos = repos.map((r: any) => ({
      full_name: r.full_name,
      name: r.name,
      description: r.description,
      language: r.language,
      default_branch: r.default_branch,
      private: r.private,
      stars: r.stargazers_count,
      updated_at: r.updated_at,
      owner: r.owner?.login,
    }));

    return NextResponse.json({ repos: cleanRepos });
  } catch (err) {
    logger.error("[GitHub/repos] Error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
