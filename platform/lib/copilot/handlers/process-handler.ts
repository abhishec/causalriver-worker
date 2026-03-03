/**
 * Process Engine Intent Handler
 * ==============================
 * Detects and handles "trigger a business process" intent from copilot messages.
 * Routes to agent_queue with agent_type='bpaas' (Process Engine legacy DB value).
 *
 * Examples of triggering phrases:
 *   "start the quarterly delivery review process for Fincense"
 *   "run the hr offboarding workflow for John Smith"
 *   "trigger procurement process for invoice INV-1234"
 *   "begin the order management process"
 *   "launch the compliance review"
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/lib/logger";

export interface ProcessTriggerIntent {
  processType: string;       // normalized: "hr_offboarding", "procurement", etc.
  rawProcessName: string;    // what user said: "quarterly delivery review"
  context?: string;          // extra context from message: "for Fincense engagement"
}

export interface ProcessTriggerResult {
  jobId: string;
  processType: string;
  message: string;           // human-readable confirmation for the user
}

// ── Common process name aliases ─────────────────────────────────────────────
// Map raw user-facing names to canonical process type identifiers used in DB.
const PROCESS_ALIASES: Record<string, string> = {
  "quarterly delivery review": "delivery_review",
  "delivery review": "delivery_review",
  "hr offboarding": "hr_offboarding",
  "offboarding": "hr_offboarding",
  "hr onboarding": "hr_onboarding",
  "onboarding": "hr_onboarding",
  "procurement": "procurement",
  "order management": "order_management",
  "order processing": "order_management",
  "compliance review": "compliance_review",
  "compliance": "compliance_review",
  "invoice approval": "invoice_approval",
  "invoice": "invoice_approval",
  "vendor onboarding": "vendor_onboarding",
  "vendor management": "vendor_onboarding",
  "employee offboarding": "hr_offboarding",
  "employee onboarding": "hr_onboarding",
  "quarterly review": "delivery_review",
  "sprint review": "delivery_review",
  "performance review": "performance_review",
  "audit": "compliance_review",
  "risk review": "compliance_review",
};

/**
 * Normalize a raw process name string to a snake_case process type identifier.
 * Checks alias map first, then falls back to lowercase+underscore normalization.
 */
function normalizeProcessName(rawName: string): string {
  const lower = rawName.toLowerCase().trim();

  // Try exact alias match first
  if (PROCESS_ALIASES[lower]) {
    return PROCESS_ALIASES[lower];
  }

  // Try partial alias match (alias is a substring of the raw name)
  for (const [alias, normalized] of Object.entries(PROCESS_ALIASES)) {
    if (lower.includes(alias)) {
      return normalized;
    }
  }

  // Fallback: lowercase, collapse whitespace, replace spaces with underscores
  return lower.replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
}

/**
 * Detect "trigger a business process" intent from a copilot message.
 * Returns null when no process trigger is found.
 */
export function detectProcessIntent(message: string): ProcessTriggerIntent | null {
  const lower = message.toLowerCase();

  // Pattern 1: verb + optional "the" + process name + process-noun
  // Examples: "start the hr offboarding process", "run quarterly delivery review workflow"
  const verbPattern =
    /(?:start|run|trigger|launch|execute|begin|kick\s+off|initiate)\s+(?:the\s+)?([a-z][a-z\s_-]{2,40}?)\s+(?:process|workflow|procedure|automation|review)\b/i;

  // Pattern 2: shorthand colon notation
  // Examples: "process: hr_offboarding", "process: procurement"
  const colonPattern = /\bprocess:\s*([a-z][a-z0-9_-]{2,40})\b/i;

  let rawProcessName: string | null = null;
  let context: string | undefined;

  const verbMatch = lower.match(verbPattern);
  if (verbMatch) {
    rawProcessName = verbMatch[1].trim();

    // Extract "for ..." context that follows the process trigger phrase
    const fullMatch = verbMatch[0];
    const afterMatch = message.slice(message.toLowerCase().indexOf(fullMatch) + fullMatch.length).trim();
    if (afterMatch) {
      context = afterMatch.slice(0, 200); // cap context length
    }
  } else {
    const colonMatch = lower.match(colonPattern);
    if (colonMatch) {
      rawProcessName = colonMatch[1].trim();
    }
  }

  if (!rawProcessName) {
    return null;
  }

  const processType = normalizeProcessName(rawProcessName);

  // Guard: if normalization produced an empty or too-short string, skip
  if (!processType || processType.length < 2) {
    return null;
  }

  return {
    processType,
    rawProcessName,
    context,
  };
}

/**
 * Handle a detected process trigger intent.
 * Inserts a job into agent_queue with agent_type='bpaas' and fires the
 * process engine worker as a non-blocking background task.
 *
 * @param intent - detected process trigger intent
 * @param workspaceId - organization_id to scope the job to
 * @param userId - user who triggered the process
 * @param service - Supabase client (admin preferred to bypass RLS)
 * @returns ProcessTriggerResult with jobId and human-readable confirmation
 */
export async function handleProcessTrigger(
  intent: ProcessTriggerIntent,
  workspaceId: string,
  userId: string,
  service: SupabaseClient
): Promise<ProcessTriggerResult> {
  const jobId = crypto.randomUUID();
  const now = new Date().toISOString();

  const { error: insertError } = await service.from("agent_queue").insert({
    id: jobId,
    organization_id: workspaceId,
    agent_type: "bpaas",
    task_type: intent.processType,
    status: "pending",
    priority: 5,
    payload: {
      processType: intent.processType,
      organizationId: workspaceId,
      userId,
      inputPayload: {
        context: intent.context ?? null,
        triggeredBy: "copilot",
        rawProcessName: intent.rawProcessName,
      },
    },
    created_at: now,
  });

  if (insertError) {
    logger.warn("[process-handler] agent_queue insert failed", {
      jobId,
      processType: intent.processType,
      error: insertError.message,
    });
    // Still throw so chat/route.ts can handle the non-fatal error path
    throw new Error(`Failed to queue process job: ${insertError.message}`);
  }

  logger.warn("[process-handler] Process job queued", {
    jobId,
    processType: intent.processType,
    rawProcessName: intent.rawProcessName,
    workspaceId,
  });

  // Fire-and-forget: trigger the process engine worker immediately.
  // Import dynamically to avoid circular deps and keep the handler lean.
  void (async () => {
    try {
      const { processProcessEngineJobs } = await import("@/lib/process-engine/worker");
      await processProcessEngineJobs(service, 1);
    } catch (workerErr) {
      logger.warn("[process-handler] Immediate process engine trigger failed (non-fatal)", {
        jobId,
        error: String(workerErr),
      });
    }
  })();

  const displayName = intent.rawProcessName
    .split(/[\s_-]+/)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");

  return {
    jobId,
    processType: intent.processType,
    message: `Starting ${displayName} process... I'll notify you when it reaches a decision point or completes. (Job ID: ${jobId})`,
  };
}
