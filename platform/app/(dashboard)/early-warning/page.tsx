import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/org-helpers";
import Link from "next/link";
import { EarlyWarningActions } from "./actions";

export const dynamic = 'force-dynamic';

export const metadata = { title: "Early Warning System" };

export default async function EarlyWarningPage() {
  const supabase = await createClient();
  const orgId = await getCurrentOrgId();

  // Fetch latest 30 days of velocity snapshots
  const { data: velocitySnapshots } = await supabase
    .from("velocity_snapshots")
    .select("*")
    .eq("organization_id", orgId)
    .order("snapshot_date", { ascending: false })
    .limit(30);

  // Fetch latest bottleneck snapshot
  const { data: bottleneckSnapshots } = await supabase
    .from("bottleneck_snapshots")
    .select("*")
    .eq("organization_id", orgId)
    .order("snapshot_date", { ascending: false})
    .limit(1);

  // Fetch Brain causal edges for root cause explanations
  const { data: causalEdges } = await supabase
    .from("causal_relationships_statistical")
    .select("source_domain, target_domain, source_metric, target_metric, effect_size, confidence, natural_language, optimal_lag_days")
    .eq("organization_id", orgId)
    .order("confidence", { ascending: false })
    .limit(10);

  // Fetch recent Brain early warning alerts from ai_memory
  const { data: brainAlerts } = await supabase
    .from("ai_memory")
    .select("content, metadata, created_at")
    .eq("organization_id", orgId)
    .eq("memory_type", "alert")
    .order("created_at", { ascending: false })
    .limit(5);

  const latestBottleneck = bottleneckSnapshots?.[0];
  const latestVelocity = velocitySnapshots?.[0];

  // Calculate velocity trend (last 7 days vs previous 7 days)
  const last7Days = velocitySnapshots?.slice(0, 7) || [];
  const prev7Days = velocitySnapshots?.slice(7, 14) || [];

  const avgLast7 = last7Days.reduce((sum: number, s: any) => sum + (s.prs_merged || 0), 0) / (last7Days.length || 1);
  const avgPrev7 = prev7Days.reduce((sum: number, s: any) => sum + (s.prs_merged || 0), 0) / (prev7Days.length || 1);
  const velocityChange = avgPrev7 > 0 ? ((avgLast7 - avgPrev7) / avgPrev7) * 100 : 0;

  const isVelocityCollapse = velocityChange < -25; // 25% drop

  // Find engineering-related causal edges for Brain explanations
  const engineeringCauses = (causalEdges || []).filter(
    (e: any) => e.source_domain === 'engineering' || e.target_domain === 'engineering'
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Early Warning System</h1>
          <p className="text-xs text-muted mt-0.5">
            Brain-powered velocity collapse prediction + bottleneck concentration risk
          </p>
        </div>
        <Link
          href="/copilot"
          className="px-4 py-2.5 rounded-lg bg-accent hover:bg-accent-dark text-accent-foreground text-sm font-medium transition-colors flex items-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
          </svg>
          Ask Brain
        </Link>
      </div>

      {/* Brain Intelligence Summary */}
      {(engineeringCauses.length > 0 || (brainAlerts && brainAlerts.length > 0)) && (
        <div className="rounded-xl bg-gradient-to-r from-indigo-500/5 to-purple-500/5 border border-indigo-500/20 p-5">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-6 h-6 rounded-full bg-indigo-500/10 flex items-center justify-center text-xs">
              🧠
            </div>
            <h3 className="text-sm font-medium">Brain Intelligence</h3>
            <span className="text-[10px] text-muted bg-surface px-1.5 py-0.5 rounded">
              {engineeringCauses.length} causal edges
            </span>
          </div>

          {/* Brain Causal Insights */}
          {engineeringCauses.length > 0 && (
            <div className="space-y-2 mb-3">
              <div className="text-xs font-medium text-muted uppercase tracking-wider">Causal Relationships Discovered</div>
              {engineeringCauses.slice(0, 3).map((edge: any, i: number) => (
                <div key={i} className="flex items-center gap-2 text-xs">
                  <span className={`w-1.5 h-1.5 rounded-full ${edge.effect_size > 0 ? 'bg-success' : 'bg-danger'}`} />
                  <span className="text-foreground">{edge.natural_language}</span>
                  <span className="text-muted ml-auto">
                    {(edge.confidence * 100).toFixed(0)}% confidence
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Recent Brain Alerts */}
          {brainAlerts && brainAlerts.length > 0 && (
            <div className="space-y-2">
              <div className="text-xs font-medium text-muted uppercase tracking-wider">Recent Brain Alerts</div>
              {brainAlerts.slice(0, 2).map((alert: any, i: number) => {
                const meta = alert.metadata as any;
                const severity = meta?.severity || 'info';
                return (
                  <div key={i} className="flex items-start gap-2 text-xs">
                    <span className={`mt-0.5 ${
                      severity === 'critical' ? 'text-danger' : severity === 'warning' ? 'text-warning' : 'text-muted'
                    }`}>
                      {severity === 'critical' ? '🚨' : severity === 'warning' ? '⚠️' : 'ℹ️'}
                    </span>
                    <div>
                      <div className="text-foreground line-clamp-2">{alert.content}</div>
                      <div className="text-muted mt-0.5">
                        {new Date(alert.created_at).toLocaleDateString('en-US', {
                          month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
                        })}
                        {meta?.cognitive_layers_used && (
                          <span className="ml-2">
                            Layers: {(meta.cognitive_layers_used as string[]).join(', ')}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Alert Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Velocity Collapse Alert */}
        <div className={`rounded-xl border p-5 ${
          isVelocityCollapse
            ? 'bg-danger/5 border-danger'
            : 'bg-card border-border-subtle'
        }`}>
          <div className="flex items-start justify-between mb-4">
            <div>
              <h3 className="text-sm font-medium">Velocity Collapse Risk</h3>
              <p className="text-xs text-muted mt-1">Deploy velocity trend</p>
            </div>
            {isVelocityCollapse && (
              <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider bg-danger/10 text-danger">
                ⚠️ High Risk
              </span>
            )}
          </div>

          <div className="space-y-3">
            <div>
              <div className="text-2xl font-bold">
                {velocityChange >= 0 ? '+' : ''}{velocityChange.toFixed(1)}%
              </div>
              <div className="text-xs text-muted">7-day velocity change</div>
            </div>

            {latestVelocity && (
              <>
                <div className="grid grid-cols-2 gap-3 pt-3 border-t border-border-subtle">
                  <div>
                    <div className="text-sm font-medium">{latestVelocity.prs_merged || 0}</div>
                    <div className="text-xs text-muted">PRs merged (last 7d)</div>
                  </div>
                  <div>
                    <div className="text-sm font-medium">
                      {latestVelocity.mean_pr_cycle_time_hours
                        ? `${(latestVelocity.mean_pr_cycle_time_hours / 24).toFixed(1)}d`
                        : '-'}
                    </div>
                    <div className="text-xs text-muted">Avg cycle time</div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="text-sm font-medium">{latestVelocity.open_pr_count || 0}</div>
                    <div className="text-xs text-muted">Open PRs (WIP)</div>
                  </div>
                  <div>
                    <div className="text-sm font-medium">
                      {latestVelocity.mean_review_latency_hours
                        ? `${(latestVelocity.mean_review_latency_hours / 24).toFixed(1)}d`
                        : '-'}
                    </div>
                    <div className="text-xs text-muted">Review latency</div>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Bottleneck Risk Alert */}
        <div className={`rounded-xl border p-5 ${
          latestBottleneck && latestBottleneck.risk_level === 'high'
            ? 'bg-warning/5 border-warning'
            : 'bg-card border-border-subtle'
        }`}>
          <div className="flex items-start justify-between mb-4">
            <div>
              <h3 className="text-sm font-medium">Bottleneck Concentration</h3>
              <p className="text-xs text-muted mt-1">Reviewer concentration risk</p>
            </div>
            {latestBottleneck && (
              <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ${
                latestBottleneck.risk_level === 'high'
                  ? 'bg-danger/10 text-danger'
                  : latestBottleneck.risk_level === 'medium'
                  ? 'bg-warning/10 text-warning'
                  : 'bg-success/10 text-success'
              }`}>
                {latestBottleneck.risk_level === 'high' && '⚠️'}
                {latestBottleneck.risk_level === 'medium' && '⚡'}
                {latestBottleneck.risk_level === 'low' && '✓'}
                {' '}{latestBottleneck.risk_level} risk
              </span>
            )}
          </div>

          {latestBottleneck ? (
            <div className="space-y-3">
              <div>
                <div className="text-2xl font-bold">{latestBottleneck.bottleneck_risk_score?.toFixed(0) || 0}</div>
                <div className="text-xs text-muted">Risk score (0-100)</div>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-3 border-t border-border-subtle">
                <div>
                  <div className="text-sm font-medium">
                    {latestBottleneck.top_reviewer_share
                      ? `${(latestBottleneck.top_reviewer_share * 100).toFixed(0)}%`
                      : '-'}
                  </div>
                  <div className="text-xs text-muted">Top reviewer share</div>
                </div>
                <div>
                  <div className="text-sm font-medium">
                    {latestBottleneck.reviewer_gini_coefficient?.toFixed(2) || '-'}
                  </div>
                  <div className="text-xs text-muted">Gini coefficient</div>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-sm text-muted py-4">
              No bottleneck data available. Run analysis to generate risk report.
            </div>
          )}
        </div>
      </div>

      {/* Velocity Trend Chart (last 30 days) */}
      <div className="rounded-xl bg-card border border-border-subtle p-5">
        <h3 className="text-sm font-medium mb-4">Deploy Velocity Trend (Last 30 Days)</h3>
        {velocitySnapshots && velocitySnapshots.length > 0 ? (
          <div className="space-y-2">
            {velocitySnapshots.slice(0, 14).reverse().map((snapshot: any) => {
              const date = new Date(snapshot.snapshot_date).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
              });
              const prs = snapshot.prs_merged || 0;
              const maxPRs = Math.max(...(velocitySnapshots || []).map((s: any) => s.prs_merged || 0));
              const width = maxPRs > 0 ? (prs / maxPRs) * 100 : 0;

              return (
                <div key={snapshot.id} className="flex items-center gap-3">
                  <div className="w-16 text-xs text-muted font-mono">{date}</div>
                  <div className="flex-1 h-6 rounded bg-surface overflow-hidden">
                    <div
                      className="h-full bg-accent transition-all flex items-center justify-end pr-2"
                      style={{ width: `${width}%` }}
                    >
                      {prs > 0 && (
                        <span className="text-xs font-medium text-accent-foreground">{prs}</span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-sm text-muted py-8 text-center">
            No velocity data available. Ingest GitHub PRs to populate velocity metrics.
          </div>
        )}
      </div>

      {/* Quick Actions — WIRED to real API calls */}
      <EarlyWarningActions orgId={orgId} />
    </div>
  );
}
