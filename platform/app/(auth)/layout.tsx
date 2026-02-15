// Force dynamic rendering - don't pre-render at build time
export const dynamic = 'force-dynamic';
export const dynamicParams = true;

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
  // Return defaults if env vars not available (e.g., during build)
  if (!SUPABASE_URL || !SERVICE_KEY) {
    return {
      accuracy: null,
      connections: null,
      brainAge: null,
      signals: null,
      isLive: false,
    };
  }

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

          {/* Auth methods */}
          <div className="flex items-center gap-3 mt-6">
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-surface/50 border border-border/30">
              <svg className="w-3 h-3 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              <span className="text-[10px] text-muted">Email</span>
            </div>
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-surface/50 border border-border/30">
              <svg className="w-3 h-3 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101" />
              </svg>
              <span className="text-[10px] text-muted">Magic Link</span>
            </div>
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-surface/50 border border-border/30">
              <svg className="w-3 h-3" viewBox="0 0 24 24">
                <path fill="#888" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
                <path fill="#888" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              </svg>
              <span className="text-[10px] text-muted">Google</span>
            </div>
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-surface/50 border border-border/30">
              <svg className="w-3 h-3 text-muted" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
              </svg>
              <span className="text-[10px] text-muted">GitHub</span>
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
