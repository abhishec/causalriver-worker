import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";
import { FleetDashboardClient } from "./FleetDashboardClient";
import type { FleetSpaceCard } from "@/app/api/admin/fleet/route";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Fleet Brain Dashboard",
};

export default async function AdminFleetPage() {
  // Auth + platform admin check (server-side — hard redirect on failure)
  let supabase: Awaited<ReturnType<typeof createClient>>;
  let user: { id: string } | null = null;

  try {
    supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    user = data.user;
  } catch {
    redirect("/");
  }

  if (!user) redirect("/");

  // Admin check via RLS-bypassing admin client
  const admin = getAdminClient();
  const { data: adminCheck } = await admin
    .from("org_members")
    .select("is_platform_admin")
    .eq("user_id", user.id)
    .eq("is_platform_admin", true)
    .limit(1)
    .maybeSingle();

  if (!adminCheck) {
    redirect("/workspace");
  }

  // Fetch all orgs
  const safe = <T,>(
    p: PromiseLike<{ data: T | null; error: any }>
  ): Promise<{ data: T | null; error: any }> =>
    Promise.resolve(p).catch((err) => {
      logger.warn("[admin/fleet] Query failed:", err);
      return { data: null as T | null, error: err };
    });

  const now = new Date();
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

  const { data: orgs } = await safe(
    admin
      .from("organizations")
      .select("id, name, slug, plan, is_core_brain, created_at")
      .order("created_at", { ascending: false })
      .limit(200)
  );

  if (!orgs || (orgs as any[]).length === 0) {
    return <FleetDashboardClient spaces={[]} />;
  }

  const orgIds = (orgs as any[]).map((o: any) => o.id);

  // Parallel data fetch
  const [predictionRows, signalRows, runningAgentRows, recentSignalRows, memberCountRows] =
    await Promise.all([
      safe(
        admin
          .from("prediction_records")
          .select("organization_id, confidence, created_at")
          .in("organization_id", orgIds)
          .order("created_at", { ascending: false })
          .limit(orgIds.length * 5)
      ),
      safe(
        admin
          .from("cross_domain_signals")
          .select("organization_id, created_at")
          .in("organization_id", orgIds)
          .gte("created_at", oneDayAgo)
          .limit(5000)
      ),
      safe(
        admin
          .from("agent_queue")
          .select("organization_id, id")
          .in("organization_id", orgIds)
          .eq("status", "running")
          .limit(500)
      ),
      safe(
        admin
          .from("cross_domain_signals")
          .select("organization_id, created_at")
          .in("organization_id", orgIds)
          .order("created_at", { ascending: false })
          .limit(orgIds.length * 2)
      ),
      safe(
        admin
          .from("org_members")
          .select("organization_id")
          .in("organization_id", orgIds)
          .limit(10000)
      ),
    ]);

  // Aggregate helpers
  const predictions = (predictionRows.data ?? []) as any[];
  const signals24h = (signalRows.data ?? []) as any[];
  const runningAgents = (runningAgentRows.data ?? []) as any[];
  const recentSignals = (recentSignalRows.data ?? []) as any[];
  const members = (memberCountRows.data ?? []) as any[];

  const predsByOrg: Record<string, number[]> = {};
  for (const p of predictions) {
    if (!predsByOrg[p.organization_id]) predsByOrg[p.organization_id] = [];
    if (predsByOrg[p.organization_id].length < 5) predsByOrg[p.organization_id].push(p.confidence ?? 0);
  }

  const signals24hByOrg: Record<string, number> = {};
  for (const s of signals24h) {
    signals24hByOrg[s.organization_id] = (signals24hByOrg[s.organization_id] ?? 0) + 1;
  }

  const agentsByOrg: Record<string, number> = {};
  for (const a of runningAgents) {
    agentsByOrg[a.organization_id] = (agentsByOrg[a.organization_id] ?? 0) + 1;
  }

  const lastActivityByOrg: Record<string, string> = {};
  for (const s of recentSignals) {
    if (!lastActivityByOrg[s.organization_id]) lastActivityByOrg[s.organization_id] = s.created_at;
  }

  const membersByOrg: Record<string, number> = {};
  for (const m of members) {
    membersByOrg[m.organization_id] = (membersByOrg[m.organization_id] ?? 0) + 1;
  }

  // Build cards
  const spaces: FleetSpaceCard[] = (orgs as any[]).map((org: any) => {
    const preds = predsByOrg[org.id] ?? [];
    const avgConf = preds.length > 0 ? preds.reduce((s: number, v: number) => s + v, 0) / preds.length : 0;
    const sig24h = signals24hByOrg[org.id] ?? 0;
    const rlVelocity = Math.round((sig24h / 24) * 10) / 10;

    return {
      id: org.id,
      name: org.name ?? "Unnamed Space",
      slug: org.slug ?? "",
      plan: org.plan ?? "free",
      is_core_brain: org.is_core_brain ?? false,
      createdAt: org.created_at,
      brainHealthPct: Math.round(avgConf * 100),
      rlVelocity,
      activeAgents: agentsByOrg[org.id] ?? 0,
      lastActivityAt: lastActivityByOrg[org.id] ?? null,
      totalPredictions: 0,
      totalSignals: sig24h,
      memberCount: membersByOrg[org.id] ?? 0,
    };
  });

  return <FleetDashboardClient spaces={spaces} />;
}
