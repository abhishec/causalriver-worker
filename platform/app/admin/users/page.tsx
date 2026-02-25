import { createServiceClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/Badge";
import { StatusDot } from "@/components/ui/StatusDot";
import { StatValue } from "@/components/ui/StatValue";
import { Card } from "@/components/ui/Card";
import { UserActionButton } from "./user-action-button";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin — Users" };

export default async function AdminUsersPage() {
  const supabase = await createServiceClient();

  const [membersResult, authData] = await Promise.all([
    supabase
      .from("org_members")
      .select("id, user_id, role, is_platform_admin, organization_id, created_at, organizations(name, slug)")
      .order("created_at", { ascending: false })
      .limit(500),
    supabase.auth.admin.listUsers({ perPage: 500 }),
  ]);

  const userMap = new Map<string, { email: string; name: string; lastSignIn: string | null }>();
  authData.data?.users?.forEach((u) => {
    userMap.set(u.id, {
      email: u.email || "",
      name: u.user_metadata?.full_name || u.user_metadata?.name || u.email?.split("@")[0] || "Unknown",
      lastSignIn: u.last_sign_in_at || null,
    });
  });

  const members = (membersResult.data || []) as unknown as Array<{
    id: string;
    user_id: string;
    role: string;
    is_platform_admin: boolean;
    organization_id: string;
    created_at: string;
    organizations: { name: string; slug: string } | null;
  }>;

  const enriched = members.map((m) => {
    const u = userMap.get(m.user_id);
    return { ...m, email: u?.email || m.user_id.slice(0, 8) + "...", name: u?.name || "Unknown", lastSignIn: u?.lastSignIn || null };
  });

  const uniqueUsers = new Set(enriched.map((u) => u.user_id)).size;
  const platformAdmins = enriched.filter((u) => u.is_platform_admin).length;
  const active24h = enriched.filter((u) => u.lastSignIn && (Date.now() - new Date(u.lastSignIn).getTime()) / 3600000 < 24).length;
  const totalOrgs = new Set(enriched.map((u) => u.organization_id)).size;

  return (
    <div className="space-y-6 max-w-6xl">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Users</h1>
        <p className="text-xs text-muted mt-0.5">All platform users, roles, and admin privileges</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatValue label="Total Users"     value={String(uniqueUsers)} />
        <StatValue label="Platform Admins" value={String(platformAdmins)} />
        <StatValue label="Active (24h)"    value={String(active24h)} pulse={active24h > 0} />
        <StatValue label="Orgs"            value={String(totalOrgs)} />
      </div>

      {/* Table */}
      <Card className="p-0 overflow-hidden">
        {/* Header row */}
        <div className="grid grid-cols-[1fr_180px_96px_80px_130px_40px] gap-3 items-center px-5 py-3 border-b border-border-subtle bg-surface/40">
          {["User", "AI Worker", "Role", "Platform", "Last Active", ""].map((h) => (
            <div key={h} className="text-[10px] font-semibold uppercase tracking-wider text-muted/60">{h}</div>
          ))}
        </div>

        <div className="divide-y divide-border-subtle">
          {enriched.map((row) => {
            const hoursSince = row.lastSignIn ? (Date.now() - new Date(row.lastSignIn).getTime()) / 3600000 : 999;
            const isOnline = hoursSince < 1;
            const isRecent = hoursSince < 24;

            return (
              <div
                key={row.id}
                className="grid grid-cols-[1fr_180px_96px_80px_130px_40px] gap-3 items-center px-5 py-3 hover:bg-surface-hover transition-colors"
              >
                {/* User */}
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-7 h-7 rounded-full bg-accent/10 flex items-center justify-center text-[10px] font-bold text-accent uppercase shrink-0">
                    {row.name?.charAt(0) || "?"}
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-medium truncate">{row.name}</div>
                    <div className="text-[10px] text-muted truncate">{row.email}</div>
                  </div>
                </div>

                {/* Org */}
                <div className="min-w-0">
                  <div className="text-xs font-medium truncate">{row.organizations?.name || "—"}</div>
                  <div className="text-[10px] text-muted truncate">{row.organizations?.slug || ""}</div>
                </div>

                {/* Role */}
                <div>
                  <Badge variant={row.role === "owner" ? "accent" : row.role === "admin" ? "info" : "default"} size="xs">
                    {row.role}
                  </Badge>
                </div>

                {/* Platform Admin */}
                <div>
                  {row.is_platform_admin
                    ? <Badge variant="warning" size="xs">Admin</Badge>
                    : <span className="text-[10px] text-muted">—</span>}
                </div>

                {/* Last Active */}
                <div className="flex items-center gap-1.5">
                  {row.lastSignIn ? (
                    <>
                      <StatusDot type={isOnline ? "active" : isRecent ? "warning" : "inactive"} size="sm" pulse={isOnline} />
                      <span className="text-[11px] text-muted">
                        {isOnline ? "Online now" : isRecent ? `${Math.floor(hoursSince)}h ago` : new Date(row.lastSignIn).toLocaleDateString()}
                      </span>
                    </>
                  ) : (
                    <span className="text-[11px] text-muted">Never</span>
                  )}
                </div>

                {/* Actions */}
                <div>
                  <UserActionButton
                    memberId={row.id}
                    userId={row.user_id}
                    orgId={row.organization_id}
                    isPlatformAdmin={row.is_platform_admin}
                    currentRole={row.role}
                    userName={row.name}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
