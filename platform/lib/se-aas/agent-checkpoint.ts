import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/lib/logger";

export type EscalationType = "human-review" | "admin-approval" | "budget-exceeded";

export interface CheckpointState {
  phase: string;                           // e.g. "evidence_gathering", "risk_assessment"
  entityIds: string[];                     // customer IDs, engagement IDs being analyzed
  partialResults: Record<string, unknown>; // findings so far
  escalationQuestion: string;              // the specific question needing human judgment
  resumeInstruction: string;               // tell next Lambda: "Continue analysis from phase X with human response Y"
  escalationType?: EscalationType;         // why the job was paused (default: "human-review")
  metadata?: Record<string, unknown>;
}

// ── Deep Checkpoint — full conversation context for Lambda chaining ──────────

/**
 * DeepCheckpoint serialises the full conversation history and context window
 * so a continuation Lambda can resume exactly where the previous one stopped.
 *
 * Unlike CheckpointState (for human-review gates), DeepCheckpoint is written
 * automatically when the 75s Lambda budget is nearly exhausted, enabling
 * unlimited job duration via DB-backed continuations.
 */
export interface DeepCheckpoint {
  jobId: string;
  phase: string;
  phaseLabel: string;
  /** Full LLM conversation history — every message, system → assistant → user. */
  conversationHistory: Array<{ role: string; content: string }>;
  /** Tickets / sub-tasks already completed in this job. */
  completedTickets: string[];
  branchName?: string;
  prUrl?: string;
  contextWindow: {
    tokensUsed: number;
    systemPrompt: string;
    lastUserMessage: string;
  };
  /** How many Lambda hops deep this checkpoint is. */
  chainDepth: number;
  savedAt: string;
}

/**
 * Save a DeepCheckpoint to agent_queue.checkpoint_data and mark the job
 * as 'paused' (NOT terminal) so the next Lambda chain continuation can
 * pick it up.
 *
 * Also writes heartbeat_at so the watchdog doesn't mark this job stale
 * before the child continuation job is picked up.
 */
export async function saveDeepCheckpoint(
  supabase: SupabaseClient,
  jobId: string,
  checkpoint: Omit<DeepCheckpoint, "savedAt">
): Promise<void> {
  const data: DeepCheckpoint = { ...checkpoint, savedAt: new Date().toISOString() };

  try {
    const { error } = await supabase
      .from("agent_queue")
      .update({
        checkpoint_data: data,
        checkpoint_phase: checkpoint.phase,
        heartbeat_at: new Date().toISOString(),
        status: "paused", // PAUSED not terminal — chain continuation will resume
      })
      .eq("id", jobId);

    if (error) {
      logger.error("[saveDeepCheckpoint] Failed to save checkpoint", { jobId, error });
      return;
    }

    logger.warn("[saveDeepCheckpoint] Saved deep checkpoint", {
      jobId,
      phase: checkpoint.phase,
      chainDepth: checkpoint.chainDepth,
      historyLength: checkpoint.conversationHistory.length,
      completedTickets: checkpoint.completedTickets.length,
    });
  } catch (err) {
    logger.error("[saveDeepCheckpoint] Threw unexpectedly", { jobId, err });
  }
}

/**
 * Load a DeepCheckpoint from agent_queue.checkpoint_data.
 * Returns null if there is no checkpoint (fresh job) or if the data is
 * not a valid DeepCheckpoint.
 */
export async function loadDeepCheckpoint(
  supabase: SupabaseClient,
  jobId: string
): Promise<DeepCheckpoint | null> {
  try {
    const { data, error } = await supabase
      .from("agent_queue")
      .select("checkpoint_data, chain_depth")
      .eq("id", jobId)
      .single();

    if (error || !data?.checkpoint_data) return null;

    const cp = data.checkpoint_data as DeepCheckpoint;
    // Backfill chain_depth from the column if the checkpoint predates the field
    if (typeof cp.chainDepth !== "number" && typeof data.chain_depth === "number") {
      cp.chainDepth = data.chain_depth;
    }
    return cp;
  } catch (err) {
    logger.warn("[loadDeepCheckpoint] Failed to load checkpoint", { jobId, err });
    return null;
  }
}

/**
 * Pause an agent job at a decision gate.
 * Saves full investigation state to checkpoint columns and marks status as
 * 'suspended' (clearer than 'awaiting_approval' — means human review required).
 * This is NOT terminal — the continuation job is created by resume_agent_job()
 * when the human responds via POST /api/agents/{id}/resume.
 *
 * escalationType controls the UI label and routing:
 *   "human-review"    — default; reviewer must read output before continuing
 *   "admin-approval"  — requires an admin-level user to unblock
 *   "budget-exceeded" — cost/quota gate; finance approval needed
 */
export async function pauseJobAtDecisionGate(
  supabase: SupabaseClient,
  jobId: string,
  orgId: string,
  checkpoint: CheckpointState
): Promise<boolean> {
  const escalationType: EscalationType = checkpoint.escalationType ?? "human-review";

  try {
    const { error } = await supabase
      .from("agent_queue")
      .update({
        status: "suspended",
        checkpoint_data: {
          ...checkpoint.partialResults,
          escalationType,
        },
        checkpoint_phase: checkpoint.phase,
        resume_prompt: checkpoint.resumeInstruction,
        escalation_question: checkpoint.escalationQuestion,
        escalation_sent_at: new Date().toISOString(),
      })
      .eq("id", jobId)
      .eq("organization_id", orgId);

    if (error) {
      logger.error("pauseJobAtDecisionGate: DB write failed — aborting for safety", { jobId, error });
      return false;
    }

    logger.warn("Agent suspended at decision gate", {
      jobId,
      phase: checkpoint.phase,
      escalationType,
      question: checkpoint.escalationQuestion.slice(0, 100),
    });
    return true;
  } catch (err) {
    logger.error("pauseJobAtDecisionGate threw unexpectedly — aborting for safety", { jobId, err });
    return false;
  }
}

/**
 * Send escalation notification via Slack webhook (if configured) and write
 * an escalation record to ai_memory for brain tracking. Both are best-effort
 * and non-fatal.
 */
export async function sendEscalationNotification(
  supabase: SupabaseClient,
  orgId: string,
  jobId: string,
  question: string,
  phase: string,
  partialSummary: string
): Promise<void> {
  // Attempt Slack webhook notification
  try {
    const { data: connector } = await supabase
      .from("org_connectors")
      .select("credentials")
      .eq("organization_id", orgId)
      .eq("connector_type", "slack")
      .eq("status", "active")
      .maybeSingle();

    const webhookUrl = (connector?.credentials as Record<string, string>)?.webhook_url;
    if (webhookUrl) {
      await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: "AI Worker needs your input",
          blocks: [
            {
              type: "section",
              text: {
                type: "mrkdwn",
                text: `*AI Worker paused — awaiting your judgment*\n\n*Question:* ${question}\n\n*Current phase:* ${phase}\n*Summary so far:* ${partialSummary.slice(0, 300)}`,
              },
            },
            {
              type: "section",
              text: {
                type: "mrkdwn",
                text: `*Respond via BrainOS dashboard or:*\n\`POST /api/agents/${jobId}/resume\` with \`{ "response": "your answer" }\``,
              },
            },
          ],
        }),
      });
    }
  } catch (err) {
    logger.warn("Slack escalation notification failed (non-fatal)", { jobId, err });
  }

  // Write escalation record to ai_memory for brain tracking
  try {
    await supabase.from("ai_memory").insert({
      organization_id: orgId,
      memory_type: "fact",
      domain: `agent.escalation.${jobId}`,
      content: `Agent paused at ${phase}: ${question}`,
      importance: 0.9,
      metadata: { jobId, phase, question, status: "pending_response" },
    });
  } catch {
    // Non-fatal: ai_memory is best-effort
  }
}

/**
 * Load checkpoint from a resumed job's payload.
 * Returns null if this is a fresh job (not a continuation after human response).
 */
export function loadResumeCheckpoint(
  payload: Record<string, unknown>
): {
  checkpointData: Record<string, unknown>;
  humanResponse: string;
  phase: string;
  resumePrompt: string;
} | null {
  if (!payload.checkpoint_data) return null;
  return {
    checkpointData: payload.checkpoint_data as Record<string, unknown>,
    humanResponse: (payload.human_response as string) ?? "",
    phase: (payload.checkpoint_phase as string) ?? "unknown",
    resumePrompt: (payload.resume_prompt as string) ?? "",
  };
}
