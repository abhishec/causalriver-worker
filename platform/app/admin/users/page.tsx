import { createServiceClient } from "@/lib/supabase/server";
import { DataTable } from "@/components/ui/DataTable";
import { Badge } from "@/components/ui/Badge";
import { StatusDot } from "@/components/ui/StatusDot";
import { StatValue } from "@/components/ui/StatValue";

export const dynamic = "force-dynamic";

export const metadata = { title: "Users & Sessions" };

export default async function AdminUsersPage() {
  const supabase = await createServiceClient();

  // Fetch all org memberships with org details
  const { data: members } = await supabase
    .from("org_members")
    .select("id, user_id, role, is_platform_admin, created_at, organizations(name, slug)")
    .order("created_at", { ascending: false })
    .limit(500);

  // Fetch all auth users to get emails and last sign-in
  const { data: authData } = await supabase.auth.admin.listUsers({ perPage: 500 });

  // Build user lookup map
  const userMap = new Map<string, { email: string; name: string; lastSignIn: string | null; createdAt: string }>();
  authData?.users?.forEach((u) => {
    userMap.set(u.id, {
      email: u.email || "",
      name: u.user_metadata?.full_name || u.user_metadata?.name || u.email?.split("@")[0] || "Unknown",
      lastSignIn: u.last_sign_in_at || null,
      createdAt: u.created_at,
    });
  });

  // Enrich members with user details
  const enrichedUsers = (members || []).map((m) => {
    const user = userMap.get(m.user_id);
    return {
      ...m,
      email: user?.email || m.user_id.slice(0, 8) + "...",
      name: user?.name || "Unknown",
      lastSignIn: user?.lastSignIn || null,
    };
  });

  // Stats
  const totalUsers = new Set(enrichedUsers.map((u) => u.user_id)).size;
  const platformAdmins = enrichedUsers.filter((u) => u.is_platform_admin).length;
  const recentlyActive = enrichedUsers.filter((u) => {
    if (!u.lastSignIn) return false;
    const hoursSince = (Date.now() - new Date(u.lastSignIn).getTime()) / 3600000;
    return hoursSince < 24;
  }).length;
  const totalOrgs = new Set(enrichedUsers.map((u) => (u.organizations as any)?.name).filter(Boolean)).size;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Users & Sessions</h1>
        <p className="text-xs text-muted mt-0.5">All platform users across organizations</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatValue label="Total Users" value={String(totalUsers)} />
        <StatValue label="Platform Admins" value={String(platformAdmins)} />
        <StatValue label="Active (24h)" value={String(recentlyActive)} pulse={recentlyActive > 0} />
        <StatValue label="Organizations" value={String(totalOrgs)} />
      </div>

      <DataTable
        columns={[
          {
            key: "name",
            header: "User",
            sortable: true,
            render: (row) => (
              <div className="flex items-center gap-3">
                <div className="w-7 h-7 rounded-full bg-accent/10 flex items-center justify-center text-[10px] font-bold text-accent uppercase shrink-0">
                  {row.name?.charAt(0) || "?"}
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-medium truncate">{row.name}</div>
                  <div className="text-[10px] text-muted truncate">{row.email}</div>
                </div>
              </div>
            ),
          },
          {
            key: "org",
            header: "Organization",
            sortable: true,
            render: (row) => (
              <div>
                <div className="text-xs font-medium">{row.organizations?.name || "—"}</div>
                <div className="text-[10px] text-muted">{row.organizations?.slug || ""}</div>
              </div>
            ),
          },
          {
            key: "role",
            header: "Role",
            sortable: true,
            render: (row) => (
              <Badge variant={row.role === "owner" ? "accent" : row.role === "admin" ? "info" : "default"} size="xs">
                {row.role}
              </Badge>
            ),
          },
          {
            key: "is_platform_admin",
            header: "Admin",
            render: (row) => row.is_platform_admin ? (
              <Badge variant="warning" size="xs">Platform</Badge>
            ) : (
              <span className="text-xs text-muted">—</span>
            ),
          },
          {
            key: "lastSignIn",
            header: "Last Active",
            sortable: true,
            render: (row) => {
              if (!row.lastSignIn) return <span className="text-xs text-muted">Never</span>;
              const hoursSince = (Date.now() - new Date(row.lastSignIn).getTime()) / 3600000;
              const isRecent = hoursSince < 1;
              return (
                <div className="flex items-center gap-1.5">
                  <StatusDot type={isRecent ? "active" : hoursSince < 24 ? "warning" : "inactive"} size="sm" pulse={isRecent} />
                  <span className="text-xs text-muted">
                    {isRecent ? "Online" : hoursSince < 24 ? `${Math.floor(hoursSince)}h ago` : new Date(row.lastSignIn).toLocaleDateString()}
                  </span>
                </div>
              );
            },
          },
          {
            key: "created_at",
            header: "Joined",
            sortable: true,
            render: (row) => (
              <span className="text-xs text-muted">{new Date(row.created_at).toLocaleDateString()}</span>
            ),
          },
        ]}
        data={enrichedUsers}
        searchable
        searchPlaceholder="Search by name or email..."
        searchFields={["name", "email", "role"]}
        compact
      />
    </div>
  );
}
