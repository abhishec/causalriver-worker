import { createServiceClient } from "@/lib/supabase/server";

const CORE_ORG_ID = "00000000-0000-4000-a000-000000000001";

async function getBrainStats() {
  try {
    const supabase = await createServiceClient();

    const [snapshotRes, edgesRes, orgsRes] = await Promise.all([
      // Latest brain snapshot
      supabase
        .from("brain_daily_snapshots")
        .select(
          "regions_active, total_connections, prediction_accuracy, signals_processed, new_connections"
        )
        .eq("organization_id", CORE_ORG_ID)
        .order("snapshot_date", { ascending: false })
        .limit(1)
        .single(),
      // Count significant causal edges
      supabase
        .from("causal_relationships_statistical")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", CORE_ORG_ID)
        .eq("is_significant", true),
      // Count organizations (excl. core brain)
      supabase
        .from("organizations")
        .select("id", { count: "exact", head: true }),
    ]);

    const snapshot = snapshotRes.data;
    const activeRegions = snapshot?.regions_active?.length ?? 11;
    const causalEdges = edgesRes.count ?? 0;
    const totalOrgs = Math.max((orgsRes.count ?? 1) - 1, 0);

    return {
      regions: activeRegions,
      causalEdges: causalEdges > 0 ? causalEdges : null,
      totalConnections: snapshot?.total_connections ?? null,
      accuracy: snapshot?.prediction_accuracy
        ? Math.round(snapshot.prediction_accuracy * 100)
        : null,
      orgs: totalOrgs > 0 ? totalOrgs : null,
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
                {stats.regions}
              </div>
              <div className="text-xs text-muted">Brain Regions</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-success">
                {stats.causalEdges !== null
                  ? stats.causalEdges.toLocaleString()
                  : "15"}
              </div>
              <div className="text-xs text-muted">
                {stats.causalEdges !== null ? "Causal Edges" : "Causal Methods"}
              </div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-warning">
                {stats.accuracy !== null
                  ? `${stats.accuracy}%`
                  : stats.totalConnections !== null
                    ? stats.totalConnections.toLocaleString()
                    : "118"}
              </div>
              <div className="text-xs text-muted">
                {stats.accuracy !== null
                  ? "Accuracy"
                  : stats.totalConnections !== null
                    ? "Connections"
                    : "Training Packs"}
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
