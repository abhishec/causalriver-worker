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
  pro:        "info",
  starter:    "success",
  free:       "default",
};

// ── Types ─────────────────────────────────────────────────────────────────────

interface OrgRow {
  id: string;
  name: string;
  slug: string;
  plan: string;
  is_core_brain: boolean;
  customer_id: string | null;
  created_at: string;
  customer: { id: string; name: string; slug: string; is_design_partner: boolean } | null;
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function AdminOrgsPage() {
  const supabase = await createServiceClient();

  const [orgsResult, authUsersResult, membersResult, customersResult] = await Promise.all([
    // Join customers so we can group workspaces by customer in the UI
    supabase
      .from("organizations")
      .select("id, name, slug, plan, is_core_brain, customer_id, created_at, customer:customer_id(id, name, slug, is_design_partner)")
      .order("created_at"),
    supabase.auth.admin.listUsers({ perPage: 500 }),
    supabase.from("org_members").select("user_id, organization_id, role, is_platform_admin").limit(500),
    supabase.from("customers").select("id, name, slug, plan, is_design_partner").order("name"),
  ]);

  const orgs     = (orgsResult.data    || []) as unknown as OrgRow[];
  const members  = membersResult.data  || [];
  const customers = customersResult.data || [];

  // ── Auth user map ──────────────────────────────────────────────────────────
  const userMap = new Map<string, { lastSignIn: string | null; email: string }>();
  authUsersResult.data?.users?.forEach((u) => {
    userMap.set(u.id, { lastSignIn: u.last_sign_in_at || null, email: u.email || "" });
  });

  // ── Org membership maps ───────────────────────────────────────────────────
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

  // ── Partition orgs ────────────────────────────────────────────────────────
  const coreOrgs       = orgs.filter((o) => o.is_core_brain);
  const customerOrgs   = orgs.filter((o) => !o.is_core_brain && o.customer_id);
  const standaloneOrgs = orgs.filter((o) => !o.is_core_brain && !o.customer_id);

  // Build customer → workspaces map
  const customerWorkspaceMap = new Map<string, OrgRow[]>();
  customerOrgs.forEach((o) => {
    const cid = o.customer_id!;
    if (!customerWorkspaceMap.has(cid)) customerWorkspaceMap.set(cid, []);
    customerWorkspaceMap.get(cid)!.push(o);
  });

  // Stats
  const totalUsers      = new Set(members.map((m) => m.user_id)).size;
  const tenantOrgs      = orgs.filter((o) => !o.is_core_brain);
  const enterpriseCount = orgs.filter((o) => o.plan === "enterprise").length;
  const designPartners  = customers.filter((c) => c.is_design_partner).length;

  return (
    <div className="space-y-8 max-w-7xl">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Organizations</h1>
        <p className="text-xs text-muted mt-0.5">
          Customers → Workspaces — each workspace has a fully isolated causal graph
        </p>
      </div>

      {/* ── Stats ───────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <StatValue label="Customers"      value={String(customers.length)} subtitle={`${designPartners} design partner${designPartners !== 1 ? "s" : ""}`} />
        <StatValue label="Workspaces"     value={String(tenantOrgs.length)} />
        <StatValue label="Enterprise"     value={String(enterpriseCount)} />
        <StatValue label="Total Users"    value={String(totalUsers)} />
        <StatValue label="Core Orgs"      value={String(coreOrgs.length)} subtitle="platform brain" />
      </div>

      {/* ── Core Brain ──────────────────────────────────────────────────── */}
      {coreOrgs.length > 0 && (
        <Section label="Core Brain" sublabel="Platform intelligence — not customer-owned">
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
        </Section>
      )}

      {/* ── Customer → Workspace groups ──────────────────────────────────── */}
      {customers.map((customer) => {
        const workspaces = customerWorkspaceMap.get(customer.id) || [];
        if (workspaces.length === 0) return null;

        return (
          <Section
            key={customer.id}
            label={customer.name}
            sublabel={
              customer.is_design_partner
                ? `Design Partner · ${workspaces.length} workspace${workspaces.length !== 1 ? "s" : ""} · each with isolated causal graph`
                : `${workspaces.length} workspace${workspaces.length !== 1 ? "s" : ""} · each with isolated causal graph`
            }
            accent={customer.is_design_partner}
          >
            {/* Isolation callout — reminds admins that workspaces are not shared */}
            <div className="mb-3 px-3 py-2 rounded-lg bg-surface border border-border-subtle text-[11px] text-muted flex items-center gap-2">
              <span className="text-success">●</span>
              Workspaces share a customer record for billing only.
              Brain state, signals, and causal graphs are completely isolated between workspaces.
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {workspaces.map((org) => (
                <OrgCard
                  key={org.id}
                  org={org}
                  members={orgMemberMap.get(org.id) || []}
                  activeCount={orgActiveCount.get(org.id) || 0}
                  userMap={userMap}
                  workspaceLabel
                />
              ))}
            </div>
          </Section>
        );
      })}

      {/* ── Standalone orgs (no customer) ────────────────────────────────── */}
      {standaloneOrgs.length > 0 && (
        <Section label="Unclaimed Workspaces" sublabel="Organizations not yet linked to a customer">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {standaloneOrgs.map((org) => (
              <OrgCard
                key={org.id}
                org={org}
                members={orgMemberMap.get(org.id) || []}
                activeCount={orgActiveCount.get(org.id) || 0}
                userMap={userMap}
              />
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}

// ── Section wrapper ───────────────────────────────────────────────────────────

function Section({
  label,
  sublabel,
  accent,
  children,
}: {
  label: string;
  sublabel?: string;
  accent?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="flex items-baseline gap-3 mb-3 px-0.5">
        <div className={`text-[10px] font-semibold uppercase tracking-widest ${accent ? "text-warning" : "text-muted/60"}`}>
          {label}
        </div>
        {sublabel && (
          <div className="text-[10px] text-muted/50">{sublabel}</div>
        )}
      </div>
      {children}
    </section>
  );
}

// ── Org / Workspace card ──────────────────────────────────────────────────────

function OrgCard({
  org,
  members,
  activeCount,
  userMap,
  workspaceLabel = false,
}: {
  org: OrgRow;
  members: Record<string, any>[];
  activeCount: number;
  userMap: Map<string, { lastSignIn: string | null; email: string }>;
  workspaceLabel?: boolean;
}) {
  const owner      = members.find((m) => m.role === "owner");
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
            {workspaceLabel && (
              <div className="text-[9px] uppercase tracking-wider text-muted/60 leading-none mb-0.5">
                Workspace
              </div>
            )}
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
