/**
 * Product Workflow Executor — Task 12
 * ====================================
 * Specialized executor for the `product_workflow` FSM process type.
 *
 * Handles: Feature Request Triage → Confluence PRD Generation →
 *          Jira Epic + Stories → Sprint Allocation →
 *          Dependency Risk Flagging → Slack Notification
 *
 * Called from domain-executor.ts at:
 * - DECOMPOSE: generate triage decision + PRD + stories (replaces generic Haiku decompose)
 * - MUTATE:    enqueue Confluence / Jira / Slack write-backs into writeback_queue
 *
 * Design:
 * - Uses claude-sonnet-4-6 for PRD generation (quality > cost here — this is a
 *   high-value artifact that will be shared with stakeholders).
 * - Write-backs are fire-and-forget via writeback_queue (same pattern as other MUTATE states).
 * - Graceful fallback at every parse boundary — never throws, always returns usable result.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/lib/logger";

// ── Public Types ──────────────────────────────────────────────────────────────

export interface ProductWorkflowInput {
  featureTitle: string;
  featureDescription: string;
  requestedBy?: string;
  targetRelease?: string;
  priority?: "low" | "medium" | "high" | "critical";
  affectedAreas?: string[];
  /** Jira project key, e.g. "PROD" */
  jiraProjectKey?: string;
  /** Confluence space key, e.g. "ENG" */
  confluenceSpaceKey?: string;
  /** Slack channel, e.g. "#product" */
  slackChannel?: string;
}

export interface ProductWorkflowStory {
  title: string;
  description: string;
  storyPoints: number;
  labels: string[];
}

export interface ProductWorkflowRisk {
  dependency: string;
  riskLevel: "low" | "medium" | "high";
  mitigation: string;
}

export interface ProductWorkflowPlan {
  /** triage outcome */
  triageDecision: "approved" | "needs_clarification" | "rejected";
  triageReason: string;
  /** Full markdown PRD document */
  prdContent: string;
  epicTitle: string;
  epicDescription: string;
  stories: ProductWorkflowStory[];
  dependencyRisks: ProductWorkflowRisk[];
  sprintRecommendation: string;
  /** Human-readable summary for FSM context mesh */
  summary: string;
  /** Original input — carried forward so MUTATE can read connector targets */
  _input: ProductWorkflowInput;
}

// ── LLM Call (Sonnet — quality output for stakeholder-facing artifact) ────────

const LLM_TIMEOUT_MS = 45_000; // PRD generation needs more time than Haiku calls

async function callSonnetWithTimeout(
  apiKey: string,
  systemPrompt: string,
  userContent: string,
  maxTokens = 3500
): Promise<string> {
  const Anthropic = (await import("@anthropic-ai/sdk")).default;
  const anthropic = new Anthropic({ apiKey });

  let timeoutHandle: ReturnType<typeof setTimeout>;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(
      () => reject(new Error(`ProductWorkflow LLM timed out after ${LLM_TIMEOUT_MS}ms`)),
      LLM_TIMEOUT_MS
    );
  });

  try {
    const response = await Promise.race([
      anthropic.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: maxTokens,
        system: systemPrompt,
        messages: [{ role: "user", content: userContent }],
      }),
      timeoutPromise,
    ]);
    const content = response.content[0];
    return content.type === "text" ? content.text : "";
  } finally {
    clearTimeout(timeoutHandle!);
  }
}

// ── Prompt Building ───────────────────────────────────────────────────────────

function buildTriagePrompt(input: ProductWorkflowInput): string {
  return `You are a senior product manager. A new feature request has been submitted. Your job is to triage it and — if approved — produce all necessary planning artifacts.

**Feature Request:**
Title: ${input.featureTitle}
Description: ${input.featureDescription}
Requested By: ${input.requestedBy ?? "Unknown"}
Target Release: ${input.targetRelease ?? "Not specified"}
Priority: ${input.priority ?? "medium"}
Affected Areas: ${(input.affectedAreas ?? []).join(", ") || "Not specified"}

Produce:
1. Triage decision (approved / needs_clarification / rejected) with a concrete reason
2. A comprehensive PRD in markdown (Overview, Goals, User Stories, Acceptance Criteria, Technical Requirements, Out of Scope)
3. A Jira Epic title + one-paragraph description
4. 3–6 Jira Stories with story points (1, 2, 3, 5, 8) and labels
5. Dependency risks with risk level (low / medium / high) and mitigation actions
6. Sprint recommendation (name, timing, total story points)
7. A one-sentence summary

Return ONLY valid JSON in this exact structure (no markdown fences, no explanation before or after):
{
  "triageDecision": "approved",
  "triageReason": "...",
  "prdContent": "# PRD: <title>\\n\\n## Overview\\n...",
  "epicTitle": "...",
  "epicDescription": "...",
  "stories": [
    {
      "title": "...",
      "description": "As a [user], I want [goal] so that [benefit]. Acceptance criteria: ...",
      "storyPoints": 3,
      "labels": ["frontend", "api"]
    }
  ],
  "dependencyRisks": [
    {
      "dependency": "Auth service upgrade",
      "riskLevel": "medium",
      "mitigation": "Coordinate with platform team before sprint start"
    }
  ],
  "sprintRecommendation": "Sprint 23 (starts 2025-04-14) — 3 stories, 8 story points total",
  "summary": "Feature approved. PRD created. 4 stories ready for Epic. Sprint 23 allocated. 1 medium dependency risk identified."
}`;
}

// ── Response Parsing ──────────────────────────────────────────────────────────

function parsePlanResponse(text: string, input: ProductWorkflowInput): ProductWorkflowPlan {
  // Try clean JSON parse first
  try {
    const parsed = JSON.parse(text.trim()) as ProductWorkflowPlan;
    parsed._input = input;
    return parsed;
  } catch {
    // intentional — fall through to fence extraction
  }

  // Try extracting from ```json ... ``` fence
  try {
    const fenceMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    if (fenceMatch) {
      const parsed = JSON.parse(fenceMatch[1]) as ProductWorkflowPlan;
      parsed._input = input;
      return parsed;
    }
  } catch {
    // intentional — fall through to brace extraction
  }

  // Try extracting outermost { ... }
  try {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) {
      const parsed = JSON.parse(text.slice(start, end + 1)) as ProductWorkflowPlan;
      parsed._input = input;
      return parsed;
    }
  } catch {
    // intentional — fall through to graceful fallback
  }

  logger.warn("[ProductWorkflow] Failed to parse LLM response — using fallback plan", {
    preview: text.slice(0, 300),
  });

  return {
    triageDecision: "needs_clarification",
    triageReason: "Could not parse AI response — manual review required",
    prdContent: `# PRD: ${input.featureTitle}\n\n## Description\n${input.featureDescription}`,
    epicTitle: input.featureTitle,
    epicDescription: input.featureDescription,
    stories: [],
    dependencyRisks: [],
    sprintRecommendation: "To be determined after manual review",
    summary: text.slice(0, 500),
    _input: input,
  };
}

// ── Public: DECOMPOSE Phase ───────────────────────────────────────────────────

/**
 * Called from domain-executor.ts DECOMPOSE state when processType === "product_workflow".
 *
 * Returns a structured plan that replaces the generic Haiku decomposition.
 * The plan is stored in context.decomposedPlan and flows through the FSM
 * into ASSESS → COMPUTE → POLICY_CHECK → MUTATE.
 */
export async function decomposeProductWorkflow(
  apiKey: string,
  inputPayload: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const input: ProductWorkflowInput = {
    featureTitle: (inputPayload.featureTitle as string) || (inputPayload.title as string) || "Untitled Feature",
    featureDescription: (inputPayload.featureDescription as string) || (inputPayload.description as string) || "",
    requestedBy: inputPayload.requestedBy as string | undefined,
    targetRelease: inputPayload.targetRelease as string | undefined,
    priority: (inputPayload.priority as ProductWorkflowInput["priority"]) ?? "medium",
    affectedAreas: inputPayload.affectedAreas as string[] | undefined,
    jiraProjectKey: inputPayload.jiraProjectKey as string | undefined,
    confluenceSpaceKey: inputPayload.confluenceSpaceKey as string | undefined,
    slackChannel: inputPayload.slackChannel as string | undefined,
  };

  const systemPrompt =
    "You are a senior product manager. Produce structured planning artifacts for the given feature request.";
  const userContent = buildTriagePrompt(input);

  let planText: string;
  try {
    planText = await callSonnetWithTimeout(apiKey, systemPrompt, userContent, 3500);
  } catch (err) {
    logger.warn("[ProductWorkflow/DECOMPOSE] LLM call failed — using fallback", {
      error: err instanceof Error ? err.message : String(err),
    });
    planText = "";
  }

  const plan = parsePlanResponse(planText, input);

  logger.warn("[ProductWorkflow/DECOMPOSE] Plan generated", {
    triageDecision: plan.triageDecision,
    storiesCount: plan.stories.length,
    risksCount: plan.dependencyRisks.length,
  });

  // Return as a decomposedPlan-compatible shape so the FSM ASSESS/COMPUTE states
  // can extract scalars from it (e.g. story_points_total, risk_count for policy checks).
  return {
    // Standard BPaaS decomposedPlan fields
    steps: ["assess", "compute", "policy_check", "mutate", "schedule_notify"],
    entities: {
      featureTitle: plan.epicTitle,
      storiesCount: plan.stories.length,
      totalStoryPoints: plan.stories.reduce((s, st) => s + (st.storyPoints ?? 0), 0),
      risksCount: plan.dependencyRisks.length,
      highRisksCount: plan.dependencyRisks.filter((r) => r.riskLevel === "high").length,
      triageDecision: plan.triageDecision,
    },
    constraints: [
      "confluence_before_jira",
      "notifications_after_artifacts",
      ...(plan.dependencyRisks.some((r) => r.riskLevel === "high") ? ["sprint_dependency_risk"] : []),
    ],
    metadata: {
      processType: "product_workflow",
      triageDecision: plan.triageDecision,
    },
    // Full product workflow plan — carried through FSM context
    productWorkflowPlan: plan,
  };
}

// ── Public: MUTATE Phase ──────────────────────────────────────────────────────

/**
 * Called from domain-executor.ts MUTATE state when processType === "product_workflow".
 *
 * Reads the ProductWorkflowPlan from context.decomposedPlan.productWorkflowPlan
 * and enqueues Confluence / Jira / Slack write-backs into writeback_queue.
 *
 * Returns a mutationResult-compatible object.
 */
export async function mutateProductWorkflow(
  supabase: SupabaseClient,
  organizationId: string,
  jobId: string,
  processInstanceId: string,
  decomposedPlan: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const plan = decomposedPlan?.productWorkflowPlan as ProductWorkflowPlan | undefined;

  if (!plan) {
    logger.warn("[ProductWorkflow/MUTATE] No productWorkflowPlan in decomposedPlan — skipping write-backs", {
      jobId,
      processInstanceId,
    });
    return {
      mutated: true,
      mutatedAt: new Date().toISOString(),
      writebacksEnqueued: 0,
      note: "No plan found in decomposedPlan — write-backs skipped",
    };
  }

  const input = plan._input;
  // Each entry is an async thunk — wrapping the Supabase insert (PostgrestFilterBuilder)
  // in an async function so Promise.allSettled can handle them correctly.
  const writebacks: Array<() => Promise<{ error: { message: string } | null } | unknown>> = [];

  // 1. Confluence: Create PRD page
  if (input?.confluenceSpaceKey && plan.triageDecision === "approved") {
    writebacks.push(
      async () => supabase.from("writeback_queue").insert({
        organization_id: organizationId,
        job_id: jobId,
        action_type: "create_page",
        connector_type: "confluence",
        action_payload: {
          spaceKey: input.confluenceSpaceKey,
          title: `PRD: ${plan.epicTitle}`,
          body: plan.prdContent,
          labels: ["prd", "feature-request", "brain-os-generated"],
        },
        status: "pending",
        attempts: 0,
        created_at: new Date().toISOString(),
      })
    );
  }

  // 2. Jira: Create Epic
  if (input?.jiraProjectKey && plan.triageDecision === "approved") {
    writebacks.push(
      async () => supabase.from("writeback_queue").insert({
        organization_id: organizationId,
        job_id: jobId,
        action_type: "create_issue",
        connector_type: "jira",
        action_payload: {
          projectKey: input.jiraProjectKey,
          issuetype: "Epic",
          summary: plan.epicTitle,
          description: plan.epicDescription,
          labels: ["brain-os-generated"],
        },
        status: "pending",
        attempts: 0,
        created_at: new Date().toISOString(),
      })
    );

    // 3. Jira: Create Stories under Epic (up to 6)
    for (const story of plan.stories.slice(0, 6)) {
      writebacks.push(
        async () => supabase.from("writeback_queue").insert({
          organization_id: organizationId,
          job_id: jobId,
          action_type: "create_issue",
          connector_type: "jira",
          action_payload: {
            projectKey: input.jiraProjectKey,
            issuetype: "Story",
            summary: story.title,
            description: story.description,
            storyPoints: story.storyPoints,
            labels: [...(story.labels ?? []), "brain-os-generated"],
          },
          status: "pending",
          attempts: 0,
          created_at: new Date().toISOString(),
        })
      );
    }
  }

  // 4. Slack: Summary notification (send regardless of triage — teams need to know)
  if (input?.slackChannel) {
    const storySummary =
      plan.stories.length > 0
        ? plan.stories.map((s) => `\u2022 ${s.title} (${s.storyPoints}pt)`).join("\n")
        : "_No stories generated_";

    const riskSummary = plan.dependencyRisks
      .filter((r) => r.riskLevel !== "low")
      .map((r) => `\u26A0\uFE0F ${r.dependency}: ${r.mitigation}`)
      .join("\n");

    const triageEmoji =
      plan.triageDecision === "approved"
        ? "\u2705"
        : plan.triageDecision === "rejected"
          ? "\u274C"
          : "\u26A0\uFE0F";

    writebacks.push(
      async () => supabase.from("writeback_queue").insert({
        organization_id: organizationId,
        job_id: jobId,
        action_type: "post_message",
        connector_type: "slack",
        action_payload: {
          channel: input.slackChannel,
          text: [
            `${triageEmoji} *Feature Request Processed: ${plan.epicTitle}*`,
            ``,
            `Triage: *${plan.triageDecision.toUpperCase()}* \u2014 ${plan.triageReason}`,
            ``,
            `*Stories:*`,
            storySummary,
            ``,
            `*Sprint:* ${plan.sprintRecommendation}`,
            riskSummary ? `\n*Dependency Risks:*\n${riskSummary}` : "",
            ``,
            `_Generated by BrainOS Process Intelligence_`,
          ]
            .filter((l) => l !== "")
            .join("\n"),
        },
        status: "pending",
        attempts: 0,
        created_at: new Date().toISOString(),
      })
    );
  }

  // Fire all write-back inserts in parallel (non-blocking settle)
  let enqueuedCount = 0;
  if (writebacks.length > 0) {
    try {
      const results = await Promise.allSettled(writebacks.map((fn) => fn()));
      enqueuedCount = results.filter((r) => r.status === "fulfilled").length;
      const failures = results.filter((r) => r.status === "rejected");
      if (failures.length > 0) {
        logger.warn("[ProductWorkflow/MUTATE] Some write-back inserts failed (non-fatal)", {
          failures: failures.length,
          jobId,
          processInstanceId,
        });
      }
    } catch (err) {
      logger.warn("[ProductWorkflow/MUTATE] Write-back enqueue error (non-fatal)", {
        error: err instanceof Error ? err.message : String(err),
        jobId,
      });
    }
  }

  logger.warn("[ProductWorkflow/MUTATE] Write-backs enqueued", {
    enqueuedCount,
    total: writebacks.length,
    triageDecision: plan.triageDecision,
    jobId,
    processInstanceId,
  });

  return {
    mutated: true,
    mutatedAt: new Date().toISOString(),
    writebacksEnqueued: enqueuedCount,
    triageDecision: plan.triageDecision,
    epicTitle: plan.epicTitle,
    storiesCount: plan.stories.length,
    risksCount: plan.dependencyRisks.length,
    sprintRecommendation: plan.sprintRecommendation,
    fields: [
      "triageDecision",
      "epicTitle",
      "prdContent",
      "stories",
      "dependencyRisks",
      "sprintRecommendation",
    ],
  };
}
