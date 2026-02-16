import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/org-helpers";
import Link from "next/link";

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
    .select(`
      *,
      top_reviewer:engineers!bottleneck_snapshots_top_reviewer_id_fkey(id, name, github_login)
    `)
    .eq("organization_id", orgId)
    .order("snapshot_date", { ascending: false})
    .limit(1);

  const latestBottleneck = bottleneckSnapshots?.[0];
  const latestVelocity = velocitySnapshots?.[0];

  // Calculate velocity trend (last 7 days vs previous 7 days)
  const last7Days = velocitySnapshots?.slice(0, 7) || [];
  const prev7Days = velocitySnapshots?.slice(7, 14) || [];

  const avgLast7 = last7Days.reduce((sum, s) => sum + (s.prs_merged || 0), 0) / (last7Days.length || 1);
  const avgPrev7 = prev7Days.reduce((sum, s) => sum + (s.prs_merged || 0), 0) / (prev7Days.length || 1);
  const velocityChange = avgPrev7 > 0 ? ((avgLast7 - avgPrev7) / avgPrev7) * 100 : 0;

  const isVelocityCollapse = velocityChange < -25; // 25% drop

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Early Warning System</h1>
          <p className="text-xs text-muted mt-0.5">
            Velocity collapse prediction + bottleneck concentration risk
          </p>
        </div>
        <Link
          href="/early-warning/run-analysis"
          className="px-4 py-2.5 rounded-lg bg-accent hover:bg-accent-dark text-accent-foreground text-sm font-medium transition-colors flex items-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
          Run Analysis
        </Link>
      </div>

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
                        : '—'}
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
                        : '—'}
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
                      : '—'}
                  </div>
                  <div className="text-xs text-muted">Top reviewer share</div>
                </div>
                <div>
                  <div className="text-sm font-medium">
                    {latestBottleneck.reviewer_gini_coefficient?.toFixed(2) || '—'}
                  </div>
                  <div className="text-xs text-muted">Gini coefficient</div>
                </div>
              </div>

              {latestBottleneck.top_reviewer && (
                <div className="pt-3 border-t border-border-subtle">
                  <div className="text-xs text-muted mb-1">Top bottleneck reviewer:</div>
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-accent/10 flex items-center justify-center text-xs font-medium">
                      {(latestBottleneck.top_reviewer as any).name?.[0] || '?'}
                    </div>
                    <span className="text-sm font-medium">
                      {(latestBottleneck.top_reviewer as any).name || 'Unknown'}
                    </span>
                    <span className="text-xs text-muted">
                      @{(latestBottleneck.top_reviewer as any).github_login}
                    </span>
                  </div>
                </div>
              )}
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
            {velocitySnapshots.slice(0, 14).reverse().map((snapshot) => {
              const date = new Date(snapshot.snapshot_date).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
              });
              const prs = snapshot.prs_merged || 0;
              const maxPRs = Math.max(...velocitySnapshots.map(s => s.prs_merged || 0));
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

      {/* Quick Actions */}
      <div className="rounded-xl bg-card border border-border-subtle p-5">
        <h3 className="text-sm font-medium mb-4">Setup & Configuration</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Link
            href="/connectors"
            className="p-4 rounded-lg border border-border-subtle hover:bg-surface-hover transition-colors"
          >
            <div className="text-sm font-medium mb-1">1. Connect GitHub</div>
            <div className="text-xs text-muted">
              Connect your GitHub repositories to start ingesting PR data
            </div>
          </Link>

          <button
            className="p-4 rounded-lg border border-border-subtle hover:bg-surface-hover transition-colors text-left"
            onClick={() => {
              // TODO: Trigger P0 ingestion
              alert('P0 ingestion will be implemented via API call to /api/connectors/github/ingest-p0');
            }}
          >
            <div className="text-sm font-medium mb-1">2. Ingest Historical Data</div>
            <div className="text-xs text-muted">
              Backfill 90 days of PR/review data for velocity modeling
            </div>
          </button>

          <button
            className="p-4 rounded-lg border border-border-subtle hover:bg-surface-hover transition-colors text-left"
            onClick={() => {
              // TODO: Trigger analysis
              alert('Analysis will run via POST /api/early-warning/analyze');
            }}
          >
            <div className="text-sm font-medium mb-1">3. Run Analysis</div>
            <div className="text-xs text-muted">
              Generate velocity + bottleneck risk predictions
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}
