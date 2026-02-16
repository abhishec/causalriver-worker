import { createServiceClient } from "@/lib/supabase/server";
import { formatUSD, formatNumber } from "@/lib/utils";
import { StatValue } from "@/components/ui/StatValue";
import { Card, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { StatusDot } from "@/components/ui/StatusDot";
import Link from "next/link";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function OrgDetailPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  const supabase = await createServiceClient();

  const { data: org } = await supabase
    .from("organizations")
    .select("id, name, slug, plan, is_core_brain, created_at")
    .eq("id", orgId)
    .single();

  if (!org) notFound();

  const [membersResult, edgesResult, signalsResult, connectorsResult, snapshotResult, authUsersResult] = await Promise.all([
    supabase
      .from("org_members")
      .select("id, user_id, role, is_platform_admin, created_at")
      .eq("organization_id", orgId)
      .order("created_at"),

    supabase
      .from("causal_relationships_statistical")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId),

    supabase
      .from("cross_domain_signals")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId),

    supabase
      .from("org_connectors")
      .select("id, connector_type, display_name, status, last_sync_at")
      .eq("organization_id", orgId),

    supabase
      .from("brain_daily_snapshots")
      .select("*")
      .eq("organization_id", orgId)
      .order("snapshot_date", { ascending: false })
      .limit(1),

    supabase.auth.admin.listUsers({ perPage: 500 }),
  ]);

  const members = membersResult.data || [];
  const totalEdges = edgesResult.count || 0;
  const totalSignals = signalsResult.count || 0;
  const connectors = connectorsResult.data || [];
  const snapshot = snapshotResult.data?.[0] || null;

  // Build user lookup map
  const userMap = new Map<string, { email: string; name: string; lastSignIn: string | null }>();
  authUsersResult.data?.users?.forEach((u) => {
    userMap.set(u.id, {
      email: u.email || "",
      name: u.user_metadata?.full_name || u.user_metadata?.name || u.email?.split("@")[0] || "Unknown",
      lastSignIn: u.last_sign_in_at || null,
    });
  });

  // Enrich members
  const enrichedMembers = members.map((m) => {
    const user = userMap.get(m.user_id);
    return {
      ...m,
      email: user?.email || m.user_id.slice(0, 8) + "...",
      name: user?.name || "Unknown",
      lastSignIn: user?.lastSignIn || null,
    };
  });

  // Stats
  const activeCount = enrichedMembers.filter((m) => {
    if (!m.lastSignIn) return false;
    return (Date.now() - new Date(m.lastSignIn).getTime()) / 3600000 < 24;
  }).length;

  const onlineCount = enrichedMembers.filter((m) => {
    if (!m.lastSignIn) return false;
    return (Date.now() - new Date(m.lastSignIn).getTime()) / 3600000 < 1;
  }).length;

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-xs text-muted">
        <Link href="/admin/orgs" className="hover:text-foreground transition-colors">Organizations</Link>
        <span>/</span>
        <span className="text-foreground">{org.name}</span>
      </div>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${org.is_core_brain ? 'bg-accent/20' : 'bg-surface'}`}>
            <span className={`text-lg font-bold ${org.is_core_brain ? 'text-accent' : 'text-muted'}`}>
              {org.name.charAt(0).toUpperCase()}
            </span>
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">{org.name}</h1>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-xs text-muted font-mono">{org.slug}</span>
              <Badge variant={org.is_core_brain ? "accent" : "default"} size="xs">
                {org.is_core_brain ? "Core Brain" : org.plan}
              </Badge>
            </div>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <StatValue label="Members" value={String(members.length)} />
        <StatValue label="Online Now" value={String(onlineCount)} pulse={onlineCount > 0} />
        <StatValue label="Causal Edges" value={formatNumber(totalEdges)} />
        <StatValue label="Total Signals" value={formatNumber(totalSignals)} />
        <StatValue label="Connectors" value={String(connectors.length)} />
      </div>

      {/* Brain Health */}
      {snapshot && (
        <Card>
          <CardTitle className="mb-4">Brain Health</CardTitle>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <div className="text-[10px] text-muted uppercase tracking-wider mb-0.5">Health Score</div>
              <div className="text-lg font-semibold">{snapshot.brain_health_score || 0}%</div>
            </div>
            <div>
              <div className="text-[10px] text-muted uppercase tracking-wider mb-0.5">Prediction Accuracy</div>
              <div className="text-lg font-semibold">{snapshot.prediction_accuracy?.toFixed(1) || 0}%</div>
            </div>
            <div>
              <div className="text-[10px] text-muted uppercase tracking-wider mb-0.5">Regions Active</div>
              <div className="text-lg font-semibold">{snapshot.regions_active?.length || 0}</div>
            </div>
            <div>
              <div className="text-[10px] text-muted uppercase tracking-wider mb-0.5">Last Snapshot</div>
              <div className="text-sm font-mono">{snapshot.snapshot_date}</div>
            </div>
          </div>
        </Card>
      )}

      {/* Members & Connectors */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Members — enriched with names, emails, activity */}
        <Card>
          <div className="flex items-center justify-between mb-4">
            <CardTitle>Members ({members.length})</CardTitle>
            {activeCount > 0 && (
              <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-success/10 text-[10px] font-medium text-success">
                <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
                {activeCount} active
              </span>
            )}
          </div>
          <div className="space-y-1.5">
            {enrichedMembers.map((m) => {
              const hoursSince = m.lastSignIn ? (Date.now() - new Date(m.lastSignIn).getTime()) / 3600000 : 999;
              const isOnline = hoursSince < 1;
              return (
                <div key={m.id} className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-surface/30 hover:bg-surface-hover transition-colors">
                  <div className="w-7 h-7 rounded-full bg-accent/10 flex items-center justify-center text-[10px] font-bold text-accent uppercase shrink-0">
                    {m.name?.charAt(0) || "?"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium truncate">{m.name}</div>
                    <div className="text-[10px] text-muted truncate">{m.email}</div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <div className="flex items-center gap-1">
                      <StatusDot type={isOnline ? "active" : hoursSince < 24 ? "warning" : "inactive"} size="sm" pulse={isOnline} />
                      <span className="text-[10px] text-muted">
                        {isOnline ? "Online" : hoursSince < 24 ? `${Math.floor(hoursSince)}h` : m.lastSignIn ? new Date(m.lastSignIn).toLocaleDateString() : "Never"}
                      </span>
                    </div>
                    <Badge variant={m.role === "owner" ? "accent" : "default"} size="xs">{m.role}</Badge>
                    {m.is_platform_admin && <Badge variant="warning" size="xs">Admin</Badge>}
                  </div>
                </div>
              );
            })}
            {members.length === 0 && (
              <p className="text-xs text-muted text-center py-4">No members</p>
            )}
          </div>
        </Card>

        {/* Connectors */}
        <Card>
          <CardTitle className="mb-4">Connectors ({connectors.length})</CardTitle>
          <div className="space-y-1.5">
            {connectors.map((c) => (
              <div key={c.id} className="flex items-center justify-between px-3 py-2.5 rounded-lg bg-surface/30 hover:bg-surface-hover transition-colors">
                <div>
                  <div className="text-sm font-medium">{c.display_name || c.connector_type}</div>
                  <div className="text-[10px] text-muted">
                    {c.last_sync_at ? `Last sync: ${new Date(c.last_sync_at).toLocaleString()}` : "Not synced"}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={c.status === "active" ? "success" : "default"} size="xs">
                    {c.status}
                  </Badge>
                  <StatusDot type={c.status === "active" ? "active" : "inactive"} size="sm" />
                </div>
              </div>
            ))}
            {connectors.length === 0 && (
              <p className="text-xs text-muted text-center py-4">No connectors configured</p>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
