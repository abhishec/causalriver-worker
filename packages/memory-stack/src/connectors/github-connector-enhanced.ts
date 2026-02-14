/**
 * GitHub Connector Enhanced (Phase 2)
 *
 * Real GitHub API integration for SE-aaS
 * - Clone repositories
 * - Read file contents
 * - Get PR details
 * - Comment on PRs
 * - Approve/request changes on PRs
 * - Get PR file diffs
 *
 * @module connectors/github-connector-enhanced
 */

import { Octokit } from '@octokit/rest';
import simpleGit, { SimpleGit } from 'simple-git';
import { promises as fs } from 'fs';
import * as path from 'path';
import * as os from 'os';

export interface GitHubConfig {
  /** GitHub personal access token */
  token: string;
  /** Owner of the repository (user or org) */
  owner: string;
  /** Repository name */
  repo: string;
  /** Base directory for cloning repos (default: temp dir) */
  baseDir?: string;
}

export interface PullRequestInfo {
  number: number;
  title: string;
  description: string;
  author: string;
  state: 'open' | 'closed' | 'merged';
  baseBranch: string;
  headBranch: string;
  changedFiles: number;
  additions: number;
  deletions: number;
  createdAt: string;
  updatedAt: string;
  mergeable: boolean | null;
  labels: string[];
}

export interface PRFile {
  filename: string;
  status: 'added' | 'removed' | 'modified' | 'renamed';
  additions: number;
  deletions: number;
  changes: number;
  patch?: string;
  previousFilename?: string;
}

export interface PRComment {
  id: number;
  body: string;
  user: string;
  createdAt: string;
  path?: string;
  line?: number;
}

export interface ReviewComment {
  path: string;
  line: number;
  body: string;
}

/**
 * Enhanced GitHub Connector for SE-aaS
 *
 * Provides real GitHub API integration for:
 * - Repository cloning
 * - File content retrieval
 * - PR analysis
 * - Automated code review
 */
export class GitHubConnectorEnhanced {
  private octokit: Octokit;
  private git: SimpleGit | null = null;
  private config: GitHubConfig;
  private repoPath: string | null = null;

  constructor(config: GitHubConfig) {
    this.config = config;
    this.octokit = new Octokit({
      auth: config.token,
    });
  }

  /**
   * Clone repository to local filesystem
   *
   * @param branch - Branch to checkout (default: main)
   * @returns Path to cloned repository
   */
  async cloneRepo(branch: string = 'main'): Promise<string> {
    const baseDir = this.config.baseDir || path.join(os.tmpdir(), 'nexusbrain-repos');
    const repoDir = path.join(baseDir, this.config.owner, this.config.repo);

    // Create base directory if needed
    await fs.mkdir(repoDir, { recursive: true });

    // Check if repo already exists
    try {
      await fs.access(path.join(repoDir, '.git'));
      // Repo exists, pull latest
      this.git = simpleGit(repoDir);
      await this.git.checkout(branch);
      await this.git.pull('origin', branch);
      this.repoPath = repoDir;
      return repoDir;
    } catch {
      // Repo doesn't exist, clone it
      const repoUrl = `https://github.com/${this.config.owner}/${this.config.repo}.git`;
      this.git = simpleGit();
      await this.git.clone(repoUrl, repoDir, ['--branch', branch]);
      this.git = simpleGit(repoDir);
      this.repoPath = repoDir;
      return repoDir;
    }
  }

  /**
   * Get file content from repository
   *
   * @param filePath - Path to file relative to repo root
   * @param ref - Git ref (branch, tag, commit) - default: main
   * @returns File content as string
   */
  async getFileContent(filePath: string, ref: string = 'main'): Promise<string> {
    try {
      const response = await this.octokit.repos.getContent({
        owner: this.config.owner,
        repo: this.config.repo,
        path: filePath,
        ref,
      });

      // Handle file content (not directory)
      if (!Array.isArray(response.data) && response.data.type === 'file') {
        const content = response.data.content;
        // Content is base64 encoded
        return Buffer.from(content, 'base64').toString('utf-8');
      }

      throw new Error(`Path ${filePath} is not a file`);
    } catch (error: any) {
      throw new Error(`Failed to get file content: ${error.message}`);
    }
  }

  /**
   * Get pull request details
   *
   * @param prNumber - PR number
   * @returns Pull request information
   */
  async getPR(prNumber: number): Promise<PullRequestInfo> {
    try {
      const response = await this.octokit.pulls.get({
        owner: this.config.owner,
        repo: this.config.repo,
        pull_number: prNumber,
      });

      const pr = response.data;

      return {
        number: pr.number,
        title: pr.title,
        description: pr.body || '',
        author: pr.user?.login || 'unknown',
        state: pr.state as 'open' | 'closed',
        baseBranch: pr.base.ref,
        headBranch: pr.head.ref,
        changedFiles: pr.changed_files,
        additions: pr.additions,
        deletions: pr.deletions,
        createdAt: pr.created_at,
        updatedAt: pr.updated_at,
        mergeable: pr.mergeable,
        labels: pr.labels.map((label) => label.name),
      };
    } catch (error: any) {
      throw new Error(`Failed to get PR: ${error.message}`);
    }
  }

  /**
   * Get files changed in a PR
   *
   * @param prNumber - PR number
   * @returns Array of changed files with diffs
   */
  async getPRFiles(prNumber: number): Promise<PRFile[]> {
    try {
      const response = await this.octokit.pulls.listFiles({
        owner: this.config.owner,
        repo: this.config.repo,
        pull_number: prNumber,
        per_page: 100, // Get up to 100 files
      });

      return response.data.map((file) => ({
        filename: file.filename,
        status: file.status as 'added' | 'removed' | 'modified' | 'renamed',
        additions: file.additions,
        deletions: file.deletions,
        changes: file.changes,
        patch: file.patch,
        previousFilename: file.previous_filename,
      }));
    } catch (error: any) {
      throw new Error(`Failed to get PR files: ${error.message}`);
    }
  }

  /**
   * Get comments on a PR
   *
   * @param prNumber - PR number
   * @returns Array of comments
   */
  async getPRComments(prNumber: number): Promise<PRComment[]> {
    try {
      const response = await this.octokit.pulls.listReviewComments({
        owner: this.config.owner,
        repo: this.config.repo,
        pull_number: prNumber,
        per_page: 100,
      });

      return response.data.map((comment) => ({
        id: comment.id,
        body: comment.body,
        user: comment.user?.login || 'unknown',
        createdAt: comment.created_at,
        path: comment.path,
        line: comment.line || undefined,
      }));
    } catch (error: any) {
      throw new Error(`Failed to get PR comments: ${error.message}`);
    }
  }

  /**
   * Comment on a pull request
   *
   * @param prNumber - PR number
   * @param body - Comment body (markdown supported)
   * @returns Comment ID
   */
  async commentOnPR(prNumber: number, body: string): Promise<number> {
    try {
      const response = await this.octokit.issues.createComment({
        owner: this.config.owner,
        repo: this.config.repo,
        issue_number: prNumber, // PRs are issues in GitHub API
        body,
      });

      return response.data.id;
    } catch (error: any) {
      throw new Error(`Failed to comment on PR: ${error.message}`);
    }
  }

  /**
   * Add review comments to specific lines in a PR
   *
   * @param prNumber - PR number
   * @param comments - Array of review comments with file path and line number
   * @param commitId - Commit ID to comment on (default: latest)
   * @returns Review ID
   */
  async addReviewComments(
    prNumber: number,
    comments: ReviewComment[],
    commitId?: string
  ): Promise<number> {
    try {
      // Get latest commit if not provided
      if (!commitId) {
        const pr = await this.getPR(prNumber);
        const commits = await this.octokit.pulls.listCommits({
          owner: this.config.owner,
          repo: this.config.repo,
          pull_number: prNumber,
        });
        commitId = commits.data[commits.data.length - 1].sha;
      }

      const response = await this.octokit.pulls.createReview({
        owner: this.config.owner,
        repo: this.config.repo,
        pull_number: prNumber,
        commit_id: commitId,
        event: 'COMMENT',
        comments: comments.map((c) => ({
          path: c.path,
          line: c.line,
          body: c.body,
        })),
      });

      return response.data.id;
    } catch (error: any) {
      throw new Error(`Failed to add review comments: ${error.message}`);
    }
  }

  /**
   * Approve a pull request
   *
   * @param prNumber - PR number
   * @param message - Optional approval message
   * @returns Review ID
   */
  async approvePR(prNumber: number, message?: string): Promise<number> {
    try {
      const response = await this.octokit.pulls.createReview({
        owner: this.config.owner,
        repo: this.config.repo,
        pull_number: prNumber,
        event: 'APPROVE',
        body: message || '✅ Auto-approved by NexusBrain SE-aaS',
      });

      return response.data.id;
    } catch (error: any) {
      throw new Error(`Failed to approve PR: ${error.message}`);
    }
  }

  /**
   * Request changes on a pull request
   *
   * @param prNumber - PR number
   * @param message - Required message explaining requested changes
   * @param comments - Optional inline comments
   * @returns Review ID
   */
  async requestChanges(
    prNumber: number,
    message: string,
    comments?: ReviewComment[]
  ): Promise<number> {
    try {
      const response = await this.octokit.pulls.createReview({
        owner: this.config.owner,
        repo: this.config.repo,
        pull_number: prNumber,
        event: 'REQUEST_CHANGES',
        body: message,
        comments: comments?.map((c) => ({
          path: c.path,
          line: c.line,
          body: c.body,
        })),
      });

      return response.data.id;
    } catch (error: any) {
      throw new Error(`Failed to request changes: ${error.message}`);
    }
  }

  /**
   * Get repository structure (file tree)
   *
   * @param treeSha - Tree SHA (default: main branch)
   * @param recursive - Get full tree recursively
   * @returns File tree
   */
  async getRepoTree(treeSha?: string, recursive: boolean = true): Promise<any> {
    try {
      // Get main branch if no SHA provided
      if (!treeSha) {
        const branch = await this.octokit.repos.getBranch({
          owner: this.config.owner,
          repo: this.config.repo,
          branch: 'main',
        });
        treeSha = branch.data.commit.sha;
      }

      const response = await this.octokit.git.getTree({
        owner: this.config.owner,
        repo: this.config.repo,
        tree_sha: treeSha,
        recursive: recursive ? 'true' : undefined,
      });

      return response.data.tree;
    } catch (error: any) {
      throw new Error(`Failed to get repo tree: ${error.message}`);
    }
  }

  /**
   * Search code in repository
   *
   * @param query - Search query
   * @returns Search results
   */
  async searchCode(query: string): Promise<any[]> {
    try {
      const response = await this.octokit.search.code({
        q: `${query} repo:${this.config.owner}/${this.config.repo}`,
      });

      return response.data.items;
    } catch (error: any) {
      throw new Error(`Failed to search code: ${error.message}`);
    }
  }

  /**
   * Get local repository path (after cloning)
   */
  getRepoPath(): string | null {
    return this.repoPath;
  }

  /**
   * Get list of all open PRs
   *
   * @param state - PR state (default: open)
   * @returns Array of PR info
   */
  async listPRs(state: 'open' | 'closed' | 'all' = 'open'): Promise<PullRequestInfo[]> {
    try {
      const response = await this.octokit.pulls.list({
        owner: this.config.owner,
        repo: this.config.repo,
        state,
        per_page: 100,
      });

      return response.data.map((pr) => ({
        number: pr.number,
        title: pr.title,
        description: pr.body || '',
        author: pr.user?.login || 'unknown',
        state: pr.state as 'open' | 'closed',
        baseBranch: pr.base.ref,
        headBranch: pr.head.ref,
        changedFiles: pr.changed_files || 0,
        additions: pr.additions || 0,
        deletions: pr.deletions || 0,
        createdAt: pr.created_at,
        updatedAt: pr.updated_at,
        mergeable: null, // Not available in list endpoint
        labels: pr.labels.map((label) => label.name),
      }));
    } catch (error: any) {
      throw new Error(`Failed to list PRs: ${error.message}`);
    }
  }
}

/**
 * Create GitHub connector instance
 *
 * @param config - GitHub configuration
 * @returns GitHub connector instance
 */
export function createGitHubConnector(config: GitHubConfig): GitHubConnectorEnhanced {
  return new GitHubConnectorEnhanced(config);
}
