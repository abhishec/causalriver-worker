import { createServiceClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/Badge";
import { StatValue } from "@/components/ui/StatValue";
import { Card } from "@/components/ui/Card";
import { StatusDot } from "@/components/ui/StatusDot";
import Link from "next/link";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin — Organizations" };

const PLAN_VARIANT: Record<string, "accent" | "info" | "success" | "default"> = {
  enterprise: "accent",
  pro: "info",
  starter: "success",
  free: "default",
};

export default async function AdminOrgsPage() {
  const supabase = await createServiceClient();

  const [orgsResult, authUsersResult, membersResult] = await Promise.all([
    supabase.from("organizations").select("*").order("created_at"),
    supabase.auth.admin.listUsers({ perPage: 500 }),
    supabase.from("org_members").select("user_id, organization_id, role, is_platform_admin").limit(500),
  ]);

  const orgs = orgsResult.data || [];
  const members = membersResult.data || [];

  const userMap = new Map<string, { lastSignIn: string | null; email: string }>();
  authUsersResult.data?.users?.forEach((u) => {
    userMap.set(u.id, { lastSignIn: u.last_sign_in_at || null, email: u.email || "" });
  });

  const orgMemberMap = new Map<string, typeof members>();
  members.forEach((m) => {
    if (!orgMemberMap.has(m.organization_id)) orgMemberMap.set(m.organization_id, []);
    orgMemberMap.get(m.organization_id)!.push(m);
  });

  const orgActiveCount = new Map<string, number>();
  members.forEach((m) => {
    const user = userMap.get(m.user_id);
    if (user?.lastSignIn) {
      const h = (Date.now() - new Date(user.lastSignIn).getTime()) / 3600000;
      if (h < 24) orgActiveCount.set(m.organization_id, (orgActiveCount.get(m.organization_id) || 0) + 1);
    }
  });

  const totalUsers = new Set(members.map((m) => m.user_id)).size;
  const coreOrgs = orgs.filter((o) => o.is_core_brain);
  const tenantOrgs = orgs.filter((o) => !o.is_core_brain);
  const enterpriseOrgs = orgs.filter((o) => o.plan === "enterprise").length;

  return (
    <div className="space-y-6 max-w-7xl">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Organizations</h1>
        <p className="text-xs text-muted mt-0.5">Manage all orgs — plans, members, and actions</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatValue label="Total Orgs"  value={String(orgs.length)} subtitle={`${coreOrgs.length} core`} />
        <StatValue label="Tenants"     value={String(tenantOrgs.length)} />
        <StatValue label="Enterprise"  value={String(enterpriseOrgs)} />
        <StatValue label="Total Users" value={String(totalUsers)} />
      </div>

      {/* Core Orgs */}
      {coreOrgs.length > 0 && (
        <section>
          <div className="text-[10px] font-semibold uppercase tracking-widest text-muted/50 mb-3 px-0.5">Core Brain</div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {coreOrgs.map((org) => (
              <OrgCard
                key={org.id}
                org={org}
                members={orgMemberMap.get(org.id) || []}
                activeCount={orgActiveCount.get(org.id) || 0}
                userMap={userMap}
              />
            ))}
          </div>
        </section>
      )}

      {/* Tenant Orgs */}
      <section>
        <div className="text-[10px] font-semibold uppercase tracking-widest text-muted/50 mb-3 px-0.5">Tenant Organizations</div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {tenantOrgs.map((org) => (
            <OrgCard
              key={org.id}
              org={org}
              members={orgMemberMap.get(org.id) || []}
              activeCount={orgActiveCount.get(org.id) || 0}
              userMap={userMap}
            />
          ))}
          {tenantOrgs.length === 0 && (
            <div className="col-span-3 py-12 text-center text-sm text-muted">No tenant organizations yet</div>
          )}
        </div>
      </section>
    </div>
  );
}

function OrgCard({
  org,
  members,
  activeCount,
  userMap,
}: {
  org: Record<string, any>;
  members: Record<string, any>[];
  activeCount: number;
  userMap: Map<string, { lastSignIn: string | null; email: string }>;
}) {
  const owner = members.find((m) => m.role === "owner");
  const ownerEmail = owner ? (userMap.get(owner.user_id)?.email ?? "—") : "—";

  return (
    <Card className="flex flex-col p-0 overflow-hidden">
      {/* Top */}
      <div className="flex items-start justify-between p-4 pb-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${org.is_core_brain ? "bg-accent/20" : "bg-surface"}`}>
            <span className={`text-sm font-bold ${org.is_core_brain ? "text-accent" : "text-muted"}`}>
              {org.name.charAt(0).toUpperCase()}
            </span>
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold truncate">{org.name}</div>
            <div className="text-[10px] text-muted font-mono truncate">{org.slug}</div>
          </div>
        </div>
        <Badge variant={PLAN_VARIANT[org.plan] ?? "default"} size="xs">{org.plan}</Badge>
      </div>

      {/* Meta */}
      <div className="flex items-center gap-4 px-4 pb-3 text-[11px] text-muted">
        <span className="flex items-center gap-1">
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
          </svg>
          {members.length} member{members.length !== 1 ? "s" : ""}
        </span>
        {activeCount > 0 && (
          <span className="flex items-center gap-1 text-success">
            <StatusDot type="active" size="sm" pulse />
            {activeCount} active
          </span>
        )}
        <span className="ml-auto text-[10px]">{new Date(org.created_at).toLocaleDateString()}</span>
      </div>

      {/* Owner */}
      <div className="px-4 pb-3">
        <span className="flex items-center gap-1 text-[11px] text-muted">
          <svg className="w-3 h-3 shrink-0 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12c0 4.97-4.03 9-9 9s-9-4.03-9-9 4.03-9 9-9 9 4.03 9 9z" />
          </svg>
          <span className="truncate">Owner: <span className="text-foreground">{ownerEmail}</span></span>
        </span>
      </div>

      {/* Member avatars */}
      {members.length > 0 && (
        <div className="px-4 pb-3 flex items-center">
          {members.slice(0, 6).map((m, i) => {
            const email = userMap.get(m.user_id)?.email ?? "?";
            return (
              <div
                key={m.user_id}
                title={email}
                style={{ zIndex: 6 - i, marginLeft: i === 0 ? 0 : "-6px" }}
                className="w-6 h-6 rounded-full bg-accent/10 border-2 border-card flex items-center justify-center text-[9px] font-bold text-accent"
              >
                {email.charAt(0).toUpperCase()}
              </div>
            );
          })}
          {members.length > 6 && (
            <div
              style={{ marginLeft: "-6px", zIndex: 0 }}
              className="w-6 h-6 rounded-full bg-surface border-2 border-card flex items-center justify-center text-[9px] text-muted"
            >
              +{members.length - 6}
            </div>
          )}
        </div>
      )}

      {/* Footer */}
      <div className="border-t border-border-subtle mt-auto flex items-center gap-2 px-3 py-2.5">
        <Link
          href={`/admin/orgs/${org.id}`}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-surface hover:bg-surface-hover border border-border transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          Manage
        </Link>
        <span className="flex-1" />
        <span className="text-[10px] text-muted font-mono">{org.id.slice(0, 8)}…</span>
      </div>
    </Card>
  );
}
