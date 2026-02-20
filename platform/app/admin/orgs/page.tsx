import { createServiceClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/Badge";
import { StatValue } from "@/components/ui/StatValue";
import { Card } from "@/components/ui/Card";
import { StatusDot } from "@/components/ui/StatusDot";
import Link from "next/link";
import { CreateWorkspaceModal } from "./create-workspace-modal";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin — Customers & Workspaces" };

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

interface CustomerMemberRow {
  customer_id: string;
  user_id: string;
  role: string;
  is_platform_admin: boolean;
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function AdminOrgsPage() {
  const supabase = await createServiceClient();

  const [orgsResult, authUsersResult, customerMembersResult, orgMembersResult, customersResult] = await Promise.all([
    // Orgs (workspaces) — grouped by customer in the UI
    supabase
      .from("organizations")
      .select("id, name, slug, plan, is_core_brain, customer_id, created_at, customer:customer_id(id, name, slug, is_design_partner)")
      .order("created_at"),
    supabase.auth.admin.listUsers({ perPage: 500 }),
    // PRIMARY: customer_members — users belong to customers
    supabase.from("customer_members").select("customer_id, user_id, role, is_platform_admin").limit(1000),
    // SECONDARY: org_members — only used for workspace-level access display
    supabase.from("org_members").select("user_id, organization_id, role, is_platform_admin").limit(500),
    supabase.from("customers").select("id, name, slug, plan, is_design_partner").order("name"),
  ]);

  const orgs            = (orgsResult.data           || []) as unknown as OrgRow[];
  const customerMembers = (customerMembersResult.data || []) as CustomerMemberRow[];
  const orgMembers      = orgMembersResult.data       || [];
  const customers       = customersResult.data        || [];

  // ── Auth user map ──────────────────────────────────────────────────────────
  const userMap = new Map<string, { lastSignIn: string | null; email: string }>();
  authUsersResult.data?.users?.forEach((u) => {
    userMap.set(u.id, { lastSignIn: u.last_sign_in_at || null, email: u.email || "" });
  });

  // ── Customer member maps ───────────────────────────────────────────────────
  // Primary: users keyed by customer_id
  const customerMemberMap = new Map<string, CustomerMemberRow[]>();
  customerMembers.forEach((m) => {
    if (!customerMemberMap.has(m.customer_id)) customerMemberMap.set(m.customer_id, []);
    customerMemberMap.get(m.customer_id)!.push(m);
  });

  // Active users per customer (signed in within 24h)
  const customerActiveCount = new Map<string, number>();
  customerMembers.forEach((m) => {
    const user = userMap.get(m.user_id);
    if (user?.lastSignIn) {
      const h = (Date.now() - new Date(user.lastSignIn).getTime()) / 3600000;
      if (h < 24) customerActiveCount.set(m.customer_id, (customerActiveCount.get(m.customer_id) || 0) + 1);
    }
  });

  // ── Org (workspace) membership maps — for workspace cards ─────────────────
  const orgMemberMap = new Map<string, typeof orgMembers>();
  orgMembers.forEach((m) => {
    if (!orgMemberMap.has(m.organization_id)) orgMemberMap.set(m.organization_id, []);
    orgMemberMap.get(m.organization_id)!.push(m);
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
  // Total unique users across all customer_members
  const totalUsers      = new Set(customerMembers.map((m) => m.user_id)).size;
  const tenantOrgs      = orgs.filter((o) => !o.is_core_brain);
  const enterpriseCount = customers.filter((c) => c.plan === "enterprise").length;
  const designPartners  = customers.filter((c) => c.is_design_partner).length;

  return (
    <div className="space-y-8 max-w-7xl">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Customers & Workspaces</h1>
          <p className="text-xs text-muted mt-0.5">
            Users belong to <strong>Customers</strong> — workspaces are isolated brain tracks within a customer
          </p>
        </div>
        <CreateWorkspaceModal customers={customers} />
      </div>

      {/* ── Stats ───────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <StatValue label="Customers"      value={String(customers.length)} subtitle={`${designPartners} design partner${designPartners !== 1 ? "s" : ""}`} />
        <StatValue label="Workspaces"     value={String(tenantOrgs.length)} subtitle="isolated brains" />
        <StatValue label="Enterprise"     value={String(enterpriseCount)} />
        <StatValue label="Total Users"    value={String(totalUsers)} subtitle="via customer_members" />
        <StatValue label="Core Orgs"      value={String(coreOrgs.length)} subtitle="platform brain" />
      </div>

      {/* ── Core Brain ──────────────────────────────────────────────────── */}
      {coreOrgs.length > 0 && (
        <Section label="Core Brain" sublabel="Platform intelligence — Brain OS internal">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {coreOrgs.map((org) => (
              <WorkspaceCard
                key={org.id}
                org={org}
                orgMembers={orgMemberMap.get(org.id) || []}
                userMap={userMap}
              />
            ))}
          </div>
        </Section>
      )}

      {/* ── Customer sections ────────────────────────────────────────────── */}
      {customers.map((customer) => {
        const workspaces   = customerWorkspaceMap.get(customer.id) || [];
        const members      = customerMemberMap.get(customer.id)    || [];
        const activeCount  = customerActiveCount.get(customer.id)  || 0;
        // Don't render customers with no workspaces AND no members (e.g. empty)
        if (workspaces.length === 0 && members.length === 0) return null;

        const ownerMember = members.find((m) => m.role === "owner");
        const ownerEmail  = ownerMember ? (userMap.get(ownerMember.user_id)?.email ?? "—") : "—";

        return (
          <section key={customer.id} className="space-y-3">
            {/* ── Customer Header ─────────────────────────────────────── */}
            <div className="flex items-center gap-3 px-0.5">
              <div className={`text-[10px] font-semibold uppercase tracking-widest ${customer.is_design_partner ? "text-warning" : "text-muted/60"}`}>
                {customer.name}
              </div>
              {customer.is_design_partner && (
                <Badge variant="default" size="xs">Design Partner</Badge>
              )}
              <Badge variant={PLAN_VARIANT[customer.plan] ?? "default"} size="xs">{customer.plan}</Badge>
              <div className="text-[10px] text-muted/50 ml-1">
                {members.length} member{members.length !== 1 ? "s" : ""} · {workspaces.length} workspace{workspaces.length !== 1 ? "s" : ""}
                {activeCount > 0 && <span className="text-success ml-2">● {activeCount} active</span>}
              </div>
              <Link
                href={`/admin/customers/${customer.id}`}
                className="ml-auto text-[10px] text-muted hover:text-foreground transition-colors"
              >
                Manage customer →
              </Link>
            </div>

            {/* ── Customer Members ────────────────────────────────────── */}
            {members.length > 0 && (
              <div className="px-3 py-2.5 rounded-lg bg-surface border border-border-subtle">
                <div className="text-[10px] text-muted/60 uppercase tracking-wider font-medium mb-2">
                  Customer Members
                </div>
                <div className="flex flex-wrap gap-2">
                  {members.map((m) => {
                    const email = userMap.get(m.user_id)?.email ?? m.user_id.slice(0, 8);
                    const lastSignIn = userMap.get(m.user_id)?.lastSignIn;
                    const isActive = lastSignIn && (Date.now() - new Date(lastSignIn).getTime()) / 3600000 < 24;
                    return (
                      <div
                        key={m.user_id}
                        className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-card border border-border-subtle text-[11px]"
                        title={`${email} · ${m.role}${m.is_platform_admin ? " (platform admin)" : ""}`}
                      >
                        <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold ${
                          m.role === "owner" ? "bg-accent/20 text-accent" :
                          m.role === "admin" ? "bg-warning/20 text-warning" :
                          "bg-surface text-muted"
                        }`}>
                          {email.charAt(0).toUpperCase()}
                        </div>
                        <span className="max-w-[140px] truncate text-foreground">{email}</span>
                        <span className="text-muted/60">{m.role}</span>
                        {m.is_platform_admin && (
                          <span className="text-[9px] text-accent font-medium">★</span>
                        )}
                        {isActive && <span className="w-1.5 h-1.5 rounded-full bg-success shrink-0" />}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ── Workspaces (brain isolation callout + cards) ─────────── */}
            {workspaces.length > 0 && (
              <div>
                <div className="mb-2 px-3 py-2 rounded-lg bg-surface border border-border-subtle text-[11px] text-muted flex items-center gap-2">
                  <span className="text-success">●</span>
                  Workspaces share a customer record for billing only.
                  Brain state, signals, and causal graphs are completely isolated per workspace.
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                  {workspaces.map((org) => (
                    <WorkspaceCard
                      key={org.id}
                      org={org}
                      orgMembers={orgMemberMap.get(org.id) || []}
                      userMap={userMap}
                      showWorkspaceLabel
                    />
                  ))}
                </div>
              </div>
            )}
          </section>
        );
      })}

      {/* ── Unclaimed workspaces (no customer) ───────────────────────────── */}
      {standaloneOrgs.length > 0 && (
        <Section label="Unclaimed Workspaces" sublabel="Not yet linked to a customer — run backfill migration">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {standaloneOrgs.map((org) => (
              <WorkspaceCard
                key={org.id}
                org={org}
                orgMembers={orgMemberMap.get(org.id) || []}
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

// ── Workspace card (brain-scoped org) ─────────────────────────────────────────

function WorkspaceCard({
  org,
  orgMembers,
  userMap,
  showWorkspaceLabel = false,
}: {
  org: OrgRow;
  orgMembers: Record<string, any>[];
  userMap: Map<string, { lastSignIn: string | null; email: string }>;
  showWorkspaceLabel?: boolean;
}) {
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
            {showWorkspaceLabel && (
              <div className="text-[9px] uppercase tracking-wider text-muted/60 leading-none mb-0.5">
                Workspace (brain)
              </div>
            )}
            <div className="text-sm font-semibold truncate">{org.name}</div>
            <div className="text-[10px] text-muted font-mono truncate">{org.slug}</div>
          </div>
        </div>
        <Badge variant={PLAN_VARIANT[org.plan] ?? "default"} size="xs">{org.plan}</Badge>
      </div>

      {/* Workspace-level org_members count (brain access) */}
      <div className="flex items-center gap-4 px-4 pb-3 text-[11px] text-muted">
        <span className="flex items-center gap-1">
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 9.776c.112-.017.227-.026.344-.026h15.812c.117 0 .232.009.344.026m-16.5 0a2.25 2.25 0 00-1.883 2.542l.857 6a2.25 2.25 0 002.227 1.932H19.05a2.25 2.25 0 002.227-1.932l.857-6a2.25 2.25 0 00-1.883-2.542m-16.5 0V6A2.25 2.25 0 016 3.75h3.879a1.5 1.5 0 011.06.44l2.122 2.12a1.5 1.5 0 001.06.44H18A2.25 2.25 0 0120.25 9v.776" />
          </svg>
          Brain workspace
        </span>
        <span className="flex items-center gap-1">
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
          </svg>
          {orgMembers.length} workspace access
        </span>
        <span className="ml-auto text-[10px]">{new Date(org.created_at).toLocaleDateString()}</span>
      </div>

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
          Brain settings
        </Link>
        <span className="flex-1" />
        <span className="text-[10px] text-muted font-mono">{org.id.slice(0, 8)}…</span>
      </div>
    </Card>
  );
}
