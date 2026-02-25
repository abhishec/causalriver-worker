import { createServiceClient } from "@/lib/supabase/server";
import { formatUSD, formatNumber } from "@/lib/utils";
import { StatValue } from "@/components/ui/StatValue";
import { Card, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { StatusDot } from "@/components/ui/StatusDot";
import Link from "next/link";
import { logger } from "@/lib/logger";

export const metadata = { title: "Mission Control" };

export default async function AdminOverviewPage() {
  const supabase = await createServiceClient();
  const today = new Date().toISOString().split("T")[0];

  // Wrap each query to prevent a single failure from crashing the whole page
  const safe = <T,>(p: PromiseLike<T>): Promise<T | null> =>
    Promise.resolve(p).catch((err) => {
      logger.warn("[AdminOverview] Query failed:", err);
      return null;
    });

  const [orgsResult, signalsResult, edgesResult, costResult, awsResult, eventsResult, membersResult, agentRunsResult, authUsersResult, customersResult] = await Promise.all([
    safe(supabase.from("organizations").select("id, name, slug, plan, is_core_brain, customer_id, created_at").order("created_at")),
    safe(supabase.from("cross_domain_signals").select("id", { count: "exact", head: true })),
    safe(supabase.from("causal_relationships_statistical").select("id", { count: "exact", head: true })),
    safe(supabase.from("llm_cost_log").select("estimated_cost_usd").gte("created_at", today)),
    safe(supabase.from("aws_cost_snapshots").select("total_aws_cost").order("period_start", { ascending: false }).limit(1)),
    safe(supabase.from("platform_events").select("id, event_type, source, title, created_at, event_data").order("created_at", { ascending: false }).limit(15)),
    safe(supabase.from("org_members").select("user_id, role, organization_id, organizations(name)").limit(100)),
    safe(supabase.from("ai_agent_activity").select("id, agent_type, action, status, created_at").order("created_at", { ascending: false }).limit(10)),
    safe(supabase.auth.admin.listUsers({ perPage: 500 })),
    safe(supabase.from("customers").select("id, name, slug, plan, is_design_partner").order("name")),
  ]);

  const orgs: any[] = (orgsResult as any)?.data || [];
  const customers: any[] = (customersResult as any)?.data || [];
  const totalSignals = (signalsResult as any)?.count || 0;
  const totalEdges = (edgesResult as any)?.count || 0;
  const costToday = ((costResult as any)?.data || []).reduce((sum: number, r: any) => sum + (r.estimated_cost_usd || 0), 0);
  const latestAWS = (awsResult as any)?.data?.[0]?.total_aws_cost || 0;
  const events: any[] = (eventsResult as any)?.data || [];
  const members: any[] = (membersResult as any)?.data || [];
  const agentRuns: any[] = (agentRunsResult as any)?.data || [];

  // Build user lookup map from auth users
  const userMap = new Map<string, { email: string; name: string; lastSignIn: string | null; createdAt: string }>();
  (authUsersResult as any)?.data?.users?.forEach((u: any) => {
    userMap.set(u.id, {
      email: u.email || "",
      name: u.user_metadata?.full_name || u.user_metadata?.name || u.email?.split("@")[0] || "Unknown",
      lastSignIn: u.last_sign_in_at || null,
      createdAt: u.created_at,
    });
  });

  // Deduplicate users and enrich with auth data
  const uniqueUserIds = [...new Set<string>(members.map((m) => m.user_id))];
  const enrichedUsers = uniqueUserIds.map((userId: string) => {
    const authUser = userMap.get(userId);
    const membership = members.find((m) => m.user_id === userId);
    return {
      userId,
      email: authUser?.email || userId.slice(0, 8) + "...",
      name: authUser?.name || "Unknown",
      lastSignIn: authUser?.lastSignIn || null,
      role: membership?.role || "member",
      orgName: (membership?.organizations as any)?.name || "—",
    };
  });

  // Active users (signed in within last 24h)
  const activeUsers = enrichedUsers.filter((u) => {
    if (!u.lastSignIn) return false;
    const hoursSince = (Date.now() - new Date(u.lastSignIn).getTime()) / 3600000;
    return hoursSince < 24;
  });

  // Online users (signed in within last hour)
  const onlineUsers = enrichedUsers.filter((u) => {
    if (!u.lastSignIn) return false;
    const hoursSince = (Date.now() - new Date(u.lastSignIn).getTime()) / 3600000;
    return hoursSince < 1;
  });

  // Group workspaces by customer for hierarchical display
  const customerMap = new Map<string, { customer: { id: string; name: string; slug: string; plan: string; is_design_partner: boolean }; workspaces: typeof orgs }>();
  customers.forEach((c) => customerMap.set(c.id, { customer: c, workspaces: [] }));
  const unclaimedWorkspaces: typeof orgs = [];
  orgs.forEach((org) => {
    if (org.customer_id && customerMap.has(org.customer_id)) {
      customerMap.get(org.customer_id)!.workspaces.push(org);
    } else {
      unclaimedWorkspaces.push(org);
    }
  });
  const customerGroups = [...customerMap.values()].filter(g => g.workspaces.length > 0);

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
        <p className="text-xs text-muted mt-0.5">Platform-wide health, AI Workers, and system status</p>
      </div>

      {/* Stats Strip */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatValue label="AI Workers" value={String(orgs.length)} subtitle={`${customers.length} customer${customers.length !== 1 ? "s" : ""}`} />
        <StatValue label="Total Users" value={String(uniqueUserIds.length)} subtitle="All AI Workers" />
        <StatValue label="Online Now" value={String(onlineUsers.length)} pulse={onlineUsers.length > 0} />
        <StatValue label="Total Signals" value={formatNumber(totalSignals)} />
        <StatValue label="LLM Cost Today" value={formatUSD(costToday)} />
        <StatValue label="AWS Cost" value={formatUSD(latestAWS)} subtitle="/day" />
      </div>

      {/* Three-column: Orgs + Active Sessions + Events */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Customers & Workspaces */}
        <Card>
          <div className="flex items-center justify-between mb-4">
            <CardTitle>Customers &amp; Workspaces</CardTitle>
            <Link href="/admin/workspaces" className="text-xs text-accent hover:text-accent/80">View all</Link>
          </div>
          <div className="space-y-3">
            {customerGroups.map(({ customer: cust, workspaces }) => (
              <div key={cust.id}>
                <div className="flex items-center gap-2 px-3 py-1.5 mb-1">
                  <div className="w-5 h-5 rounded bg-warning/15 flex items-center justify-center shrink-0">
                    <span className="text-[9px] font-bold text-warning">{cust.name.charAt(0).toUpperCase()}</span>
                  </div>
                  <span className="text-[11px] font-semibold text-muted-foreground truncate">{cust.name}</span>
                  <Badge variant="default" size="xs">{cust.plan}</Badge>
                  {cust.is_design_partner && <span className="text-[9px] text-warning font-medium">Partner</span>}
                </div>
                <div className="space-y-0.5 ml-3 border-l border-border-subtle pl-3">
                  {workspaces.map((org) => (
                    <Link key={org.id} href={`/admin/workspaces/${org.id}`} className="flex items-center justify-between px-2 py-2 rounded-lg hover:bg-surface-hover transition-colors">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className={`w-6 h-6 rounded flex items-center justify-center shrink-0 ${org.is_core_brain ? "bg-accent/20" : "bg-surface"}`}>
                          <span className={`text-[10px] font-bold ${org.is_core_brain ? "text-accent" : "text-muted"}`}>{org.name.charAt(0).toUpperCase()}</span>
                        </div>
                        <span className="text-[12px] font-medium truncate">{org.name}</span>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <Badge variant={org.is_core_brain ? "accent" : "default"} size="xs">{org.is_core_brain ? "Core" : org.plan}</Badge>
                        <svg className="w-3 h-3 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            ))}
            {unclaimedWorkspaces.length > 0 && (
              <div>
                <div className="flex items-center gap-2 px-3 py-1.5 mb-1">
                  <span className="text-[11px] font-semibold text-muted/60">Unclaimed</span>
                </div>
                <div className="space-y-0.5 ml-3 border-l border-border-subtle/50 pl-3">
                  {unclaimedWorkspaces.map((org) => (
                    <Link key={org.id} href={`/admin/workspaces/${org.id}`} className="flex items-center justify-between px-2 py-2 rounded-lg hover:bg-surface-hover transition-colors">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className={`w-6 h-6 rounded flex items-center justify-center shrink-0 ${org.is_core_brain ? "bg-accent/20" : "bg-surface"}`}>
                          <span className={`text-[10px] font-bold ${org.is_core_brain ? "text-accent" : "text-muted"}`}>{org.name.charAt(0).toUpperCase()}</span>
                        </div>
                        <span className="text-[12px] font-medium truncate">{org.name}</span>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <Badge variant={org.is_core_brain ? "accent" : "default"} size="xs">{org.is_core_brain ? "Core" : org.plan}</Badge>
                        <svg className="w-3 h-3 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}
            {orgs.length === 0 && (
              <p className="text-sm text-muted text-center py-6">No AI Workers</p>
            )}
          </div>
        </Card>

        {/* Active Sessions — WHO'S LOGGED IN */}
        <Card>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <CardTitle>Active Sessions</CardTitle>
              {onlineUsers.length > 0 && (
                <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-success/10 text-[10px] font-medium text-success">
                  <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
                  {onlineUsers.length} online
                </span>
              )}
            </div>
            <Link href="/admin/users" className="text-xs text-accent hover:text-accent/80">All users</Link>
          </div>
          <div className="space-y-1">
            {activeUsers.length > 0 ? (
              activeUsers.slice(0, 12).map((user) => {
                const hoursSince = user.lastSignIn ? (Date.now() - new Date(user.lastSignIn).getTime()) / 3600000 : 999;
                const isOnline = hoursSince < 1;
                return (
                  <div key={user.userId} className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-surface-hover transition-colors">
                    <div className="w-7 h-7 rounded-full bg-accent/10 flex items-center justify-center text-[10px] font-bold text-accent uppercase shrink-0">
                      {user.name?.charAt(0) || "?"}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium truncate">{user.name}</div>
                      <div className="text-[10px] text-muted truncate">{user.email}</div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <StatusDot type={isOnline ? "active" : "warning"} size="sm" pulse={isOnline} />
                      <span className="text-[10px] text-muted">
                        {isOnline ? "Online" : `${Math.floor(hoursSince)}h ago`}
                      </span>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="text-center py-8">
                <p className="text-xs text-muted">No active sessions in last 24h</p>
              </div>
            )}
            {activeUsers.length > 12 && (
              <div className="text-center pt-2">
                <Link href="/admin/users" className="text-[10px] text-accent hover:text-accent/80">
                  +{activeUsers.length - 12} more users
                </Link>
              </div>
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
