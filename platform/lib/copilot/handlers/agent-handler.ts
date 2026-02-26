/**
 * Agent Creation Handler
 *
 * Handles the "create-agent" intent detected by the LLM classifier.
 * Creates an agent record in se_aas_artifacts (domain_type="agent-definition")
 * and returns the created agent metadata for SSE emission and prompt injection.
 *
 * Extracted from chat/route.ts (was lines 1107–1163).
 */

import { getAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";

export interface AgentSpec {
  name: string;
  description?: string;
  domain?: string;
  trigger?: string;
  schedule?: string | null;
  requiredInputs?: string[];
}

export interface AgentCreatedResult {
  [k: string]: unknown;
  agentId: string;
  name: string;
  domain: string;
  trigger: string;
  schedule?: string | null;
  brainEnabled: true;
  rlEnabled: true;
  memoryTracking: true;
  createdAt: string;
}

/**
 * Create an agent record inline from a Copilot "create-agent" intent.
 *
 * @param spec - agent specification from LLM classifier
 * @param workspaceId - organization_id to scope the agent to
 * @param userId - user who triggered the creation
 * @param originalMessage - raw user message (used as description fallback)
 * @returns AgentCreatedResult on success, or null on failure (non-fatal)
 */
export async function handleAgentCreation(
  spec: AgentSpec,
  workspaceId: string,
  userId: string,
  originalMessage: string
): Promise<AgentCreatedResult | null> {
  try {
    const admin = getAdminClient();
    const agentId = crypto.randomUUID();
    const now = new Date().toISOString();

    const { error: agentInsertError } = await admin.from("se_aas_artifacts").insert({
      id: agentId,
      organization_id: workspaceId,
      domain_type: "agent-definition",
      artifact_data: {
        agentId,
        name: spec.name,
        description: spec.description || originalMessage,
        domain: spec.domain || "custom",
        trigger: spec.trigger || "manual",
        schedule: spec.schedule ?? null,
        requiredInputs: spec.requiredInputs ?? [],
        status: "active",
        brainEnabled: true,
        rlEnabled: true,
        memoryTracking: true,
        createdAt: now,
        createdBy: userId,
      },
      metadata: { source: "copilot", agentVersion: "1.0" },
      created_by: userId,
      created_at: now,
    });

    if (agentInsertError) {
      logger.warn("[agent-handler] Agent insert error (non-fatal):", agentInsertError);
    }

    logger.warn(`[agent-handler] Agent created inline: ${spec.name} (${agentId})`);

    return {
      agentId,
      name: spec.name,
      domain: spec.domain || "custom",
      trigger: spec.trigger || "manual",
      schedule: spec.schedule,
      brainEnabled: true,
      rlEnabled: true,
      memoryTracking: true,
      createdAt: now,
    };
  } catch (agentErr) {
    logger.error("[agent-handler] Agent creation failed (non-fatal):", agentErr);
    return null;
  }
}

/** Display name map for domain agent types — used for "Handled by" indicator in chat UI */
export const DOMAIN_AGENT_NAMES: Record<string, string> = {
  // Delivery Intelligence (P0)
  "pod-match": "Pod Match Agent",
  "early-warning": "Early Warning Agent",
  "scope-creep": "Scope Creep Monitor",
  "delivery-intelligence": "Delivery Intelligence Agent",
  // Code Intelligence (P1)
  "pr-review": "PR Review Agent",
  "tdd": "TDD Agent",
  "boilerplate-scaffold": "Scaffold Agent",
  "dependency-upgrade": "Dependency Audit Agent",
  "design-doc-generator": "Design Doc Agent",
  // Test
  "test-case-generator": "Test Case Agent",
  "test-data-generator": "Test Data Agent",
  // SWE Codebase
  "codebase-qa": "Codebase Q&A Agent",
  "dead-code-detector": "Dead Code Agent",
  "impact-analysis": "Impact Analysis Agent",
  "architecture-extractor": "Architecture Agent",
  // Observability
  "incident-diagnosis": "Incident RCA Agent",
  "log-query": "Log Analysis Agent",
  "performance-profiler": "Performance Profiler",
  // Data
  "sql-analyzer": "SQL Analysis Agent",
  "data-lineage": "Data Lineage Agent",
  // PM-aaS
  "roadmap-planner": "Roadmap Planner Agent",
  "sprint-health": "Sprint Health Agent",
  "backlog-prioritizer": "Backlog Prioritizer Agent",
  "stakeholder-alignment": "Stakeholder Alignment Agent",
  "release-risk": "Release Risk Agent",
  "feature-impact": "Feature Impact Agent",
  "capacity-planner": "Capacity Planner Agent",
  // AAS
  "aas-pl": "Accounting Agent (P&L)",
  "aas-balance": "Accounting Agent (Balance Sheet)",
  "aas-trial": "Accounting Agent (Trial Balance)",
  "aas-gst": "Accounting Agent (GST)",
  "aas-anomaly": "Anomaly Detective",
  "aas-transactions": "Accounting Agent (Transactions)",
  "aas-benchmark": "Benchmark Agent",
  "statement-generator": "Accounting Agent",
  "reconciler": "Reconciliation Agent",
  "bookkeeper": "Bookkeeping Agent",
  "tax-compliance": "Tax Compliance Agent",
  "anomaly-detective": "Anomaly Detective",
  "audit-preparer": "Audit Agent",
  "cash-flow-prophet": "Cash Flow Agent",
  "revenue-leakage-detector": "Revenue Leakage Agent",
  "causal-pl-narrator": "Causal P&L Agent",
};

/** Agent intent detection — determines if user wants to launch a brain agent */
export function detectAgentIntent(
  message: string
): {
  agentType: string;
  extractedParams: {
    jiraId?: string;
    repo?: string;
    branch?: string;
    prNumber?: number;
    description?: string;
  };
} | null {
  const lower = message.toLowerCase();

  const agentTriggers = [
    /(?:start|launch|run|create|use|spin\s+up)\s+(?:an?\s+)?(?:openclaw|agent|claw)\b/i,
    /(?:openclaw|agent|claw)\s*[:\-—]\s*/i,
    /(?:openclaw|agent|claw)\s+(?:to|for|and)\s+/i,
    /(?:start|launch|run)\s+(?:an?\s+)?(?:brain\s+)?agent\b/i,
    /create\s+(?:an?\s+)?(?:openclaw|agent|claw)\s+(?:agent\s+)?and\s+(?:execute|run)/i,
    /(?:train|retrain|start\s+training|run\s+(?:brain\s+)?training)\s+(?:the\s+)?brain\b/i,
  ];

  const isAgentTriggered = agentTriggers.some(rx => rx.test(message));
  if (!isAgentTriggered) return null;

  // Extract Jira ID: PROJ-123, JIRA-456, NB-789, etc.
  const jiraMatch = message.match(/\b([A-Z][A-Z0-9]+-\d+)\b/);
  const jiraId = jiraMatch?.[1];

  // Extract PR number
  const prMatch = message.match(/(?:pr|pull\s+request)\s*#?(\d+)/i);
  const prNumber = prMatch ? parseInt(prMatch[1]) : undefined;

  // Extract repository name
  const repoMatch = message.match(/(?:on|in|repo|repository)\s+([a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)?)/i);
  const repo = repoMatch?.[1];

  // Extract branch
  const branchMatch = message.match(/branch\s+([a-zA-Z0-9_./-]+)/i);
  const branch = branchMatch?.[1];

  // Detect agent type from task description
  let agentType = "general";

  if (
    /(?:train|retrain|start\s+training|run\s+(?:brain\s+)?training)\s+(?:the\s+)?brain\b/i.test(message) ||
    /brain\s+training/i.test(message) ||
    /(?:train|retrain)\s+(?:the\s+)?(?:ai|brain|model)\b/i.test(message)
  ) {
    agentType = "train-brain";
  } else if (/review\s+(?:pr|pull|code|diff)|pr\s+review|code\s+review/i.test(lower)) {
    agentType = "code-review";
  } else if (/(?:fix|implement|build|code|develop|create\s+(?:feature|fix))/i.test(lower)) {
    agentType = "build";
  } else if (/(?:diagnose|debug|root\s+cause|incident|why\s+is)/i.test(lower)) {
    agentType = "diagnose";
  } else if (/(?:test|write\s+tests?|generate\s+tests?|tdd)/i.test(lower)) {
    agentType = "test";
  } else if (/(?:analyze|impact|blast\s+radius|assess)/i.test(lower)) {
    agentType = "analyze";
  } else if (/(?:upgrade|dependency|dependencies|outdated)/i.test(lower)) {
    agentType = "dependency-upgrade";
  } else if (/(?:performance|profil|slow|latency)/i.test(lower)) {
    agentType = "performance";
  } else if (/(?:balance\s+sheet|p\s*&\s*l|financial\s+statement|accounting|reconcil|audit|tax|gst)/i.test(lower)) {
    agentType = "analyze";
  }

  // If openclaw is explicitly mentioned, tag it
  if (/openclaw|claw/i.test(lower)) {
    agentType = "openclaw";
  }

  return {
    agentType,
    extractedParams: {
      jiraId,
      repo,
      branch,
      prNumber,
      description: message,
    },
  };
}
