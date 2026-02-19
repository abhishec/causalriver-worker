import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/org-helpers";
import Link from "next/link";
import { EarlyWarningActions } from "./actions";
import { ReviewerDistributionChart, BRSBreakdown } from "./bottleneck-charts";
import { EmptyState } from "@/components/ui/EmptyState";

export const dynamic = 'force-dynamic';

export const metadata = { title: "Early Warning System" };

export default async function EarlyWarningPage() {
  const supabase = await createClient();
  const orgId = await getCurrentOrgId();

  // ── Workspace / Branch context ──────────────────────────────────────────
  // Each workspace-org has a primaryBranch stored in org_connectors.
  // We surface this as a badge so the user knows this velocity/bottleneck
  // data is scoped to their specific branch (e.g. release/6.3.4).
  const { data: githubConnector } = await supabase
    .from("org_connectors")
    .select("config")
    .eq("organization_id", orgId)
    .eq("connector_type", "github")
    .limit(1)
    .maybeSingle();

  const primaryBranch: string | null = githubConnector?.config?.primaryBranch ?? null;
  const releaseVersion: string | null = primaryBranch
    ? (githubConnector?.config?.releaseVersionMap?.[primaryBranch] ?? null)
    : null;
  const githubRepo: string | null = githubConnector?.config?.githubRepo ?? null;

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
          href={`/copilot?q=${encodeURIComponent(
            isVelocityCollapse
              ? `Our deploy velocity dropped ${Math.abs(velocityChange).toFixed(0)}% in the last 7 days. ${latestBottleneck ? `Bottleneck risk score is ${latestBottleneck.bottleneck_risk_score?.toFixed(0) || 0}/100 (${latestBottleneck.risk_level}).` : ""} What's causing this and what should we do about it?`
              : latestBottleneck && latestBottleneck.risk_level === 'high'
                ? `Our bottleneck risk score is ${latestBottleneck.bottleneck_risk_score?.toFixed(0) || 0}/100 (${latestBottleneck.risk_level} risk). ${latestBottleneck.top_reviewer_login ? `Top reviewer ${latestBottleneck.top_reviewer_login} handles ${((latestBottleneck.top_reviewer_share || 0) * 100).toFixed(0)}% of reviews.` : ""} Analyze the root causes and recommend fixes.`
                : "Give me a full early warning analysis — velocity trends, bottleneck risks, and causal factors affecting our engineering health."
          )}`}
          className="px-4 py-2.5 rounded-lg bg-accent hover:bg-accent-dark text-accent-foreground text-sm font-medium transition-colors flex items-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
          </svg>
          Ask Brain
        </Link>
      </div>

      {/* Workspace / Branch Context Badge */}
      {(primaryBranch || githubRepo) && (
        <div className="flex items-center gap-2 flex-wrap text-xs">
          <span className="text-muted">Workspace scope:</span>
          {githubRepo && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-mono bg-surface border border-border-subtle text-muted">
              {githubRepo}
            </span>
          )}
          {primaryBranch && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-mono font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              🌿 {primaryBranch}
            </span>
          )}
          {releaseVersion && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20">
              v{releaseVersion}
            </span>
          )}
          <span className="text-muted">
            · All metrics isolated to this workspace
          </span>
          <Link
            href="/se-aas"
            className="ml-auto text-accent hover:text-accent/80 transition-colors"
          >
            View SE-AAS Dashboard →
          </Link>
        </div>
      )}

      {/* Brain Intelligence Summary */}
      {(engineeringCauses.length > 0 || (brainAlerts && brainAlerts.length > 0)) && (
        <div className="rounded-xl bg-gradient-to-r from-indigo-500/5 to-purple-500/5 border border-indigo-500/20 p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-indigo-500/10 flex items-center justify-center text-xs">
                🧠
              </div>
              <h3 className="text-sm font-medium">Brain Intelligence</h3>
              <span className="text-[10px] text-muted bg-surface px-1.5 py-0.5 rounded">
                {engineeringCauses.length} causal edges
              </span>
            </div>
            <Link
              href="/brain"
              className="text-[10px] text-accent hover:text-accent/80 font-medium transition-colors"
            >
              Explore in Brain →
            </Link>
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
                    {((edge.confidence || 0) * 100).toFixed(0)}% confidence
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
                  <div className="text-xs text-muted">
                    Top reviewer{latestBottleneck.top_reviewer_login ? ` (${latestBottleneck.top_reviewer_login})` : ''}
                  </div>
                  {latestBottleneck.top_reviewer_share > 0.4 && (
                    <div className="text-[10px] text-danger mt-0.5">⚠️ Above 40% threshold</div>
                  )}
                </div>
                <div>
                  <div className="text-sm font-medium">
                    {latestBottleneck.reviewer_gini_coefficient?.toFixed(2) || '-'}
                  </div>
                  <div className="text-xs text-muted">Gini coefficient</div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className={`text-sm font-medium ${
                    latestBottleneck.reviewer_hhi > 0.25 ? 'text-danger' : ''
                  }`}>
                    {latestBottleneck.reviewer_hhi?.toFixed(3) || '-'}
                  </div>
                  <div className="text-xs text-muted">HHI index</div>
                  {latestBottleneck.reviewer_hhi > 0.25 && (
                    <div className="text-[10px] text-danger mt-0.5">⚠️ Concentrated (&gt;0.25)</div>
                  )}
                </div>
                <div>
                  <div className="text-sm font-medium">
                    {latestBottleneck.max_betweenness_centrality
                      ? (latestBottleneck.max_betweenness_centrality * 100).toFixed(1)
                      : '-'}
                  </div>
                  <div className="text-xs text-muted">Betweenness centrality</div>
                </div>
              </div>
            </div>
          ) : (
            <EmptyState
              icon={
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
                </svg>
              }
              title="No bottleneck data yet"
              description="Connect your GitHub repository and run the bottleneck analysis to measure reviewer concentration risk."
              className="py-8"
            />
          )}
        </div>
      </div>

      {/* Velocity Prediction (from GBRT model) */}
      {latestVelocity?.predicted_velocity != null && (
        <div className="rounded-xl bg-gradient-to-r from-blue-500/5 to-cyan-500/5 border border-blue-500/20 p-5">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-6 h-6 rounded-full bg-blue-500/10 flex items-center justify-center text-xs">
              📈
            </div>
            <h3 className="text-sm font-medium">Velocity Prediction</h3>
            <span className="text-[10px] text-muted bg-surface px-1.5 py-0.5 rounded">
              Gradient Boosted Tree Model
            </span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <div className="text-xl font-bold">{latestVelocity.predicted_velocity?.toFixed(1)}</div>
              <div className="text-xs text-muted">Predicted next sprint velocity</div>
            </div>
            <div>
              <div className="text-sm font-medium">
                [{latestVelocity.prediction_lower_bound?.toFixed(1)} — {latestVelocity.prediction_upper_bound?.toFixed(1)}]
              </div>
              <div className="text-xs text-muted">95% confidence interval</div>
            </div>
            <div>
              <div className={`text-sm font-medium ${
                (latestVelocity.collapse_probability || 0) > 0.5 ? 'text-danger' : 'text-success'
              }`}>
                {((latestVelocity.collapse_probability || 0) * 100).toFixed(0)}%
              </div>
              <div className="text-xs text-muted">Collapse probability</div>
            </div>
            <div>
              <div className="text-sm font-medium">
                {((latestVelocity.model_confidence || 0) * 100).toFixed(0)}%
              </div>
              <div className="text-xs text-muted">Model confidence</div>
            </div>
          </div>
        </div>
      )}

      {/* Reviewer Distribution + BRS Breakdown */}
      {latestBottleneck && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Reviewer Distribution Chart */}
          <div className="rounded-xl bg-card border border-border-subtle p-5">
            <div className="flex items-center gap-2 mb-3">
              <h3 className="text-sm font-medium">Reviewer Distribution</h3>
              <span className="text-[10px] text-muted bg-surface px-1.5 py-0.5 rounded">
                Review share %
              </span>
            </div>
            <ReviewerDistributionChart
              reviewerBreakdown={latestBottleneck.reviewer_breakdown || []}
            />
          </div>

          {/* BRS Component Breakdown */}
          <div className="rounded-xl bg-card border border-border-subtle p-5">
            <div className="flex items-center gap-2 mb-3">
              <h3 className="text-sm font-medium">Risk Score Breakdown</h3>
              <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                latestBottleneck.risk_level === 'high'
                  ? 'bg-danger/10 text-danger'
                  : latestBottleneck.risk_level === 'medium'
                  ? 'bg-warning/10 text-warning'
                  : 'bg-success/10 text-success'
              }`}>
                {latestBottleneck.risk_level}
              </span>
            </div>
            <BRSBreakdown
              reviewerBreakdown={latestBottleneck.reviewer_breakdown || []}
              riskScore={latestBottleneck.bottleneck_risk_score || 0}
              giniCoefficient={latestBottleneck.reviewer_gini_coefficient || 0}
              hhi={latestBottleneck.reviewer_hhi || 0}
              topReviewerShare={latestBottleneck.top_reviewer_share || 0}
              reviewerCount={(latestBottleneck.reviewer_breakdown || []).length || 1}
              maxBetweenness={latestBottleneck.max_betweenness_centrality || 0}
              avgLatencyHours={latestBottleneck.avg_review_latency_hours || 0}
            />
          </div>
        </div>
      )}

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
          <EmptyState
            icon={
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
              </svg>
            }
            title="No velocity data yet"
            description="Ingest GitHub pull requests to start tracking deploy velocity trends and collapse predictions."
          />
        )}
      </div>

      {/* Quick Actions — WIRED to real API calls */}
      <EarlyWarningActions orgId={orgId} />
    </div>
  );
}
