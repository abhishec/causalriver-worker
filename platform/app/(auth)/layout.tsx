// Force dynamic rendering - don't pre-render at build time
export const dynamic = 'force-dynamic';
export const dynamicParams = true;

import { AuthLeftPanel } from "./AuthLeftPanel";
import { CORE_ORG_ID } from "@/lib/org-helpers";
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const HEADERS = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  "Content-Type": "application/json",
};

async function supabaseGet<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      headers: HEADERS,
      next: { revalidate: 300 },
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

async function supabaseCount(path: string): Promise<number> {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      headers: { ...HEADERS, Prefer: "count=exact", Range: "0-0" },
      next: { revalidate: 300 },
    });
    if (!res.ok) return 0;
    const range = res.headers.get("content-range");
    if (!range) return 0;
    const total = range.split("/")[1];
    return total ? parseInt(total, 10) : 0;
  } catch {
    return 0;
  }
}

interface BrainSnapshot {
  snapshot_date: string;
  regions_active: string[];
  total_connections: number;
  prediction_accuracy: number;
  signals_processed: number;
  new_connections: number;
  top_discoveries: string[];
  patterns_found: number;
  edges_strengthened: number;
  edges_pruned: number;
}

async function getBrainStats() {
  // Return defaults if env vars not available (e.g., during build)
  if (!SUPABASE_URL || !SERVICE_KEY) {
    return {
      accuracy: null,
      connections: null,
      brainAge: null,
      signals: null,
      newToday: null,
      discoveries: [] as string[],
      regionsActive: [] as string[],
      isLive: false,
    };
  }

  try {
    const [snapshots, totalSnapshots, signalsCount] = await Promise.all([
      supabaseGet<BrainSnapshot[]>(
        `brain_daily_snapshots?organization_id=eq.${CORE_ORG_ID}&order=snapshot_date.desc&limit=3&select=snapshot_date,regions_active,total_connections,prediction_accuracy,signals_processed,new_connections,top_discoveries,patterns_found,edges_strengthened,edges_pruned`
      ),
      supabaseCount(
        `brain_daily_snapshots?organization_id=eq.${CORE_ORG_ID}&select=id`
      ),
      supabaseCount(
        `cross_domain_signals?organization_id=eq.${CORE_ORG_ID}&select=id`
      ),
    ]);

    const snapshot = snapshots?.[0] ?? null;

    // Gather recent discoveries from last 3 days
    const recentDiscoveries = (snapshots || [])
      .flatMap((s) => s.top_discoveries || [])
      .filter(Boolean)
      .slice(0, 8);

    return {
      accuracy: snapshot?.prediction_accuracy
        ? Math.round(snapshot.prediction_accuracy)
        : null,
      connections: snapshot?.total_connections ?? null,
      brainAge: totalSnapshots > 0 ? totalSnapshots : null,
      signals: signalsCount > 0 ? signalsCount : null,
      newToday: snapshot?.new_connections ?? null,
      discoveries: recentDiscoveries,
      regionsActive: snapshot?.regions_active ?? [],
      isLive: snapshot !== null,
    };
  } catch {
    return {
      accuracy: null,
      connections: null,
      brainAge: null,
      signals: null,
      newToday: null,
      discoveries: [] as string[],
      regionsActive: [] as string[],
      isLive: false,
    };
  }
}

export default async function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const stats = await getBrainStats();

  return (
    <div className="flex min-h-screen">
      {/* Left — Dynamic Causal Memory Panel */}
      <div className="hidden lg:flex lg:w-1/2 flex-col justify-center items-center bg-gradient-to-br from-background via-surface to-background relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-brain" />
        <AuthLeftPanel stats={stats} />
      </div>

      {/* Right — Auth Form */}
      <div className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-md">{children}</div>
      </div>
    </div>
  );
}
