/**
 * GET /api/brain/workspace-summary
 * =================================
 *
 * Unified dashboard summary — replaces 4-5 separate API calls with one.
 * All queries run in parallel via Promise.all. Each query has its own
 * try/catch with safe fallback — never 500s.
 *
 * Response:
 * {
 *   brain: {
 *     iqScore: number,           // accuracy * 100
 *     accuracy: number,          // 0–1
 *     totalPredictions: number,
 *     learningVelocity: number,  // signals/hour (7-day avg)
 *     signalsLast24h: number,
 *   },
 *   topDomains: Array<{ domain, successRate, outcomeCount }>,  // top 3 by outcome count
 *   worker: {
 *     pendingJobs: number,
 *     runningJobs: number,
 *     succeededLast1h: number,
 *     failedLast1h: number,
 *   },
 *   workspace: {
 *     activatedServices: string[],
 *     brainReadiness: 'empty' | 'populating' | 'ready',
 *   },
 *   connectors: {
 *     total: number,
 *     connected: number,
 *     types: string[],
 *   },
 *   computedAt: string,
 * }
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { getCurrentWorkspaceId } from "@/lib/workspace-helpers";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

// ── Safe query helper ────────────────────────────────────────────────────────

async function safeQuery<T>(label: string, fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    logger.warn(`[workspace-summary] ${label} failed:`, err);
    return fallback;
  }
}

// ── Route Handler ─────────────────────────────────────────────────────────────

export async function GET() {
  // ── Auth ────────────────────────────────────────────────────────────────
  let user = null;
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.getUser();
    if (!error) user = data.user;
  } catch (authErr) {
    logger.warn("[workspace-summary] Auth failed:", authErr);
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = getAdminClient();
  const workspaceId = await getCurrentWorkspaceId();
  if (!workspaceId) {
    return NextResponse.json({ error: "No workspace context" }, { status: 400 });
  }

  const now = new Date();
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const today = now.toISOString().split("T")[0];

  // ── Run all queries in parallel ───────────────────────────────────────────

  const [
    brainSnapshot,
    domainOutcomes,
    signalsLast24h,
    signalsLast7d,
    pendingCount,
    runningCount,
    recentJobs,
    workspaceSettings,
    connectors,
  ] = await Promise.all([

    // ── 1. Brain IQ from today's evolution snapshot ──────────────────────
    safeQuery(
      "brain_evolution_snapshots",
      async () => {
        const { data } = await admin
          .from("brain_evolution_snapshots")
          .select("accuracy, total_predictions, intelligence_score")
          .eq("organization_id", workspaceId)
          .eq("snapshot_date", today)
          .maybeSingle();
        return data as { accuracy: number; total_predictions: number; intelligence_score: number } | null;
      },
      null
    ),

    // ── 2. Top domains by outcome count (last 30 days) ───────────────────
    safeQuery(
      "prediction_records (domains)",
      async () => {
        const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
        const { data } = await admin
          .from("prediction_records")
          .select("domain, confidence, was_correct")
          .eq("organization_id", workspaceId)
          .eq("prediction_type", "agent_task_outcome")
          .gte("created_at", thirtyDaysAgo)
          .limit(500);
        return (data ?? []) as Array<{ domain: string; confidence: number; was_correct: boolean }>;
      },
      [] as Array<{ domain: string; confidence: number; was_correct: boolean }>
    ),

    // ── 3. RL signals last 24h ───────────────────────────────────────────
    safeQuery(
      "cross_domain_signals (24h count)",
      async () => {
        const { count } = await admin
          .from("cross_domain_signals")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", workspaceId)
          .gte("signal_timestamp", oneDayAgo);
        return count ?? 0;
      },
      0
    ),

    // ── 4. RL signals last 7 days (for velocity) ─────────────────────────
    safeQuery(
      "cross_domain_signals (7d count)",
      async () => {
        const { count } = await admin
          .from("cross_domain_signals")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", workspaceId)
          .gte("signal_timestamp", sevenDaysAgo);
        return count ?? 0;
      },
      0
    ),

    // ── 5. Agent queue: pending count ────────────────────────────────────
    safeQuery(
      "agent_queue (pending)",
      async () => {
        const { count, error } = await admin
          .from("agent_queue")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", workspaceId)
          .eq("status", "pending");
        if (error) return 0;
        return count ?? 0;
      },
      0
    ),

    // ── 6. Agent queue: running count ────────────────────────────────────
    safeQuery(
      "agent_queue (running)",
      async () => {
        const { count, error } = await admin
          .from("agent_queue")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", workspaceId)
          .eq("status", "running");
        if (error) return 0;
        return count ?? 0;
      },
      0
    ),

    // ── 7. Agent queue: recent jobs for succeeded/failed last 1h ─────────
    safeQuery(
      "agent_queue (recent)",
      async () => {
        const { data, error } = await admin
          .from("agent_queue")
          .select("status, completed_at")
          .eq("organization_id", workspaceId)
          .order("created_at", { ascending: false })
          .limit(50);
        if (error) return [] as Array<{ status: string; completed_at: string | null }>;
        return (data ?? []) as Array<{ status: string; completed_at: string | null }>;
      },
      [] as Array<{ status: string; completed_at: string | null }>
    ),

    // ── 8. Workspace settings (active_services) ──────────────────────────
    safeQuery(
      "organizations (settings)",
      async () => {
        const { data } = await admin
          .from("organizations")
          .select("settings")
          .eq("id", workspaceId)
          .maybeSingle();
        return data as { settings: Record<string, unknown> | null } | null;
      },
      null
    ),

    // ── 9. Connectors ─────────────────────────────────────────────────────
    safeQuery(
      "org_connectors",
      async () => {
        const { data, error } = await admin
          .from("org_connectors")
          .select("connector_type")
          .eq("organization_id", workspaceId);
        if (error) return [] as Array<{ connector_type: string }>;
        return (data ?? []) as Array<{ connector_type: string }>;
      },
      [] as Array<{ connector_type: string }>
    ),
  ]);

  // ── Compute brain section ─────────────────────────────────────────────────

  const accuracy = brainSnapshot?.accuracy ?? 0;
  const totalPredictions = brainSnapshot?.total_predictions ?? 0;
  const iqScore = Math.round(accuracy * 100);
  // Velocity: signals/hour averaged over 7 days
  const learningVelocity = Math.round((signalsLast7d / (7 * 24)) * 10) / 10;

  // ── Compute topDomains section ───────────────────────────────────────────

  const domainMap: Record<string, { total: number; success: number }> = {};
  for (const r of domainOutcomes) {
    const d = r.domain ?? "unknown";
    if (!domainMap[d]) domainMap[d] = { total: 0, success: 0 };
    domainMap[d].total++;
    if (r.was_correct === true) domainMap[d].success++;
  }
  const topDomains = Object.entries(domainMap)
    .sort((a, b) => b[1].total - a[1].total)
    .slice(0, 3)
    .map(([domain, stats]) => ({
      domain,
      successRate: stats.total > 0 ? Math.round((stats.success / stats.total) * 100) / 100 : 0,
      outcomeCount: stats.total,
    }));

  // ── Compute worker section ────────────────────────────────────────────────

  const succeededLast1h = recentJobs.filter(
    (j) => j.status === "success" && j.completed_at && j.completed_at >= oneHourAgo
  ).length;
  const failedLast1h = recentJobs.filter(
    (j) => j.status === "error" && j.completed_at && j.completed_at >= oneHourAgo
  ).length;

  // ── Compute workspace section ─────────────────────────────────────────────

  const settings = workspaceSettings?.settings ?? {};
  const activatedServices: string[] = Array.isArray(settings.active_services)
    ? (settings.active_services as string[])
    : ["seaas", "aas", "general"];

  // Brain readiness: empty → no predictions, populating → <10, ready → 10+
  let brainReadiness: "empty" | "populating" | "ready";
  if (totalPredictions === 0) {
    brainReadiness = "empty";
  } else if (totalPredictions < 10) {
    brainReadiness = "populating";
  } else {
    brainReadiness = "ready";
  }

  // ── Compute connectors section ─────────────────────────────────────────────

  const connectorTypes: string[] = [];
  for (const c of connectors) {
    if (c.connector_type && !connectorTypes.includes(c.connector_type)) {
      connectorTypes.push(c.connector_type);
    }
  }

  // ── Build response ────────────────────────────────────────────────────────

  return NextResponse.json({
    brain: {
      iqScore,
      accuracy,
      totalPredictions,
      learningVelocity,
      signalsLast24h,
    },
    topDomains,
    worker: {
      pendingJobs: pendingCount,
      runningJobs: runningCount,
      succeededLast1h,
      failedLast1h,
    },
    workspace: {
      activatedServices,
      brainReadiness,
    },
    connectors: {
      total: connectors.length,
      connected: connectors.length,
      types: connectorTypes,
    },
    computedAt: now.toISOString(),
  });
}
