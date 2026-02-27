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

interface GitHubRefResponse {
  object: {
    sha: string;
    type: string;
    url: string;
  };
  ref: string;
  url: string;
}

interface GitHubCommitFileResponse {
  content: { sha: string; path: string } | null;
  commit: {
    sha: string;
    message: string;
  };
}

interface GitHubPRResponse {
  number: number;
  html_url: string;
  title: string;
}

export interface GitHubBranchResult {
  branchName: string;
  sha: string;
}

export interface GitHubCommitResult {
  commit: {
    sha: string;
    message: string;
  };
}

export interface GitHubPRResult {
  number: number;
  url: string;
  title: string;
}

export interface GitHubFileToCommit {
  path: string;
  content: string;
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
 * Shared fetch helper for GitHub API calls (POST/PUT).
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
 * Shared GET helper for GitHub API calls.
 */
async function githubGet(
  token: string,
  url: string
): Promise<{ ok: boolean; status: number; data: Record<string, unknown> }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GITHUB_API_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: "GET",
      signal: controller.signal,
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });

    const text = await response.text();
    let data: Record<string, unknown> = {};

    try {
      data = JSON.parse(text) as Record<string, unknown>;
    } catch {
      data = { message: text.slice(0, 500) };
    }

    return { ok: response.ok, status: response.status, data };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Shared PUT helper for GitHub API calls.
 */
async function githubPut(
  token: string,
  url: string,
  body: Record<string, unknown>
): Promise<{ ok: boolean; status: number; data: Record<string, unknown> }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GITHUB_API_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: "PUT",
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

/**
 * Create a new branch in a GitHub repository.
 *
 * @param token      - GitHub personal access token or OAuth access token
 * @param owner      - Repository owner (user or org)
 * @param repo       - Repository name
 * @param branchName - Name for the new branch
 * @param fromBranch - Base branch to branch from (defaults to "main")
 * @returns { branchName, sha } of the newly created branch
 */
export async function createGitHubBranch(
  token: string,
  owner: string,
  repo: string,
  branchName: string,
  fromBranch = "main"
): Promise<GitHubBranchResult> {
  // Step 1: Get the base branch SHA
  const refUrl = `${GITHUB_API_BASE}/repos/${owner}/${repo}/git/ref/heads/${fromBranch}`;

  const { ok: refOk, status: refStatus, data: refData } = await githubGet(token, refUrl);

  if (!refOk) {
    const errMsg = parseGitHubError(refData as GitHubErrorResponse, refStatus);
    throw new Error(`GitHub: failed to get ref for '${fromBranch}': ${errMsg}`);
  }

  const refResponse = refData as unknown as GitHubRefResponse;
  const baseSha = refResponse.object?.sha;

  if (!baseSha) {
    throw new Error(`GitHub: could not extract SHA from ref response for '${fromBranch}'`);
  }

  // Step 2: Create the new branch
  const createUrl = `${GITHUB_API_BASE}/repos/${owner}/${repo}/git/refs`;

  const { ok: createOk, status: createStatus, data: createData } = await githubFetch(
    token,
    createUrl,
    {
      ref: `refs/heads/${branchName}`,
      sha: baseSha,
    }
  );

  if (!createOk) {
    const errMsg = parseGitHubError(createData as GitHubErrorResponse, createStatus);
    throw new Error(`GitHub: failed to create branch '${branchName}': ${errMsg}`);
  }

  logger.warn("[writeback/github] createGitHubBranch: branch created", {
    owner,
    repo,
    branchName,
    sha: baseSha,
  });

  return { branchName, sha: baseSha };
}

/**
 * Commit one or more files to a GitHub branch.
 *
 * Creates or updates each file in the given branch. If a file already exists,
 * its current blob SHA is fetched first so the update succeeds.
 *
 * @param token   - GitHub personal access token or OAuth access token
 * @param owner   - Repository owner (user or org)
 * @param repo    - Repository name
 * @param branch  - Branch to commit files to
 * @param files   - Array of { path, content } objects to write
 * @param message - Commit message
 * @returns { commit: { sha, message } } from the last file committed
 */
export async function commitFilesToBranch(
  token: string,
  owner: string,
  repo: string,
  branch: string,
  files: GitHubFileToCommit[],
  message: string
): Promise<GitHubCommitResult> {
  if (files.length === 0) {
    throw new Error("GitHub: commitFilesToBranch requires at least one file");
  }

  let lastCommit: { sha: string; message: string } = { sha: "", message };

  for (const file of files) {
    // Check if file already exists to get its blob SHA (required for updates)
    const contentsUrl = `${GITHUB_API_BASE}/repos/${owner}/${repo}/contents/${file.path}?ref=${encodeURIComponent(branch)}`;
    const { ok: existsOk, data: existsData } = await githubGet(token, contentsUrl);

    const existingFileSha =
      existsOk && existsData && typeof (existsData as Record<string, unknown>).sha === "string"
        ? (existsData as Record<string, unknown>).sha as string
        : undefined;

    // Encode content as base64
    const encodedContent = Buffer.from(file.content).toString("base64");

    const putUrl = `${GITHUB_API_BASE}/repos/${owner}/${repo}/contents/${file.path}`;
    const putBody: Record<string, unknown> = {
      message,
      content: encodedContent,
      branch,
    };
    if (existingFileSha) {
      putBody.sha = existingFileSha;
    }

    const { ok: putOk, status: putStatus, data: putData } = await githubPut(token, putUrl, putBody);

    if (!putOk) {
      const errMsg = parseGitHubError(putData as GitHubErrorResponse, putStatus);
      throw new Error(`GitHub: failed to commit file '${file.path}': ${errMsg}`);
    }

    const commitResponse = putData as unknown as GitHubCommitFileResponse;
    lastCommit = {
      sha: commitResponse.commit?.sha ?? "",
      message: commitResponse.commit?.message ?? message,
    };
  }

  logger.warn("[writeback/github] commitFilesToBranch: files committed", {
    owner,
    repo,
    branch,
    fileCount: files.length,
    commitSha: lastCommit.sha,
  });

  return { commit: lastCommit };
}

/**
 * Create a pull request in a GitHub repository.
 *
 * @param token  - GitHub personal access token or OAuth access token
 * @param owner  - Repository owner (user or org)
 * @param repo   - Repository name
 * @param title  - PR title
 * @param body   - PR description / body
 * @param head   - Source branch (the branch with changes)
 * @param base   - Target branch (defaults to "main")
 * @returns { number, url, title } of the created pull request
 */
export async function createGitHubPR(
  token: string,
  owner: string,
  repo: string,
  title: string,
  body: string,
  head: string,
  base = "main"
): Promise<GitHubPRResult> {
  const url = `${GITHUB_API_BASE}/repos/${owner}/${repo}/pulls`;

  const { ok, status, data } = await githubFetch(token, url, {
    title,
    body,
    head,
    base,
  });

  if (!ok) {
    const errMsg = parseGitHubError(data as GitHubErrorResponse, status);
    throw new Error(`GitHub: failed to create PR '${title}': ${errMsg}`);
  }

  const pr = data as unknown as GitHubPRResponse;

  logger.warn("[writeback/github] createGitHubPR: PR created", {
    owner,
    repo,
    prNumber: pr.number,
    title: pr.title,
  });

  return {
    number: pr.number,
    url: pr.html_url,
    title: pr.title,
  };
}
