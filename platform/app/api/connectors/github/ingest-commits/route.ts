import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getCurrentWorkspaceId } from "@/lib/workspace-helpers";
import { logger } from "@/lib/logger";
import { getConnectorWithCredentials, getConnectorCredentials } from "@/lib/connectors/get-credentials";
import { ingestDocument } from "@/lib/connectors/document-ingester";

export const dynamic = "force-dynamic";

/**
 * POST /api/connectors/github/ingest-commits
 *
 * Fetches the last 90 days of commits from connected GitHub repo(s) and embeds
 * each commit as a searchable brain document. This enables Brain to answer
 * questions like "What changed in the auth module last month?"
 *
 * Body: {
 *   connectorId?: string,   -- target a specific connector instance
 *   lookbackDays?: number,  -- default: 90, max: 365
 *   maxCommits?: number,    -- default: 100, max: 500 (per repo)
 * }
 *
 * Returns: { ingestedCount, totalCommits, reposProcessed, errors }
 */
export async function POST(request: Request) {
  try {
    // 1. Auth
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const workspaceId = await getCurrentWorkspaceId();
    if (!workspaceId) {
      return NextResponse.json({ error: "No workspace context" }, { status: 400 });
    }

    // 2. Load connector config + credentials
    const service = await createServiceClient();
    const body = await request.json().catch(() => ({})) as {
      connectorId?: string;
      lookbackDays?: number;
      maxCommits?: number;
    };

    const connectorId = body.connectorId;
    const lookbackDays = Math.min(body.lookbackDays ?? 90, 365);
    const maxCommitsPerRepo = Math.min(body.maxCommits ?? 100, 500);

    let connector: {
      id: string;
      connector_type: string;
      config: Record<string, unknown>;
      status: string;
      signals_count: number | null;
      credentials: Record<string, unknown> | null;
    } | null = null;

    if (connectorId) {
      const { data: row } = await service
        .from("org_connectors")
        .select("id, connector_type, config, status, signals_count")
        .eq("organization_id", workspaceId)
        .eq("connector_type", "github")
        .eq("id", connectorId)
        .maybeSingle();
      if (row) {
        const credentials = await getConnectorCredentials(service, workspaceId, "github");
        connector = { ...row, config: (row.config as Record<string, unknown>) ?? {}, credentials };
      }
    } else {
      connector = await getConnectorWithCredentials(service, workspaceId, "github");
    }

    if (!connector) {
      return NextResponse.json(
        { error: "GitHub connector not set up. Please connect a repository first." },
        { status: 404 }
      );
    }

    const credentials = connector.credentials as { access_token?: string; token?: string } | null;
    const token = credentials?.access_token || credentials?.token;
    if (!token) {
      return NextResponse.json(
        { error: "GitHub token missing. Please re-connect GitHub." },
        { status: 400 }
      );
    }

    const storedConfig = connector.config as {
      owner?: string;
      repo?: string;
      repositories?: Array<{ owner: string; name: string; branch?: string }>;
    };

    // Support both single-repo and multi-repo connector configs
    const repositories = storedConfig.repositories;
    const reposToProcess =
      !repositories || repositories.length === 0
        ? [{ owner: storedConfig.owner || "", name: storedConfig.repo || "" }]
        : repositories;

    if (!reposToProcess[0]?.owner || !reposToProcess[0]?.name) {
      return NextResponse.json(
        { error: "GitHub connector config missing owner/repo. Please reconfigure." },
        { status: 400 }
      );
    }

    // Compute since timestamp: lookbackDays ago in ISO format
    const sinceDate = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000).toISOString();

    let totalCommits = 0;
    let ingestedCount = 0;
    const errors: string[] = [];

    // 3. Process each repo
    for (const repoConfig of reposToProcess.slice(0, 3)) {
      const owner = repoConfig.owner;
      const repo = repoConfig.name;

      try {
        logger.warn(`[GitHub ingest-commits] Fetching commits for ${owner}/${repo} since ${sinceDate}`);

        // Fetch commit list — paginate up to maxCommitsPerRepo
        let page = 1;
        let hasMore = true;
        const allCommits: Array<{ sha: string; commit: { message: string; author: { name: string; date: string } } }> = [];

        while (hasMore && allCommits.length < maxCommitsPerRepo) {
          const perPage = Math.min(100, maxCommitsPerRepo - allCommits.length);
          const listUrl = `https://api.github.com/repos/${owner}/${repo}/commits?since=${sinceDate}&per_page=${perPage}&page=${page}`;

          const listRes = await fetch(listUrl, {
            headers: {
              Authorization: `Bearer ${token}`,
              Accept: "application/vnd.github+json",
            },
          });

          if (!listRes.ok) {
            const errMsg = `GitHub commits list failed for ${owner}/${repo}: ${listRes.status} ${listRes.statusText}`;
            logger.warn(`[GitHub ingest-commits] ${errMsg}`);
            errors.push(errMsg);
            break;
          }

          const commits = await listRes.json() as Array<{
            sha: string;
            commit: { message: string; author: { name: string; date: string } };
          }>;

          if (!Array.isArray(commits) || commits.length === 0) {
            hasMore = false;
            break;
          }

          allCommits.push(...commits);
          hasMore = commits.length === perPage;
          page++;
        }

        totalCommits += allCommits.length;
        logger.warn(`[GitHub ingest-commits] ${owner}/${repo}: found ${allCommits.length} commits in last ${lookbackDays} days`);

        // 4. For each commit, fetch diff summary and ingest as brain document
        const FETCH_DELAY_MS = 150; // stay well under GitHub's 5000 req/hr limit

        for (const commitRef of allCommits) {
          try {
            await new Promise((resolve) => setTimeout(resolve, FETCH_DELAY_MS));

            // Fetch full commit detail including files changed
            const detailUrl = `https://api.github.com/repos/${owner}/${repo}/commits/${commitRef.sha}`;
            const detailRes = await fetch(detailUrl, {
              headers: {
                Authorization: `Bearer ${token}`,
                Accept: "application/vnd.github+json",
              },
            });

            if (!detailRes.ok) {
              logger.warn(`[GitHub ingest-commits] Commit detail fetch failed: ${commitRef.sha} — ${detailRes.status}`);
              continue;
            }

            const detail = await detailRes.json() as {
              sha: string;
              commit: {
                message: string;
                author: { name: string; email?: string; date: string };
              };
              stats?: { additions: number; deletions: number; total: number };
              files?: Array<{
                filename: string;
                status: string;
                additions: number;
                deletions: number;
              }>;
            };

            const sha = detail.sha;
            const shortSha = sha.slice(0, 7);
            const message = detail.commit.message || "(no message)";
            const author = detail.commit.author.name || "Unknown";
            const date = detail.commit.author.date || new Date().toISOString();
            const additions = detail.stats?.additions ?? 0;
            const deletions = detail.stats?.deletions ?? 0;

            // Build file list: changed filenames grouped by status
            const files = detail.files ?? [];
            const filesByStatus: Record<string, string[]> = {};
            for (const f of files) {
              const status = f.status || "modified";
              if (!filesByStatus[status]) filesByStatus[status] = [];
              filesByStatus[status].push(f.filename);
            }

            const fileList = files.map((f) => f.filename).join(", ") || "(no files)";
            const fileSummaryParts: string[] = [];
            for (const [status, fnames] of Object.entries(filesByStatus)) {
              fileSummaryParts.push(`${status}: ${fnames.slice(0, 10).join(", ")}${fnames.length > 10 ? ` (+${fnames.length - 10} more)` : ""}`);
            }
            const fileSummary = fileSummaryParts.join("; ") || fileList;

            // Compose the document text for semantic search
            const documentText = [
              `Commit ${shortSha}: ${message.split("\n")[0]}`,
              message.split("\n").slice(1).filter(Boolean).join(" ").trim() || null,
              `Author: ${author}`,
              `Date: ${new Date(date).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}`,
              `Repository: ${owner}/${repo}`,
              `Files changed (${files.length}): ${fileSummary}`,
              additions + deletions > 0 ? `Changes: ${additions} additions, ${deletions} deletions` : null,
            ]
              .filter(Boolean)
              .join("\n");

            // Ingest into brain_documents (document_chunks table)
            await ingestDocument(service, {
              organizationId: workspaceId,
              documentTitle: `${owner}/${repo} commit ${shortSha}: ${message.split("\n")[0].slice(0, 100)}`,
              content: documentText,
              sourceType: "github",
              sourceUrl: `https://github.com/${owner}/${repo}/commit/${sha}`,
              documentId: `commit/${owner}/${repo}/${sha}`,
              metadata: {
                type: "git-commit",
                sha,
                short_sha: shortSha,
                author,
                date,
                repo: `${owner}/${repo}`,
                files_changed: files.length,
                additions,
                deletions,
                file_list: files.map((f) => f.filename).slice(0, 20),
              },
            });

            ingestedCount++;
          } catch (commitErr) {
            const msg = commitErr instanceof Error ? commitErr.message : String(commitErr);
            logger.warn(`[GitHub ingest-commits] Failed to process commit ${commitRef.sha}: ${msg}`);
          }
        }

        logger.warn(`[GitHub ingest-commits] ${owner}/${repo}: ingested ${ingestedCount} commits`);
      } catch (repoErr) {
        const msg = repoErr instanceof Error ? repoErr.message : String(repoErr);
        errors.push(`${owner}/${repo}: ${msg}`);
        logger.warn(`[GitHub ingest-commits] Repo processing failed: ${msg}`);
      }
    }

    // 5. Update connector last_commit_ingest_at timestamp
    try {
      await service
        .from("org_connectors")
        .update({
          config: {
            ...storedConfig,
            last_commit_ingest_at: new Date().toISOString(),
            last_commit_ingest_count: ingestedCount,
          },
        })
        .eq("id", connector.id);
    } catch {
      // Non-fatal: connector config update failure doesn't fail the ingest
    }

    logger.warn(`[GitHub ingest-commits] Complete: ingested ${ingestedCount}/${totalCommits} commits from ${reposToProcess.length} repo(s)`);

    return NextResponse.json({
      success: errors.length === 0,
      ingestedCount,
      totalCommits,
      reposProcessed: reposToProcess.length,
      lookbackDays,
      errors,
    });
  } catch (err: unknown) {
    logger.error("[GitHub ingest-commits] Error:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
