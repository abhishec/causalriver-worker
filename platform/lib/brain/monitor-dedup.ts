/**
 * Shared Monitor Dedup Helper
 * ============================
 *
 * Prevents duplicate agents being queued when multiple monitor systems
 * (autonomous-monitor cron + monitoring-reactions cognitive-cycle) independently
 * detect the same health issue.
 *
 * Both monitors write to and read from the SAME dedup namespace in ai_memory
 * (memory_type='dedup', domain='monitor-dedup:{alertKey}') so each knows
 * whether the other has already fired for a given alert within the TTL window.
 *
 * TTL: 2 hours — aligns with the monitoring-reactions cooldown window.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/lib/logger";

// 2-hour dedup window — matches monitoring-reactions cooldown
export const MONITOR_DEDUP_TTL_MS = 2 * 60 * 60 * 1000;

/**
 * Check whether an alert for this key has already been fired within the TTL
 * window, and mark it as fired if not.
 *
 * @param supabase    Supabase client scoped to the request/cron
 * @param orgId       Organisation ID
 * @param alertKey    Unique key for the alert event, e.g.
 *                    "health-alert:engagement-123" or "flight-risk:engineer-456"
 * @returns           `true`  → duplicate, caller should SKIP this alert
 *                    `false` → new alert, caller should PROCEED and an
 *                              ai_memory dedup marker has been written
 */
export async function checkAndSetMonitorDedup(
  supabase: SupabaseClient,
  orgId: string,
  alertKey: string,
): Promise<boolean> {
  const dedupDomain = `monitor-dedup:${alertKey}`;
  const since = new Date(Date.now() - MONITOR_DEDUP_TTL_MS).toISOString();

  // ── Check: is there a recent dedup marker? ─────────────────────────────────
  let existing: { id: string } | null = null;
  try {
    const { data, error } = await supabase
      .from("ai_memory")
      .select("id")
      .eq("organization_id", orgId)
      .eq("memory_type", "dedup")
      .eq("domain", dedupDomain)
      .gte("created_at", since)
      .limit(1)
      .maybeSingle();

    if (error) {
      // If we can't read the dedup table, log a warning but allow the alert
      // through (better to fire a duplicate than to silently miss a real alert)
      logger.warn(
        `[MonitorDedup] dedup check error for key=${alertKey} org=${orgId}: ${error.message}`
      );
      return false;
    }

    existing = data as { id: string } | null;
  } catch (err) {
    logger.warn(`[MonitorDedup] dedup check threw for key=${alertKey}: ${String(err)}`);
    return false;
  }

  if (existing) {
    // Already fired within TTL — this is a duplicate
    return true;
  }

  // ── Mark as fired: upsert so concurrent monitor runs don't double-insert ───
  try {
    const { error: upsertErr } = await supabase.from("ai_memory").upsert(
      {
        organization_id: orgId,
        memory_type: "dedup",
        domain: dedupDomain,
        content: `Monitor dedup fired: ${alertKey}`,
        importance: 0.1,
        metadata: {
          alertKey,
          firedAt: new Date().toISOString(),
        },
      },
      { onConflict: "organization_id,memory_type,domain" }
    );

    if (upsertErr) {
      logger.warn(
        `[MonitorDedup] dedup upsert error for key=${alertKey} org=${orgId}: ${upsertErr.message}`
      );
      // Don't block the alert — still return false so the alert fires
    }
  } catch (err) {
    logger.warn(`[MonitorDedup] dedup upsert threw for key=${alertKey}: ${String(err)}`);
  }

  // New alert — caller should proceed
  return false;
}

/**
 * Build a canonical alert key for an engagement health alert.
 * e.g. "health-alert:engagement-abc-123"
 */
export function healthAlertKey(engagementId: string): string {
  return `health-alert:${engagementId}`;
}

/**
 * Build a canonical alert key for a flight-risk alert.
 * e.g. "flight-risk:engineer-johndoe"
 */
export function flightRiskAlertKey(engineerId: string): string {
  return `flight-risk:${engineerId}`;
}

/**
 * Build a canonical alert key for a scope-creep alert.
 * e.g. "scope-creep:engagement-abc-123"
 */
export function scopeCreepAlertKey(engagementId: string): string {
  return `scope-creep:${engagementId}`;
}
