import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/org-helpers";

/**
 * POST /api/connectors/github/setup
 *
 * Validates a GitHub PAT + owner/repo, then saves the connector config.
 * Does NOT store the token in the database — it's only used for validation
 * and must be provided again for sync/ingest operations (or stored in env).
 *
 * Body: { token: string, owner: string, repo: string }
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
    const orgId = await getCurrentOrgId();

    // 3. Parse body
    const body = await request.json();
    const { token, owner, repo } = body;

    if (!token || !owner || !repo) {
      return NextResponse.json(
        { error: "token, owner, and repo are required" },
        { status: 400 }
      );
    }

    // 4. Validate token by calling GitHub API
    const ghResponse = await fetch(
      `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github.v3+json",
          "User-Agent": "NexusBrain-Platform",
        },
      }
    );

    if (!ghResponse.ok) {
      const ghError = await ghResponse.text();
      if (ghResponse.status === 401) {
        return NextResponse.json(
          { error: "Invalid GitHub token. Please check your Personal Access Token." },
          { status: 401 }
        );
      }
      if (ghResponse.status === 404) {
        return NextResponse.json(
          { error: `Repository ${owner}/${repo} not found. Check owner and repo name.` },
          { status: 404 }
        );
      }
      return NextResponse.json(
        { error: `GitHub API error: ${ghError}` },
        { status: ghResponse.status }
      );
    }

    const repoData = await ghResponse.json();

    // 5. Save connector config (service client to bypass RLS)
    const service = await createServiceClient();
    const connectorConfig = {
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

    // Check if connector already exists for this org
    const { data: existing } = await service
      .from("org_connectors")
      .select("id")
      .eq("organization_id", orgId)
      .eq("connector_type", "github")
      .maybeSingle();

    let saveError;
    if (existing) {
      // Update existing
      const { error } = await service
        .from("org_connectors")
        .update({
          status: "active",
          config: connectorConfig,
          error_message: null,
        })
        .eq("id", existing.id);
      saveError = error;
    } else {
      // Insert new
      const { error } = await service
        .from("org_connectors")
        .insert({
          organization_id: orgId,
          connector_type: "github",
          status: "active",
          config: connectorConfig,
          signals_count: 0,
        });
      saveError = error;
    }

    if (saveError) {
      console.error("Failed to save connector:", saveError);
      return NextResponse.json(
        { error: "Failed to save connector configuration" },
        { status: 500 }
      );
    }

    // 6. Return success with repo info
    return NextResponse.json({
      success: true,
      repo: {
        fullName: repoData.full_name,
        name: repoData.name,
        description: repoData.description,
        language: repoData.language,
        stars: repoData.stargazers_count,
        forks: repoData.forks_count,
        size: repoData.size,
        defaultBranch: repoData.default_branch,
        isPrivate: repoData.private,
        openIssues: repoData.open_issues_count,
        updatedAt: repoData.updated_at,
      },
    });
  } catch (err: any) {
    console.error("GitHub setup error:", err);
    return NextResponse.json(
      { error: err.message || "Internal server error" },
      { status: 500 }
    );
  }
}
