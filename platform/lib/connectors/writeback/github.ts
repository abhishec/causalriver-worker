import { logger } from "@/lib/logger";
import type {
  GitHubAddPRCommentPayload,
  GitHubCreateIssuePayload,
  WritebackActionResult,
} from "./types";

const GITHUB_API_TIMEOUT_MS = 30_000;
const GITHUB_API_BASE = "https://api.github.com";

interface GitHubIssueResponse {
  number: number;
  html_url: string;
  id: number;
}

interface GitHubCommentResponse {
  id: number;
  html_url: string;
}

interface GitHubErrorResponse {
  message?: string;
  errors?: Array<{ resource: string; field: string; code: string }>;
  documentation_url?: string;
}

/**
 * Parse a GitHub API error response into a readable string.
 */
function parseGitHubError(body: GitHubErrorResponse, status: number): string {
  const parts: string[] = [`HTTP ${status}`];

  if (body.message) {
    parts.push(body.message);
  }

  if (body.errors && body.errors.length > 0) {
    const fieldErrors = body.errors.map(
      (e) => `${e.resource}.${e.field}: ${e.code}`
    );
    parts.push(...fieldErrors);
  }

  return parts.join(" — ");
}

/**
 * Shared fetch helper for GitHub API calls.
 */
async function githubFetch(
  token: string,
  url: string,
  body: Record<string, unknown>
): Promise<{ ok: boolean; status: number; data: Record<string, unknown> }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GITHUB_API_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
      },
      body: JSON.stringify(body),
    });

    const text = await response.text();
    let data: Record<string, unknown> = {};

    try {
      data = JSON.parse(text) as Record<string, unknown>;
    } catch {
      // Non-JSON response — wrap in a message field for caller to handle
      data = { message: text.slice(0, 500) };
    }

    return { ok: response.ok, status: response.status, data };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Create a GitHub issue in the specified repository.
 *
 * @param token   - GitHub personal access token or OAuth access token
 * @param payload - Owner, repo, title, body, and optional labels
 * @returns WritebackActionResult with github_issue (number) and github_url on success
 */
export async function createGitHubIssue(
  token: string,
  payload: GitHubCreateIssuePayload
): Promise<WritebackActionResult> {
  const url = `${GITHUB_API_BASE}/repos/${payload.owner}/${payload.repo}/issues`;

  try {
    const { ok, status, data } = await githubFetch(token, url, {
      title: payload.title,
      body: payload.body,
      ...(payload.labels && payload.labels.length > 0
        ? { labels: payload.labels }
        : {}),
    });

    if (!ok) {
      const errorMessage = parseGitHubError(data as GitHubErrorResponse, status);
      logger.warn("[writeback/github] createIssue error:", {
        owner: payload.owner,
        repo: payload.repo,
        error: errorMessage,
      });
      return {
        success: false,
        error: `GitHub API error: ${errorMessage}`,
      };
    }

    const issue = data as unknown as GitHubIssueResponse;

    return {
      success: true,
      externalRef: {
        github_issue: issue.number,
        github_url: issue.html_url,
      },
    };
  } catch (err) {
    const isTimeout = err instanceof Error && err.name === "AbortError";
    const message = isTimeout
      ? "GitHub API request timed out after 30s"
      : `GitHub API request failed: ${err instanceof Error ? err.message : String(err)}`;
    logger.error("[writeback/github] createIssue fetch error:", message);
    return { success: false, error: message };
  }
}

/**
 * Add a comment to a GitHub pull request.
 *
 * GitHub uses the Issues comments endpoint for PR comments (PRs are issues).
 *
 * @param token   - GitHub personal access token or OAuth access token
 * @param payload - Owner, repo, pull request number, and comment body
 * @returns WritebackActionResult with github_comment_id on success
 */
export async function addPRComment(
  token: string,
  payload: GitHubAddPRCommentPayload
): Promise<WritebackActionResult> {
  const url = `${GITHUB_API_BASE}/repos/${payload.owner}/${payload.repo}/issues/${payload.pullNumber}/comments`;

  try {
    const { ok, status, data } = await githubFetch(token, url, {
      body: payload.body,
    });

    if (!ok) {
      const errorMessage = parseGitHubError(data as GitHubErrorResponse, status);
      logger.warn("[writeback/github] addPRComment error:", {
        owner: payload.owner,
        repo: payload.repo,
        pullNumber: payload.pullNumber,
        error: errorMessage,
      });
      return {
        success: false,
        error: `GitHub API error: ${errorMessage}`,
      };
    }

    const comment = data as unknown as GitHubCommentResponse;

    return {
      success: true,
      externalRef: {
        github_comment_id: comment.id,
      },
    };
  } catch (err) {
    const isTimeout = err instanceof Error && err.name === "AbortError";
    const message = isTimeout
      ? "GitHub API request timed out after 30s"
      : `GitHub API request failed: ${err instanceof Error ? err.message : String(err)}`;
    logger.error("[writeback/github] addPRComment fetch error:", message);
    return { success: false, error: message };
  }
}
