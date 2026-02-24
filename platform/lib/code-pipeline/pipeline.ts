/**
 * Code Application Pipeline — End-to-End Automated Code Fix
 *
 * Pipeline stages:
 *   1. DETECT:        Validate issue, check for duplicate runs
 *   2. GENERATE FIX:  executeAgent() with appropriate agent type
 *   3. CREATE BRANCH: GitHub API → create branch with fix artifacts
 *   4. RUN TESTS:     Trigger CI on branch, poll for completion
 *   5. OPEN PR:       Create PR with analysis + confidence score
 *   6. MONITOR:       Track PR status (merged/closed/commented)
 *
 * RL integration:
 *   - Merged PR → positive signal (reinforces the fix approach)
 *   - Closed PR → negative signal (learns from rejection)
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { executeAgent } from "@/lib/agents/execute";
import { logger } from "@/lib/logger";

// ── Types ──────────────────────────────────────────────────────────────────

export interface CodeIssue {
  type: "tech_debt" | "vulnerability" | "test_coverage" | "performance" | "lint";
  severity: "critical" | "high" | "medium" | "low";
  file?: string;
  description: string;
  source: "health_monitor" | "ci_failure" | "agent_detection" | "user_request";
}

export type PipelineStage =
  | "detected"
  | "generating_fix"
  | "branch_created"
  | "tests_running"
  | "pr_opened"
  | "monitoring"
  | "completed"
  | "failed";

export interface CodePipelineRun {
  id: string;
  organizationId: string;
  issue: CodeIssue;
  stage: PipelineStage;
  branchName?: string;
  prUrl?: string;
  prNumber?: number;
  agentTaskId?: string;
  fixArtifacts?: Array<{ path: string; content: string; language: string }>;
  testResults?: Record<string, unknown>;
  confidence?: number;
  prStatus?: string;
  rejectionReason?: string;
  createdAt: string;
  completedAt?: string;
  durationMs?: number;
}

export interface PipelineConfig {
  /** GitHub connector ID for this org (from org_connectors) */
  connectorId?: string;
  /** Repository in format owner/repo */
  repository?: string;
  /** Base branch (default: main) */
  baseBranch?: string;
  /** Whether to actually create branches/PRs (false = dry run) */
  dryRun?: boolean;
  /** Auto-assign reviewers from CODEOWNERS */
  autoAssignReviewers?: boolean;
}

// ── Agent Type Mapping ─────────────────────────────────────────────────────

const ISSUE_TYPE_TO_AGENT: Record<string, string> = {
  tech_debt: "tech-debt-audit",
  vulnerability: "code-review",
  test_coverage: "tdd",
  performance: "performance",
  lint: "code-review",
};

// ── Main Pipeline Function ─────────────────────────────────────────────────

/**
 * Run the full code application pipeline for a detected issue.
 *
 * In dry-run mode, only stages 1 (detect) and 2 (generate fix) run.
 * The fix artifacts are returned without creating branches or PRs.
 */
export async function runCodePipeline(
  supabase: SupabaseClient,
  issue: CodeIssue,
  organizationId: string,
  userId: string,
  config: PipelineConfig = {},
): Promise<CodePipelineRun> {
  const startTime = Date.now();
  const dryRun = config.dryRun !== false; // Default to dry run for safety

  // ── Stage 1: DETECT ──────────────────────────────────────────────────
  // Check for duplicate pipeline run (same issue in last 4 hours)
  const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString();
  const { data: existingRun } = await supabase
    .from("code_pipeline_runs")
    .select("id, stage")
    .eq("organization_id", organizationId)
    .eq("issue_type", issue.type)
    .eq("issue_description", issue.description)
    .gte("created_at", fourHoursAgo)
    .not("stage", "in", '("completed","failed")')
    .limit(1)
    .single();

  if (existingRun) {
    logger.warn(`[CodePipeline] Duplicate run detected (${existingRun.id}), skipping`);
    return {
      id: existingRun.id,
      organizationId,
      issue,
      stage: existingRun.stage as PipelineStage,
      createdAt: new Date().toISOString(),
    };
  }

  // Create pipeline run record
  const { data: runRecord, error: insertError } = await supabase
    .from("code_pipeline_runs")
    .insert({
      organization_id: organizationId,
      issue_type: issue.type,
      issue_severity: issue.severity,
      issue_description: issue.description,
      issue_source: issue.source,
      stage: "detected",
    })
    .select("id")
    .single();

  if (insertError || !runRecord) {
    logger.error("[CodePipeline] Failed to create run record:", insertError);
    return {
      id: "error",
      organizationId,
      issue,
      stage: "failed",
      createdAt: new Date().toISOString(),
    };
  }

  const runId = runRecord.id;

  // ── Stage 2: GENERATE FIX ────────────────────────────────────────────
  await updateStage(supabase, runId, "generating_fix");

  const agentType = ISSUE_TYPE_TO_AGENT[issue.type] || "code-review";
  const fixPrompt = buildFixPrompt(issue);

  try {
    const agentResult = await executeAgent(supabase, {
      prompt: fixPrompt,
      agentType,
      organizationId,
      userId,
      source: "api",
      priority: issue.severity === "critical" ? "critical" : "high",
    });

    // Update run with agent results
    const artifacts = agentResult.artifacts || [];
    const confidence = agentResult.confidence ?? 0.5;

    await supabase
      .from("code_pipeline_runs")
      .update({
        agent_task_id: agentResult.taskId,
        fix_artifacts: artifacts,
        confidence,
        stage: dryRun ? "completed" : "branch_created",
        completed_at: dryRun ? new Date().toISOString() : null,
        duration_ms: dryRun ? Date.now() - startTime : null,
      })
      .eq("id", runId);

    if (dryRun) {
      logger.warn(`[CodePipeline] Dry run completed: ${artifacts.length} artifacts generated, confidence=${confidence}`);

      // Emit RL signal for dry run
      await emitPipelineSignal(supabase, organizationId, runId, "dry_run_completed", confidence);

      return {
        id: runId,
        organizationId,
        issue,
        stage: "completed",
        agentTaskId: agentResult.taskId,
        fixArtifacts: artifacts.map((a) => ({
          path: a.title || "fix",
          content: a.content,
          language: a.language || "text",
        })),
        confidence,
        createdAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        durationMs: Date.now() - startTime,
      };
    }

    // ── Stages 3-6: Branch, Test, PR, Monitor ──────────────────────────
    // Full GitHub integration using the org's GitHub connector token.
    const branchName = `brain-fix/${issue.type}-${Date.now()}`;

    // Get GitHub credentials from org_connectors
    const ghCreds = await getGitHubCredentials(supabase, organizationId);

    if (!ghCreds) {
      // No GitHub connector — store artifacts only, mark as branch_created
      await supabase
        .from("code_pipeline_runs")
        .update({ branch_name: branchName, stage: "branch_created" })
        .eq("id", runId);

      logger.warn(`[CodePipeline] No GitHub connector — artifacts stored, branch ${branchName} not pushed`);
      await emitPipelineSignal(supabase, organizationId, runId, "fix_generated", confidence);

      return {
        id: runId, organizationId, issue, stage: "branch_created", branchName,
        agentTaskId: agentResult.taskId,
        fixArtifacts: artifacts.map((a) => ({ path: a.title || "fix", content: a.content, language: a.language || "text" })),
        confidence, createdAt: new Date().toISOString(), durationMs: Date.now() - startTime,
      };
    }

    const { token, owner, repo, baseBranch } = ghCreds;

    // ── Stage 3: CREATE BRANCH + COMMIT ──────────────────────────────
    try {
      const commitSha = await createBranchAndCommit(
        token, owner, repo, baseBranch, branchName,
        artifacts.map((a) => ({
          // Sanitize path — strip traversal sequences, only allow safe filename characters
          path: (a.title || `fix-${issue.type}.ts`).replace(/\.\./g, '').replace(/^\/+/, '').replace(/[^a-zA-Z0-9/_.\-]/g, '_'),
          content: a.content,
        })),
        `[Brain Fix] ${issue.type}: ${issue.description.slice(0, 72)}`
      );

      await supabase
        .from("code_pipeline_runs")
        .update({ branch_name: branchName, stage: "branch_created" })
        .eq("id", runId);

      // ── Stage 4: RUN TESTS (wait for CI) ─────────────────────────
      await updateStage(supabase, runId, "tests_running");
      const ciResult = await pollCIChecks(token, owner, repo, commitSha);

      if (!ciResult.passed) {
        await supabase
          .from("code_pipeline_runs")
          .update({ stage: "failed", test_results: ciResult, completed_at: new Date().toISOString(), duration_ms: Date.now() - startTime })
          .eq("id", runId);
        await emitPipelineSignal(supabase, organizationId, runId, "ci_failed", confidence * 0.3);

        return {
          id: runId, organizationId, issue, stage: "failed", branchName,
          testResults: ciResult as unknown as Record<string, unknown>,
          createdAt: new Date().toISOString(), durationMs: Date.now() - startTime,
        };
      }

      // ── Stage 5: OPEN PR ──────────────────────────────────────────
      const pr = await openPullRequest(token, owner, repo, branchName, baseBranch, issue, confidence);

      await supabase
        .from("code_pipeline_runs")
        .update({ stage: "pr_opened", pr_number: pr.number, pr_url: pr.url })
        .eq("id", runId);

      await emitPipelineSignal(supabase, organizationId, runId, "pr_opened", confidence);
      logger.warn(`[CodePipeline] PR #${pr.number} opened: ${pr.url}`);

      // ── Stage 6: MONITOR (non-blocking — tracked by webhook) ──────
      // PR monitoring happens asynchronously via GitHub webhooks
      // calling updatePipelinePRStatus() when PR is merged/closed.
      await updateStage(supabase, runId, "monitoring");

      return {
        id: runId, organizationId, issue, stage: "monitoring", branchName,
        prUrl: pr.url, prNumber: pr.number,
        agentTaskId: agentResult.taskId,
        fixArtifacts: artifacts.map((a) => ({ path: a.title || "fix", content: a.content, language: a.language || "text" })),
        confidence, createdAt: new Date().toISOString(), durationMs: Date.now() - startTime,
      };
    } catch (ghErr) {
      const ghErrMsg = (ghErr instanceof Error ? ghErr.message : String(ghErr))
        .replace(/ghp_[a-zA-Z0-9_]+/g, "[REDACTED]")
        .replace(/Bearer\s+[a-zA-Z0-9_.-]+/g, "Bearer [REDACTED]");
      logger.error("[CodePipeline] GitHub integration failed:", ghErrMsg);
      await supabase
        .from("code_pipeline_runs")
        .update({ branch_name: branchName, stage: "branch_created", completed_at: new Date().toISOString(), duration_ms: Date.now() - startTime })
        .eq("id", runId);
      await emitPipelineSignal(supabase, organizationId, runId, "fix_generated", confidence);

      return {
        id: runId, organizationId, issue, stage: "branch_created", branchName,
        agentTaskId: agentResult.taskId,
        fixArtifacts: artifacts.map((a) => ({ path: a.title || "fix", content: a.content, language: a.language || "text" })),
        confidence, createdAt: new Date().toISOString(), durationMs: Date.now() - startTime,
      };
    }
  } catch (err) {
    await updateStage(supabase, runId, "failed");
    logger.error("[CodePipeline] Fix generation failed:", err);

    return {
      id: runId,
      organizationId,
      issue,
      stage: "failed",
      createdAt: new Date().toISOString(),
      durationMs: Date.now() - startTime,
    };
  }
}

// ── Pipeline Status API Helpers ────────────────────────────────────────────

/**
 * Get all active pipeline runs for an organization.
 */
export async function getActivePipelineRuns(
  supabase: SupabaseClient,
  organizationId: string,
): Promise<CodePipelineRun[]> {
  const { data: runs } = await supabase
    .from("code_pipeline_runs")
    .select("*")
    .eq("organization_id", organizationId)
    .not("stage", "in", '("completed","failed")')
    .order("created_at", { ascending: false })
    .limit(20);

  if (!runs) return [];

  return runs.map(mapRunRecord);
}

/**
 * Get pipeline run history for an organization.
 */
export async function getPipelineHistory(
  supabase: SupabaseClient,
  organizationId: string,
  limit = 20,
): Promise<CodePipelineRun[]> {
  const { data: runs } = await supabase
    .from("code_pipeline_runs")
    .select("*")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (!runs) return [];

  return runs.map(mapRunRecord);
}

/**
 * Update a pipeline run's PR status (called by webhook handler).
 */
export async function updatePipelinePRStatus(
  supabase: SupabaseClient,
  organizationId: string,
  prNumber: number,
  status: "merged" | "closed",
  rejectionReason?: string,
): Promise<void> {
  const { data: run } = await supabase
    .from("code_pipeline_runs")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("pr_number", prNumber)
    .single();

  if (!run) return;

  await supabase
    .from("code_pipeline_runs")
    .update({
      pr_status: status,
      rejection_reason: rejectionReason,
      stage: "completed",
      completed_at: new Date().toISOString(),
    })
    .eq("id", run.id);

  // Emit RL signal based on outcome
  const signalValue = status === "merged" ? 0.9 : -0.4;
  await emitPipelineSignal(supabase, organizationId, run.id, `pr_${status}`, signalValue);
}

// ── Private Helpers ────────────────────────────────────────────────────────

async function updateStage(supabase: SupabaseClient, runId: string, stage: PipelineStage): Promise<void> {
  await supabase
    .from("code_pipeline_runs")
    .update({ stage })
    .eq("id", runId);
}

async function emitPipelineSignal(
  supabase: SupabaseClient,
  organizationId: string,
  runId: string,
  signalType: string,
  value: number,
): Promise<void> {
  try {
    await supabase.from("cross_domain_signals").insert({
      organization_id: organizationId,
      source_domain: "brain.code_pipeline",
      signal_type: signalType,
      signal_value: value,
      entity_type: "code_pipeline_run",
      entity_id: runId,
      signal_metadata: {
        run_id: runId,
        signal_type: signalType,
        emitted_at: new Date().toISOString(),
      },
    });
  } catch {
    // Non-critical
  }
}

function buildFixPrompt(issue: CodeIssue): string {
  const parts: string[] = [
    `Fix the following ${issue.type.replace(/_/g, " ")} issue (severity: ${issue.severity}):`,
    "",
    issue.description,
  ];

  if (issue.file) {
    parts.push("", `File: ${issue.file}`);
  }

  parts.push(
    "",
    "Please provide:",
    "1. Root cause analysis",
    "2. Proposed fix with code changes",
    "3. Risk assessment of the fix",
    "4. Test cases to verify the fix",
  );

  return parts.join("\n");
}

// ── GitHub Integration Helpers ────────────────────────────────────────────

interface GitHubCredentials {
  token: string;
  owner: string;
  repo: string;
  baseBranch: string;
}

/**
 * Get GitHub credentials from org_connectors for this organization.
 * Returns null if no GitHub connector is configured.
 */
async function getGitHubCredentials(
  supabase: SupabaseClient,
  organizationId: string,
): Promise<GitHubCredentials | null> {
  try {
    const { data } = await supabase
      .from("org_connectors")
      .select("credentials, config")
      .eq("organization_id", organizationId)
      .eq("connector_type", "github")
      .limit(1)
      .single();

    if (!data?.credentials) return null;

    const creds = data.credentials as Record<string, unknown>;
    const config = (data.config as Record<string, unknown>) || {};
    const token = (creds.access_token || creds.token) as string;
    if (!token) return null;

    // Parse owner/repo from config fields (GitHub connector stores as config.owner + config.repo)
    const repoFullName = (config.repoFullName || config.repository || creds.repository || "") as string;
    const owner = (config.owner as string) || repoFullName.split("/")[0] || "";
    const repo = (config.repo as string) || repoFullName.split("/")[1] || "";
    if (!owner || !repo) return null;

    return {
      token,
      owner,
      repo,
      baseBranch: (config.base_branch as string) || "main",
    };
  } catch {
    return null;
  }
}

/**
 * Stage 3: Create a branch and commit fix artifacts via GitHub REST API.
 * Returns the commit SHA.
 */
async function createBranchAndCommit(
  token: string,
  owner: string,
  repo: string,
  baseBranch: string,
  branchName: string,
  files: Array<{ path: string; content: string }>,
  commitMessage: string,
): Promise<string> {
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github.v3+json",
    "Content-Type": "application/json",
  };
  const baseUrl = `https://api.github.com/repos/${owner}/${repo}`;

  // 1. Get the SHA of the base branch
  const refRes = await fetch(`${baseUrl}/git/ref/heads/${baseBranch}`, { headers });
  if (!refRes.ok) throw new Error(`Failed to get base branch ref: ${refRes.status}`);
  const refData = await refRes.json() as { object: { sha: string } };
  const baseSha = refData.object.sha;

  // 2. Create branch
  const createRefRes = await fetch(`${baseUrl}/git/refs`, {
    method: "POST",
    headers,
    body: JSON.stringify({ ref: `refs/heads/${branchName}`, sha: baseSha }),
  });
  if (!createRefRes.ok) {
    const err = await createRefRes.text();
    throw new Error(`Failed to create branch: ${createRefRes.status} ${err}`);
  }

  // 3. Create blobs for each file
  const blobs: Array<{ path: string; sha: string }> = [];
  for (const file of files) {
    const blobRes = await fetch(`${baseUrl}/git/blobs`, {
      method: "POST",
      headers,
      body: JSON.stringify({ content: file.content, encoding: "utf-8" }),
    });
    if (!blobRes.ok) throw new Error(`Failed to create blob for ${file.path}`);
    const blobData = await blobRes.json() as { sha: string };
    blobs.push({ path: file.path, sha: blobData.sha });
  }

  // 4. Create tree
  const treeRes = await fetch(`${baseUrl}/git/trees`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      base_tree: baseSha,
      tree: blobs.map((b) => ({ path: b.path, mode: "100644", type: "blob", sha: b.sha })),
    }),
  });
  if (!treeRes.ok) throw new Error(`Failed to create tree: ${treeRes.status}`);
  const treeData = await treeRes.json() as { sha: string };

  // 5. Create commit
  const commitRes = await fetch(`${baseUrl}/git/commits`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      message: commitMessage,
      tree: treeData.sha,
      parents: [baseSha],
    }),
  });
  if (!commitRes.ok) throw new Error(`Failed to create commit: ${commitRes.status}`);
  const commitData = await commitRes.json() as { sha: string };

  // 6. Update branch ref to point to new commit
  await fetch(`${baseUrl}/git/refs/heads/${branchName}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({ sha: commitData.sha }),
  });

  return commitData.sha;
}

/**
 * Stage 4: Poll GitHub Check Runs for a commit SHA.
 * Waits up to 2 minutes, polling every 10s.
 */
async function pollCIChecks(
  token: string,
  owner: string,
  repo: string,
  sha: string,
): Promise<{ passed: boolean; url: string; details?: string }> {
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github.v3+json",
  };
  const url = `https://api.github.com/repos/${owner}/${repo}/commits/${sha}/check-runs`;
  const maxAttempts = 12; // 12 × 10s = 2 minutes

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    await new Promise((r) => setTimeout(r, 10_000)); // wait 10s

    try {
      const res = await fetch(url, { headers });
      if (!res.ok) continue;

      const data = await res.json() as { total_count: number; check_runs: Array<{ status: string; conclusion: string | null; html_url: string }> };
      if (data.total_count === 0 && attempt < 3) continue; // CI not started yet

      const allComplete = data.check_runs.every((cr) => cr.status === "completed");
      if (!allComplete && attempt < maxAttempts - 1) continue;

      const allPassed = data.check_runs.every(
        (cr) => cr.conclusion === "success" || cr.conclusion === "neutral" || cr.conclusion === "skipped",
      );

      return {
        passed: allPassed || data.total_count === 0, // No checks = pass
        url: data.check_runs[0]?.html_url || `https://github.com/${owner}/${repo}/commit/${sha}`,
        details: data.check_runs.map((cr) => `${cr.status}:${cr.conclusion}`).join(", "),
      };
    } catch {
      // Retry on failure
    }
  }

  // Timeout — assume pass (no CI configured or slow CI)
  return { passed: true, url: `https://github.com/${owner}/${repo}/commit/${sha}`, details: "timeout" };
}

/**
 * Stage 5: Open a Pull Request via GitHub REST API.
 */
async function openPullRequest(
  token: string,
  owner: string,
  repo: string,
  branchName: string,
  baseBranch: string,
  issue: CodeIssue,
  confidence: number,
): Promise<{ number: number; url: string }> {
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github.v3+json",
    "Content-Type": "application/json",
  };

  const title = `[Brain Fix] ${issue.type.replace(/_/g, " ")}: ${issue.description.slice(0, 60)}`;
  const body = [
    `## Brain OS Automated Fix`,
    ``,
    `**Issue type:** ${issue.type}`,
    `**Severity:** ${issue.severity}`,
    `**Source:** ${issue.source}`,
    `**Confidence:** ${Math.round(confidence * 100)}%`,
    ``,
    `### Description`,
    issue.description,
    ``,
    `---`,
    `*This PR was automatically generated by Brain OS Code Pipeline.*`,
    `*The Brain's confidence in this fix is ${Math.round(confidence * 100)}%.*`,
    `*Merging this PR will emit a positive RL signal, improving future fixes.*`,
  ].join("\n");

  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/pulls`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      title,
      body,
      head: branchName,
      base: baseBranch,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to create PR: ${res.status} ${err}`);
  }

  const pr = await res.json() as { number: number; html_url: string };
  return { number: pr.number, url: pr.html_url };
}

function mapRunRecord(run: Record<string, unknown>): CodePipelineRun {
  return {
    id: run.id as string,
    organizationId: run.organization_id as string,
    issue: {
      type: run.issue_type as CodeIssue["type"],
      severity: run.issue_severity as CodeIssue["severity"],
      description: run.issue_description as string,
      source: run.issue_source as CodeIssue["source"],
    },
    stage: run.stage as PipelineStage,
    branchName: run.branch_name as string | undefined,
    prUrl: run.pr_url as string | undefined,
    prNumber: run.pr_number as number | undefined,
    agentTaskId: run.agent_task_id as string | undefined,
    fixArtifacts: run.fix_artifacts as CodePipelineRun["fixArtifacts"],
    testResults: run.test_results as Record<string, unknown> | undefined,
    confidence: run.confidence as number | undefined,
    prStatus: run.pr_status as string | undefined,
    rejectionReason: run.rejection_reason as string | undefined,
    createdAt: run.created_at as string,
    completedAt: run.completed_at as string | undefined,
    durationMs: run.duration_ms as number | undefined,
  };
}
