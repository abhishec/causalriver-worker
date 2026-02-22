import { logger } from "@/lib/logger";
/**
 * Brain Auto-Trigger — Batch signal accumulation → lightweight brain cycle
 * =========================================================================
 *
 * Webhooks (GitHub, Jira, Slack, Linear) insert signals into cross_domain_signals
 * but never trigger the brain to actually process them. This module provides:
 *
 *   1. `maybeTriggerBrainCycle(orgId)` — checks if enough unprocessed signals
 *      have accumulated since the last brain cycle, and if so, fires a
 *      lightweight (L1-L15) brain cycle via the internal API.
 *
 *   2. Debounce logic — prevents triggering more than once per 5 minutes
 *      per org, even under high webhook volume.
 *
 *   3. Threshold — triggers after 10+ new signals since last cycle.
 *
 * Usage (in any webhook route):
 *   import { maybeTriggerBrainCycle } from '@/lib/brain-trigger';
 *   // ... insert signals ...
 *   await maybeTriggerBrainCycle(orgId, supabase);
 */

// In-memory debounce: orgId → last trigger timestamp
const lastTriggerMap = new Map<string, number>();

/** Minimum interval between auto-triggers per org (5 minutes) */
const DEBOUNCE_MS = 5 * 60 * 1000;

/** Minimum new signals needed to justify a brain cycle */
const SIGNAL_THRESHOLD = 10;

/**
 * Check if a lightweight brain cycle should be triggered for this org.
 * Non-blocking — fires and forgets. Never throws.
 */
export async function maybeTriggerBrainCycle(
  orgId: string,
  supabase: any
): Promise<{ triggered: boolean; reason?: string }> {
  try {
    // ── Debounce check ──────────────────────────────────────────
    const now = Date.now();
    const lastTrigger = lastTriggerMap.get(orgId) || 0;

    if (now - lastTrigger < DEBOUNCE_MS) {
      return { triggered: false, reason: "debounce" };
    }

    // ── Signal accumulation check ───────────────────────────────
    // Count signals inserted since last brain cycle
    const { data: lastCycle } = await supabase
      .from("scheduled_job_runs")
      .select("completed_at")
      .eq("organization_id", orgId)
      .like("job_type", "brain_cycle_%")
      .order("completed_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const since = lastCycle?.completed_at
      || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(); // 24h ago fallback

    const { count: newSignalCount } = await supabase
      .from("cross_domain_signals")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId)
      .gte("created_at", since);

    if ((newSignalCount || 0) < SIGNAL_THRESHOLD) {
      return {
        triggered: false,
        reason: `only ${newSignalCount} new signals (threshold: ${SIGNAL_THRESHOLD})`,
      };
    }

    // ── Fire lightweight brain cycle ────────────────────────────
    lastTriggerMap.set(orgId, now);

    const baseUrl =
      process.env.NEXT_PUBLIC_APP_URL ||
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null) ||
      (process.env.NODE_ENV === "production" ? null : "http://localhost:3001");

    if (!baseUrl) {
      logger.error("[BrainTrigger] Cannot trigger brain cycle: NEXT_PUBLIC_APP_URL or VERCEL_URL not configured");
      return { triggered: false, reason: "NEXT_PUBLIC_APP_URL or VERCEL_URL not configured" };
    }

    // Use service-level call (no user cookie needed — this is server-to-server)
    const response = await fetch(`${baseUrl}/api/brain/cycle`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        organizationId: orgId,
        mode: "lightweight",
        input: {
          query: `[auto-trigger] ${newSignalCount} new webhook signals since ${since}`,
        },
      }),
    });

    if (response.ok) {
      const data = await response.json();
      logger.debug(
        `[brain-trigger] Auto-triggered lightweight cycle for org ${orgId.substring(0, 8)}... (${newSignalCount} signals, ${data.duration_ms}ms)`
      );
      return { triggered: true };
    } else {
      logger.warn(
        `[brain-trigger] Failed for org ${orgId.substring(0, 8)}...: HTTP ${response.status}`
      );
      return { triggered: false, reason: `HTTP ${response.status}` };
    }
  } catch (err: any) {
    // Never throw — this is fire-and-forget
    logger.warn("[brain-trigger] Error:", err.message);
    return { triggered: false, reason: err.message };
  }
}
