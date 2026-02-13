import { createClient } from "@/lib/supabase/server";
import { formatNumber, formatUSD } from "@/lib/utils";
import { MetricCard } from "@/components/dashboard/MetricCard";

export const dynamic = 'force-dynamic';

const CORE_ORG_ID = "00000000-0000-4000-a000-000000000001";

export const metadata = { title: "Admin - Core Brain" };

export default async function AdminBrainCorePage() {
  const supabase = await createClient();

  const [snapshotsResult, signalsResult, edgesResult, memoriesResult, patternsResult] = await Promise.all([
    supabase.from("brain_daily_snapshots").select("*").eq("organization_id", CORE_ORG_ID).order("snapshot_date", { ascending: false }).limit(14),
    supabase.from("cross_domain_signals").select("id", { count: "exact", head: true }).eq("organization_id", CORE_ORG_ID),
    supabase.from("causal_relationships_statistical").select("id", { count: "exact", head: true }).eq("organization_id", CORE_ORG_ID),
    supabase.from("ai_memory").select("id", { count: "exact", head: true }).eq("organization_id", CORE_ORG_ID),
    supabase.from("brain_grammar_rules").select("id", { count: "exact", head: true }).eq("organization_id", CORE_ORG_ID),
  ]);

  const snapshots = snapshotsResult.data || [];
  const latest = snapshots[0];
  const totalSignals = signalsResult.count || 0;
  const totalEdges = edgesResult.count || 0;
  const totalMemories = memoriesResult.count || 0;
  const totalPatterns = patternsResult.count || 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Core Brain</h1>
        <p className="text-muted text-sm mt-1">Deep dive into the platform&apos;s core intelligence engine</p>
      </div>

      {/* Core Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <MetricCard label="Signals" value={formatNumber(totalSignals)} pulse />
        <MetricCard label="Causal Edges" value={formatNumber(totalEdges)} />
        <MetricCard label="Memories" value={formatNumber(totalMemories)} />
        <MetricCard label="Patterns" value={formatNumber(totalPatterns)} />
        <MetricCard label="Accuracy" value={`${latest?.prediction_accuracy?.toFixed(1) || 0}%`} />
      </div>

      {/* Snapshot History */}
      <div className="rounded-xl bg-card border border-border/50 p-5">
        <h3 className="text-sm font-medium mb-4">Training History (Last 14 Days)</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-muted border-b border-border/30">
                <th className="text-left py-2 font-medium">Date</th>
                <th className="text-right py-2 font-medium">Signals</th>
                <th className="text-right py-2 font-medium">New Edges</th>
                <th className="text-right py-2 font-medium">Strengthened</th>
                <th className="text-right py-2 font-medium">Pruned</th>
                <th className="text-right py-2 font-medium">Anomalies</th>
                <th className="text-right py-2 font-medium">Patterns</th>
                <th className="text-right py-2 font-medium">Duration</th>
                <th className="text-left py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {snapshots.map((s) => (
                <tr key={s.id} className="border-b border-border/10 hover:bg-surface-hover">
                  <td className="py-2 font-mono text-xs">{s.snapshot_date}</td>
                  <td className="py-2 text-right">{s.signals_processed}</td>
                  <td className="py-2 text-right text-success">{s.new_connections}</td>
                  <td className="py-2 text-right">{s.edges_strengthened}</td>
                  <td className="py-2 text-right text-warning">{s.edges_pruned}</td>
                  <td className="py-2 text-right">{s.anomalies_detected}</td>
                  <td className="py-2 text-right">{s.patterns_found}</td>
                  <td className="py-2 text-right text-muted">{s.run_duration_ms ? `${(s.run_duration_ms / 1000).toFixed(1)}s` : '-'}</td>
                  <td className="py-2">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                      s.run_status === 'completed' ? 'bg-success/10 text-success' :
                      s.run_status === 'running' ? 'bg-accent/10 text-accent' :
                      'bg-danger/10 text-danger'
                    }`}>
                      {s.run_status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {snapshots.length === 0 && (
            <p className="text-sm text-muted text-center py-6">No training snapshots yet. Wait for the first consolidation run.</p>
          )}
        </div>
      </div>

      {/* Latest Discoveries */}
      {latest?.top_discoveries && latest.top_discoveries.length > 0 && (
        <div className="rounded-xl bg-card border border-border/50 p-5">
          <h3 className="text-sm font-medium mb-4">Latest Discoveries</h3>
          <div className="space-y-2">
            {latest.top_discoveries.map((d: string, i: number) => (
              <div key={i} className="flex items-start gap-3 px-3 py-2 rounded-lg bg-surface">
                <span className="text-accent mt-0.5 shrink-0">&#x2022;</span>
                <span className="text-sm text-muted-foreground">{d}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Narrative */}
      {latest?.narrative && (
        <div className="rounded-xl bg-card border border-accent/20 p-5">
          <h3 className="text-sm font-medium mb-3 text-accent">Brain Narrative</h3>
          <p className="text-sm text-muted-foreground leading-relaxed">{latest.narrative}</p>
        </div>
      )}
    </div>
  );
}
