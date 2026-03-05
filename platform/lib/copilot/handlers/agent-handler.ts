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
 * @param workerId - optional AI Worker ID; when present, inserts into agent_queue so the Jobs tab shows it
 * @returns AgentCreatedResult on success, or null on failure (non-fatal)
 */
export async function handleAgentCreation(
  spec: AgentSpec,
  workspaceId: string,
  userId: string,
  originalMessage: string,
  workerId?: string
): Promise<AgentCreatedResult | null> {
  try {
    // Admin client bypasses RLS — se_aas_artifacts and agent_queue have no user-scoped RLS.
    // Caller (chat/route.ts) has already verified workspace membership before invoking this handler.
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

    // ── Also insert into agents so the Agents tab can surface this agent definition ───────────
    // The Agents tab queries the `agents` table filtered by ai_worker_id. Without this insert,
    // agents created from Copilot are invisible there.
    if (workerId) {
      const { error: agentsTableError } = await admin.from("agents").insert({
        id: agentId,
        ai_worker_id: workerId,
        organization_id: workspaceId,
        name: spec.name,
        purpose: spec.description || originalMessage.slice(0, 500),
        status: "active",
        created_by: "user",
        created_at: now,
      });
      if (agentsTableError) {
        logger.warn("[agent-handler] agents table insert error (non-fatal):", agentsTableError);
      }
    }

    // ── Also insert into agent_queue so the Jobs tab can surface this agent ──────────────────
    // The Jobs tab queries agent_queue filtered by ai_worker_id. Without this insert, agents
    // created from Copilot are invisible in the Jobs tab because they only exist in se_aas_artifacts.
    if (workerId) {
      const { error: queueInsertError } = await admin.from("agent_queue").insert({
        organization_id: workspaceId,
        agent_type: spec.domain || "custom",
        task_type: spec.trigger || "manual",
        priority: 5, // 5 = normal priority in agent_queue
        status: "pending",
        ai_worker_id: workerId,
        payload: {
          agentId,
          name: spec.name,
          description: spec.description || originalMessage,
          domain: spec.domain || "custom",
          schedule: spec.schedule ?? null,
          requiredInputs: spec.requiredInputs ?? [],
          brainEnabled: true,
          rlEnabled: true,
          memoryTracking: true,
          source: "copilot",
        },
        created_at: now,
      });
      if (queueInsertError) {
        logger.warn("[agent-handler] agent_queue insert error (non-fatal):", queueInsertError);
      }
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
    /(?:train|retrain)\s+(?:the\s+)?(?:ai|brain|model)\b/i.test(message) ||
    /\b(?:begin|start|kick\s+off|run|trigger)\s+training\b/i.test(message) ||
    /\bbegin\s+(?:the\s+)?(?:learning|training|consolidation)\b/i.test(message) ||
    /\brun\s+(?:consolidation|brain\s+cycle)\b/i.test(message)
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

// ── General Task Detection + Job Creation (Gap A fix) ────────────────────────

export interface GeneralTaskDetection {
  /** The resolved task description to pass to the general worker */
  task: string;
  /** Agent type: 'general' for quick tasks, 'apex' for complex research */
  agentType: "general" | "apex";
  /** URLs extracted from the message (for scan/analyze tasks) */
  urls: string[];
}

/**
 * Detect if the user's message is a general research/scan/analysis task
 * that should be dispatched to the general worker (not SE-aaS/AaaS/PM-aaS).
 *
 * Triggers on: URL scans, competitor research, web lookups, doc analysis,
 * knowledge base queries, report generation, and similar open-ended tasks.
 *
 * Returns null if the message is NOT a general task (i.e., a domain-specific
 * SE-aaS / AaaS / PM-aaS query should handle it instead).
 */
export function detectGeneralTask(
  message: string,
  alreadyHandled: boolean,
): GeneralTaskDetection | null {
  // Don't double-handle if an agent or SE-aaS domain already owns this message
  if (alreadyHandled) return null;

  // Extract URLs from the message
  const urlPattern = /https?:\/\/[^\s,)'"]+|(?:www\.)[^\s,)'"]+\.[a-z]{2,}/gi;
  const urls = (message.match(urlPattern) ?? []).map((u) =>
    u.startsWith("http") ? u : `https://${u}`
  );

  const lower = message.toLowerCase();

  // === Trigger patterns for general worker dispatch ===

  // 1. URL scan / scrape / extract (always general)
  const hasUrl = urls.length > 0;
  const urlAction = /\b(scan|scrape|extract|visit|browse|fetch|read|check|look at|analyse|analyze|summarize|compare)\b/i.test(lower);
  if (hasUrl && urlAction) {
    return {
      task: message,
      agentType: "general",
      urls,
    };
  }

  // 2. Competitor / market research
  if (
    /\b(competitor|competition|rival|vs\.?|versus|benchmark|market\s+(research|analysis|landscape|intel|intelligence))\b/i.test(lower)
  ) {
    return {
      task: message,
      agentType: "apex", // Complex research → APEX FSM
      urls,
    };
  }

  // 3. Product / feature research from KB
  if (
    /\b(product\s+(feature|roadmap|pricing|tier|plan|capability)|what\s+does\s+(our|the)\s+product|how\s+does\s+(our|the)\s+product|knowledge\s+base|search\s+(our\s+)?docs?|find\s+in\s+(our\s+)?docs?)\b/i.test(lower)
  ) {
    return {
      task: message,
      agentType: "general",
      urls,
    };
  }

  // 4. Explicit research / report generation
  if (
    /\b(research|investigate|deep\s+dive|write\s+(a\s+)?(report|summary|analysis)|generate\s+(a\s+)?(report|summary)|compile|gather\s+info(rmation)?)\b/i.test(lower)
  ) {
    return {
      task: message,
      agentType: urls.length > 2 ? "apex" : "general",
      urls,
    };
  }

  // 5. Explicit "run APEX" / "use apex agent" — dispatch to APEX FSM
  if (
    /\b(run|use|launch|start|deploy)\s+(?:the\s+)?(?:apex|apex\s+agent|apex\s+research)\b/i.test(lower)
  ) {
    return {
      task: message,
      agentType: "apex",
      urls,
    };
  }

  // 5b. Explicit "run agent for X" / "use agent to X" (general purpose)
  if (
    /\b(run\s+(?:an?\s+)?agent\s+(for|to|on)|use\s+(?:an?\s+)?agent\s+(for|to)|dispatch\s+(?:an?\s+)?agent)\b/i.test(lower)
  ) {
    return {
      task: message,
      agentType: "general",
      urls,
    };
  }

  // 6. Explicit web search requests
  if (
    /\b(search\s+(?:the\s+)?web|look\s+up\s+online|find\s+online|google\s+(for|this)|web\s+search)\b/i.test(lower)
  ) {
    return {
      task: message,
      agentType: "general",
      urls,
    };
  }

  // 7. Document ingestion / connector sync triggers
  // "read my google drive", "ingest confluence", "scan my docs", "sync notion"
  if (
    /\b(ingest|import|sync|index|read\s+(?:from\s+|my\s+)?(?:google\s+drive|drive|confluence|notion|sharepoint|dropbox)|scan\s+(?:my\s+|our\s+)?(?:docs?|documents?|files?|google\s+drive|confluence)|load\s+(?:my\s+|our\s+)?docs?|add\s+(?:my\s+|our\s+)?docs?)\b/i.test(lower)
  ) {
    return {
      task: `Discover and ingest documents from the user's connected sources. User request: "${message}"`,
      agentType: "general",
      urls,
    };
  }

  // 8. Explicit "summarize all my docs / knowledge base" requests
  if (
    /\b(what(?:'s|\s+is)\s+in\s+(?:my\s+|our\s+)?(?:knowledge\s+base|kb|docs?|documents?|files?)|summarize\s+(?:all\s+)?(?:my\s+|our\s+)?(?:docs?|documents?|files?|knowledge))\b/i.test(lower)
  ) {
    return {
      task: message,
      agentType: "general",
      urls,
    };
  }

  return null;
}

export interface GeneralJobCreatedResult {
  jobId: string;
  agentType: "general" | "apex";
  task: string;
  status: "pending";
  createdAt: string;
}

/**
 * Create a general-purpose agent job in agent_queue.
 * Called when detectGeneralTask() returns a non-null result.
 */
export async function handleGeneralJobCreation(
  detection: GeneralTaskDetection,
  workspaceId: string,
  userId: string,
  workerId?: string,
): Promise<GeneralJobCreatedResult | null> {
  // Validate task before queuing — prevent empty or oversized tasks from wasting worker cycles
  const trimmedTask = detection.task?.trim() ?? "";
  if (!trimmedTask) {
    logger.warn("[agent-handler] Rejected empty task");
    return null;
  }
  if (trimmedTask.length > 5000) {
    logger.warn("[agent-handler] Task exceeds 5000 char limit, truncating");
    detection = { ...detection, task: trimmedTask.slice(0, 5000) };
  }

  try {
    const admin = getAdminClient();
    const now = new Date().toISOString();

    const { data: job, error } = await admin.from("agent_queue").insert({
      organization_id: workspaceId,
      agent_type: detection.agentType,       // 'general' or 'apex'
      task_type: "user-request",
      priority: 7,                           // above normal, below chain-continuations
      status: "pending",
      ai_worker_id: workerId ?? null,
      payload: {
        task: detection.task,
        urls: detection.urls,
        source: "copilot",
        createdBy: userId,
        maxTurns: detection.agentType === "apex" ? 50 : 20,
      },
      created_at: now,
    }).select("id").single();

    if (error || !job?.id) {
      logger.warn("[agent-handler] General job insert failed:", error);
      return null;
    }

    logger.warn(`[agent-handler] General ${detection.agentType} job created: ${job.id} for "${detection.task.slice(0, 60)}"`);

    return {
      jobId: job.id,
      agentType: detection.agentType,
      task: detection.task,
      status: "pending",
      createdAt: now,
    };
  } catch (err) {
    logger.error("[agent-handler] General job creation failed:", err);
    return null;
  }
}
