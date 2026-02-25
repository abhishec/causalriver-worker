import { createServiceClient } from "@/lib/supabase/server";
import { formatNumber } from "@/lib/utils";
import { StatValue } from "@/components/ui/StatValue";
import { Card, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { StatusDot } from "@/components/ui/StatusDot";
import { OrgActionButtons } from "./org-action-buttons";
import Link from "next/link";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function OrgDetailPage({
  params,
}: {
  params: Promise<{ orgId: string }>;
}) {
  const { orgId } = await params;
  const supabase = await createServiceClient();

  const { data: org } = await supabase
    .from("organizations")
    .select("id, name, slug, plan, is_core_brain, created_at, settings")
    .eq("id", orgId)
    .single();

  if (!org) notFound();

  const [membersResult, edgesResult, signalsResult, connectorsResult, snapshotResult, authUsersResult] = await Promise.all([
    supabase.from("org_members").select("id, user_id, role, is_platform_admin, created_at").eq("organization_id", orgId).order("created_at"),
    supabase.from("causal_relationships_statistical").select("id", { count: "exact", head: true }).eq("organization_id", orgId),
    supabase.from("cross_domain_signals").select("id", { count: "exact", head: true }).eq("organization_id", orgId),
    supabase.from("org_connectors").select("id, connector_type, display_name, status, last_sync_at, signals_count").eq("organization_id", orgId),
    supabase.from("brain_daily_snapshots").select("*").eq("organization_id", orgId).order("snapshot_date", { ascending: false }).limit(1),
    supabase.auth.admin.listUsers({ perPage: 500 }),
  ]);

  const members = membersResult.data || [];
  const totalEdges = edgesResult.count || 0;
  const totalSignals = signalsResult.count || 0;
  const connectors = connectorsResult.data || [];
  const snapshot = snapshotResult.data?.[0] || null;

  const userMap = new Map<string, { email: string; name: string; lastSignIn: string | null }>();
  authUsersResult.data?.users?.forEach((u) => {
    userMap.set(u.id, {
      email: u.email || "",
      name: u.user_metadata?.full_name || u.user_metadata?.name || u.email?.split("@")[0] || "Unknown",
      lastSignIn: u.last_sign_in_at || null,
    });
  });

  const enrichedMembers = members.map((m) => {
    const user = userMap.get(m.user_id);
    return { ...m, email: user?.email || m.user_id.slice(0, 8) + "...", name: user?.name || "Unknown", lastSignIn: user?.lastSignIn || null };
  });

  const onlineCount = enrichedMembers.filter((m) => m.lastSignIn && (Date.now() - new Date(m.lastSignIn).getTime()) / 3600000 < 1).length;
  const activeCount = enrichedMembers.filter((m) => m.lastSignIn && (Date.now() - new Date(m.lastSignIn).getTime()) / 3600000 < 24).length;

  return (
    <div className="space-y-6 max-w-6xl">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-xs text-muted">
        <Link href="/admin/workspaces" className="hover:text-foreground transition-colors">AI Workers</Link>
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
        </svg>
        <span className="text-foreground font-medium">{org.name}</span>
      </nav>

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-4">
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${org.is_core_brain ? "bg-accent/20" : "bg-surface"}`}>
            <span className={`text-lg font-bold ${org.is_core_brain ? "text-accent" : "text-muted"}`}>
              {org.name.charAt(0).toUpperCase()}
            </span>
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">{org.name}</h1>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <span className="text-xs text-muted font-mono">{org.slug}</span>
              <Badge variant={org.is_core_brain ? "accent" : org.plan === "enterprise" ? "accent" : org.plan === "pro" ? "info" : "default"} size="xs">
                {org.is_core_brain ? "Core Brain" : org.plan}
              </Badge>
              <span className="text-[10px] text-muted">Created {new Date(org.created_at).toLocaleDateString()}</span>
            </div>
          </div>
        </div>
        <OrgActionButtons
          orgId={org.id}
          orgName={org.name}
          currentPlan={org.plan}
          planOptions={["free", "starter", "pro", "enterprise"]}
          isCoreOrg={org.is_core_brain}
        />
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <StatValue label="Members"      value={String(members.length)} />
        <StatValue label="Online Now"   value={String(onlineCount)} pulse={onlineCount > 0} />
        <StatValue label="Active (24h)" value={String(activeCount)} />
        <StatValue label="Signals"      value={formatNumber(totalSignals)} />
        <StatValue label="Connectors"   value={String(connectors.length)} />
      </div>

      {/* Brain snapshot */}
      {snapshot && (
        <Card>
          <CardTitle className="mb-4">Brain Health</CardTitle>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {[
              { label: "Health Score",        value: `${snapshot.brain_health_score ?? 0}%` },
              { label: "Prediction Accuracy", value: `${(snapshot.prediction_accuracy ?? 0).toFixed(1)}%` },
              { label: "Regions Active",      value: String(snapshot.regions_active?.length ?? 0) },
              { label: "Last Snapshot",       value: snapshot.snapshot_date ?? "—" },
            ].map((s) => (
              <div key={s.label}>
                <div className="text-[10px] font-semibold uppercase tracking-wider text-muted mb-1">{s.label}</div>
                <div className="text-lg font-semibold font-mono">{s.value}</div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Members + Connectors */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Members */}
        <Card className="p-0 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-border-subtle">
            <CardTitle>Members ({members.length})</CardTitle>
            {activeCount > 0 && (
              <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-success/10 text-[10px] font-medium text-success">
                <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
                {activeCount} active
              </span>
            )}
          </div>
          <div className="divide-y divide-border-subtle">
            {enrichedMembers.map((m) => {
              const hoursSince = m.lastSignIn ? (Date.now() - new Date(m.lastSignIn).getTime()) / 3600000 : 999;
              const isOnline = hoursSince < 1;
              const isRecent = hoursSince < 24;
              return (
                <div key={m.id} className="flex items-center gap-3 px-5 py-3 hover:bg-surface-hover transition-colors">
                  <div className="w-8 h-8 rounded-full bg-accent/10 flex items-center justify-center text-[11px] font-bold text-accent uppercase shrink-0">
                    {m.name?.charAt(0) || "?"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{m.name}</div>
                    <div className="text-[11px] text-muted truncate">{m.email}</div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <StatusDot type={isOnline ? "active" : isRecent ? "warning" : "inactive"} size="sm" pulse={isOnline} />
                    <span className="text-[10px] text-muted w-16 text-right">
                      {isOnline ? "Online" : isRecent ? `${Math.floor(hoursSince)}h ago` : m.lastSignIn ? new Date(m.lastSignIn).toLocaleDateString() : "Never"}
                    </span>
                    <Badge variant={m.role === "owner" ? "accent" : m.role === "admin" ? "info" : "default"} size="xs">{m.role}</Badge>
                    {m.is_platform_admin && <Badge variant="warning" size="xs">Admin</Badge>}
                  </div>
                </div>
              );
            })}
            {members.length === 0 && (
              <div className="px-5 py-10 text-center text-sm text-muted">No members in this AI Worker</div>
            )}
          </div>
        </Card>

        {/* Connectors */}
        <Card className="p-0 overflow-hidden">
          <div className="px-5 py-4 border-b border-border-subtle">
            <CardTitle>Connectors ({connectors.length})</CardTitle>
          </div>
          <div className="divide-y divide-border-subtle">
            {connectors.map((c) => (
              <div key={c.id} className="flex items-center justify-between px-5 py-3 hover:bg-surface-hover transition-colors">
                <div>
                  <div className="text-sm font-medium">{c.display_name || c.connector_type}</div>
                  <div className="text-[11px] text-muted">
                    {c.last_sync_at ? `Last sync ${new Date(c.last_sync_at).toLocaleString()}` : "Not synced yet"}
                    {c.signals_count > 0 && ` · ${formatNumber(c.signals_count)} signals`}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <StatusDot type={c.status === "active" ? "active" : "inactive"} size="sm" />
                  <Badge variant={c.status === "active" ? "success" : "default"} size="xs">{c.status}</Badge>
                </div>
              </div>
            ))}
            {connectors.length === 0 && (
              <div className="px-5 py-10 text-center text-sm text-muted">No connectors configured</div>
            )}
          </div>
        </Card>
      </div>

      {/* Org metadata */}
      <Card>
        <CardTitle className="mb-3">AI Worker Details</CardTitle>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
          {[
            { label: "AI Worker ID", value: org.id },
            { label: "Slug",       value: org.slug },
            { label: "Plan",       value: org.plan },
            { label: "Core Brain", value: org.is_core_brain ? "Yes" : "No" },
            { label: "Created",    value: new Date(org.created_at).toLocaleString() },
          ].map((row) => (
            <div key={row.label} className="flex items-center gap-3">
              <span className="text-[11px] text-muted w-20 shrink-0">{row.label}</span>
              <span className="font-mono text-xs bg-surface px-2 py-1 rounded truncate flex-1 border border-border-subtle">{row.value}</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
