import { createServiceClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/Badge";
import { DataTable } from "@/components/ui/DataTable";
import { StatValue } from "@/components/ui/StatValue";
import Link from "next/link";

export const dynamic = 'force-dynamic';

export const metadata = { title: "Admin - Organizations" };

export default async function AdminOrgsPage() {
  const supabase = await createServiceClient();

  const [orgsResult, authUsersResult, membersResult] = await Promise.all([
    supabase.from("organizations").select("*").order("created_at"),
    supabase.auth.admin.listUsers({ perPage: 500 }),
    supabase.from("org_members").select("user_id, organization_id").limit(500),
  ]);

  const orgs = orgsResult.data || [];
  const members = membersResult.data || [];

  // Build user lookup
  const userMap = new Map<string, { lastSignIn: string | null }>();
  authUsersResult.data?.users?.forEach((u) => {
    userMap.set(u.id, { lastSignIn: u.last_sign_in_at || null });
  });

  // Count members per org and active users
  const orgMemberCount = new Map<string, number>();
  const orgActiveCount = new Map<string, number>();
  members.forEach((m) => {
    orgMemberCount.set(m.organization_id, (orgMemberCount.get(m.organization_id) || 0) + 1);
    const user = userMap.get(m.user_id);
    if (user?.lastSignIn) {
      const hoursSince = (Date.now() - new Date(user.lastSignIn).getTime()) / 3600000;
      if (hoursSince < 24) {
        orgActiveCount.set(m.organization_id, (orgActiveCount.get(m.organization_id) || 0) + 1);
      }
    }
  });

  // Enrich orgs
  const enrichedOrgs = orgs.map((org) => ({
    ...org,
    memberCount: orgMemberCount.get(org.id) || 0,
    activeCount: orgActiveCount.get(org.id) || 0,
  }));

  const totalUsers = new Set(members.map((m) => m.user_id)).size;
  const coreOrgs = orgs.filter((o) => o.is_core_brain).length;
  const tenantOrgs = orgs.length - coreOrgs;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Organizations</h1>
        <p className="text-xs text-muted mt-0.5">Manage all connected organizations</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatValue label="Total Orgs" value={String(orgs.length)} />
        <StatValue label="Tenant Orgs" value={String(tenantOrgs)} />
        <StatValue label="Core Brain" value={String(coreOrgs)} />
        <StatValue label="Total Users" value={String(totalUsers)} />
      </div>

      <DataTable
        columns={[
          {
            key: "name",
            header: "Organization",
            sortable: true,
            render: (row) => (
              <Link
                href={`/admin/orgs/${row.id}`}
                className="flex items-center gap-3 hover:text-accent transition-colors"
              >
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${row.is_core_brain ? 'bg-accent/20' : 'bg-surface'}`}>
                  <span className={`text-xs font-bold ${row.is_core_brain ? 'text-accent' : 'text-muted'}`}>
                    {row.name.charAt(0).toUpperCase()}
                  </span>
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-medium truncate">{row.name}</div>
                  <div className="text-[10px] text-muted truncate">{row.slug}</div>
                </div>
              </Link>
            ),
          },
          {
            key: "plan",
            header: "Plan",
            sortable: true,
            render: (row) => (
              <Badge
                variant={
                  row.plan === "enterprise" ? "accent" :
                  row.plan === "pro" ? "info" :
                  row.plan === "starter" ? "success" : "default"
                }
                size="xs"
              >
                {row.plan}
              </Badge>
            ),
          },
          {
            key: "is_core_brain",
            header: "Type",
            render: (row) => row.is_core_brain
              ? <Badge variant="accent" size="xs">Core Brain</Badge>
              : <span className="text-xs text-muted">Tenant</span>,
          },
          {
            key: "memberCount",
            header: "Members",
            sortable: true,
            render: (row) => (
              <div className="flex items-center gap-1.5">
                <span className="text-xs tabular-nums">{row.memberCount}</span>
                {row.activeCount > 0 && (
                  <span className="text-[10px] text-success tabular-nums">({row.activeCount} active)</span>
                )}
              </div>
            ),
          },
          {
            key: "created_at",
            header: "Created",
            sortable: true,
            render: (row) => (
              <span className="text-xs text-muted">{new Date(row.created_at).toLocaleDateString()}</span>
            ),
          },
          {
            key: "actions",
            header: "",
            render: (row) => (
              <Link
                href={`/admin/orgs/${row.id}`}
                className="text-xs text-accent hover:text-accent/80 transition-colors"
              >
                View →
              </Link>
            ),
          },
        ]}
        data={enrichedOrgs}
        searchable
        searchPlaceholder="Search organizations..."
        searchFields={["name", "slug", "plan"]}
        compact
      />
    </div>
  );
}
