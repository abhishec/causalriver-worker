/**
 * Workspace Resource Guard — Multi-Tenancy Resource Limits
 * =============================================================
 *
 * Enforces per-workspace resource limits:
 *   - max_concurrent_connections (MCP SSE)
 *   - max active agent tasks
 *   - daily tool call budget
 *
 * Usage:
 *   const allowed = await checkWorkspaceResources(supabase, workspaceId, 'mcp_connection');
 *   if (!allowed.ok) return Response(allowed.reason, { status: 429 });
 */

import type { SupabaseClient } from "@supabase/supabase-js";

// ============================================================================
// LIMITS — Configurable per tier (hardcoded defaults for now)
// ============================================================================

const DEFAULT_LIMITS = {
  max_mcp_connections: 5,
  max_agent_tasks: 3,
  max_daily_tool_calls: 1000,
};

export type ResourceType = "mcp_connection" | "agent_task" | "tool_call";

export interface ResourceCheckResult {
  ok: boolean;
  reason?: string;
  current?: number;
  limit?: number;
}

// ============================================================================
// CHECK — Can this workspace consume another resource unit?
// ============================================================================

export async function checkWorkspaceResources(
  supabase: SupabaseClient,
  workspaceId: string,
  resourceType: ResourceType
): Promise<ResourceCheckResult> {
  // Upsert to ensure the row exists (idempotent)
  await supabase.from("org_resource_usage").upsert(
    { organization_id: workspaceId },
    { onConflict: "organization_id", ignoreDuplicates: true }
  ).then(() => {}, () => {});

  const { data: usage } = await supabase
    .from("org_resource_usage")
    .select("*")
    .eq("organization_id", workspaceId)
    .maybeSingle();

  if (!usage) {
    // No usage row yet — allow (first request creates it)
    return { ok: true };
  }

  // Reset daily counter if needed
  const resetAt = usage.daily_tool_calls_reset_at
    ? new Date(usage.daily_tool_calls_reset_at)
    : new Date(0);
  const now = new Date();
  if (now.getTime() - resetAt.getTime() > 24 * 60 * 60 * 1000) {
    await supabase
      .from("org_resource_usage")
      .update({
        daily_tool_calls: 0,
        daily_tool_calls_reset_at: now.toISOString(),
        updated_at: now.toISOString(),
      })
      .eq("organization_id", workspaceId);
    usage.daily_tool_calls = 0;
  }

  switch (resourceType) {
    case "mcp_connection": {
      const current = usage.active_mcp_connections || 0;
      const limit = DEFAULT_LIMITS.max_mcp_connections;
      if (current >= limit) {
        return {
          ok: false,
          reason: `Max MCP connections reached (${current}/${limit})`,
          current,
          limit,
        };
      }
      return { ok: true, current, limit };
    }

    case "agent_task": {
      const current = usage.active_agent_tasks || 0;
      const limit = DEFAULT_LIMITS.max_agent_tasks;
      if (current >= limit) {
        return {
          ok: false,
          reason: `Max concurrent agent tasks reached (${current}/${limit})`,
          current,
          limit,
        };
      }
      return { ok: true, current, limit };
    }

    case "tool_call": {
      const current = usage.daily_tool_calls || 0;
      const limit = DEFAULT_LIMITS.max_daily_tool_calls;
      if (current >= limit) {
        return {
          ok: false,
          reason: `Daily tool call limit reached (${current}/${limit})`,
          current,
          limit,
        };
      }
      return { ok: true, current, limit };
    }

    default:
      return { ok: true };
  }
}

// ============================================================================
// INCREMENT / DECREMENT — Track resource usage
// ============================================================================

export async function incrementResource(
  supabase: SupabaseClient,
  workspaceId: string,
  resourceType: ResourceType
): Promise<void> {
  const field = resourceType === "mcp_connection"
    ? "active_mcp_connections"
    : resourceType === "agent_task"
      ? "active_agent_tasks"
      : "daily_tool_calls";

  const { data: usage } = await supabase
    .from("org_resource_usage")
    .select(field)
    .eq("organization_id", workspaceId)
    .maybeSingle();

  const currentVal = (usage as any)?.[field] || 0;

  await supabase
    .from("org_resource_usage")
    .upsert(
      {
        organization_id: workspaceId,
        [field]: currentVal + 1,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "organization_id" }
    );
}

export async function decrementResource(
  supabase: SupabaseClient,
  workspaceId: string,
  resourceType: ResourceType
): Promise<void> {
  if (resourceType === "tool_call") return; // Don't decrement daily counters

  const field = resourceType === "mcp_connection"
    ? "active_mcp_connections"
    : "active_agent_tasks";

  const { data: usage } = await supabase
    .from("org_resource_usage")
    .select(field)
    .eq("organization_id", workspaceId)
    .maybeSingle();

  const currentVal = (usage as any)?.[field] || 0;

  await supabase
    .from("org_resource_usage")
    .upsert(
      {
        organization_id: workspaceId,
        [field]: Math.max(0, currentVal - 1),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "organization_id" }
    );
}

// ============================================================================
// PERMISSION CHECK — Verify API key has required permission
// ============================================================================

export function hasPermission(
  permissions: string[],
  required: string
): boolean {
  // 'admin' has all permissions
  if (permissions.includes("admin")) return true;
  // 'write' implies 'read'
  if (required === "read" && permissions.includes("write")) return true;
  // 'execute_motor_commands' is a special permission for brain_execute
  return permissions.includes(required);
}

/* ── Backward compat aliases ─────────────────────────────────────────── */

/** @deprecated Use checkWorkspaceResources() instead */
export const checkOrgResources = checkWorkspaceResources;
