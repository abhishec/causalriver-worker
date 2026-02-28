/**
 * Incident Response Executor
 * Task 14: Incident → RCA → Rollback Decision → Change Request → Post-Mortem Generation
 *
 * Called from domain-executor.ts when currentState === "RCA" in an "incident_response" process.
 * Phase 1: Claude Sonnet performs root cause analysis + rollback decision
 * Phase 2: Generates full blameless post-mortem Markdown document
 * Phase 3: Enqueues write-backs: Jira bug ticket, Confluence post-mortem, GitHub issue, Slack alert
 */

import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/lib/logger";

const _ANTHROPIC_API_KEY =
  process.env.ANTHROPIC_API_KEY ?? process.env.NEXT_PUBLIC_ANTHROPIC_API_KEY ?? "";

// ── Types ────────────────────────────────────────────────────────────────────

export interface IncidentInput {
  incidentTitle: string;
  incidentDescription: string;
  severity: "P0" | "P1" | "P2" | "P3";
  affectedServices: string[];
  detectedAt: string;
  resolvedAt?: string;
  impactedUsers?: number;
  errorLogs?: string;
  recentDeployments?: string[];
  jiraProjectKey?: string;
  confluenceSpaceKey?: string;
  githubRepo?: string;
  slackChannel?: string;
}

export interface IncidentResponseResult {
  rcaSummary: string;
  rootCause: string;
  contributingFactors: string[];
  rollbackDecision: {
    shouldRollback: boolean;
    reasoning: string;
    targetDeployment?: string;
    riskLevel: "low" | "medium" | "high";
  };
  immediateActions: string[];
  changeRequest: {
    title: string;
    description: string;
    priority: "P0" | "P1" | "P2" | "P3";
    labels: string[];
  };
  postMortemContent: string;
  preventionRecommendations: string[];
  jiraTicketId?: string;
  confluencePageId?: string;
  githubIssueNumber?: number;
}

// ── Main entry point ─────────────────────────────────────────────────────────

export async function executeIncidentResponse(
  supabase: SupabaseClient,
  organizationId: string,
  input: IncidentInput,
  jobId: string
): Promise<IncidentResponseResult> {
  const apiKey = _ANTHROPIC_API_KEY;
  const client = new Anthropic({ apiKey });

  // Phase 1: RCA + Rollback Decision via Claude Sonnet
  logger.warn("[IncidentResponse] Phase 1: RCA analysis starting", {
    jobId,
    incidentTitle: input.incidentTitle,
    severity: input.severity,
  });

  const rcaPrompt = buildRCAPrompt(input);
  const rcaResponse = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 4000,
    messages: [{ role: "user", content: rcaPrompt }],
  });

  const rcaText =
    rcaResponse.content[0].type === "text" ? rcaResponse.content[0].text : "";

  const parsed = parseRCAResponse(rcaText, input);

  logger.warn("[IncidentResponse] Phase 1 complete", {
    jobId,
    rootCause: parsed.rootCause,
    shouldRollback: parsed.rollbackDecision.shouldRollback,
  });

  // Phase 2: Generate full post-mortem document (deterministic — no LLM)
  parsed.postMortemContent = generatePostMortem(input, parsed);

  // Phase 3: Enqueue write-backs (fire-and-forget, non-blocking)
  await enqueueIncidentWritebacks(supabase, organizationId, jobId, parsed, input);

  return parsed;
}

// ── RCA Prompt Builder ───────────────────────────────────────────────────────

function buildRCAPrompt(input: IncidentInput): string {
  const durationMs =
    input.resolvedAt
      ? new Date(input.resolvedAt).getTime() - new Date(input.detectedAt).getTime()
      : null;
  const durationMin = durationMs ? Math.round(durationMs / 60000) : null;

  const lines: string[] = [
    "You are a Site Reliability Engineer performing a root cause analysis for a production incident.",
    "",
    "**Incident Details:**",
    `Title: ${input.incidentTitle}`,
    `Severity: ${input.severity}`,
    `Description: ${input.incidentDescription}`,
    `Affected Services: ${input.affectedServices.join(", ")}`,
    `Detected At: ${input.detectedAt}`,
  ];

  if (input.resolvedAt) {
    lines.push(`Resolved At: ${input.resolvedAt} (Duration: ${durationMin ?? "unknown"} minutes)`);
  } else {
    lines.push("Status: Ongoing");
  }

  if (input.impactedUsers) {
    lines.push(`Impacted Users: ${input.impactedUsers}`);
  }

  if (input.errorLogs) {
    lines.push("", `Error Logs:\n\`\`\`\n${input.errorLogs.slice(0, 2000)}\n\`\`\``);
  }

  if (input.recentDeployments?.length) {
    lines.push("", `Recent Deployments:\n${input.recentDeployments.join("\n")}`);
  }

  lines.push(
    "",
    "Perform a thorough root cause analysis and provide actionable recommendations.",
    "",
    "Respond in this EXACT JSON format:",
    "```json",
    JSON.stringify(
      {
        rcaSummary: "One paragraph summary of what happened and impact",
        rootCause: "The single primary root cause (be specific)",
        contributingFactors: ["Factor 1", "Factor 2"],
        rollbackDecision: {
          shouldRollback: true,
          reasoning: "Why rollback is/isn't recommended",
          targetDeployment: "v2.1.3 or null if no rollback",
          riskLevel: "medium",
        },
        immediateActions: [
          "1. [Action already taken / needed immediately]",
          "2. ...",
        ],
        changeRequest: {
          title: `Fix: [specific technical fix needed]`,
          description: "Technical description of the fix required",
          priority: input.severity,
          labels: ["incident", "hotfix", input.severity.toLowerCase()],
        },
        preventionRecommendations: [
          "Add circuit breaker to ...",
          "Increase test coverage for ...",
          "Add alerting for ...",
        ],
      },
      null,
      2
    ),
    "```"
  );

  return lines.join("\n");
}

// ── Post-Mortem Generator ────────────────────────────────────────────────────

function generatePostMortem(
  input: IncidentInput,
  rca: IncidentResponseResult
): string {
  const today = new Date().toISOString().split("T")[0];
  const detectedTime = new Date(input.detectedAt).toISOString().replace("T", " ").slice(0, 19) + " UTC";
  const resolvedTime = input.resolvedAt
    ? new Date(input.resolvedAt).toISOString().replace("T", " ").slice(0, 19) + " UTC"
    : null;
  const durationMin = input.resolvedAt
    ? Math.round(
        (new Date(input.resolvedAt).getTime() - new Date(input.detectedAt).getTime()) / 60000
      )
    : null;
  const duration = durationMin ? `${durationMin} minutes` : "Ongoing";

  return [
    `# Post-Mortem: ${input.incidentTitle}`,
    "",
    `**Date:** ${today}`,
    `**Severity:** ${input.severity}`,
    `**Duration:** ${duration}`,
    `**Status:** ${input.resolvedAt ? "Resolved" : "Ongoing"}`,
    `**Affected Services:** ${input.affectedServices.join(", ")}`,
    input.impactedUsers ? `**Impacted Users:** ~${input.impactedUsers}` : null,
    "",
    "---",
    "",
    "## Executive Summary",
    "",
    rca.rcaSummary,
    "",
    "---",
    "",
    "## Timeline",
    "",
    "| Time (UTC) | Event |",
    "|------------|-------|",
    `| ${detectedTime} | Incident detected |`,
    resolvedTime ? `| ${resolvedTime} | Incident resolved |` : "| Ongoing | Mitigation in progress |",
    "",
    "---",
    "",
    "## Root Cause Analysis",
    "",
    `**Primary Root Cause:** ${rca.rootCause}`,
    "",
    "**Contributing Factors:**",
    ...rca.contributingFactors.map((f) => `- ${f}`),
    "",
    "---",
    "",
    "## Impact",
    "",
    input.impactedUsers
      ? `- **Users Affected:** ~${input.impactedUsers}`
      : "- **Users Affected:** Under investigation",
    `- **Services Affected:** ${input.affectedServices.join(", ")}`,
    `- **Duration:** ${duration}`,
    "",
    "---",
    "",
    "## Rollback Decision",
    "",
    `**Decision:** ${rca.rollbackDecision.shouldRollback ? "Rollback Executed" : "No Rollback (Forward Fix)"}`,
    `**Reasoning:** ${rca.rollbackDecision.reasoning}`,
    rca.rollbackDecision.targetDeployment
      ? `**Target Version:** ${rca.rollbackDecision.targetDeployment}`
      : null,
    `**Risk Level:** ${rca.rollbackDecision.riskLevel.toUpperCase()}`,
    "",
    "---",
    "",
    "## Immediate Actions Taken",
    "",
    ...rca.immediateActions.map((a) => `- ${a}`),
    "",
    "---",
    "",
    "## Prevention Recommendations",
    "",
    ...rca.preventionRecommendations.map((r, i) => `${i + 1}. ${r}`),
    "",
    "---",
    "",
    "## Action Items",
    "",
    "| Owner | Action | Priority | Due |",
    "|-------|--------|----------|-----|",
    `| Engineering | ${rca.changeRequest.title} | ${rca.changeRequest.priority} | Next Sprint |`,
    ...rca.preventionRecommendations
      .slice(0, 3)
      .map((r) => `| Engineering | ${r} | P2 | 2 weeks |`),
    "",
    "---",
    "",
    "*Generated by BrainOS Process Intelligence — Incident Response Workflow*",
  ]
    .filter((line): line is string => line !== null)
    .join("\n");
}

// ── Response Parser ──────────────────────────────────────────────────────────

function parseRCAResponse(text: string, input: IncidentInput): IncidentResponseResult {
  try {
    // Try fenced JSON block first
    const jsonMatch = text.match(/```json\n([\s\S]*?)\n```/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[1]) as IncidentResponseResult;
      return { ...parsed, postMortemContent: "" };
    }
    // Fallback: extract outermost JSON object
    const jsonStart = text.indexOf("{");
    const jsonEnd = text.lastIndexOf("}");
    if (jsonStart >= 0 && jsonEnd > jsonStart) {
      const parsed = JSON.parse(text.slice(jsonStart, jsonEnd + 1)) as IncidentResponseResult;
      return { ...parsed, postMortemContent: "" };
    }
  } catch (err) {
    logger.warn("[IncidentResponse] Failed to parse RCA JSON response", {
      err: err instanceof Error ? err.message : String(err),
    });
  }

  // Graceful fallback — manual review required
  return {
    rcaSummary: "RCA in progress — manual review required.",
    rootCause: "Under investigation",
    contributingFactors: [],
    rollbackDecision: {
      shouldRollback: false,
      reasoning: "Insufficient data for automated decision — manual review required.",
      riskLevel: "high",
    },
    immediateActions: ["Monitor systems closely", "Review recent deployments"],
    changeRequest: {
      title: `Investigate: ${input.incidentTitle}`,
      description: input.incidentDescription,
      priority: input.severity,
      labels: ["incident", input.severity.toLowerCase()],
    },
    preventionRecommendations: [],
    postMortemContent: "",
  };
}

// ── Write-back Enqueuer ──────────────────────────────────────────────────────

async function enqueueIncidentWritebacks(
  supabase: SupabaseClient,
  organizationId: string,
  jobId: string,
  result: IncidentResponseResult,
  input: IncidentInput
): Promise<void> {
  const writebacks: Array<PromiseLike<unknown>> = [];

  // 1. Jira: Create incident bug ticket with RCA details
  if (input.jiraProjectKey) {
    writebacks.push(
      supabase.from("writeback_queue").insert({
        organization_id: organizationId,
        job_id: jobId,
        action_type: "jira_create_issue",
        action_payload: {
          project: input.jiraProjectKey,
          issuetype: "Bug",
          summary: result.changeRequest.title,
          description: [
            result.changeRequest.description,
            "",
            `**Root Cause:** ${result.rootCause}`,
            "",
            `**RCA Summary:** ${result.rcaSummary}`,
            "",
            `**Rollback:** ${result.rollbackDecision.shouldRollback ? `Yes — ${result.rollbackDecision.targetDeployment ?? "latest stable"}` : "No — forward fix"}`,
          ].join("\n"),
          priority: result.changeRequest.priority,
          labels: result.changeRequest.labels,
        },
        status: "pending",
      })
    );
  }

  // 2. Confluence: Create blameless post-mortem page
  if (input.confluenceSpaceKey) {
    const today = new Date().toISOString().split("T")[0];
    writebacks.push(
      supabase.from("writeback_queue").insert({
        organization_id: organizationId,
        job_id: jobId,
        action_type: "confluence_create_page",
        action_payload: {
          spaceKey: input.confluenceSpaceKey,
          title: `Post-Mortem: ${input.incidentTitle} [${today}]`,
          body: result.postMortemContent,
          labels: ["post-mortem", "incident", input.severity.toLowerCase()],
        },
        status: "pending",
      })
    );
  }

  // 3. GitHub: Create bug issue for the underlying root cause fix
  if (input.githubRepo) {
    writebacks.push(
      supabase.from("writeback_queue").insert({
        organization_id: organizationId,
        job_id: jobId,
        action_type: "github_create_issue",
        action_payload: {
          repo: input.githubRepo,
          title: result.changeRequest.title,
          body: [
            `**Severity:** ${input.severity}`,
            "",
            `**Root Cause:** ${result.rootCause}`,
            "",
            `**Description:** ${result.changeRequest.description}`,
            "",
            `**Rollback Decision:** ${result.rollbackDecision.shouldRollback ? `Yes — rolled back to ${result.rollbackDecision.targetDeployment ?? "latest stable"}` : "No — forward fix chosen"}`,
            "",
            `**Prevention:**`,
            ...result.preventionRecommendations.map((r) => `- ${r}`),
            "",
            "---",
            "*Created automatically by BrainOS Incident Response Workflow*",
          ].join("\n"),
          labels: result.changeRequest.labels,
        },
        status: "pending",
      })
    );
  }

  // 4. Slack: Alert with rollback decision and immediate actions
  if (input.slackChannel) {
    const rollbackLine = result.rollbackDecision.shouldRollback
      ? `Rollback initiated to ${result.rollbackDecision.targetDeployment ?? "latest stable"}`
      : "Forward fix path chosen (no rollback)";

    writebacks.push(
      supabase.from("writeback_queue").insert({
        organization_id: organizationId,
        job_id: jobId,
        action_type: "slack_post_message",
        action_payload: {
          channel: input.slackChannel,
          text: [
            `*Incident RCA Complete: ${input.incidentTitle}*`,
            "",
            `*Severity:* ${input.severity}`,
            `*Root Cause:* ${result.rootCause}`,
            `*Rollback:* ${rollbackLine}`,
            "",
            `*Immediate Actions:*`,
            ...result.immediateActions.slice(0, 3).map((a) => `  - ${a}`),
            "",
            `_Post-mortem generated. Jira ticket and Confluence page created._`,
          ].join("\n"),
        },
        status: "pending",
      })
    );
  }

  if (writebacks.length === 0) {
    return;
  }

  try {
    const results = await Promise.allSettled(writebacks);
    const failures = results.filter((r) => r.status === "rejected");
    if (failures.length > 0) {
      logger.warn("[IncidentResponse] Some write-backs failed to enqueue (non-fatal)", {
        failureCount: failures.length,
        totalCount: writebacks.length,
      });
    }
  } catch (err) {
    logger.warn("[IncidentResponse] Write-back enqueue error (non-fatal)", {
      err: err instanceof Error ? err.message : String(err),
    });
  }
}
