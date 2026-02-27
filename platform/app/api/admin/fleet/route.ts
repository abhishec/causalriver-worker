export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";

export interface FleetSpaceCard {
  id: string;
  name: string;
  slug: string;
  plan: string;
  is_core_brain: boolean;
  createdAt: string;
  /** Brain health: avg confidence from last 5 prediction_records (0–1 → shown as %) */
  brainHealthPct: number;
  /** RL velocity: signals per hour (cross_domain_signals last 24h) */
  rlVelocity: number;
  /** Active agent count: agent_queue status='running' */
  activeAgents: number;
  /** Last signal activity timestamp */
  lastActivityAt: string | null;
  /** Total predictions recorded */
  totalPredictions: number;
  /** Total cross-domain signals */
  totalSignals: number;
  /** Member count */
  memberCount: number;
}

/**
 * GET /api/admin/fleet
 *
 * Platform-admin-only: returns all AI worker spaces with brain health,
 * RL velocity, active agent counts, and last activity timestamps.
 */
export async function GET() {
  try {
    // Authenticate + verify platform admin
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: adminCheck } = await supabase
      .from("org_members")
      .select("is_platform_admin")
      .eq("user_id", user.id)
      .eq("is_platform_admin", true)
      .limit(1)
      .maybeSingle();

    if (!adminCheck) {
      return NextResponse.json({ error: "Forbidden — platform admin required" }, { status: 403 });
    }

    const admin = getAdminClient();

    // 1. Fetch all organizations
    const { data: orgs, error: orgsErr } = await admin
      .from("organizations")
      .select("id, name, slug, plan, is_core_brain, created_at")
      .order("created_at", { ascending: false })
      .limit(200);

    if (orgsErr || !orgs) {
      logger.error("[admin/fleet] Failed to fetch orgs:", orgsErr?.message);
      return NextResponse.json({ error: "Failed to fetch organizations" }, { status: 500 });
    }

    if (orgs.length === 0) {
      return NextResponse.json({ spaces: [] });
    }

    const orgIds = orgs.map((o: any) => o.id);

    // 2. Parallel queries for all orgs in batch
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

    const [
      predictionRows,
      signalRows,
      runningAgentRows,
      recentSignalRows,
      memberCountRows,
    ] = await Promise.all([
      // Brain health: last 5 predictions per org
      admin
        .from("prediction_records")
        .select("organization_id, confidence, created_at")
        .in("organization_id", orgIds)
        .order("created_at", { ascending: false })
        .limit(orgIds.length * 5),

      // Total signals per org (last 7 days for velocity estimate)
      admin
        .from("cross_domain_signals")
        .select("organization_id, created_at")
        .in("organization_id", orgIds)
        .gte("created_at", oneDayAgo)
        .order("created_at", { ascending: false })
        .limit(5000),

      // Active agents per org
      admin
        .from("agent_queue")
        .select("organization_id, id, started_at")
        .in("organization_id", orgIds)
        .eq("status", "running")
        .limit(500),

      // Most recent signal timestamp per org (for last activity)
      admin
        .from("cross_domain_signals")
        .select("organization_id, created_at")
        .in("organization_id", orgIds)
        .order("created_at", { ascending: false })
        .limit(orgIds.length),

      // Member count per org
      admin
        .from("org_members")
        .select("organization_id")
        .in("organization_id", orgIds)
        .limit(10000),
    ]);

    // 3. Aggregate per org
    const predictions = predictionRows.data ?? [];
    const signals24h = signalRows.data ?? [];
    const runningAgents = runningAgentRows.data ?? [];
    const recentSignals = recentSignalRows.data ?? [];
    const members = memberCountRows.data ?? [];

    // Map: orgId → last 5 confidences
    const predsByOrg: Record<string, number[]> = {};
    for (const p of predictions as any[]) {
      if (!predsByOrg[p.organization_id]) predsByOrg[p.organization_id] = [];
      if (predsByOrg[p.organization_id].length < 5) {
        predsByOrg[p.organization_id].push(p.confidence ?? 0);
      }
    }

    // Map: orgId → signals in last 24h (for RL velocity)
    const signals24hByOrg: Record<string, number> = {};
    for (const s of signals24h as any[]) {
      signals24hByOrg[s.organization_id] = (signals24hByOrg[s.organization_id] ?? 0) + 1;
    }

    // Map: orgId → active agent count
    const agentsByOrg: Record<string, number> = {};
    for (const a of runningAgents as any[]) {
      agentsByOrg[a.organization_id] = (agentsByOrg[a.organization_id] ?? 0) + 1;
    }

    // Map: orgId → most recent signal timestamp (first unique per org)
    const lastActivityByOrg: Record<string, string> = {};
    for (const s of recentSignals as any[]) {
      if (!lastActivityByOrg[s.organization_id]) {
        lastActivityByOrg[s.organization_id] = s.created_at;
      }
    }

    // Map: orgId → member count
    const membersByOrg: Record<string, number> = {};
    for (const m of members as any[]) {
      membersByOrg[m.organization_id] = (membersByOrg[m.organization_id] ?? 0) + 1;
    }

    // 4. Also fetch total prediction counts and total signal counts per org (non-blocking)
    const [totalPredRows, totalSignalRows] = await Promise.all([
      admin
        .from("prediction_records")
        .select("organization_id")
        .in("organization_id", orgIds)
        .limit(50000),
      admin
        .from("cross_domain_signals")
        .select("organization_id")
        .in("organization_id", orgIds)
        .limit(50000),
    ]);

    const totalPredsByOrg: Record<string, number> = {};
    for (const p of (totalPredRows.data ?? []) as any[]) {
      totalPredsByOrg[p.organization_id] = (totalPredsByOrg[p.organization_id] ?? 0) + 1;
    }
    const totalSignalsByOrg: Record<string, number> = {};
    for (const s of (totalSignalRows.data ?? []) as any[]) {
      totalSignalsByOrg[s.organization_id] = (totalSignalsByOrg[s.organization_id] ?? 0) + 1;
    }

    // 5. Build response cards
    const spaces: FleetSpaceCard[] = orgs.map((org: any) => {
      const preds = predsByOrg[org.id] ?? [];
      const avgConfidence =
        preds.length > 0 ? preds.reduce((s: number, v: number) => s + v, 0) / preds.length : 0;

      const sig24h = signals24hByOrg[org.id] ?? 0;
      // RL velocity: signals per hour over last 24h
      const rlVelocity = Math.round((sig24h / 24) * 10) / 10;

      return {
        id: org.id,
        name: org.name ?? "Unnamed Space",
        slug: org.slug ?? "",
        plan: org.plan ?? "free",
        is_core_brain: org.is_core_brain ?? false,
        createdAt: org.created_at,
        brainHealthPct: Math.round(avgConfidence * 100),
        rlVelocity,
        activeAgents: agentsByOrg[org.id] ?? 0,
        lastActivityAt: lastActivityByOrg[org.id] ?? null,
        totalPredictions: totalPredsByOrg[org.id] ?? 0,
        totalSignals: totalSignalsByOrg[org.id] ?? 0,
        memberCount: membersByOrg[org.id] ?? 0,
      };
    });

    return NextResponse.json({ spaces });
  } catch (err: any) {
    logger.error("[admin/fleet] Unhandled error:", err?.message);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
