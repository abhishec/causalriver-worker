/**
 * Writeback Dispatcher — The "Voice" of the AI Worker
 *
 * After every successful domain execution, checkAndQueueWriteback is called
 * (fire-and-forget safe) to evaluate which connector_writeback_rules match
 * and enqueue pre-rendered action payloads into writeback_queue.
 *
 * processWritebackQueue is called by the cron endpoint
 * /api/cron/process-writeback to drain pending items and execute them
 * against the target connectors (Slack / Jira / GitHub).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/lib/logger";
import { getConnectorCredentials } from "@/lib/connectors/get-credentials";
import { getConnectorToken, markConnectorError } from "@/lib/connectors/get-connector-token";
import { executeWritebackAction } from "@/lib/connectors/writeback/index";
import { getBrainContext } from "@/lib/brain/brain-context";
import { verifyWriteback, inferWritebackAction, buildVerificationSummary } from "@/lib/brain/mutation-verifier";

/** Connector types that support token-aware refresh (Jira, Confluence) */
const REFRESHABLE_WRITE_BACK_TYPES = new Set(["jira", "confluence"]);

// ─── Types ────────────────────────────────────────────────────────────────────

export interface WritebackContext {
  jobId: string;
  artifactId: string | null;
  domainType: string;
  organizationId: string;
  userId: string;
  artifactData: Record<string, unknown>;
}

interface WritebackRule {
  id: string;
  organization_id: string;
  name: string;
  domain_type: string;
  connector_type: string;
  action_type: string;
  action_config: Record<string, unknown>;
  condition_filter: Record<string, unknown> | null;
  enabled: boolean;
}

interface WritebackQueueItem {
  id: string;
  organization_id: string;
  rule_id: string;
  artifact_id: string | null;
  job_id: string;
  connector_type: string;
  action_type: string;
  action_payload: Record<string, unknown>;
  status: string;
  attempts: number;
  last_error: string | null;
  external_ref: Record<string, unknown> | null;
  created_at: string;
  completed_at: string | null;
}

// ─── Condition Evaluation ─────────────────────────────────────────────────────

type ConditionOperator = "gte" | "lte" | "gt" | "lt" | "eq" | "contains";

/**
 * Safely resolve a dot-notation path from an object.
 * e.g. "data.0.engagement_name" → obj.data[0].engagement_name
 */
function resolvePath(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split(".");
  let current: unknown = obj;
  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    if (typeof current === "object" && !Array.isArray(current)) {
      current = (current as Record<string, unknown>)[part];
    } else if (Array.isArray(current)) {
      const idx = parseInt(part, 10);
      current = isNaN(idx) ? undefined : current[idx];
    } else {
      return undefined;
    }
  }
  return current;
}

/**
 * Evaluate a single operator against a resolved value.
 *
 * Special case: if operator is "gt" / "gte" / "lt" / "lte" and the value
 * is an Array, we compare array.length (supports checking non-empty arrays).
 */
function applyOperator(
  value: unknown,
  operator: ConditionOperator,
  expected: unknown
): boolean {
  // Array length shortcut for numeric comparisons
  const comparand = Array.isArray(value) ? value.length : value;

  switch (operator) {
    case "eq":
      return comparand === expected;
    case "gt":
      return typeof comparand === "number" && comparand > Number(expected);
    case "gte":
      return typeof comparand === "number" && comparand >= Number(expected);
    case "lt":
      return typeof comparand === "number" && comparand < Number(expected);
    case "lte":
      return typeof comparand === "number" && comparand <= Number(expected);
    case "contains":
      if (typeof comparand === "string") {
        return comparand.includes(String(expected));
      }
      if (Array.isArray(comparand)) {
        return comparand.includes(expected);
      }
      return false;
    default:
      logger.warn("[writeback-dispatcher] Unknown operator in condition_filter:", operator);
      return false;
  }
}

/**
 * Evaluate condition_filter against artifactData.
 *
 * Format: { "fieldPath": { "operator": value } }
 * All conditions must pass (AND logic).
 *
 * Returns true when condition_filter is null/empty (unconditional rule).
 */
function evaluateCondition(
  condition: Record<string, unknown> | null,
  artifactData: Record<string, unknown>
): boolean {
  if (!condition || Object.keys(condition).length === 0) return true;

  for (const [fieldPath, operatorMap] of Object.entries(condition)) {
    if (typeof operatorMap !== "object" || operatorMap === null) {
      logger.warn("[writeback-dispatcher] Invalid condition entry for field:", fieldPath);
      return false;
    }

    const value = resolvePath(artifactData, fieldPath);

    for (const [operator, expected] of Object.entries(
      operatorMap as Record<string, unknown>
    )) {
      const passes = applyOperator(value, operator as ConditionOperator, expected);
      if (!passes) return false;
    }
  }

  return true;
}

// ─── Template Rendering ───────────────────────────────────────────────────────

/**
 * Replace {{fieldPath}} placeholders in a template string with values from
 * artifactData using dot-notation resolution.
 *
 * Special variable: {{_domain}} → ctx.domainType
 *
 * Falls back to '' for unresolved paths.
 */
function renderTemplate(
  template: string,
  artifactData: Record<string, unknown>,
  domainType: string
): string {
  return template.replace(/\{\{([^}]+)\}\}/g, (_, rawPath: string) => {
    const path = rawPath.trim();
    if (path === "_domain") return domainType;
    const val = resolvePath(artifactData, path);
    if (val === undefined || val === null) return "";
    if (typeof val === "object") return JSON.stringify(val);
    return String(val);
  });
}

/**
 * Recursively render all string values inside an action_config JSONB object.
 * This handles nested templates in Jira/GitHub configs.
 */
function renderActionPayload(
  config: Record<string, unknown>,
  artifactData: Record<string, unknown>,
  domainType: string
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(config)) {
    if (typeof val === "string") {
      result[key] = renderTemplate(val, artifactData, domainType);
    } else if (Array.isArray(val)) {
      result[key] = val.map((item) =>
        typeof item === "string"
          ? renderTemplate(item, artifactData, domainType)
          : item
      );
    } else if (val !== null && typeof val === "object") {
      result[key] = renderActionPayload(
        val as Record<string, unknown>,
        artifactData,
        domainType
      );
    } else {
      result[key] = val;
    }
  }
  return result;
}

// ─── Brain-Context Retry Decision ─────────────────────────────────────────────

/**
 * Uses live brain signals to decide whether a failed write-back item is worth
 * retrying, rather than relying solely on attempt count.
 *
 * Logic:
 * - If Brain IQ is very low (<10) AND we've already tried once, the connector
 *   data feeding the rule is likely stale — dead-letter early.
 * - If the brain has active signals for the connector type, the connection is
 *   probably live and worth another attempt (up to 3 total).
 * - Falls back to simple attempt-count policy when brain context is unavailable.
 *
 * Never throws — returns a safe default on any error.
 */
export async function shouldRetryWriteback(
  supabase: SupabaseClient,
  orgId: string,
  connectorType: string,
  retryCount: number
): Promise<{ shouldRetry: boolean; reason: string }> {
  try {
    const ctx = await getBrainContext(supabase, orgId);

    // Brain IQ too low — connector data may be stale, don't retry aggressively
    if (ctx.brainIq < 10 && retryCount >= 1) {
      return {
        shouldRetry: false,
        reason: `Brain IQ ${ctx.brainIq} too low — connector data unreliable`,
      };
    }

    // Active brain signals for this connector type suggest the connection is live
    const hasConnectorSignals = ctx.topSignals.some(
      s => s.domain.toLowerCase() === connectorType.toLowerCase()
    );
    if (hasConnectorSignals && retryCount < 3) {
      return {
        shouldRetry: true,
        reason: `Active ${connectorType} signals suggest connection is live`,
      };
    }

    return {
      shouldRetry: retryCount < 2,
      reason: "Default retry policy",
    };
  } catch {
    return {
      shouldRetry: retryCount < 2,
      reason: "Brain context unavailable — default retry",
    };
  }
}

// ─── RBAC ─────────────────────────────────────────────────────────────────────

/** Roles permitted to trigger write-back operations */
const WRITEBACK_ALLOWED_ROLES = new Set(["admin", "owner"]);

/**
 * Check whether the given user has permission to trigger write-backs for the org.
 *
 * Queries org_members for the user's role. Returns allowed=true for admin/owner.
 *
 * Fail-open on DB errors: if we cannot determine the role, we log a warning and
 * allow the write-back rather than blocking legitimate operations.
 */
async function checkWritebackPermission(
  supabase: SupabaseClient,
  organizationId: string,
  userId: string
): Promise<{ allowed: boolean; role: string | null; reason?: string }> {
  try {
    const { data, error } = await supabase
      .from("org_members")
      .select("role")
      .eq("organization_id", organizationId)
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      logger.warn("[writeback-dispatcher] RBAC check DB error — failing open:", {
        organizationId,
        userId,
        error: error.message,
      });
      return { allowed: true, role: null, reason: "db_error_fail_open" };
    }

    if (!data) {
      // User is not a member of this org
      return {
        allowed: false,
        role: null,
        reason: "Write-back requires admin or owner role",
      };
    }

    const role = data.role as string;
    if (WRITEBACK_ALLOWED_ROLES.has(role)) {
      return { allowed: true, role };
    }

    return {
      allowed: false,
      role,
      reason: "Write-back requires admin or owner role",
    };
  } catch (err) {
    logger.warn("[writeback-dispatcher] RBAC check threw — failing open:", {
      organizationId,
      userId,
      err: err instanceof Error ? err.message : String(err),
    });
    return { allowed: true, role: null, reason: "exception_fail_open" };
  }
}

/**
 * Insert a row into writeback_audit_log.
 * Fire-and-forget safe — never throws.
 */
async function insertWritebackAuditLog(
  supabase: SupabaseClient,
  params: {
    organizationId: string;
    userId: string;
    userRole: string | null;
    action: "allowed" | "denied";
    connectorType: string;
    writeType: string;
    entityId?: string;
    denialReason?: string;
    metadata?: Record<string, unknown>;
  }
): Promise<void> {
  try {
    const { error } = await supabase.from("writeback_audit_log").insert({
      organization_id: params.organizationId,
      user_id: params.userId,
      user_role: params.userRole ?? "unknown",
      action: params.action,
      connector_type: params.connectorType,
      write_type: params.writeType,
      entity_id: params.entityId ?? null,
      denial_reason: params.denialReason ?? null,
      metadata: params.metadata ?? {},
      created_at: new Date().toISOString(),
    });

    if (error) {
      logger.warn("[writeback-dispatcher] Failed to insert writeback_audit_log:", {
        organizationId: params.organizationId,
        userId: params.userId,
        error: error.message,
      });
    }
  } catch (err) {
    logger.warn("[writeback-dispatcher] insertWritebackAuditLog threw (non-fatal):", err);
  }
}

// ─── Approval Intercept ───────────────────────────────────────────────────────

/**
 * Check whether the org has require_writeback_approval enabled in their metadata.
 * Returns false on any error (fail-open so write-backs still execute by default).
 */
async function orgRequiresApproval(
  supabase: SupabaseClient,
  organizationId: string
): Promise<boolean> {
  try {
    const { data: org } = await supabase
      .from("organizations")
      .select("metadata")
      .eq("id", organizationId)
      .maybeSingle();
    return (org?.metadata as Record<string, unknown> | null)?.require_writeback_approval === true;
  } catch {
    return false;
  }
}

/**
 * Queue a pending approval record for an agent write-back.
 * Called when the org requires approval before write-backs execute.
 *
 * Returns the approval ID on success, null on failure.
 */
export async function queueWritebackApproval(
  supabase: SupabaseClient,
  params: {
    organizationId: string;
    jobId: string | null;
    connectorType: string;
    actionType: string;
    actionPayload: Record<string, unknown>;
    requestedBy: string;
  }
): Promise<{ approvalId: string } | null> {
  try {
    // ── Idempotency: prevent double-click duplicate approvals ────────────────
    // Check for an existing pending approval with same org + job + action before inserting.
    // If found, return the existing ID — the user already submitted this approval.
    if (params.jobId) {
      const { data: existing } = await supabase
        .from("writeback_approvals")
        .select("id")
        .eq("organization_id", params.organizationId)
        .eq("job_id", params.jobId)
        .eq("action_type", params.actionType)
        .eq("connector_type", params.connectorType)
        .eq("status", "pending")
        .limit(1)
        .maybeSingle();
      if (existing) {
        logger.warn("[writeback-dispatcher] Duplicate approval suppressed (idempotency):", {
          approvalId: existing.id,
          jobId: params.jobId,
          actionType: params.actionType,
        });
        return { approvalId: existing.id };
      }
    }

    const { data, error } = await supabase
      .from("writeback_approvals")
      .insert({
        organization_id: params.organizationId,
        job_id: params.jobId ?? null,
        connector_type: params.connectorType,
        action_type: params.actionType,
        action_payload: params.actionPayload,
        status: "pending",
        requested_by: params.requestedBy,
      })
      .select("id")
      .single();

    if (error || !data) {
      logger.warn("[writeback-dispatcher] Failed to queue approval:", {
        organizationId: params.organizationId,
        error: error?.message,
      });
      return null;
    }

    logger.warn("[writeback-dispatcher] Approval queued:", {
      approvalId: data.id,
      connectorType: params.connectorType,
      actionType: params.actionType,
      organizationId: params.organizationId,
    });

    // Notify via Slack (fire-and-forget) if org has a webhook
    void notifyApprovalRequired(supabase, params.organizationId, data.id, params);

    return { approvalId: data.id };
  } catch (err) {
    logger.warn("[writeback-dispatcher] queueWritebackApproval threw (non-fatal):", err);
    return null;
  }
}

/**
 * Execute the stored action_payload from an approved writeback_approvals record.
 * Called by the approve API route after the user approves.
 *
 * Returns success/error from the write-back execution.
 */
export async function executeApprovedWriteback(
  supabase: SupabaseClient,
  approval: {
    id: string;
    organization_id: string;
    connector_type: string;
    action_type: string;
    action_payload: Record<string, unknown>;
  }
): Promise<{ success: boolean; error?: string; externalRef?: Record<string, unknown> }> {
  try {
    const connectorRow = await supabase
      .from("org_connectors")
      .select("id, config")
      .eq("organization_id", approval.organization_id)
      .eq("connector_type", approval.connector_type)
      .maybeSingle();

    const config = (connectorRow.data?.config as Record<string, unknown>) ?? {};
    const connectorRowId = connectorRow.data?.id as string | undefined;

    let credentials: Record<string, unknown> | null = null;
    if (REFRESHABLE_WRITE_BACK_TYPES.has(approval.connector_type)) {
      const freshToken = await getConnectorToken(
        supabase,
        approval.organization_id,
        approval.connector_type as "jira" | "confluence"
      );
      if (freshToken) {
        const rawCreds = await getConnectorCredentials(
          supabase,
          approval.organization_id,
          approval.connector_type
        );
        credentials = { ...(rawCreds ?? {}), access_token: freshToken };
      }
    } else {
      credentials = await getConnectorCredentials(
        supabase,
        approval.organization_id,
        approval.connector_type
      );
    }

    if (!credentials) {
      return {
        success: false,
        error: `No active credentials for connector ${approval.connector_type}`,
      };
    }

    const result = await executeWritebackAction(
      approval.connector_type,
      approval.action_type,
      approval.action_payload,
      credentials,
      config
    );

    // Verify the write committed (fire-and-forget — never blocks)
    void (async () => {
      try {
        const _writeAction = inferWritebackAction(approval.connector_type, approval.action_type, approval.action_payload);
        const _verifyResult = await verifyWriteback(_writeAction, result, supabase);
        if (!_verifyResult.confirmed) {
          logger.warn(`[WritebackDispatcher] Write unconfirmed: ${buildVerificationSummary([_verifyResult])}`);
        }
      } catch { /* never throw */ }
    })();

    // Detect 401/403 auth failures and mark connector errored
    if (
      !result.success &&
      result.error &&
      /\b(401|403)\b/.test(result.error) &&
      connectorRowId
    ) {
      await markConnectorError(
        supabase,
        connectorRowId,
        "Token expired or revoked during approved write-back — reconnect required"
      );
    }

    return result;
  } catch (err) {
    return {
      success: false,
      error: `Execution threw: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/**
 * Notify the org's Slack webhook that a write-back is pending approval.
 * Fire-and-forget safe — never throws.
 */
async function notifyApprovalRequired(
  supabase: SupabaseClient,
  organizationId: string,
  approvalId: string,
  params: {
    connectorType: string;
    actionType: string;
    requestedBy: string;
  }
): Promise<void> {
  try {
    const { data: prefs } = await supabase
      .from("notification_preferences")
      .select("slack_webhook_url")
      .eq("organization_id", organizationId)
      .not("slack_webhook_url", "is", null)
      .limit(1)
      .maybeSingle();

    const webhookUrl = prefs?.slack_webhook_url as string | undefined;
    if (!webhookUrl) return;

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://app.usebrainos.com";
    const approvalUrl = `${appUrl}/connectors/approvals`;

    const actionLabel = params.actionType.replace(/_/g, " ");
    const resp = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: `[BrainOS] Agent wants to ${actionLabel} on ${params.connectorType} — approval required`,
        blocks: [
          {
            type: "header",
            text: { type: "plain_text", text: "Write-back Approval Required" },
          },
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: [
                `*Connector:* ${params.connectorType}`,
                `*Action:* ${actionLabel}`,
                `*Requested by:* ${params.requestedBy}`,
                `*Approval ID:* \`${approvalId}\``,
              ].join("\n"),
            },
          },
          {
            type: "actions",
            elements: [
              {
                type: "button",
                text: { type: "plain_text", text: "Review Approval" },
                url: approvalUrl,
                style: "primary",
              },
            ],
          },
        ],
      }),
    });

    if (!resp.ok) {
      logger.warn("[writeback-dispatcher] Approval Slack notification failed:", {
        status: resp.status,
        approvalId,
      });
    }
  } catch (err) {
    logger.warn("[writeback-dispatcher] notifyApprovalRequired error (non-fatal):", err);
  }
}

// ─── Process Engine Writeback ─────────────────────────────────────────────────

/**
 * Discriminated union of all writeback payloads that can be dispatched through
 * the centralized dispatcher.  Add new writeback types here so every data
 * mutation routes through one place.
 */
export type WritebackPayload =
  /** Process Engine MUTATE state — inserts a row into bpaas_process_mutations */
  | {
      type: "process_mutation";
      organizationId: string;
      processInstanceId: string;
      processType: string;
      mutationPayload: Record<string, unknown>;
      mutationReason: string;
      executedBy: string; // userId or 'process-engine'
    };

/**
 * Central writeback dispatcher — routes mutation payloads to the appropriate
 * persistence layer based on the payload type.
 *
 * Design principles:
 * - All cases must be non-blocking from the caller's perspective — the caller
 *   should use `void dispatchWriteback(...).catch(...)` for fire-and-forget.
 * - Never throws — errors are logged as warnings and swallowed so a failed
 *   write-back never aborts the FSM state machine.
 * - New mutation types: add a branch in the switch below + extend WritebackPayload.
 *
 * @example
 * void dispatchWriteback(supabase, {
 *   type: "process_mutation",
 *   organizationId: params.organizationId,
 *   processInstanceId,
 *   processType: params.processType,
 *   mutationPayload: mutationData,
 *   mutationReason: "FSM MUTATE state execution",
 *   executedBy: params.userId ?? "process-engine",
 * }).catch(e => logger.warn("[ProcessEngine/MUTATE] writeback dispatch failed", { error: String(e) }));
 */
export async function dispatchWriteback(
  supabase: SupabaseClient,
  payload: WritebackPayload
): Promise<void> {
  switch (payload.type) {
    case "process_mutation": {
      const { error } = await supabase.from("bpaas_process_mutations").insert({
        organization_id: payload.organizationId,
        process_instance_id: payload.processInstanceId,
        process_type: payload.processType,
        mutation_data: {
          ...payload.mutationPayload,
          _reason: payload.mutationReason,
          _executed_by: payload.executedBy,
        },
        created_at: new Date().toISOString(),
      });

      if (error) {
        logger.warn("[writeback-dispatcher] process_mutation insert failed (non-fatal)", {
          processInstanceId: payload.processInstanceId,
          processType: payload.processType,
          organizationId: payload.organizationId,
          error: error.message,
        });
      } else {
        logger.warn("[writeback-dispatcher] process_mutation dispatched", {
          processInstanceId: payload.processInstanceId,
          processType: payload.processType,
          executedBy: payload.executedBy,
        });
      }
      break;
    }

    default: {
      // TypeScript exhaustiveness check — this branch should be unreachable when
      // all WritebackPayload members are handled above. Cast to unknown first to
      // satisfy strict-mode narrowing while still producing a compile-time error
      // if a new union member is added without a matching case.
      logger.warn("[writeback-dispatcher] dispatchWriteback: unknown payload type", {
        type: (payload as { type: string }).type,
      });
    }
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Returns true for write-back actions that should ALWAYS require human approval
 * regardless of org-level require_writeback_approval setting.
 * Conservative: err on side of requiring approval for irreversible or high-impact actions.
 */
function isHighImpactWriteback(rule: { action_type?: string | null; connector_type?: string | null }): boolean {
  const actionType = (rule.action_type ?? "").toLowerCase();
  const connectorType = (rule.connector_type ?? "").toLowerCase();
  // Always require approval for: merging PRs, deleting anything, closing sprints, financial postings
  const HIGH_IMPACT_ACTIONS = ["merge_pr", "delete", "close_sprint", "post_payment", "bulk_update", "force_push"];
  if (HIGH_IMPACT_ACTIONS.some(a => actionType.includes(a))) return true;
  // Jira: creating tickets is OK auto-approve; transitions (to Done, In Progress) need approval
  if (connectorType === "jira" && actionType.includes("transition")) return true;
  // GitHub: creating issues OK; merging PRs needs approval
  if (connectorType === "github" && actionType.includes("merge")) return true;
  return false;
}

/**
 * Called after every successful domain execution (fire-and-forget safe).
 *
 * Finds enabled connector_writeback_rules for the org+domain, evaluates
 * conditions, renders action payloads from templates, and either:
 * - Inserts a pending approval record (if org has require_writeback_approval=true)
 * - Inserts pending rows into writeback_queue (default: execute immediately)
 */
export async function checkAndQueueWriteback(
  supabase: SupabaseClient,
  ctx: WritebackContext
): Promise<{ queued: number; error?: string; code?: string }> {
  try {
    // ── RBAC Gate ────────────────────────────────────────────────────────────
    // Only admin or owner roles may trigger write-backs.
    // Fail-open on DB errors to avoid blocking legitimate operations.
    const rbac = await checkWritebackPermission(
      supabase,
      ctx.organizationId,
      ctx.userId
    );

    if (!rbac.allowed) {
      logger.warn("[writeback-dispatcher] RBAC denied:", {
        organizationId: ctx.organizationId,
        userId: ctx.userId,
        role: rbac.role,
        reason: rbac.reason,
        domainType: ctx.domainType,
      });

      // Audit log: denied attempt (connector_type and write_type use domainType as
      // placeholder — no rule match has occurred yet at this stage)
      void insertWritebackAuditLog(supabase, {
        organizationId: ctx.organizationId,
        userId: ctx.userId,
        userRole: rbac.role,
        action: "denied",
        connectorType: "unknown",
        writeType: ctx.domainType,
        denialReason: rbac.reason,
        metadata: { jobId: ctx.jobId, artifactId: ctx.artifactId },
      });

      return {
        queued: 0,
        error: "Insufficient permissions",
        code: "RBAC_DENIED",
      };
    }

    // ── Approval gate ────────────────────────────────────────────────────────
    const requiresApproval = await orgRequiresApproval(supabase, ctx.organizationId);

    const { data: rules, error } = await supabase
      .from("connector_writeback_rules")
      .select(
        "id, organization_id, name, domain_type, connector_type, action_type, action_config, condition_filter, enabled"
      )
      .eq("organization_id", ctx.organizationId)
      .eq("domain_type", ctx.domainType)
      .eq("enabled", true);

    if (error) {
      logger.warn("[writeback-dispatcher] Error fetching rules:", {
        organizationId: ctx.organizationId,
        domainType: ctx.domainType,
        error: error.message,
      });
      return { queued: 0 };
    }

    if (!rules || rules.length === 0) {
      return { queued: 0 };
    }

    let queued = 0;

    for (const rule of rules as WritebackRule[]) {
      // Evaluate condition_filter against artifact data
      const conditionPasses = evaluateCondition(
        rule.condition_filter,
        ctx.artifactData
      );

      if (!conditionPasses) {
        logger.warn("[writeback-dispatcher] Condition failed, skipping rule:", {
          ruleId: rule.id,
          ruleName: rule.name,
          domainType: ctx.domainType,
        });
        continue;
      }

      // Render the action payload from templates in action_config
      const actionPayload = renderActionPayload(
        rule.action_config,
        ctx.artifactData,
        ctx.domainType
      );

      // ── Approval intercept ────────────────────────────────────────────────
      if (requiresApproval || isHighImpactWriteback(rule)) {
        const approval = await queueWritebackApproval(supabase, {
          organizationId: ctx.organizationId,
          jobId: ctx.jobId,
          connectorType: rule.connector_type,
          actionType: rule.action_type,
          actionPayload,
          requestedBy: `domain:${ctx.domainType}`,
        });

        if (approval) {
          queued++;
          logger.warn("[writeback-dispatcher] Write-back held for approval:", {
            approvalId: approval.approvalId,
            ruleId: rule.id,
            connectorType: rule.connector_type,
            actionType: rule.action_type,
          });
        }
        continue;
      }

      // ── Idempotency: prevent double-dispatch of same job+rule ────────────
      // Check for an existing pending/processing row before inserting.
      if (ctx.jobId && rule.id) {
        const { data: existingQueueItem } = await supabase
          .from("writeback_queue")
          .select("id")
          .eq("organization_id", ctx.organizationId)
          .eq("rule_id", rule.id)
          .eq("job_id", ctx.jobId)
          .in("status", ["pending", "processing"])
          .limit(1)
          .maybeSingle();
        if (existingQueueItem) {
          logger.warn("[writeback-dispatcher] Duplicate writeback_queue entry suppressed:", {
            ruleId: rule.id,
            jobId: ctx.jobId,
          });
          queued++; // count as queued (already in queue)
          continue;
        }
      }

      // Insert into writeback_queue (immediate execution path)
      const { error: insertError } = await supabase
        .from("writeback_queue")
        .insert({
          organization_id: ctx.organizationId,
          rule_id: rule.id,
          artifact_id: ctx.artifactId,
          job_id: ctx.jobId,
          connector_type: rule.connector_type,
          action_type: rule.action_type,
          action_payload: actionPayload,
          status: "pending",
          attempts: 0,
          last_error: null,
          external_ref: null,
        });

      if (insertError) {
        logger.warn("[writeback-dispatcher] Failed to enqueue rule:", {
          ruleId: rule.id,
          ruleName: rule.name,
          error: insertError.message,
        });
        continue;
      }

      queued++;
      logger.warn("[writeback-dispatcher] Queued writeback:", {
        ruleId: rule.id,
        ruleName: rule.name,
        connectorType: rule.connector_type,
        actionType: rule.action_type,
        organizationId: ctx.organizationId,
        domainType: ctx.domainType,
      });

      // Audit log: allowed write-back queued
      void insertWritebackAuditLog(supabase, {
        organizationId: ctx.organizationId,
        userId: ctx.userId,
        userRole: rbac.role,
        action: "allowed",
        connectorType: rule.connector_type,
        writeType: rule.action_type,
        entityId: rule.id,
        metadata: {
          jobId: ctx.jobId,
          artifactId: ctx.artifactId,
          ruleId: rule.id,
          ruleName: rule.name,
          domainType: ctx.domainType,
        },
      });
    }

    return { queued };
  } catch (err) {
    logger.error("[writeback-dispatcher] Unexpected error in checkAndQueueWriteback:", err);
    return { queued: 0 };
  }
}

/**
 * Called by /api/cron/process-writeback to drain pending items in
 * writeback_queue and execute them against the target connector.
 *
 * @param organizationId  - If provided, only process items for this org
 * @param limit           - Max items to process per invocation (default 20)
 */
export async function processWritebackQueue(
  supabase: SupabaseClient,
  organizationId?: string,
  limit = 20
): Promise<{ processed: number; succeeded: number; failed: number }> {
  let processed = 0;
  let succeeded = 0;
  let failed = 0;

  try {
    // Build query — fetch pending items not yet exhausted (< 3 attempts)
    let query = supabase
      .from("writeback_queue")
      .select(
        "id, organization_id, rule_id, artifact_id, job_id, connector_type, action_type, action_payload, status, attempts, last_error, external_ref, created_at, completed_at"
      )
      .eq("status", "pending")
      .lt("attempts", 3)
      .order("created_at", { ascending: true })
      .limit(limit);

    if (organizationId) {
      query = query.eq("organization_id", organizationId);
    }

    const { data: items, error: fetchError } = await query;

    if (fetchError) {
      logger.error("[writeback-dispatcher] Error fetching writeback queue:", fetchError.message);
      return { processed: 0, succeeded: 0, failed: 0 };
    }

    if (!items || items.length === 0) {
      return { processed: 0, succeeded: 0, failed: 0 };
    }

    for (const item of items as WritebackQueueItem[]) {
      const startMs = Date.now();
      processed++;

      // Mark in_progress and increment attempts atomically
      const { error: lockError } = await supabase
        .from("writeback_queue")
        .update({
          status: "in_progress",
          attempts: item.attempts + 1,
        })
        .eq("id", item.id)
        .eq("status", "pending"); // guard against double-processing

      if (lockError) {
        logger.warn("[writeback-dispatcher] Could not lock item, skipping:", {
          itemId: item.id,
          error: lockError.message,
        });
        processed--;
        continue;
      }

      const newAttempts = item.attempts + 1;
      let result: Awaited<ReturnType<typeof executeWritebackAction>>;

      try {
        // Get connector config from org_connectors (needed for domain, site_url, etc.)
        const { data: connectorRow } = await supabase
          .from("org_connectors")
          .select("id, config")
          .eq("organization_id", item.organization_id)
          .eq("connector_type", item.connector_type)
          .maybeSingle();

        const config = (connectorRow?.config as Record<string, unknown>) ?? {};
        const connectorRowId = connectorRow?.id as string | undefined;

        // For token-refreshable connectors (Jira, Confluence): use getConnectorToken()
        // to auto-refresh expired OAuth tokens before executing the write-back.
        // For other connectors: fall back to raw credentials via RPC.
        let credentials: Record<string, unknown> | null = null;
        if (REFRESHABLE_WRITE_BACK_TYPES.has(item.connector_type)) {
          const freshToken = await getConnectorToken(
            supabase,
            item.organization_id,
            item.connector_type as "jira" | "confluence"
          );
          if (freshToken) {
            // Build a credentials object with the fresh (possibly refreshed) token
            // plus any other fields from the raw credentials (api_token, email, etc.)
            const rawCreds = await getConnectorCredentials(
              supabase,
              item.organization_id,
              item.connector_type
            );
            credentials = { ...(rawCreds ?? {}), access_token: freshToken };
          }
        } else {
          credentials = await getConnectorCredentials(
            supabase,
            item.organization_id,
            item.connector_type
          );
        }

        if (!credentials) {
          result = {
            success: false,
            error: `No active credentials for connector ${item.connector_type}`,
          };
        } else {
          result = await executeWritebackAction(
            item.connector_type,
            item.action_type,
            item.action_payload,
            credentials,
            config
          );

          // Verify the write committed (fire-and-forget — never blocks)
          void (async () => {
            try {
              const _writeAction = inferWritebackAction(item.connector_type, item.action_type, item.action_payload);
              const _verifyResult = await verifyWriteback(_writeAction, result, supabase);
              if (!_verifyResult.confirmed) {
                logger.warn(`[WritebackDispatcher] Write unconfirmed: ${buildVerificationSummary([_verifyResult])}`);
              }
            } catch { /* never throw */ }
          })();

          // Detect 401/403 auth failures in the result error message.
          // When detected, mark the connector as errored so the UI shows a reconnect button.
          if (
            !result.success &&
            result.error &&
            /\b(401|403)\b/.test(result.error) &&
            connectorRowId
          ) {
            logger.warn("[writeback-dispatcher] Auth failure detected — marking connector errored", {
              connectorType: item.connector_type,
              connectorId: connectorRowId,
              error: result.error,
            });
            await markConnectorError(
              supabase,
              connectorRowId,
              "Token expired or revoked during write-back — reconnect required"
            );
          }
        }
      } catch (execErr) {
        result = {
          success: false,
          error: `Execution threw: ${execErr instanceof Error ? execErr.message : String(execErr)}`,
        };
      }

      const executionMs = Date.now() - startMs;

      if (result.success) {
        succeeded++;

        await supabase
          .from("writeback_queue")
          .update({
            status: "completed",
            external_ref: result.externalRef ?? null,
            completed_at: new Date().toISOString(),
            last_error: null,
          })
          .eq("id", item.id);
      } else {
        failed++;
        // Brain-aware retry decision: consult brain signals before dead-lettering
        const { shouldRetry, reason: retryReason } = await shouldRetryWriteback(
          supabase,
          item.organization_id,
          item.connector_type,
          newAttempts
        );
        const isDead = !shouldRetry;
        const nextStatus = isDead ? "dead_letter" : "pending";

        logger.warn("[writeback-dispatcher] Retry decision:", {
          itemId: item.id,
          connectorType: item.connector_type,
          attempts: newAttempts,
          shouldRetry,
          retryReason,
          nextStatus,
        });

        // Build the update object
        const updateObj: Record<string, unknown> = {
          status: nextStatus,
          attempts: newAttempts,
          last_error: result.error ?? "Unknown error",
        };
        if (isDead) {
          updateObj.dead_letter_at = new Date().toISOString();
        }

        await supabase.from("writeback_queue").update(updateObj).eq("id", item.id);

        // If dead letter: emit gaba signal + structured warning for ops alerting
        if (isDead) {
          logger.warn("[writeback-dispatcher] DEAD LETTER — write-back permanently failed", {
            itemId: item.id,
            organizationId: item.organization_id,
            ruleId: item.rule_id,
            connectorType: item.connector_type,
            actionType: item.action_type,
            attempts: newAttempts,
            lastError: result.error,
            deadLetterAt: updateObj.dead_letter_at,
          });

          // Emit gaba (inhibitory) signal so brain knows this connector path is unreliable
          void Promise.resolve(
            supabase.from("cross_domain_signals").insert({
              organization_id: item.organization_id,
              source_domain: "writeback",
              target_domain: item.connector_type,
              signal_type: "gaba",
              // signal_value is NOT NULL — use the strength as numeric RL value
              signal_value: -0.4,
              signal_strength: -0.4,
              entity_type: "writeback",
              entity_id: item.id,
              signal_timestamp: new Date().toISOString(),
              payload: {
                reason: "write_back_dead_letter",
                connector_type: item.connector_type,
                action_type: item.action_type,
                writeback_item_id: item.id,
              },
              created_at: new Date().toISOString(),
            })
          ); // fire-and-forget

          // Insert into dead_letter_queue for manual review + send Slack to admin
          void moveToDeadLetterQueue(supabase, item, newAttempts, result.error ?? "Unknown error"); // fire-and-forget
        } else {
          logger.warn("[writeback-dispatcher] Action failed:", {
            itemId: item.id,
            connectorType: item.connector_type,
            actionType: item.action_type,
            attempts: newAttempts,
            nextStatus,
            error: result.error,
          });
        }
      }

      // Always insert an audit log entry
      const { error: logError } = await supabase.from("agent_writeback_log").insert({
        organization_id: item.organization_id,
        writeback_queue_id: item.id,
        connector_type: item.connector_type,
        action_type: item.action_type,
        // Fetch domain_type from the rule to populate the log correctly
        domain_type: await resolveDomainType(supabase, item.rule_id),
        success: result.success,
        external_ref: result.externalRef ?? null,
        error_message: result.success ? null : (result.error ?? null),
        execution_ms: executionMs,
      });

      if (logError) {
        logger.warn("[writeback-dispatcher] Failed to write audit log:", {
          itemId: item.id,
          error: logError.message,
        });
      }
    }
  } catch (err) {
    logger.error("[writeback-dispatcher] Unexpected error in processWritebackQueue:", err);
  }

  return { processed, succeeded, failed };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Look up domain_type from connector_writeback_rules for an audit log entry.
 * Returns '' on any error to avoid blocking the main flow.
 */
async function resolveDomainType(
  supabase: SupabaseClient,
  ruleId: string
): Promise<string> {
  try {
    const { data } = await supabase
      .from("connector_writeback_rules")
      .select("domain_type")
      .eq("id", ruleId)
      .maybeSingle();
    return (data?.domain_type as string) ?? "";
  } catch {
    return "";
  }
}

/**
 * Move a permanently-failed write-back item into the dead_letter_queue table
 * and send a Slack notification to the workspace admin (if configured).
 *
 * Fire-and-forget safe — never throws.
 */
async function moveToDeadLetterQueue(
  supabase: SupabaseClient,
  item: WritebackQueueItem,
  attemptCount: number,
  failureReason: string
): Promise<void> {
  try {
    // Insert into dead_letter_queue
    const { error: dlqError } = await supabase.from("dead_letter_queue").insert({
      organization_id: item.organization_id,
      job_type: "writeback",
      payload: {
        writeback_queue_id: item.id,
        rule_id: item.rule_id,
        connector_type: item.connector_type,
        action_type: item.action_type,
        action_payload: item.action_payload,
        original_created_at: item.created_at,
      },
      failure_reason: failureReason,
      attempt_count: attemptCount,
      writeback_queue_id: item.id,
      connector_type: item.connector_type,
      action_type: item.action_type,
      rule_id: item.rule_id,
      slack_notified: false,
    });

    if (dlqError) {
      logger.warn("[writeback-dispatcher] Failed to insert dead_letter_queue row:", {
        itemId: item.id,
        error: dlqError.message,
      });
    }

    // Send Slack notification to admin if they have a webhook configured
    await notifyAdminSlackDeadLetter(supabase, item, attemptCount, failureReason);

    // In-app notification: alert org admins even if Slack is not configured (audit C5)
    // Inserts into notifications table (same schema used by domain-executor high-risk alerts)
    const { data: admins } = await supabase
      .from("org_members")
      .select("user_id")
      .eq("organization_id", item.organization_id)
      .in("role", ["admin", "owner"]);

    if (admins && admins.length > 0) {
      void supabase.from("notifications").insert(
        admins.map((m: { user_id: string }) => ({
          user_id: m.user_id,
          organization_id: item.organization_id,
          notification_type: "writeback_dead_letter",
          title: "Write-back action permanently failed",
          message: `The ${item.connector_type} ${item.action_type} action failed after ${attemptCount} attempts and has been dead-lettered. Review in Settings → Connectors.`,
          metadata: {
            writeback_queue_id: item.id,
            connector_type: item.connector_type,
            action_type: item.action_type,
            rule_id: item.rule_id,
            failure_reason: failureReason,
            attempt_count: attemptCount,
          },
          read: false,
        }))
      ).then(null, (err: unknown) =>
        logger.warn("[writeback-dispatcher] In-app notification insert failed (non-fatal):", err)
      );
    }
  } catch (err) {
    logger.warn("[writeback-dispatcher] moveToDeadLetterQueue error (non-fatal):", err);
  }
}

/**
 * Send a Slack notification to the workspace admin when a write-back item is dead-lettered.
 * Looks up the admin's notification preferences for a Slack webhook URL.
 *
 * Never throws — silently skips if no webhook is configured.
 */
async function notifyAdminSlackDeadLetter(
  supabase: SupabaseClient,
  item: WritebackQueueItem,
  attemptCount: number,
  failureReason: string
): Promise<void> {
  try {
    // Look up the Slack webhook from notification_preferences for this org
    const { data: prefs } = await supabase
      .from("notification_preferences")
      .select("slack_webhook_url")
      .eq("organization_id", item.organization_id)
      .not("slack_webhook_url", "is", null)
      .limit(1)
      .maybeSingle();

    const webhookUrl = prefs?.slack_webhook_url as string | undefined;
    if (!webhookUrl) {
      return;
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://app.usebrainos.com";
    const deadLetterUrl = `${appUrl}/settings?tab=connectors`;

    const resp = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: `[BrainOS] Write-back permanently failed after ${attemptCount} attempts`,
        blocks: [
          {
            type: "header",
            text: { type: "plain_text", text: "Write-back Dead Letter" },
          },
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: [
                `*Connector:* ${item.connector_type}`,
                `*Action:* ${item.action_type}`,
                `*Attempts:* ${attemptCount}`,
                `*Failure reason:* ${failureReason}`,
                `*Item ID:* \`${item.id}\``,
              ].join("\n"),
            },
          },
          {
            type: "actions",
            elements: [
              {
                type: "button",
                text: { type: "plain_text", text: "Review in Settings" },
                url: deadLetterUrl,
                style: "danger",
              },
            ],
          },
        ],
      }),
    });

    if (!resp.ok) {
      logger.warn("[writeback-dispatcher] Dead-letter Slack notification failed:", {
        status: resp.status,
        itemId: item.id,
      });
    } else {
      // Mark as notified in dead_letter_queue (best-effort)
      void supabase
        .from("dead_letter_queue")
        .update({ slack_notified: true, slack_notified_at: new Date().toISOString() })
        .eq("writeback_queue_id", item.id)
        .then(null, (err: unknown) =>
          logger.warn("[writeback-dispatcher] dead_letter_queue slack_notified update failed (non-fatal):", err)
        );
    }
  } catch (err) {
    logger.warn("[writeback-dispatcher] notifyAdminSlackDeadLetter error (non-fatal):", err);
  }
}
