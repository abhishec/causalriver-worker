/**
 * Git Blame Resolver
 * ===================
 * Resolves the last committer for a file or repo to a Slack mention string.
 *
 * Used by the overnight agent to find a reviewer for AI-generated PRs:
 *   1. getLastCommitter()  — calls GitHub REST API to find who last touched the repo/file
 *   2. mapGitHubToSlack()  — looks up the GitHub login in our engineers table or
 *                            connector_signals to find a matching Slack user ID
 *
 * Both functions are non-fatal: they return null on any failure so the caller
 * can proceed without a reviewer assignment.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/lib/logger";

const GITHUB_API_BASE = "https://api.github.com";
const GITHUB_TIMEOUT_MS = 30_000;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface LastCommitter {
  /** GitHub login (username), e.g. "octocat" */
  login: string;
  /** Display name from Git config, e.g. "The Octocat" */
  name: string | null;
  /** Email from Git config, e.g. "octocat@github.com" */
  email: string | null;
}

// ── GitHub API helpers ────────────────────────────────────────────────────────

/**
 * Fetch the most recent committer for a file path, or for the entire repo
 * if no file path is provided.
 *
 * Uses: GET /repos/{owner}/{repo}/commits?path={file}&per_page=1
 *
 * @param repoOwner  - Repository owner (user or org)
 * @param repoName   - Repository name
 * @param token      - GitHub personal access token or OAuth access token
 * @param filePath   - Optional file path to scope the blame query
 * @returns LastCommitter or null on any failure
 */
export async function getLastCommitter(
  repoOwner: string,
  repoName: string,
  token: string,
  filePath?: string
): Promise<LastCommitter | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GITHUB_TIMEOUT_MS);

  try {
    const url = filePath
      ? `${GITHUB_API_BASE}/repos/${repoOwner}/${repoName}/commits?path=${encodeURIComponent(filePath)}&per_page=1`
      : `${GITHUB_API_BASE}/repos/${repoOwner}/${repoName}/commits?per_page=1`;

    const response = await fetch(url, {
      method: "GET",
      signal: controller.signal,
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });

    if (!response.ok) {
      logger.warn("[git-blame-resolver] GitHub API error", {
        status: response.status,
        repo: `${repoOwner}/${repoName}`,
        filePath,
      });
      return null;
    }

    const data = (await response.json()) as unknown[];
    if (!Array.isArray(data) || data.length === 0) return null;

    const firstCommit = data[0] as Record<string, unknown>;

    // GitHub commit response shape:
    // { author: { login, ... }, commit: { author: { name, email } } }
    const githubAuthor = firstCommit.author as Record<string, unknown> | null | undefined;
    const commitDetail = firstCommit.commit as Record<string, unknown> | undefined;
    const gitAuthor = commitDetail?.author as Record<string, unknown> | undefined;

    const login =
      typeof githubAuthor?.login === "string" ? githubAuthor.login : null;

    if (!login) return null;

    return {
      login,
      name: typeof gitAuthor?.name === "string" ? gitAuthor.name : null,
      email: typeof gitAuthor?.email === "string" ? gitAuthor.email : null,
    };
  } catch (err) {
    const isTimeout = err instanceof Error && err.name === "AbortError";
    logger.warn("[git-blame-resolver] getLastCommitter failed (non-fatal)", {
      error: isTimeout ? "timeout" : err instanceof Error ? err.message : String(err),
      repo: `${repoOwner}/${repoName}`,
      filePath,
    });
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// ── Slack mapping ─────────────────────────────────────────────────────────────

/**
 * Map a GitHub login to a Slack user ID for the given organization.
 *
 * Lookup strategy (in order):
 *   1. engineers table: github_login → email → Slack lookup via connector_signals
 *   2. connector_signals: metadata.github_login → metadata.slack_user_id
 *   3. Returns "@{githubLogin}" as a last-resort fallback text mention
 *
 * Returns null if no Slack identity can be found (caller should skip the @mention).
 *
 * @param githubLogin  - GitHub username to look up
 * @param supabase     - Service-role Supabase client (bypasses RLS)
 * @param orgId        - Organization ID for scoped lookup
 * @returns Slack user ID (e.g. "U01ABCDEF") or null
 */
export async function mapGitHubToSlack(
  githubLogin: string,
  supabase: SupabaseClient,
  orgId: string
): Promise<string | null> {
  if (!githubLogin) return null;

  try {
    // Strategy 1: engineers table — github_login → slack_user_id direct column
    // (populated when user links their Slack account in settings)
    const { data: engineer } = await supabase
      .from("engineers")
      .select("slack_user_id, email, name")
      .eq("organization_id", orgId)
      .eq("github_login", githubLogin)
      .maybeSingle();

    if (engineer?.slack_user_id) {
      logger.warn("[git-blame-resolver] Resolved GitHub→Slack via engineers table", {
        githubLogin,
        slackUserId: engineer.slack_user_id,
      });
      return engineer.slack_user_id as string;
    }

    // Strategy 2: connector_signals metadata — look for signals with both
    // github_login and slack_user_id set (written by Slack connector sync)
    const { data: signal } = await supabase
      .from("connector_signals")
      .select("metadata")
      .eq("organization_id", orgId)
      .filter("metadata->github_login", "eq", githubLogin)
      .not("metadata->slack_user_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (signal?.metadata) {
      const meta = signal.metadata as Record<string, unknown>;
      const slackId = meta.slack_user_id;
      if (typeof slackId === "string" && slackId.startsWith("U")) {
        logger.warn("[git-blame-resolver] Resolved GitHub→Slack via connector_signals", {
          githubLogin,
          slackUserId: slackId,
        });
        return slackId;
      }
    }

    // Strategy 3: No mapping found — log and return null
    // Caller will use the GitHub login as a text fallback (@login in PR description)
    logger.warn("[git-blame-resolver] No Slack mapping found for GitHub login", {
      githubLogin,
      orgId,
    });
    return null;
  } catch (err) {
    logger.warn("[git-blame-resolver] mapGitHubToSlack failed (non-fatal)", {
      githubLogin,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}
