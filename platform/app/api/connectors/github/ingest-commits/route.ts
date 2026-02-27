import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getCurrentWorkspaceId } from "@/lib/workspace-helpers";
import { logger } from "@/lib/logger";
import { getConnectorWithCredentials, getConnectorCredentials } from "@/lib/connectors/get-credentials";
import { getAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 120; // fetches paginated GitHub commits + per-commit detail, can exceed 10s easily

/**
 * POST /api/connectors/github/ingest-commits
 *
 * Fetches a GitHub repo's commit history and ingests each commit as a
 * knowledge chunk (source_type = 'git_commit') into the brain's Tier 1
 * raw knowledge store. Enables copilot to answer questions like:
 *   - "What changed in the last sprint?"
 *   - "Show me commits that touched the auth system"
 *
 * Deduplicates by commit SHA via upsert on (organization_id, source_id).
 * Paginates GitHub API up to 500 commits per call.
 * Emits a dopamine brain signal after ingestion.
 */

// ── Request / Response types ──────────────────────────────────────────────────

interface IngestCommitsBody {
  repoOwner?: string;
  repoName?: string;
  branch?: string;      // default: "main"
  since?: string;       // ISO date — only fetch commits after this date
  limit?: number;       // default: 200, max: 500
  connectorId?: string; // optional: target a specific connector instance
}

interface IngestCommitsResponse {
  ingested: number;
  skipped: number;
  errors: number;
  latestCommitSha: string | null;
  executionMs: number;
}

// ── GitHub API types ──────────────────────────────────────────────────────────

interface GitHubCommitListItem {
  sha: string;
  commit: {
    message: string;
    author: {
      name: string;
      date: string;
    };
  };
}

interface GitHubCommitDetail {
  sha: string;
  commit: {
    message: string;
    author: {
      name: string;
      date: string;
    };
  };
  stats?: {
    additions: number;
    deletions: number;
    total: number;
  };
  files?: Array<{
    filename: string;
    status: string;
    additions: number;
    deletions: number;
  }>;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const MAX_COMMITS = 500;
const DEFAULT_LIMIT = 200;
const PAGE_SIZE = 100;
const PAGE_DELAY_MS = 100; // Rate limit protection between pages
const DETAIL_THRESHOLD = 100; // Only fetch full commit detail if limit <= this

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(request: Request): Promise<NextResponse> {
  const startMs = Date.now();

  try {
    // ── Auth: isolate createClient() + getUser() — Lambda cold-start safety ──
    let supabase;
    let authUser: { id: string } | null = null;
    try {
      supabase = await createClient();
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      authUser = user;
    } catch {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!authUser || !supabase) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const workspaceId = await getCurrentWorkspaceId();
    if (!workspaceId) {
      return NextResponse.json({ error: "No workspace context" }, { status: 400 });
    }

    // 2. Parse request body
    const body = await request.json().catch(() => ({})) as IngestCommitsBody;
    const branch = body.branch ?? "main";
    const since = body.since;
    const limit = Math.min(body.limit ?? DEFAULT_LIMIT, MAX_COMMITS);

    // 3. Load GitHub connector + credentials (service client bypasses RLS)
    const service = await createServiceClient();

    let connector: {
      id: string;
      connector_type: string;
      config: Record<string, unknown>;
      status: string;
      signals_count: number | null;
      credentials: Record<string, unknown> | null;
    } | null = null;

    if (body.connectorId) {
      const { data: row } = await service
        .from("org_connectors")
        .select("id, connector_type, config, status, signals_count")
        .eq("organization_id", workspaceId)
        .eq("connector_type", "github")
        .eq("id", body.connectorId)
        .maybeSingle();
      if (row) {
        const credentials = await getConnectorCredentials(service, workspaceId, "github");
        connector = {
          ...row,
          config: (row.config as Record<string, unknown>) ?? {},
          credentials,
        };
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

    // 4. Resolve repo owner/name: body params override connector config
    const storedConfig = connector.config as {
      owner?: string;
      repo?: string;
      repositories?: Array<{ owner: string; name: string; branch?: string }>;
    };

    let repoOwner = body.repoOwner;
    let repoName = body.repoName;

    if (!repoOwner || !repoName) {
      // Fall back to connector config
      if (storedConfig.repositories && storedConfig.repositories.length > 0) {
        repoOwner = storedConfig.repositories[0].owner;
        repoName = storedConfig.repositories[0].name;
      } else {
        repoOwner = storedConfig.owner;
        repoName = storedConfig.repo;
      }
    }

    if (!repoOwner || !repoName) {
      return NextResponse.json(
        { error: "repoOwner and repoName are required (or configure a GitHub connector with a repo)." },
        { status: 400 }
      );
    }

    logger.warn(
      `[ingest-commits] Starting ingestion for ${repoOwner}/${repoName} branch=${branch} limit=${limit}${since ? ` since=${since}` : ""}`
    );

    // 5. Fetch commit list from GitHub (paginated)
    const allCommits = await fetchCommitList(token, repoOwner, repoName, branch, since, limit);

    logger.warn(`[ingest-commits] Fetched ${allCommits.length} commits from ${repoOwner}/${repoName}`);

    // 6. Ingest commits into knowledge_chunks
    let ingested = 0;
    let skipped = 0;
    let errors = 0;
    let latestCommitSha: string | null = allCommits.length > 0 ? allCommits[0].sha : null;

    const admin = getAdminClient();
    const fetchDetails = limit <= DETAIL_THRESHOLD;

    for (const commitRef of allCommits) {
      try {
        let detail: GitHubCommitDetail | null = null;

        if (fetchDetails) {
          // Fetch full commit detail (files, stats) — only for small batches to avoid rate limits
          detail = await fetchCommitDetail(token, repoOwner, repoName, commitRef.sha);
        }

        const sha = commitRef.sha;
        const message = commitRef.commit.message || "(no message)";
        const authorName = commitRef.commit.author.name || "Unknown";
        const authorDate = commitRef.commit.author.date || new Date().toISOString();
        const filesCount = detail?.files?.length ?? undefined;
        const additions = detail?.stats?.additions ?? 0;
        const deletions = detail?.stats?.deletions ?? 0;
        const fileNames = detail?.files?.map((f) => f.filename).slice(0, 20) ?? [];

        // Build verbatim text for semantic search
        const verbatimText = buildVerbatimText({
          sha,
          message,
          authorName,
          authorDate,
          repoOwner,
          repoName,
          branch,
          filesCount,
          additions,
          deletions,
          fileNames,
        });

        // Upsert into knowledge_chunks with conflict on (organization_id, source_id)
        // The unique index knowledge_chunks_org_source_id_unique enforces deduplication.
        const { data: upsertData, error: upsertError } = await admin
          .from("knowledge_chunks")
          .upsert(
            {
              organization_id: workspaceId,
              source_type: "git_commit",
              source_id: sha,
              source_url: `https://github.com/${repoOwner}/${repoName}/commit/${sha}`,
              verbatim_text: verbatimText,
              metadata: {
                sha,
                author: authorName,
                date: authorDate,
                repo: `${repoOwner}/${repoName}`,
                branch,
                additions,
                deletions,
                files: fileNames,
              },
              ingested_by: "ingest-commits-api",
            },
            {
              onConflict: "organization_id,source_id",
              ignoreDuplicates: true,
            }
          )
          .select("id");

        if (upsertError) {
          logger.warn(`[ingest-commits] Upsert failed for commit ${sha.slice(0, 7)}`, {
            error: upsertError.message,
          });
          errors++;
        } else if (!upsertData || upsertData.length === 0) {
          // ignoreDuplicates=true returns empty array for skipped rows
          skipped++;
        } else {
          ingested++;
        }
      } catch (commitErr) {
        logger.warn(`[ingest-commits] Error processing commit ${commitRef.sha.slice(0, 7)}`, {
          error: commitErr instanceof Error ? commitErr.message : String(commitErr),
        });
        errors++;
      }
    }

    logger.warn(
      `[ingest-commits] ${repoOwner}/${repoName}: ingested=${ingested} skipped=${skipped} errors=${errors}`
    );

    // 7. Emit brain dopamine signal after successful batch ingestion
    if (ingested > 0) {
      try {
        await service.from("cross_domain_signals").insert({
          organization_id: workspaceId,
          signal_type: "dopamine",
          signal_value: 0.7,
          source_domain: "github.commits",
          entity_type: "connector",
          entity_id: `github:${repoOwner}/${repoName}`,
          signal_metadata: {
            ingestedCount: ingested,
            skippedCount: skipped,
            repo: `${repoOwner}/${repoName}`,
            branch,
            latestCommitSha,
          },
        });
      } catch (signalErr) {
        // Non-fatal: brain signal failure never blocks the ingestion response
        logger.warn("[ingest-commits] Brain signal insert failed (non-fatal)", {
          error: signalErr instanceof Error ? signalErr.message : String(signalErr),
        });
      }
    }

    const executionMs = Date.now() - startMs;

    const response: IngestCommitsResponse = {
      ingested,
      skipped,
      errors,
      latestCommitSha,
      executionMs,
    };

    return NextResponse.json(response);
  } catch (err: unknown) {
    logger.error(
      "[ingest-commits] Unhandled error:",
      err instanceof Error ? err.message : err
    );
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

// ── GitHub API helpers ────────────────────────────────────────────────────────

/**
 * Fetch paginated commit list from GitHub REST API.
 * Respects the Link header for pagination and stops at `limit`.
 */
async function fetchCommitList(
  token: string,
  owner: string,
  repo: string,
  branch: string,
  since: string | undefined,
  limit: number
): Promise<GitHubCommitListItem[]> {
  const all: GitHubCommitListItem[] = [];
  let pagesFetched = 0;

  // Build initial URL
  const params = new URLSearchParams({
    sha: branch,
    per_page: String(PAGE_SIZE),
  });
  if (since) {
    params.set("since", since);
  }
  let nextUrl: string | null =
    `https://api.github.com/repos/${owner}/${repo}/commits?${params.toString()}`;

  while (nextUrl && all.length < limit) {
    if (pagesFetched > 0) {
      // Rate limit protection: 100ms between pages when fetching > 100 commits
      await new Promise((resolve) => setTimeout(resolve, PAGE_DELAY_MS));
    }

    const res = await fetch(nextUrl, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });

    if (!res.ok) {
      logger.warn(
        `[ingest-commits] GitHub commits list failed: ${res.status} ${res.statusText}`
      );
      break;
    }

    const page = (await res.json()) as GitHubCommitListItem[];

    if (!Array.isArray(page) || page.length === 0) {
      break;
    }

    // Only take up to remaining quota
    const remaining = limit - all.length;
    all.push(...page.slice(0, remaining));
    pagesFetched++;

    // Follow Link: <url>; rel="next" header for pagination
    nextUrl = parseNextLink(res.headers.get("Link"));
  }

  return all;
}

/**
 * Fetch full commit detail (files, stats) for a single SHA.
 */
async function fetchCommitDetail(
  token: string,
  owner: string,
  repo: string,
  sha: string
): Promise<GitHubCommitDetail | null> {
  try {
    const res = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/commits/${sha}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
      }
    );

    if (!res.ok) {
      return null;
    }

    return (await res.json()) as GitHubCommitDetail;
  } catch {
    return null;
  }
}

/**
 * Parse the `Link` response header to extract the `rel="next"` URL.
 * Returns null if no next page.
 *
 * Example: `<https://api.github.com/...?page=2>; rel="next", <...>; rel="last"`
 */
function parseNextLink(linkHeader: string | null): string | null {
  if (!linkHeader) return null;

  for (const part of linkHeader.split(",")) {
    const trimmed = part.trim();
    if (trimmed.includes('rel="next"')) {
      const match = trimmed.match(/<([^>]+)>/);
      if (match) return match[1];
    }
  }

  return null;
}

// ── Verbatim text builder ─────────────────────────────────────────────────────

interface VerbatimParams {
  sha: string;
  message: string;
  authorName: string;
  authorDate: string;
  repoOwner: string;
  repoName: string;
  branch: string;
  filesCount: number | undefined;
  additions: number;
  deletions: number;
  fileNames: string[];
}

/**
 * Build the verbatim text that will be embedded for semantic search.
 * Includes all semantically meaningful fields so queries like
 * "commits that touched auth" or "what changed last sprint" work correctly.
 */
function buildVerbatimText(p: VerbatimParams): string {
  const lines: string[] = [
    `Author: ${p.authorName}`,
    `Date: ${p.authorDate}`,
    `Message: ${p.message.slice(0, 500)}`,
  ];

  if (p.filesCount !== undefined) {
    lines.push(`Files changed: ${p.filesCount}`);
  } else {
    lines.push(`Files changed: unknown`);
  }

  if (p.additions > 0 || p.deletions > 0) {
    lines.push(`Additions: ${p.additions}  Deletions: ${p.deletions}`);
  }

  if (p.fileNames.length > 0) {
    lines.push(`Changed files: ${p.fileNames.join(", ")}`);
  }

  lines.push(`SHA: ${p.sha}`);
  lines.push(`Repository: ${p.repoOwner}/${p.repoName}  Branch: ${p.branch}`);

  return lines.join("\n");
}
