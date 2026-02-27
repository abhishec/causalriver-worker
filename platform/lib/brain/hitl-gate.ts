/**
 * Human-in-the-Loop (HITL) Gate
 * ==============================
 * Configurable per-org approval gates that pause agent execution until
 * a human approves or rejects the proposed action.
 *
 * Usage:
 *   const { blocked, approvalId } = await checkHitlGate(supabase, {
 *     orgId, gateType: 'overnight_agent', summary: '...', details: {...}
 *   });
 *   if (blocked) return Response.json({ status: 'pending_approval', approvalId }, { status: 202 });
 *
 * Config is stored in ai_memory with domain='brain-config', memory_type='hitl-config'.
 * EU AI Act Article 14 — human oversight is opt-OUT for high-risk operations.
 * HITL is enabled by default; organizations must explicitly disable it.
 */

import { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/lib/logger";
import { logDecision } from "@/lib/brain/decision-log";

// ── Types ───────────────────────────────────────────────────────────────────

export type GateType =
  | "high_confidence_action"
  | "overnight_agent"
  | "low_confidence"
  | "policy_override";

export type HitlGateConfig = {
  /** Master switch — true by default (opt-out, EU AI Act Article 14). */
  enabled: boolean;
  /** Which gate types are active for this org. */
  gateTypes: GateType[];
  /**
   * Confidence threshold for the 'low_confidence' gate.
   * Gate fires when agent confidence < this value.
   * Default: 0.4
   */
  confidenceThreshold?: number;
};

export type HitlApprovalStatus = "pending" | "approved" | "rejected" | "expired";

export type HitlApproval = {
  id: string;
  organization_id: string;
  job_id: string | null;
  gate_type: GateType;
  summary: string;
  details: Record<string, unknown>;
  status: HitlApprovalStatus;
  requested_at: string;
  resolved_at: string | null;
  resolved_by: string | null;
  resolution_note: string | null;
  expires_at: string;
};

// ── Defaults ─────────────────────────────────────────────────────────────────

/**
 * Default gate configuration.
 * EU AI Act Article 14 — human oversight is opt-OUT for high-risk operations.
 * HITL is enabled by default. Only overnight_agent and high_confidence_action
 * are gated by default — low_confidence and policy_override are off to avoid
 * excessive noise on lower-stakes operations.
 */
const DEFAULT_HITL_CONFIG: HitlGateConfig = {
  enabled: true,
  gateTypes: ["overnight_agent", "high_confidence_action"],
  confidenceThreshold: 0.4,
};

// ── Config loader ────────────────────────────────────────────────────────────

/**
 * Load HITL config for the given org from ai_memory.
 * Falls back to DEFAULT_HITL_CONFIG if no config stored or parse fails.
 */
export async function getOrgHitlConfig(
  supabase: SupabaseClient,
  orgId: string
): Promise<HitlGateConfig> {
  try {
    const { data } = await supabase
      .from("ai_memory")
      .select("content")
      .eq("organization_id", orgId)
      .eq("domain", "brain-config")
      .eq("memory_type", "hitl-config")
      .maybeSingle();

    if (data?.content) {
      const parsed = JSON.parse(data.content) as Partial<HitlGateConfig>;
      return { ...DEFAULT_HITL_CONFIG, ...parsed };
    }
  } catch (err) {
    logger.warn("[HITL] Failed to load org HITL config, using defaults", {
      orgId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
  return DEFAULT_HITL_CONFIG;
}

// ── Gate check ───────────────────────────────────────────────────────────────

/**
 * Check whether an HITL gate should block the current action.
 *
 * Returns `{ blocked: false }` when:
 *  - HITL is disabled for the org
 *  - The gate type is not in the org's active gate list
 *  - A 'low_confidence' gate, but agent confidence is above the threshold
 *
 * Returns `{ blocked: true, approvalId }` when the gate fires. An approval
 * record is created in hitl_approvals and the caller should return a 202
 * "pending_approval" response to the client.
 */
export async function checkHitlGate(
  supabase: SupabaseClient,
  params: {
    orgId: string;
    gateType: GateType;
    jobId?: string;
    summary: string;
    details?: Record<string, unknown>;
    confidence?: number;
  }
): Promise<{ blocked: boolean; approvalId?: string }> {
  const config = await getOrgHitlConfig(supabase, params.orgId);

  // Master switch
  if (!config.enabled) {
    return { blocked: false };
  }

  // Gate type not active for this org
  if (!config.gateTypes.includes(params.gateType)) {
    return { blocked: false };
  }

  // 'low_confidence' gate: only fires when confidence is below threshold
  if (params.gateType === "low_confidence" && params.confidence !== undefined) {
    const threshold = config.confidenceThreshold ?? DEFAULT_HITL_CONFIG.confidenceThreshold ?? 0.4;
    if (params.confidence >= threshold) {
      return { blocked: false };
    }
  }

  // Gate fires — create approval record
  const { data, error } = await supabase
    .from("hitl_approvals")
    .insert({
      organization_id: params.orgId,
      job_id: params.jobId ?? null,
      gate_type: params.gateType,
      summary: params.summary,
      details: params.details ?? {},
      status: "pending",
    })
    .select("id")
    .single();

  if (error || !data) {
    // If we can't create the approval record, fail open (don't block the agent)
    // to avoid deadlocking the system when the DB has transient issues.
    logger.warn("[HITL] Failed to create approval record — failing open", {
      orgId: params.orgId,
      gateType: params.gateType,
      error: error?.message,
    });
    return { blocked: false };
  }

  logger.warn("[HITL] Gate triggered — awaiting human approval", {
    orgId: params.orgId,
    gateType: params.gateType,
    approvalId: data.id,
    jobId: params.jobId,
  });

  void logDecision(supabase, {
    organizationId: params.orgId,
    decisionType: "hitl_override",
    inputContext: { gateType: params.gateType, summary: params.summary, jobId: params.jobId },
    decisionMade: { blocked: true, approvalId: data.id },
    rationale: `HITL gate triggered: ${params.gateType}`,
    jobId: params.jobId,
  });

  return { blocked: true, approvalId: data.id };
}

// ── Approval resolution ──────────────────────────────────────────────────────

/**
 * Approve or reject a pending HITL approval.
 * If approved and the approval has a job_id, the agent_queue job is set back
 * to 'pending' so the cron worker picks it up on the next cycle.
 *
 * Returns the updated approval record or null on error.
 */
export async function resolveHitlApproval(
  supabase: SupabaseClient,
  params: {
    approvalId: string;
    orgId: string;
    resolvedBy: string;
    action: "approve" | "reject";
    note?: string;
  }
): Promise<HitlApproval | null> {
  const newStatus: HitlApprovalStatus =
    params.action === "approve" ? "approved" : "rejected";

  const { data: approval, error } = await supabase
    .from("hitl_approvals")
    .update({
      status: newStatus,
      resolved_at: new Date().toISOString(),
      resolved_by: params.resolvedBy,
      resolution_note: params.note ?? null,
    })
    .eq("id", params.approvalId)
    .eq("organization_id", params.orgId)
    .eq("status", "pending") // only update if still pending
    .select()
    .single();

  if (error || !approval) {
    logger.warn("[HITL] Failed to resolve approval", {
      approvalId: params.approvalId,
      orgId: params.orgId,
      error: error?.message,
    });
    return null;
  }

  void logDecision(supabase, {
    organizationId: params.orgId,
    decisionType: "hitl_override",
    inputContext: { approvalId: params.approvalId, action: params.action },
    decisionMade: { resolved: true, action: params.action, resolvedBy: params.resolvedBy },
    rationale: params.note ?? `HITL ${params.action}`,
    userId: params.resolvedBy,
  });

  // If approved and there's a blocked job → resume it
  if (params.action === "approve" && approval.job_id) {
    const { error: jobErr } = await supabase
      .from("agent_queue")
      .update({ status: "pending" })
      .eq("id", approval.job_id)
      .eq("organization_id", params.orgId)
      .eq("status", "blocked");

    if (jobErr) {
      logger.warn("[HITL] Approval granted but failed to unblock job", {
        approvalId: params.approvalId,
        jobId: approval.job_id,
        error: jobErr.message,
      });
    } else {
      logger.warn("[HITL] Job unblocked after approval", {
        approvalId: params.approvalId,
        jobId: approval.job_id,
      });
    }
  }

  return approval as HitlApproval;
}
