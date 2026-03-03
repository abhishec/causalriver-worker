/**
 * PM-aaS Domain Executor (Brain-Integrated)
 * ==========================================
 *
 * ARCHITECTURE:
 * PM-aaS (Product Management as a Service) mirrors SE-aaS architecture exactly:
 * - Step -1: RL Context Priming (case-log patterns)
 * - Step -1b: Brain Context Priming (live brain state)
 * - Step 1: LLM execution via Anthropic Claude
 * - Step 2: Save artifact to se_aas_artifacts
 * - Step 3 (Step 8): RL outcome recording
 *
 * 7 Domains (from service_templates seed):
 *   roadmap-planner       — roadmap planning and prioritization
 *   sprint-health         — sprint status, velocity, blockers
 *   backlog-prioritizer   — score and rank backlog items
 *   stakeholder-alignment — stakeholder update generation
 *   release-risk          — release readiness assessment
 *   feature-impact        — feature effort/risk/dependency analysis
 *   capacity-planner      — team capacity vs planned work
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";
import { logger } from "@/lib/logger";
import { saveArtifact } from "@/lib/se-aas/job-queue";
import { recordAgentOutcome, computeAgentQuality } from "@/lib/brain/agent-rl";
import { recordBrainLearning } from "@/lib/brain/engagement-flywheel";
import { getCaseLogContext, logAgentRetro } from "@/lib/brain/rl-agent-loop";
import { routeCallType } from "@/lib/se-aas/model-router";
import { captureStreamedResponse } from "@/lib/brain/claude-learning-capture";

// ============================================================================
// TYPES
// ============================================================================

export interface ExecutePmDomainParams {
  domainType: string;
  request: Record<string, unknown>;
  organizationId: string;
  userId: string;
  anthropicApiKey?: string;
  /**
   * Optional: AI worker UUID from ai_workers table (ADR-020).
   * When provided, written to RL tables to enable per-worker threshold adaptation.
   */
  aiWorkerId?: string;
}

export interface ExecutePmDomainResult {
  result: Record<string, unknown>;
  artifactId: string | null;
}

// ============================================================================
// MODEL SELECTION — routed through the BrainOS smart router
// ============================================================================

// Light PM domains: structured data + lookup → pm-aas-structured (Haiku)
const PM_HAIKU_DOMAINS = new Set([
  "sprint-health",
  "capacity-planner",
]);

function selectPmModel(domainType: string): string {
  const callType = PM_HAIKU_DOMAINS.has(domainType)
    ? "pm-aas-structured"
    : "pm-aas-analysis";
  return routeCallType(callType).model;
}

// ============================================================================
// DOMAIN PROMPTS — each produces structured JSON
// ============================================================================

function buildDomainPrompt(domainType: string, request: Record<string, unknown>): string {
  const brainCtx = request["_brainContextStr"]
    ? `\n\nBRAIN CONTEXT (learned organizational patterns):\n${request["_brainContextStr"]}`
    : "";
  const caseLog = request["_caseLogContext"]
    ? `\n\nPAST PATTERNS (case-log priming):\n${request["_caseLogContext"]}`
    : "";

  switch (domainType) {
    case "roadmap-planner": {
      const goals = request.goals ?? request.description ?? request.query ?? "Product goals not specified";
      const timeframe = request.timeframe ?? "Q1-Q4";
      const context = request.context ?? "";
      return `You are a senior Product Manager AI. Create a structured product roadmap.

INPUT:
Goals/Objectives: ${goals}
Timeframe: ${timeframe}
Additional Context: ${context}
${brainCtx}${caseLog}

OUTPUT: Return ONLY valid JSON (no markdown, no explanation):
{
  "roadmap": {
    "vision": "1-2 sentence product vision",
    "timeframe": "${timeframe}",
    "themes": [
      {
        "name": "theme name",
        "quarter": "Q1/Q2/Q3/Q4",
        "priority": "P0/P1/P2",
        "description": "what this theme delivers",
        "initiatives": ["initiative 1", "initiative 2"],
        "successMetrics": ["metric 1", "metric 2"],
        "estimatedEffort": "S/M/L/XL",
        "dependencies": ["dependency 1"]
      }
    ],
    "milestones": [
      {
        "name": "milestone",
        "targetDate": "YYYY-MM-DD or Q period",
        "deliverables": ["deliverable 1"],
        "riskLevel": "low/medium/high"
      }
    ],
    "risks": ["risk 1", "risk 2"],
    "assumptions": ["assumption 1"]
  },
  "narrative": "2-3 paragraph roadmap summary for stakeholders",
  "claudePowered": true,
  "brainAugmented": ${!!request["_brainContextStr"]}
}`;
    }

    case "sprint-health": {
      const sprintData = request.sprintData ?? request.description ?? request.query ?? "Sprint data not provided";
      const team = request.team ?? "unspecified team";
      return `You are a Scrum Master AI analyzing sprint health.

INPUT:
Sprint Data / Context: ${sprintData}
Team: ${team}
${brainCtx}${caseLog}

OUTPUT: Return ONLY valid JSON (no markdown, no explanation):
{
  "sprintHealth": {
    "overallStatus": "on-track/at-risk/blocked",
    "healthScore": 0.0,
    "velocity": {
      "planned": 0,
      "completed": 0,
      "percentComplete": 0,
      "trend": "improving/stable/declining"
    },
    "blockers": [
      {
        "description": "blocker description",
        "severity": "critical/high/medium/low",
        "owner": "person/team responsible",
        "daysBlocked": 0,
        "recommendedAction": "action to unblock"
      }
    ],
    "risks": [
      {
        "risk": "risk description",
        "likelihood": "high/medium/low",
        "impact": "high/medium/low",
        "mitigation": "mitigation strategy"
      }
    ],
    "burndownAssessment": "analysis of burndown trajectory",
    "teamMorale": "positive/neutral/concerning",
    "recommendations": ["recommendation 1", "recommendation 2", "recommendation 3"]
  },
  "narrative": "Sprint health summary paragraph",
  "claudePowered": true,
  "brainAugmented": ${!!request["_brainContextStr"]}
}`;
    }

    case "backlog-prioritizer": {
      const items = request.items ?? request.backlog ?? request.description ?? request.query ?? "Backlog items not provided";
      const criteria = request.criteria ?? "business value, effort, risk, dependencies";
      return `You are a Product Owner AI prioritizing a product backlog.

INPUT:
Backlog Items: ${JSON.stringify(items).slice(0, 3000)}
Prioritization Criteria: ${criteria}
${brainCtx}${caseLog}

OUTPUT: Return ONLY valid JSON (no markdown, no explanation):
{
  "prioritizedBacklog": [
    {
      "rank": 1,
      "item": "item name/description",
      "priorityScore": 0.0,
      "businessValue": "high/medium/low",
      "effort": "S/M/L/XL",
      "riskLevel": "high/medium/low",
      "wsjfScore": 0.0,
      "rationale": "why this priority",
      "dependencies": ["dependency"],
      "recommendedSprint": "Sprint 1/2/3 or Next/Backlog"
    }
  ],
  "summary": {
    "totalItems": 0,
    "highPriorityCount": 0,
    "technicalDebtPercentage": 0,
    "estimatedSprints": 0,
    "topThemesByValue": ["theme 1", "theme 2"]
  },
  "insights": ["insight 1 about the backlog", "insight 2"],
  "narrative": "Backlog prioritization analysis paragraph",
  "claudePowered": true,
  "brainAugmented": ${!!request["_brainContextStr"]}
}`;
    }

    case "stakeholder-alignment": {
      const audience = request.audience ?? request.stakeholders ?? "executive stakeholders";
      const context = request.context ?? request.description ?? request.query ?? "Product update context not provided";
      const format = request.format ?? "executive-update";
      return `You are a senior PM crafting stakeholder communications.

INPUT:
Audience: ${audience}
Context / Recent Progress: ${context}
Format: ${format}
${brainCtx}${caseLog}

OUTPUT: Return ONLY valid JSON (no markdown, no explanation):
{
  "stakeholderUpdate": {
    "subject": "email/doc subject line",
    "audience": "${audience}",
    "executiveSummary": "2-3 sentence TLDR",
    "sections": [
      {
        "title": "section title",
        "content": "section content",
        "tone": "informative/celebratory/cautionary/urgent"
      }
    ],
    "keyMetrics": [
      {
        "metric": "metric name",
        "value": "current value",
        "trend": "up/down/stable",
        "context": "what this means"
      }
    ],
    "decisions": [
      {
        "decision": "decision needed or made",
        "context": "why this decision matters",
        "recommendation": "recommended path",
        "deadline": "when decision needed"
      }
    ],
    "nextSteps": ["next step 1", "next step 2"],
    "risks": ["risk to flag to stakeholders"],
    "fullDraft": "Complete stakeholder update draft ready to send"
  },
  "narrative": "Communication strategy notes",
  "claudePowered": true,
  "brainAugmented": ${!!request["_brainContextStr"]}
}`;
    }

    case "release-risk": {
      const releaseContext = request.releaseContext ?? request.description ?? request.query ?? "Release details not provided";
      const releaseDate = request.releaseDate ?? "upcoming";
      const features = request.features ?? [];
      return `You are a Release Manager AI assessing release readiness and risk.

INPUT:
Release Context: ${releaseContext}
Target Release Date: ${releaseDate}
Features in Scope: ${JSON.stringify(features).slice(0, 2000)}
${brainCtx}${caseLog}

OUTPUT: Return ONLY valid JSON (no markdown, no explanation):
{
  "releaseRisk": {
    "overallRiskLevel": "low/medium/high/critical",
    "riskScore": 0.0,
    "readinessScore": 0.0,
    "goNoGoRecommendation": "go/no-go/conditional-go",
    "riskFactors": [
      {
        "category": "technical/process/dependency/resource/timeline",
        "risk": "risk description",
        "severity": "critical/high/medium/low",
        "likelihood": "high/medium/low",
        "mitigationStrategy": "how to mitigate",
        "owner": "who owns this"
      }
    ],
    "readinessChecklist": [
      {
        "item": "checklist item",
        "status": "complete/incomplete/at-risk/not-applicable",
        "notes": "any notes"
      }
    ],
    "rollbackPlan": "rollback strategy if release fails",
    "monitoringPlan": "what to watch post-release",
    "conditionalGoConditions": ["condition that must be met for go"],
    "recommendations": ["recommendation 1", "recommendation 2"]
  },
  "narrative": "Release risk assessment paragraph for stakeholders",
  "claudePowered": true,
  "brainAugmented": ${!!request["_brainContextStr"]}
}`;
    }

    case "feature-impact": {
      const feature = request.feature ?? request.description ?? request.query ?? "Feature not described";
      const scope = request.scope ?? "full product";
      return `You are a Principal PM analyzing feature impact, effort, and dependencies.

INPUT:
Feature: ${feature}
Scope: ${scope}
${brainCtx}${caseLog}

OUTPUT: Return ONLY valid JSON (no markdown, no explanation):
{
  "featureImpact": {
    "featureName": "extracted feature name",
    "summary": "1 sentence feature description",
    "businessImpact": {
      "score": 0.0,
      "level": "transformative/high/medium/low",
      "affectedUserSegments": ["segment 1"],
      "revenueImpact": "potential revenue impact",
      "retentionImpact": "positive/neutral/negative",
      "acquisitionImpact": "positive/neutral/negative"
    },
    "effort": {
      "score": 0.0,
      "tshirtSize": "XS/S/M/L/XL/XXL",
      "estimatedSprints": 0,
      "engineeringComplexity": "low/medium/high/very-high",
      "designComplexity": "low/medium/high",
      "dataComplexity": "low/medium/high"
    },
    "dependencies": [
      {
        "system": "system/team name",
        "type": "technical/team/data/external",
        "blocker": true,
        "notes": "dependency notes"
      }
    ],
    "risks": [
      {
        "risk": "risk description",
        "severity": "critical/high/medium/low",
        "mitigation": "mitigation approach"
      }
    ],
    "alternatives": [
      {
        "approach": "alternative approach",
        "tradeoffs": "tradeoff description",
        "effort": "relative effort"
      }
    ],
    "recommendation": "go/no-go/phase/defer",
    "rationale": "decision rationale"
  },
  "narrative": "Feature impact analysis paragraph",
  "claudePowered": true,
  "brainAugmented": ${!!request["_brainContextStr"]}
}`;
    }

    case "capacity-planner": {
      const team = request.team ?? request.description ?? request.query ?? "Team details not provided";
      const plannedWork = request.plannedWork ?? request.backlog ?? [];
      const sprintLength = request.sprintLength ?? 2;
      return `You are a PM AI analyzing team capacity vs planned work.

INPUT:
Team / Capacity Data: ${JSON.stringify(team).slice(0, 2000)}
Planned Work: ${JSON.stringify(plannedWork).slice(0, 2000)}
Sprint Length (weeks): ${sprintLength}
${brainCtx}${caseLog}

OUTPUT: Return ONLY valid JSON (no markdown, no explanation):
{
  "capacityPlan": {
    "totalCapacityPoints": 0,
    "plannedWorkPoints": 0,
    "utilizationRate": 0.0,
    "capacityStatus": "under-capacity/balanced/over-capacity",
    "teamBreakdown": [
      {
        "member": "person/role",
        "availablePoints": 0,
        "allocatedPoints": 0,
        "utilizationRate": 0.0,
        "status": "available/at-capacity/over-allocated",
        "risks": ["risk for this person"]
      }
    ],
    "workAllocation": [
      {
        "initiative": "initiative/epic name",
        "estimatedPoints": 0,
        "assignedTeam": "team or person",
        "sprintTarget": "Sprint 1/2/3",
        "feasibility": "feasible/at-risk/infeasible"
      }
    ],
    "alerts": [
      {
        "type": "over-allocation/skill-gap/dependency/timeline",
        "severity": "critical/high/medium/low",
        "description": "alert description",
        "recommendation": "what to do"
      }
    ],
    "recommendations": ["recommendation 1", "recommendation 2"],
    "suggestedAdjustments": ["scope reduction option 1", "timeline adjustment 1"]
  },
  "narrative": "Capacity planning summary paragraph",
  "claudePowered": true,
  "brainAugmented": ${!!request["_brainContextStr"]}
}`;
    }

    default:
      throw new Error(`Unknown PM-aaS domain: ${domainType}`);
  }
}

// ============================================================================
// MAIN EXECUTOR
// ============================================================================

/**
 * Execute a PM-aaS domain and persist the result as an artifact.
 *
 * Mirrors SE-aaS domain-executor.ts structure:
 *   Step -1:  RL Context Priming (case-log)
 *   Step -1b: Brain Context Priming (live brain state)
 *   Step 1:   Claude API execution with domain-specific prompt
 *   Step 2:   Save artifact to se_aas_artifacts
 *   Step 8:   RL outcome recording
 */
export async function executePmDomain(
  supabase: SupabaseClient,
  params: ExecutePmDomainParams
): Promise<ExecutePmDomainResult> {
  const { domainType, organizationId, userId } = params;

  // Validate domain
  const VALID_PM_DOMAINS = new Set([
    "roadmap-planner",
    "sprint-health",
    "backlog-prioritizer",
    "stakeholder-alignment",
    "release-risk",
    "feature-impact",
    "capacity-planner",
  ]);

  if (!VALID_PM_DOMAINS.has(domainType)) {
    throw new Error(`Unknown PM-aaS domain: ${domainType}`);
  }

  // ── Step -1: RL Context Priming ─────────────────────────────────────────
  const caseLogContext = await getCaseLogContext({
    agentType: `pm-aas.${domainType}`,
    prompt: JSON.stringify(params.request).slice(0, 200),
    orgId: organizationId,
  }).catch(() => "");

  const enrichedRequest: Record<string, unknown> = { ...params.request };
  if (caseLogContext) {
    enrichedRequest["_caseLogContext"] = caseLogContext;
  }

  // ── Step -1b: Brain Context Priming ─────────────────────────────────────
  try {
    const { getBrainContext } = await import("@/lib/brain/brain-context");
    const brainCtx = await getBrainContext(supabase, organizationId);
    if (brainCtx.contextSummary) {
      enrichedRequest["_brainContextStr"] = brainCtx.contextSummary;
    }
  } catch {
    // non-fatal — domain proceeds without brain context
  }

  // ── Step 0.5: Pull CORE insights into this org (fire-and-forget, TTL-guarded) — ADR-027
  try {
    const { pushCoreInsightsToOrg } = await import("@nexus-ai/memory-stack");
    void pushCoreInsightsToOrg(organizationId, supabase as any).catch((e: unknown) =>
      logger.warn("[pm-aas/domain-executor] Core insight pull failed (non-fatal):", e instanceof Error ? e.message : String(e))
    );
  } catch { /* non-fatal — federation never blocks execution */ }

  // ── Step 1: Build prompt and call Claude ────────────────────────────────
  const model = selectPmModel(domainType);
  const anthropicKey = params.anthropicApiKey || process.env.ANTHROPIC_API_KEY;

  if (!anthropicKey) {
    throw new Error("[PM-aaS] ANTHROPIC_API_KEY is not configured");
  }

  const prompt = buildDomainPrompt(domainType, enrichedRequest);
  const startMs = Date.now();

  let rawContent = "";
  try {
    const anthropic = new Anthropic({ apiKey: anthropicKey });
    const response = await anthropic.messages.create({
      model,
      max_tokens: 4096,
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
    });
    rawContent =
      response.content[0]?.type === "text" ? response.content[0].text : "";
  } catch (claudeErr: any) {
    logger.warn("[PM-aaS] Claude API call failed:", claudeErr?.message);
    throw claudeErr;
  }

  const durationMs = Date.now() - startMs;

  // Capture raw Claude output to federated_knowledge (fire-and-forget, never blocks)
  if (rawContent) {
    captureStreamedResponse(rawContent, durationMs, {
      supabase,
      organizationId,
      domain: `pm-aas.${domainType}`,
    });
  }

  // Parse JSON response — strip any markdown fences if present
  let result: Record<string, unknown>;
  try {
    const cleaned = rawContent
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```\s*$/i, "")
      .trim();
    result = JSON.parse(cleaned);
  } catch {
    // If Claude didn't return valid JSON, wrap the raw text
    logger.warn(`[PM-aaS] ${domainType}: Claude returned non-JSON, wrapping raw output`);
    result = {
      domainType,
      narrative: rawContent.slice(0, 2000),
      claudePowered: true,
      brainAugmented: !!enrichedRequest["_brainContextStr"],
      parseError: true,
    };
  }

  // Ensure domainType is always in result
  result.domainType = domainType;

  // ── Step 2: Save artifact (non-blocking) ────────────────────────────────
  let artifactId: string | null = null;
  try {
    const saved = await saveArtifact(supabase, {
      organizationId,
      domainType: `pm-aas.${domainType}`,
      artifactData: result,
      metadata: {
        durationMs,
        userId,
        service: "pm-aas",
        model,
        claudePowered: true,
        brainAugmented: !!enrichedRequest["_brainContextStr"],
      },
      createdBy: userId,
    });
    artifactId = saved.artifactId;
  } catch (artifactErr: any) {
    logger.warn("[PM-aaS] Artifact save failed (non-blocking):", artifactErr?.message);
  }

  // ── Step 8: RL Outcome Recording (fire-and-forget) ─────────────────────
  const rlQuality = computeAgentQuality(
    JSON.stringify(result),
    null,
    durationMs,
    `pm-aas.${domainType}`
  );
  const rlTaskId = `pm-aas.${domainType}_${organizationId.slice(0, 8)}_${Date.now()}`;

  recordAgentOutcome(supabase, {
    agentId: rlTaskId,
    domain: `pm-aas.${domainType}`,
    taskDescription: JSON.stringify(params.request).slice(0, 200),
    resultSummary: JSON.stringify(result).slice(0, 500),
    quality: rlQuality,
    executionMs: durationMs,
    organizationId,
    userId,
    aiWorkerId: params.aiWorkerId ?? undefined,
  }).catch(() => {/* non-fatal */});

  // ADR-025: Record brain learning for federation pipeline
  void recordBrainLearning(supabase, {
    organizationId,
    aiWorkerId: params.aiWorkerId,
    domain: `pm-aas.${domainType}`,
    taskDescription: `PM-aaS domain execution: ${domainType}`,
    qualityScore: rlQuality,
    executionMs: durationMs,
    result,
    outcomeLabel: rlQuality >= 0.7 ? "success" : rlQuality >= 0.4 ? "partial" : "failed",
  }).catch((err: unknown) =>
    logger.warn("[pm-aas/domain-executor] recordBrainLearning failed (non-fatal)", { err: String(err) })
  );

  logAgentRetro({
    taskId: rlTaskId,
    agentType: `pm-aas.${domainType}`,
    prompt: JSON.stringify(params.request).slice(0, 100),
    status: rlQuality >= 0.5 ? "completed" : "partial",
    durationMs,
    modelUsed: model,
    outputSummary: JSON.stringify(result).slice(0, 200),
  }).catch(() => {/* non-fatal */});

  return {
    result: { ...result, timing: { totalMs: durationMs } },
    artifactId,
  };
}
