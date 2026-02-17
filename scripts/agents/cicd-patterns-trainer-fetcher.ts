/**
 * CI/CD Patterns Trainer — GitHub Actions Workflow Fetcher
 *
 * Fetches .github/workflows/*.yml from 30+ top repos to learn CI/CD patterns:
 * - Pipeline structure (jobs, steps, dependencies)
 * - Testing strategies (matrix builds, parallel tests)
 * - Deployment patterns (staging, production, rollback)
 * - Security practices (secret management, permissions)
 * - Performance (caching, artifact management)
 *
 * Uses GitHub Contents API (1 call/repo) + raw.githubusercontent.com (no rate limit)
 * for actual file contents.
 */

// ============================================================================
// TYPES
// ============================================================================

export interface WorkflowFile {
  name: string;         // e.g. "ci.yml"
  path: string;         // e.g. ".github/workflows/ci.yml"
  size: number;         // bytes
  content: string;      // raw YAML content
  downloadUrl: string;
}

export interface RepoWorkflowData {
  owner: string;
  repo: string;
  fullName: string;     // "vercel/next.js"
  stars: number;
  language: string;
  workflows: WorkflowFile[];
  workflowRunStats: {
    totalRuns: number;
    successRuns: number;
    failureRuns: number;
    avgDurationSec: number;
  };
  fetchedAt: Date;
}

export interface CICDFetchOptions {
  /** Rate limit delay in ms (default: 300) */
  rateLimitDelay?: number;
  /** GitHub token (optional but recommended for 5K/hr rate limit) */
  githubToken?: string;
  /** Max workflow runs to fetch per repo (default: 50) */
  maxWorkflowRuns?: number;
}

// ============================================================================
// TARGET REPOS
// ============================================================================

export const TARGET_CICD_REPOS: Array<{ owner: string; repo: string }> = [
  // Web Frameworks (diverse CI patterns)
  { owner: 'vercel', repo: 'next.js' },
  { owner: 'facebook', repo: 'react' },
  { owner: 'vuejs', repo: 'core' },
  { owner: 'sveltejs', repo: 'svelte' },
  { owner: 'angular', repo: 'angular' },
  // Backend / Runtime
  { owner: 'nodejs', repo: 'node' },
  { owner: 'denoland', repo: 'deno' },
  { owner: 'expressjs', repo: 'express' },
  { owner: 'fastify', repo: 'fastify' },
  // Infrastructure
  { owner: 'kubernetes', repo: 'kubernetes' },
  { owner: 'hashicorp', repo: 'terraform' },
  { owner: 'docker', repo: 'compose' },
  // Databases / Data
  { owner: 'supabase', repo: 'supabase' },
  { owner: 'prisma', repo: 'prisma' },
  { owner: 'drizzle-team', repo: 'drizzle-orm' },
  // AI / ML
  { owner: 'huggingface', repo: 'transformers' },
  { owner: 'langchain-ai', repo: 'langchain' },
  // DevTools
  { owner: 'microsoft', repo: 'vscode' },
  { owner: 'vitejs', repo: 'vite' },
  { owner: 'eslint', repo: 'eslint' },
  { owner: 'prettier', repo: 'prettier' },
  // Testing frameworks (for learning test CI patterns)
  { owner: 'jestjs', repo: 'jest' },
  { owner: 'vitest-dev', repo: 'vitest' },
  { owner: 'microsoft', repo: 'playwright' },
  { owner: 'cypress-io', repo: 'cypress' },
  // Cloud / SaaS
  { owner: 'grafana', repo: 'grafana' },
  { owner: 'elastic', repo: 'elasticsearch' },
  { owner: 'apache', repo: 'kafka' },
  // Rust / Go (different CI patterns)
  { owner: 'rust-lang', repo: 'rust' },
  { owner: 'golang', repo: 'go' },
];

// ============================================================================
// FETCHER FUNCTIONS
// ============================================================================

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchWithAuth(
  url: string,
  token?: string,
): Promise<Response> {
  const headers: Record<string, string> = {
    'Accept': 'application/vnd.github.v3+json',
    'User-Agent': 'NexusBrain-CICDTrainer/1.0',
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return fetch(url, { headers });
}

async function fetchWorkflowFiles(
  owner: string,
  repo: string,
  options: CICDFetchOptions,
): Promise<WorkflowFile[]> {
  const delay = options.rateLimitDelay || 300;
  const workflows: WorkflowFile[] = [];

  // Step 1: List workflow files (1 API call)
  try {
    const listUrl = `https://api.github.com/repos/${owner}/${repo}/contents/.github/workflows`;
    const response = await fetchWithAuth(listUrl, options.githubToken);

    if (!response.ok) {
      // Repo might not have .github/workflows (e.g. Go uses Makefile)
      return [];
    }

    const files = await response.json();
    if (!Array.isArray(files)) return [];

    // Step 2: Download raw content (FREE, no rate limit via raw.githubusercontent.com)
    for (const file of files) {
      if (!file.name.endsWith('.yml') && !file.name.endsWith('.yaml')) continue;

      try {
        const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/HEAD/${file.path}`;
        const rawResponse = await fetch(rawUrl, {
          headers: { 'User-Agent': 'NexusBrain-CICDTrainer/1.0' },
        });
        if (rawResponse.ok) {
          const content = await rawResponse.text();
          workflows.push({
            name: file.name,
            path: file.path,
            size: file.size || content.length,
            content,
            downloadUrl: rawUrl,
          });
        }
        await sleep(100); // gentle rate limit even on raw
      } catch {
        // Skip individual file errors
      }
    }
  } catch (err) {
    console.log(`[CICDFetcher] [${owner}/${repo}] Error: ${err instanceof Error ? err.message : String(err)}`);
  }

  await sleep(delay);
  return workflows;
}

async function fetchWorkflowRunStats(
  owner: string,
  repo: string,
  options: CICDFetchOptions,
): Promise<RepoWorkflowData['workflowRunStats']> {
  const maxRuns = options.maxWorkflowRuns || 50;
  try {
    const url = `https://api.github.com/repos/${owner}/${repo}/actions/runs?per_page=${maxRuns}`;
    const response = await fetchWithAuth(url, options.githubToken);

    if (!response.ok) {
      return { totalRuns: 0, successRuns: 0, failureRuns: 0, avgDurationSec: 0 };
    }

    const data = await response.json();
    const runs = data.workflow_runs || [];

    let totalDuration = 0;
    let durationCount = 0;
    let successCount = 0;
    let failureCount = 0;

    for (const run of runs) {
      if (run.conclusion === 'success') successCount++;
      else if (run.conclusion === 'failure') failureCount++;

      if (run.created_at && run.updated_at) {
        const duration = (new Date(run.updated_at).getTime() - new Date(run.created_at).getTime()) / 1000;
        if (duration > 0 && duration < 7200) { // ignore runs > 2 hours (likely stuck)
          totalDuration += duration;
          durationCount++;
        }
      }
    }

    return {
      totalRuns: runs.length,
      successRuns: successCount,
      failureRuns: failureCount,
      avgDurationSec: durationCount > 0 ? Math.round(totalDuration / durationCount) : 0,
    };
  } catch {
    return { totalRuns: 0, successRuns: 0, failureRuns: 0, avgDurationSec: 0 };
  }
}

async function fetchRepoStars(
  owner: string,
  repo: string,
  options: CICDFetchOptions,
): Promise<{ stars: number; language: string }> {
  try {
    const url = `https://api.github.com/repos/${owner}/${repo}`;
    const response = await fetchWithAuth(url, options.githubToken);
    if (response.ok) {
      const data = await response.json();
      return { stars: data.stargazers_count || 0, language: data.language || 'Unknown' };
    }
  } catch {
    // ignore
  }
  return { stars: 0, language: 'Unknown' };
}

// ============================================================================
// YAML ANALYSIS HELPERS
// ============================================================================

export interface WorkflowAnalysis {
  jobCount: number;
  stepCount: number;
  hasMatrix: boolean;
  hasCaching: boolean;
  hasArtifacts: boolean;
  hasSecrets: boolean;
  hasPermissions: boolean;
  hasContainerServices: boolean;
  hasConcurrency: boolean;
  triggers: string[];
  actions: string[];           // e.g. "actions/checkout@v4"
  jobDependencies: number;     // count of job 'needs' references
  envVarCount: number;
}

export function analyzeWorkflowYAML(content: string): WorkflowAnalysis {
  const analysis: WorkflowAnalysis = {
    jobCount: 0,
    stepCount: 0,
    hasMatrix: false,
    hasCaching: false,
    hasArtifacts: false,
    hasSecrets: false,
    hasPermissions: false,
    hasContainerServices: false,
    hasConcurrency: false,
    triggers: [],
    actions: [],
    jobDependencies: 0,
    envVarCount: 0,
  };

  const lines = content.split('\n');

  // Count jobs (lines matching "  jobname:" under "jobs:" section)
  let inJobs = false;
  let inSteps = false;
  for (const line of lines) {
    const trimmed = line.trimEnd();

    if (trimmed === 'jobs:') { inJobs = true; continue; }
    if (inJobs && !trimmed.startsWith(' ') && !trimmed.startsWith('\t') && trimmed.length > 0) {
      inJobs = false;
    }
    if (inJobs && /^  [a-zA-Z_-]+:/.test(trimmed) && !trimmed.includes('matrix') && !trimmed.includes('env')) {
      analysis.jobCount++;
    }

    // Count steps (lines with "- uses:" or "- run:")
    if (trimmed.includes('- uses:') || trimmed.includes('- run:')) {
      analysis.stepCount++;
    }

    // Extract actions (- uses: actions/checkout@v4)
    const usesMatch = trimmed.match(/- uses:\s*(.+)/);
    if (usesMatch) {
      const action = usesMatch[1].trim();
      if (!analysis.actions.includes(action)) analysis.actions.push(action);
    }

    // Detect features
    if (trimmed.includes('matrix:')) analysis.hasMatrix = true;
    if (trimmed.includes('actions/cache') || trimmed.includes('cache:')) analysis.hasCaching = true;
    if (trimmed.includes('actions/upload-artifact') || trimmed.includes('actions/download-artifact')) analysis.hasArtifacts = true;
    if (trimmed.includes('secrets.')) analysis.hasSecrets = true;
    if (trimmed.match(/^permissions:/)) analysis.hasPermissions = true;
    if (trimmed.includes('services:')) analysis.hasContainerServices = true;
    if (trimmed.includes('concurrency:')) analysis.hasConcurrency = true;
    if (trimmed.includes('needs:')) analysis.jobDependencies++;
    if (trimmed.match(/\$\{\{.*env\./)) analysis.envVarCount++;
  }

  // Extract triggers
  const onMatch = content.match(/^on:\s*\n((?:  .+\n)*)/m);
  if (onMatch) {
    const triggerLines = onMatch[1].split('\n');
    for (const tl of triggerLines) {
      const trigger = tl.trim().replace(/:$/, '');
      if (trigger && !trigger.startsWith('-') && !trigger.startsWith('#')) {
        analysis.triggers.push(trigger);
      }
    }
  }
  // Simple on: syntax (on: [push, pull_request])
  const simpleOnMatch = content.match(/^on:\s*\[(.+)\]/m);
  if (simpleOnMatch) {
    analysis.triggers = simpleOnMatch[1].split(',').map(t => t.trim());
  }

  return analysis;
}

// ============================================================================
// MAIN EXPORT
// ============================================================================

export async function fetchAllCICDData(
  repos?: Array<{ owner: string; repo: string }>,
  options: CICDFetchOptions = {},
): Promise<RepoWorkflowData[]> {
  const targets = repos || TARGET_CICD_REPOS;
  const delay = options.rateLimitDelay || 300;
  const results: RepoWorkflowData[] = [];

  console.log(`[CICDFetcher] Fetching CI/CD workflows from ${targets.length} repos...`);

  for (let i = 0; i < targets.length; i++) {
    const { owner, repo } = targets[i];
    const fullName = `${owner}/${repo}`;
    console.log(`[${i + 1}/${targets.length}] -- ${fullName} --`);

    // Fetch repo info + workflows + run stats in sequence (to respect rate limits)
    const { stars, language } = await fetchRepoStars(owner, repo, options);
    await sleep(delay);

    const workflows = await fetchWorkflowFiles(owner, repo, options);
    await sleep(delay);

    const runStats = await fetchWorkflowRunStats(owner, repo, options);
    await sleep(delay);

    results.push({
      owner, repo, fullName,
      stars, language,
      workflows,
      workflowRunStats: runStats,
      fetchedAt: new Date(),
    });

    console.log(
      `[CICDFetcher] [${fullName}] DONE: ${workflows.length} workflows, ` +
      `${runStats.totalRuns} runs (${runStats.successRuns} success, ${runStats.failureRuns} failures)`,
    );
  }

  const totalWfs = results.reduce((sum, r) => sum + r.workflows.length, 0);
  console.log(`[CICDFetcher] Complete: ${totalWfs} workflows across ${results.length} repos`);

  return results;
}
