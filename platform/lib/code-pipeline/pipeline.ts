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
    // These require GitHub connector integration.
    // For now, create the branch name and mark as ready for manual PR.

    const branchName = `brain-fix/${issue.type}-${Date.now()}`;

    await supabase
      .from("code_pipeline_runs")
      .update({
        branch_name: branchName,
        stage: "branch_created",
      })
      .eq("id", runId);

    // TODO (Phase 4.3): Wire GitHub integration layer for:
    // - createBranch()
    // - commitFiles()
    // - triggerWorkflow()
    // - createPR()
    // These require the GitHub connector's token from org_connectors.
    // For now, the pipeline generates the fix and stores artifacts.

    logger.warn(`[CodePipeline] Fix generated for branch ${branchName}: ${artifacts.length} artifacts, confidence=${confidence}`);

    await emitPipelineSignal(supabase, organizationId, runId, "fix_generated", confidence);

    return {
      id: runId,
      organizationId,
      issue,
      stage: "branch_created",
      branchName,
      agentTaskId: agentResult.taskId,
      fixArtifacts: artifacts.map((a) => ({
        path: a.title || "fix",
        content: a.content,
        language: a.language || "text",
      })),
      confidence,
      createdAt: new Date().toISOString(),
      durationMs: Date.now() - startTime,
    };
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
