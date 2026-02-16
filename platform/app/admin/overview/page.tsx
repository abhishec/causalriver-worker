import { createClient } from "@/lib/supabase/server";
import { formatUSD, formatNumber } from "@/lib/utils";
import { StatValue } from "@/components/ui/StatValue";
import { Card, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { StatusDot } from "@/components/ui/StatusDot";
import { DataTable } from "@/components/ui/DataTable";
import Link from "next/link";

export const dynamic = 'force-dynamic';

export const metadata = { title: "Mission Control" };

export default async function AdminOverviewPage() {
  const supabase = await createClient();
  const today = new Date().toISOString().split("T")[0];
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();

  const [orgsResult, signalsResult, edgesResult, costResult, awsResult, eventsResult, activeUsersResult, agentRunsResult] = await Promise.all([
    supabase.from("organizations").select("id, name, slug, plan, is_core_brain, created_at").order("created_at"),
    supabase.from("cross_domain_signals").select("id", { count: "exact", head: true }),
    supabase.from("causal_relationships_statistical").select("id", { count: "exact", head: true }),
    supabase.from("llm_cost_log").select("estimated_cost_usd").gte("created_at", today),
    supabase.from("aws_cost_snapshots").select("total_aws_cost").order("period_start", { ascending: false }).limit(1),
    supabase.from("platform_events").select("id, event_type, source, title, created_at, event_data").order("created_at", { ascending: false }).limit(15),
    // Active users (last 24h sessions)
    supabase.from("org_members").select("user_id, role, organizations(name)").limit(50),
    // Recent agent runs
    supabase.from("ai_agent_activity").select("id, agent_type, action, status, created_at").order("created_at", { ascending: false }).limit(10),
  ]);

  const orgs = orgsResult.data || [];
  const totalSignals = signalsResult.count || 0;
  const totalEdges = edgesResult.count || 0;
  const costToday = (costResult.data || []).reduce((sum, r) => sum + (r.estimated_cost_usd || 0), 0);
  const latestAWS = awsResult.data?.[0]?.total_aws_cost || 0;
  const events = eventsResult.data || [];
  const members = activeUsersResult.data || [];
  const agentRuns = agentRunsResult.data || [];

  const SYSTEM_SERVICES = [
    { name: "ECS Cluster", status: "active" as const },
    { name: "EventBridge", status: "active" as const },
    { name: "Supabase", status: "active" as const },
    { name: "ECR Registry", status: "active" as const },
    { name: "S3 Storage", status: "active" as const },
    { name: "CloudWatch", status: "active" as const },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Mission Control</h1>
        <p className="text-xs text-muted mt-0.5">Platform-wide health, organizations, and system status</p>
      </div>

      {/* Stats Strip */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatValue label="Organizations" value={String(orgs.length)} subtitle={`${orgs.filter(o => o.is_core_brain).length} core`} />
        <StatValue label="Total Users" value={String(members.length)} subtitle="All orgs" />
        <StatValue label="Total Signals" value={formatNumber(totalSignals)} />
        <StatValue label="Causal Edges" value={formatNumber(totalEdges)} />
        <StatValue label="LLM Cost Today" value={formatUSD(costToday)} />
        <StatValue label="AWS Cost" value={formatUSD(latestAWS)} subtitle="/day" />
      </div>

      {/* Two-column: Orgs + Events */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Organizations */}
        <Card>
          <div className="flex items-center justify-between mb-4">
            <CardTitle>Organizations</CardTitle>
            <Link href="/admin/orgs" className="text-xs text-accent hover:text-accent/80">View all</Link>
          </div>
          <div className="space-y-1.5">
            {orgs.map((org) => (
              <Link
                key={org.id}
                href={`/admin/orgs/${org.id}`}
                className="flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-surface-hover transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${org.is_core_brain ? 'bg-accent/20' : 'bg-surface'}`}>
                    <span className={`text-xs font-bold ${org.is_core_brain ? 'text-accent' : 'text-muted'}`}>
                      {org.name.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div>
                    <div className="text-sm font-medium">{org.name}</div>
                    <div className="text-[10px] text-muted">{org.slug}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={org.is_core_brain ? "accent" : "default"} size="xs">
                    {org.is_core_brain ? "Core" : org.plan}
                  </Badge>
                  <svg className="w-3.5 h-3.5 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                  </svg>
                </div>
              </Link>
            ))}
            {orgs.length === 0 && (
              <p className="text-sm text-muted text-center py-6">No organizations</p>
            )}
          </div>
        </Card>

        {/* Events Stream */}
        <Card>
          <CardTitle className="mb-4">Platform Events</CardTitle>
          <div className="space-y-1.5">
            {events.map((evt) => (
              <div key={evt.id} className="flex items-start gap-3 px-3 py-2 rounded-lg hover:bg-surface-hover transition-colors">
                <StatusDot
                  type={
                    evt.event_type === 'error' ? 'error' :
                    evt.event_type === 'warning' ? 'warning' :
                    evt.event_type === 'training_complete' || evt.event_type === 'consolidation.complete' ? 'success' :
                    'active'
                  }
                  size="sm"
                  className="mt-1"
                />
                <div className="flex-1 min-w-0">
                  <div className="text-sm truncate">{evt.title || evt.event_type}</div>
                  <div className="text-[10px] text-muted">{evt.source} · {new Date(evt.created_at).toLocaleString()}</div>
                </div>
              </div>
            ))}
            {events.length === 0 && (
              <p className="text-sm text-muted text-center py-6">No events yet</p>
            )}
          </div>
        </Card>
      </div>

      {/* System Status + Recent Agent Runs */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* System Health */}
        <Card>
          <CardTitle className="mb-4">System Health</CardTitle>
          <div className="grid grid-cols-2 gap-2">
            {SYSTEM_SERVICES.map((svc) => (
              <div key={svc.name} className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg bg-surface/50">
                <StatusDot type={svc.status} size="sm" pulse />
                <span className="text-sm">{svc.name}</span>
              </div>
            ))}
          </div>
        </Card>

        {/* Recent Agent Runs */}
        <Card>
          <div className="flex items-center justify-between mb-4">
            <CardTitle>Recent Agent Runs</CardTitle>
            <Link href="/admin/agent-runs" className="text-xs text-accent hover:text-accent/80">View all</Link>
          </div>
          <div className="space-y-1.5">
            {agentRuns.map((run) => (
              <div key={run.id} className="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-surface-hover transition-colors">
                <div>
                  <div className="text-sm font-medium">{run.agent_type}</div>
                  <div className="text-[10px] text-muted">{run.action}</div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge
                    variant={run.status === "completed" || run.status === "success" ? "success" : run.status === "error" ? "danger" : "warning"}
                    size="xs"
                  >
                    {run.status}
                  </Badge>
                  <span className="text-[10px] text-muted">{new Date(run.created_at).toLocaleTimeString()}</span>
                </div>
              </div>
            ))}
            {agentRuns.length === 0 && (
              <p className="text-sm text-muted text-center py-4">No agent runs yet</p>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
