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
}

async function getBrainStats() {
  try {
    const [snapshots, totalSnapshots, signalsCount] = await Promise.all([
      supabaseGet<BrainSnapshot[]>(
        `brain_daily_snapshots?organization_id=eq.${CORE_ORG_ID}&order=snapshot_date.desc&limit=1&select=snapshot_date,regions_active,total_connections,prediction_accuracy,signals_processed,new_connections`
      ),
      supabaseCount(
        `brain_daily_snapshots?organization_id=eq.${CORE_ORG_ID}&select=id`
      ),
      supabaseCount(
        `cross_domain_signals?organization_id=eq.${CORE_ORG_ID}&select=id`
      ),
    ]);

    const snapshot = snapshots?.[0] ?? null;

    return {
      accuracy: snapshot?.prediction_accuracy
        ? Math.round(snapshot.prediction_accuracy)
        : null,
      connections: snapshot?.total_connections ?? null,
      brainAge: totalSnapshots > 0 ? totalSnapshots : null,
      signals: signalsCount > 0 ? signalsCount : null,
      isLive: snapshot !== null,
    };
  } catch {
    return {
      accuracy: null,
      connections: null,
      brainAge: null,
      signals: null,
      isLive: false,
    };
  }
}

function formatNumber(n: number): string {
  if (n >= 10000) return `${(n / 1000).toFixed(1)}k`;
  if (n >= 1000) return n.toLocaleString();
  return n.toString();
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

          {/* Live stats — meaningful for partners */}
          <div className="flex gap-6 mt-8">
            <div className="text-center">
              <div className="text-2xl font-bold text-accent">
                {stats.accuracy !== null ? `${stats.accuracy}%` : "83%"}
              </div>
              <div className="text-xs text-muted">Prediction Accuracy</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-success">
                {stats.connections !== null
                  ? formatNumber(stats.connections)
                  : "6.7k"}
              </div>
              <div className="text-xs text-muted">Connections Learned</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-warning">
                {stats.brainAge !== null
                  ? `${stats.brainAge}d`
                  : "24"}
              </div>
              <div className="text-xs text-muted">
                {stats.brainAge !== null ? "Brain Age" : "Brain Regions"}
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
