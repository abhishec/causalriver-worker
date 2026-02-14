import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/org-helpers";
import { formatNumber } from "@/lib/utils";
import Link from "next/link";

export const dynamic = 'force-dynamic';

export const metadata = { title: "Training" };

const SCHEDULE = [
  {
    name: "Trainer",
    frequency: "Every 6 hours",
    description: "Runs causal discovery, pattern mining, and edge weight updates across all ingested signals",
    icon: "\u{1F9E0}",
    color: "bg-accent",
  },
  {
    name: "Default Mode Network",
    frequency: "Every 4 hours",
    description: "Background consolidation, weak-edge pruning, cross-domain pattern synthesis",
    icon: "\u{1F4AD}",
    color: "bg-purple-500",
  },
  {
    name: "Consolidation",
    frequency: "Daily at 2:00 AM",
    description: "Deep sleep cycle: snapshot creation, memory compaction, knowledge graph optimization",
    icon: "\u{1F319}",
    color: "bg-info",
  },
];

export default async function TrainingPage() {
  const supabase = await createClient();
  const CORE_ORG_ID = await getCurrentOrgId();

  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString().split("T")[0];

  const [snapshotsResult, signalsByDomainResult] = await Promise.all([
    supabase
      .from("brain_daily_snapshots")
      .select("*")
      .eq("organization_id", CORE_ORG_ID)
      .gte("snapshot_date", thirtyDaysAgo)
      .order("snapshot_date", { ascending: false })
      .limit(30),

    supabase
      .from("cross_domain_signals")
      .select("source_domain")
      .eq("organization_id", CORE_ORG_ID),
  ]);

  const snapshots = snapshotsResult.data || [];
  const signals = signalsByDomainResult.data || [];

  // Group signals by domain
  const domainCounts: Record<string, number> = {};
  signals.forEach((s: { source_domain: string }) => {
    const domain = s.source_domain || "unknown";
    domainCounts[domain] = (domainCounts[domain] || 0) + 1;
  });
  const sortedDomains = Object.entries(domainCounts).sort((a, b) => b[1] - a[1]);
  const totalSignals = signals.length;

  // Cumulative stats
  const totalProcessed = snapshots.reduce(
    (sum: number, s: { signals_processed?: number }) => sum + (s.signals_processed || 0),
    0
  );
  const totalConnections = snapshots.reduce(
    (sum: number, s: { new_connections?: number }) => sum + (s.new_connections || 0),
    0
  );
  const totalStrengthened = snapshots.reduce(
    (sum: number, s: { edges_strengthened?: number }) => sum + (s.edges_strengthened || 0),
    0
  );
  const totalPruned = snapshots.reduce(
    (sum: number, s: { edges_pruned?: number }) => sum + (s.edges_pruned || 0),
    0
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Training</h1>
          <p className="text-muted text-sm mt-1">
            Brain training schedule, run history, and knowledge growth metrics
          </p>
        </div>
        <Link
          href="/training/builder"
          className="px-4 py-2.5 rounded-lg bg-accent hover:bg-accent-dark text-accent-foreground text-sm font-medium transition-colors flex items-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          Create Custom Pack
        </Link>
      </div>

      {/* Training Schedule */}
      <div className="rounded-xl bg-card border border-border/50 p-5">
        <h3 className="text-sm font-medium mb-4">Training Schedule</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {SCHEDULE.map((item) => (
            <div
              key={item.name}
              className="rounded-lg bg-surface border border-border/30 p-4"
            >
              <div className="flex items-center gap-3 mb-3">
                <span className="text-2xl">{item.icon}</span>
                <div>
                  <div className="font-medium text-sm">{item.name}</div>
                  <div className="text-xs text-accent font-mono">{item.frequency}</div>
                </div>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {item.description}
              </p>
              <div className="mt-3 flex items-center gap-2">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-success" />
                </span>
                <span className="text-[10px] text-success font-medium uppercase tracking-wider">
                  Active
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Knowledge Growth */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="rounded-xl bg-card border border-border/50 p-5">
          <div className="text-xs font-medium text-muted uppercase tracking-wider mb-2">
            Signals Processed
          </div>
          <div className="text-2xl font-bold text-accent">{formatNumber(totalProcessed)}</div>
          <div className="text-xs text-muted mt-1">Last 30 days</div>
        </div>
        <div className="rounded-xl bg-card border border-border/50 p-5">
          <div className="text-xs font-medium text-muted uppercase tracking-wider mb-2">
            New Connections
          </div>
          <div className="text-2xl font-bold text-success">{formatNumber(totalConnections)}</div>
          <div className="text-xs text-muted mt-1">Causal edges discovered</div>
        </div>
        <div className="rounded-xl bg-card border border-border/50 p-5">
          <div className="text-xs font-medium text-muted uppercase tracking-wider mb-2">
            Edges Strengthened
          </div>
          <div className="text-2xl font-bold text-info">{formatNumber(totalStrengthened)}</div>
          <div className="text-xs text-muted mt-1">Confidence increased</div>
        </div>
        <div className="rounded-xl bg-card border border-border/50 p-5">
          <div className="text-xs font-medium text-muted uppercase tracking-wider mb-2">
            Edges Pruned
          </div>
          <div className="text-2xl font-bold text-warning">{formatNumber(totalPruned)}</div>
          <div className="text-xs text-muted mt-1">Weak links removed</div>
        </div>
      </div>

      {/* Data Ingestion by Domain */}
      <div className="rounded-xl bg-card border border-border/50 p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-medium">Data Ingestion by Domain</h3>
          <span className="text-xs text-muted">{formatNumber(totalSignals)} total signals</span>
        </div>
        {sortedDomains.length === 0 ? (
          <p className="text-sm text-muted">No signals ingested yet</p>
        ) : (
          <div className="space-y-3">
            {sortedDomains.map(([domain, count]) => {
              const pct = totalSignals > 0 ? (count / totalSignals) * 100 : 0;
              return (
                <div key={domain}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm capitalize">{domain}</span>
                    <span className="text-sm font-medium text-muted-foreground">
                      {formatNumber(count)}
                    </span>
                  </div>
                  <div className="flex-1 h-1.5 rounded-full bg-surface overflow-hidden">
                    <div
                      className="h-full rounded-full bg-accent transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Training Runs Table */}
      <div className="rounded-xl bg-card border border-border/50 p-5">
        <h3 className="text-sm font-medium mb-4">Training Runs (Last 30 Days)</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-muted border-b border-border/30">
                <th className="text-left py-2 font-medium">Date</th>
                <th className="text-right py-2 font-medium">Signals</th>
                <th className="text-right py-2 font-medium">New Edges</th>
                <th className="text-right py-2 font-medium">Strengthened</th>
                <th className="text-right py-2 font-medium">Pruned</th>
                <th className="text-right py-2 font-medium">Duration</th>
                <th className="text-right py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {snapshots.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-muted">
                    No training snapshots recorded yet
                  </td>
                </tr>
              ) : (
                snapshots.map(
                  (s: {
                    id: string;
                    snapshot_date: string;
                    signals_processed?: number;
                    new_connections?: number;
                    edges_strengthened?: number;
                    edges_pruned?: number;
                    run_duration_ms?: number;
                    run_status?: string;
                  }) => (
                    <tr
                      key={s.id}
                      className="border-b border-border/10 hover:bg-surface-hover"
                    >
                      <td className="py-2 font-mono text-xs">{s.snapshot_date}</td>
                      <td className="py-2 text-right">
                        {formatNumber(s.signals_processed || 0)}
                      </td>
                      <td className="py-2 text-right text-success">
                        +{formatNumber(s.new_connections || 0)}
                      </td>
                      <td className="py-2 text-right text-info">
                        {formatNumber(s.edges_strengthened || 0)}
                      </td>
                      <td className="py-2 text-right text-warning">
                        {formatNumber(s.edges_pruned || 0)}
                      </td>
                      <td className="py-2 text-right text-muted font-mono text-xs">
                        {s.run_duration_ms
                          ? `${(s.run_duration_ms / 1000).toFixed(1)}s`
                          : "\u2014"}
                      </td>
                      <td className="py-2 text-right">
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ${
                            s.run_status === "completed"
                              ? "bg-success/10 text-success"
                              : s.run_status === "running"
                                ? "bg-info/10 text-info"
                                : s.run_status === "failed"
                                  ? "bg-danger/10 text-danger"
                                  : "bg-muted/10 text-muted"
                          }`}
                        >
                          {s.run_status || "unknown"}
                        </span>
                      </td>
                    </tr>
                  )
                )
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
