import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/lib/logger";

export interface CheckpointState {
  phase: string;                           // e.g. "evidence_gathering", "risk_assessment"
  entityIds: string[];                     // customer IDs, engagement IDs being analyzed
  partialResults: Record<string, unknown>; // findings so far
  escalationQuestion: string;              // the specific question needing human judgment
  resumeInstruction: string;               // tell next Lambda: "Continue analysis from phase X with human response Y"
  metadata?: Record<string, unknown>;
}

/**
 * Pause an agent job at a decision gate.
 * Saves full investigation state to checkpoint columns and marks status as
 * awaiting_approval. This is NOT terminal — the continuation job is created
 * by resume_agent_job() when the human responds.
 */
export async function pauseJobAtDecisionGate(
  supabase: SupabaseClient,
  jobId: string,
  orgId: string,
  checkpoint: CheckpointState
): Promise<void> {
  try {
    const { error } = await supabase
      .from("agent_queue")
      .update({
        status: "awaiting_approval",
        checkpoint_data: checkpoint.partialResults,
        checkpoint_phase: checkpoint.phase,
        resume_prompt: checkpoint.resumeInstruction,
        escalation_question: checkpoint.escalationQuestion,
        escalation_sent_at: new Date().toISOString(),
      })
      .eq("id", jobId)
      .eq("organization_id", orgId);

    if (error) {
      logger.error("Failed to save checkpoint to agent_queue", { jobId, error });
      return;
    }

    logger.warn("Agent paused at decision gate", {
      jobId,
      phase: checkpoint.phase,
      question: checkpoint.escalationQuestion.slice(0, 100),
    });
  } catch (err) {
    logger.error("pauseJobAtDecisionGate threw unexpectedly", { jobId, err });
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
