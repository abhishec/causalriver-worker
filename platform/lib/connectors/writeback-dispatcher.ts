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
import { executeWritebackAction } from "@/lib/connectors/writeback/index";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface WritebackContext {
  jobId: string;
  artifactId: string | null;
  domainType: string;
  organizationId: string;
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

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Called after every successful domain execution (fire-and-forget safe).
 *
 * Finds enabled connector_writeback_rules for the org+domain, evaluates
 * conditions, renders action payloads from templates, and inserts
 * pending rows into writeback_queue.
 */
export async function checkAndQueueWriteback(
  supabase: SupabaseClient,
  ctx: WritebackContext
): Promise<{ queued: number }> {
  try {
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

      // Insert into writeback_queue
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
        // Get decrypted credentials via RPC
        const credentials = await getConnectorCredentials(
          supabase,
          item.organization_id,
          item.connector_type
        );

        // Get connector config from org_connectors
        const { data: connectorRow } = await supabase
          .from("org_connectors")
          .select("config")
          .eq("organization_id", item.organization_id)
          .eq("connector_type", item.connector_type)
          .maybeSingle();

        const config = (connectorRow?.config as Record<string, unknown>) ?? {};

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
        const nextStatus = newAttempts >= 3 ? "failed" : "pending";

        await supabase
          .from("writeback_queue")
          .update({
            status: nextStatus,
            last_error: result.error ?? "Unknown error",
          })
          .eq("id", item.id);

        logger.warn("[writeback-dispatcher] Action failed:", {
          itemId: item.id,
          connectorType: item.connector_type,
          actionType: item.action_type,
          attempts: newAttempts,
          nextStatus,
          error: result.error,
        });
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
