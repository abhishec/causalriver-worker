import { createClient } from "@/lib/supabase/server";
import { MetricCard } from "@/components/dashboard/MetricCard";
import { formatUSD, formatNumber } from "@/lib/utils";

export const dynamic = 'force-dynamic';

export const metadata = { title: "Admin Overview" };

export default async function AdminOverviewPage() {
  const supabase = await createClient();
  const today = new Date().toISOString().split("T")[0];

  const [orgsResult, signalsResult, edgesResult, costResult, awsResult, eventsResult] = await Promise.all([
    supabase.from("organizations").select("id, name, slug, plan, is_core_brain, created_at").order("created_at"),
    supabase.from("cross_domain_signals").select("id", { count: "exact", head: true }),
    supabase.from("causal_relationships_statistical").select("id", { count: "exact", head: true }),
    supabase.from("llm_cost_log").select("estimated_cost_usd").gte("created_at", today),
    supabase.from("aws_cost_snapshots").select("total_aws_cost").order("period_start", { ascending: false }).limit(1),
    supabase.from("platform_events").select("id, event_type, source, title, created_at").order("created_at", { ascending: false }).limit(10),
  ]);

  const orgs = orgsResult.data || [];
  const totalSignals = signalsResult.count || 0;
  const totalEdges = edgesResult.count || 0;
  const costToday = (costResult.data || []).reduce((sum, r) => sum + (r.estimated_cost_usd || 0), 0);
  const latestAWS = awsResult.data?.[0]?.total_aws_cost || 0;
  const events = eventsResult.data || [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Platform Admin</h1>
        <p className="text-muted text-sm mt-1">Global system health and organization management</p>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard label="Organizations" value={orgs.length} subtitle={`${orgs.filter(o => o.is_core_brain).length} core + ${orgs.filter(o => !o.is_core_brain).length} tenant`} pulse />
        <MetricCard label="Total Signals" value={formatNumber(totalSignals)} subtitle="Across all orgs" />
        <MetricCard label="Causal Edges" value={formatNumber(totalEdges)} subtitle="Brain knowledge" pulse />
        <MetricCard label="LLM Cost Today" value={formatUSD(costToday)} subtitle={`AWS: ${formatUSD(latestAWS)}/day`} />
      </div>

      {/* Orgs Table + Events */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Organizations */}
        <div className="rounded-xl bg-card border border-border/50 p-5">
          <h3 className="text-sm font-medium mb-4">Organizations</h3>
          <div className="space-y-2">
            {orgs.map((org) => (
              <div key={org.id} className="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-surface-hover transition-colors">
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${org.is_core_brain ? 'bg-accent/20' : 'bg-surface'}`}>
                    <span className={`text-xs font-bold ${org.is_core_brain ? 'text-accent' : 'text-muted'}`}>
                      {org.name.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div>
                    <div className="text-sm font-medium">{org.name}</div>
                    <div className="text-[10px] text-muted">{org.slug} / {org.plan}</div>
                  </div>
                </div>
                {org.is_core_brain && (
                  <span className="px-1.5 py-0.5 rounded bg-accent/10 text-accent text-[10px] font-medium">Core</span>
                )}
              </div>
            ))}
            {orgs.length === 0 && (
              <p className="text-sm text-muted text-center py-4">No organizations yet</p>
            )}
          </div>
        </div>

        {/* Recent Events */}
        <div className="rounded-xl bg-card border border-border/50 p-5">
          <h3 className="text-sm font-medium mb-4">Recent Platform Events</h3>
          <div className="space-y-2">
            {events.map((evt) => (
              <div key={evt.id} className="flex items-start gap-3 px-3 py-2 rounded-lg hover:bg-surface-hover transition-colors">
                <div className={`mt-0.5 w-2 h-2 rounded-full shrink-0 ${
                  evt.event_type === 'error' ? 'bg-danger' :
                  evt.event_type === 'warning' ? 'bg-warning' :
                  evt.event_type === 'training_complete' ? 'bg-success' :
                  'bg-info'
                }`} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm">{evt.title}</div>
                  <div className="text-[10px] text-muted">{evt.source} / {new Date(evt.created_at).toLocaleString()}</div>
                </div>
              </div>
            ))}
            {events.length === 0 && (
              <p className="text-sm text-muted text-center py-4">No events yet. Brain processes will log events here.</p>
            )}
          </div>
        </div>
      </div>

      {/* System Status */}
      <div className="rounded-xl bg-card border border-border/50 p-5">
        <h3 className="text-sm font-medium mb-4">System Status</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-success brain-pulse" />
            <span className="text-sm">ECS Cluster</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-success brain-pulse" />
            <span className="text-sm">EventBridge</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-success brain-pulse" />
            <span className="text-sm">Supabase</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-success brain-pulse" />
            <span className="text-sm">ECR Registry</span>
          </div>
        </div>
      </div>
    </div>
  );
}
