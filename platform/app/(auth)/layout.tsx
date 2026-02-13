const CORE_ORG_ID = "00000000-0000-4000-a000-000000000001";
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
      next: { revalidate: 300 }, // cache for 5 min
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
    const range = res.headers.get("content-range"); // "0-0/67"
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
}

async function getBrainStats() {
  try {
    const [snapshots, causalEdges, totalOrgs] = await Promise.all([
      supabaseGet<BrainSnapshot[]>(
        `brain_daily_snapshots?organization_id=eq.${CORE_ORG_ID}&order=snapshot_date.desc&limit=1&select=snapshot_date,regions_active,total_connections,prediction_accuracy,signals_processed,new_connections`
      ),
      supabaseCount(
        `causal_relationships_statistical?organization_id=eq.${CORE_ORG_ID}&is_significant=eq.true&select=id`
      ),
      supabaseCount(`organizations?select=id`),
    ]);

    const snapshot = snapshots?.[0] ?? null;
    const activeRegions = snapshot?.regions_active?.length ?? 11;
    const orgs = Math.max(totalOrgs - 1, 0); // exclude core brain

    return {
      regions: activeRegions,
      causalEdges: causalEdges > 0 ? causalEdges : null,
      totalConnections: snapshot?.total_connections ?? null,
      accuracy: snapshot?.prediction_accuracy
        ? Math.round(snapshot.prediction_accuracy)
        : null,
      orgs: orgs > 0 ? orgs : null,
      isLive: causalEdges > 0 || snapshot !== null,
    };
  } catch {
    return {
      regions: 11,
      causalEdges: null,
      totalConnections: null,
      accuracy: null,
      orgs: null,
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
      {/* Left — Brain Animation */}
      <div className="hidden lg:flex lg:w-1/2 flex-col justify-center items-center bg-gradient-to-br from-background via-surface to-background relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-brain" />

        {/* Neural network dots */}
        <div className="relative z-10 flex flex-col items-center gap-6">
          <div className="relative">
            <div className="w-24 h-24 rounded-full bg-accent/20 flex items-center justify-center glow-accent">
              <span className="text-5xl font-bold text-accent">N</span>
            </div>
            {/* Orbiting dots */}
            <div className="absolute -top-2 -right-2 w-3 h-3 rounded-full bg-accent/60 brain-pulse" />
            <div
              className="absolute -bottom-1 -left-3 w-2 h-2 rounded-full bg-accent-light/40 brain-pulse"
              style={{ animationDelay: "1s" }}
            />
            <div
              className="absolute top-1/2 -right-6 w-2 h-2 rounded-full bg-success/50 brain-pulse"
              style={{ animationDelay: "0.5s" }}
            />
          </div>

          <h1 className="text-3xl font-bold text-foreground">NexusBrain</h1>
          <p className="text-muted text-center max-w-xs">
            A living brain for your apps — it perceives, reasons, dreams, and
            gets smarter every day.
          </p>

          {/* Live stats from brain */}
          <div className="flex gap-6 mt-8">
            <div className="text-center">
              <div className="text-2xl font-bold text-accent">
                {stats.causalEdges !== null
                  ? stats.causalEdges.toLocaleString()
                  : "15"}
              </div>
              <div className="text-xs text-muted">
                {stats.causalEdges !== null ? "Causal Edges" : "Causal Methods"}
              </div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-success">
                {stats.totalConnections !== null
                  ? stats.totalConnections.toLocaleString()
                  : "118"}
              </div>
              <div className="text-xs text-muted">
                {stats.totalConnections !== null
                  ? "Connections"
                  : "Training Packs"}
              </div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-warning">
                {stats.accuracy !== null ? `${stats.accuracy}%` : "11"}
              </div>
              <div className="text-xs text-muted">
                {stats.accuracy !== null ? "Accuracy" : "Brain Regions"}
              </div>
            </div>
          </div>

          {/* Live pulse indicator */}
          {stats.isLive && (
            <div className="flex items-center gap-2 mt-4">
              <div className="w-2 h-2 rounded-full bg-success animate-pulse" />
              <span className="text-xs text-muted">Brain is live</span>
            </div>
          )}
        </div>
      </div>

      {/* Right — Auth Form */}
      <div className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-md">{children}</div>
      </div>
    </div>
  );
}
