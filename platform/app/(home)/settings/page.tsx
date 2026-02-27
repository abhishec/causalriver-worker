import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createClient, getAuthUser } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { getCurrentWorkspaceId } from "@/lib/workspace-helpers";
import { SettingsClient } from "./settings-client";
import { logger } from "@/lib/logger";


export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  // ── 500→401 Lambda pattern: each init wrapped separately ──
  // createClient/getAdminClient/getCurrentWorkspaceId all throw if env vars or
  // session are missing on a Lambda cold start. Redirect to login rather than 500.
  const supabase = await createClient().catch(() => redirect("/login"));
  const workspaceId = await getCurrentWorkspaceId().catch(() => redirect("/login"));

  // Admin client: optional — customer tab degrades gracefully if unavailable
  let admin: ReturnType<typeof getAdminClient> | null = null;
  try { admin = getAdminClient(); } catch { logger.warn("[Settings] Admin client unavailable — customer tab disabled"); }

  // Auth user: optional — only drives the customer memberships query
  let user: Awaited<ReturnType<typeof getAuthUser>> | null = null;
  try { user = await getAuthUser(); } catch { logger.warn("[Settings] getAuthUser failed — customer memberships empty"); }

  const safe = <T,>(p: PromiseLike<{ data: T | null; error: any }>): Promise<{ data: T | null; error: any }> =>
    Promise.resolve(p).catch((err) => {
      logger.error("[Settings] Query failed:", err);
      return { data: null as T | null, error: err };
    });

  // ── Query 1: Org data (no FK join — resilient to customer RLS issues) ──
  // ── Query 2-4: Budget, API keys, Connectors (parallel)
  // ── Query 5: ALL customer memberships for this user (for Customers tab) ──
  const [orgResult, budgetResult, apiKeysResult, connectorsResult, allCustomerMembershipsResult] = await Promise.all([
    safe(supabase
      .from("organizations")
      .select("id, name, slug, plan, is_core_brain, customer_id")
      .eq("id", workspaceId)
      .maybeSingle()),

    safe(supabase
      .from("cost_budget_config")
      .select("*")
      .eq("organization_id", workspaceId)
      .maybeSingle()),

    safe(supabase
      .from("api_keys")
      .select("id, key_prefix, name, permissions, rate_limit_per_minute, last_used_at, created_at, is_active")
      .eq("organization_id", workspaceId)
      .eq("is_active", true)
      .order("created_at", { ascending: false })),

    safe(supabase
      .from("org_connectors")
      .select("id, connector_type, instance_name, display_name, status, last_sync_at, config, metadata, signals_count, error_message")
      .eq("organization_id", workspaceId)
      .order("created_at", { ascending: true })),

    // Fetch all customer memberships for this user (uses admin to bypass RLS)
    user && admin
      ? safe(admin
          .from("customer_members")
          .select("customer_id, role, primary_org_id")
          .eq("user_id", user.id)
          .order("joined_at", { ascending: true }))
      : Promise.resolve({ data: null, error: null }),
  ]);

  const orgData = orgResult.data as {
    id: string; name: string; slug: string; plan: string;
    is_core_brain: boolean; customer_id: string | null;
  } | null;

  if (!orgData) {
    logger.error("[Settings] Org query returned null for workspaceId:", workspaceId, "error:", orgResult.error);

    // Attempt recovery: resolve via customer chain → primary_org_id
    const { getCurrentCustomer } = await import("@/lib/workspace-helpers");
    const recoveryCustomer = await getCurrentCustomer();
    if (recoveryCustomer?.primary_org_id && recoveryCustomer.primary_org_id !== workspaceId) {
      const { data: recoveredOrg } = await safe(supabase
        .from("organizations")
        .select("id, name, slug, plan, is_core_brain, customer_id")
        .eq("id", recoveryCustomer.primary_org_id)
        .maybeSingle());
      if (recoveredOrg) {
        // Use recovered org data — reassign orgData
        (orgResult as any).data = recoveredOrg;
      }
    }
  }

  // Re-read after potential recovery
  const finalOrgData = (orgResult.data as {
    id: string; name: string; slug: string; plan: string;
    is_core_brain: boolean; customer_id: string | null;
  } | null);

  // ── Parse all customer memberships ──
  const customerMembershipRows = (allCustomerMembershipsResult.data || []) as {
    customer_id: string; role: string; primary_org_id: string | null;
  }[];
  const allCustomerIds = customerMembershipRows.map(r => r.customer_id);

  // ── Fetch ALL customers + ALL workspaces under those customers (parallel) ──
  type CustomerRow = {
    id: string; name: string; slug: string; plan: string;
    is_design_partner: boolean; industry: string | null; created_at: string | null;
  };
  type WorkspaceRow = { id: string; name: string; slug: string; plan: string; customer_id: string };

  let allCustomers: CustomerRow[] = [];
  let allWorkspacesAcrossCustomers: WorkspaceRow[] = [];

  if (allCustomerIds.length > 0 && admin) {
    const [customersResult, workspacesResult] = await Promise.all([
      safe(admin
        .from("customers")
        .select("id, name, slug, plan, is_design_partner, industry, created_at")
        .in("id", allCustomerIds)
        .order("created_at", { ascending: true })),
      safe(admin
        .from("organizations")
        .select("id, name, slug, plan, customer_id")
        .in("customer_id", allCustomerIds)
        .order("created_at", { ascending: true })),
    ]);
    allCustomers = (customersResult.data || []) as CustomerRow[];
    allWorkspacesAcrossCustomers = (workspacesResult.data || []) as WorkspaceRow[];
  }

  // ── Fetch connector counts for ALL workspaces across all customers ──
  let allWorkspaceConnectors: { organization_id: string; connector_type: string; display_name: string; status: string }[] = [];

  if (allWorkspacesAcrossCustomers.length > 0 && admin) {
    const allWsIds = allWorkspacesAcrossCustomers.map(ws => ws.id);
    const { data: wsCons } = await safe(admin
      .from("org_connectors")
      .select("organization_id, connector_type, display_name, status")
      .in("organization_id", allWsIds)
      .eq("status", "active"));
    allWorkspaceConnectors = wsCons || [];
  }

  // ── Build workspace-with-connectors map ──
  const connectorsByWorkspace: Record<string, { type: string; name: string; count: number }[]> = {};
  for (const conn of allWorkspaceConnectors) {
    if (!connectorsByWorkspace[conn.organization_id]) {
      connectorsByWorkspace[conn.organization_id] = [];
    }
    const existing = connectorsByWorkspace[conn.organization_id].find(c => c.type === conn.connector_type);
    if (existing) {
      existing.count++;
    } else {
      connectorsByWorkspace[conn.organization_id].push({
        type: conn.connector_type,
        name: conn.display_name || conn.connector_type,
        count: 1,
      });
    }
  }

  // ── Build the full customer → workspaces structure for the Customers tab ──
  const allCustomersWithWorkspaces = allCustomers.map(cust => {
    const membership = customerMembershipRows.find(r => r.customer_id === cust.id);
    const workspaces = allWorkspacesAcrossCustomers
      .filter(ws => ws.customer_id === cust.id)
      .map(ws => ({
        ...ws,
        connectors: connectorsByWorkspace[ws.id] || [],
      }));
    return {
      ...cust,
      role: membership?.role ?? "member",
      defaultWorkspaceId: membership?.primary_org_id ?? null,
      workspaces,
    };
  });

  // ── For backward compat: current workspace's customer + siblings ──
  const customerId = finalOrgData?.customer_id ?? null;
  const customer = allCustomers.find(c => c.id === customerId) ?? null;
  const siblingWorkspaces = allWorkspacesAcrossCustomers
    .filter(ws => ws.customer_id === customerId)
    .map(ws => ({
      ...ws,
      connectors: connectorsByWorkspace[ws.id] || [],
    }));
  const defaultWorkspaceId = customerMembershipRows.find(r => r.customer_id === customerId)?.primary_org_id ?? null;

  return (
    <Suspense fallback={<div className="p-8 text-sm text-muted">Loading settings...</div>}>
      <SettingsClient
        org={finalOrgData}
        orgId={workspaceId}
        budget={budgetResult.data}
        apiKeys={apiKeysResult.data || []}
        connectors={connectorsResult.data || []}
        customer={customer}
        siblingWorkspaces={siblingWorkspaces}
        defaultWorkspaceId={defaultWorkspaceId}
        allCustomers={allCustomersWithWorkspaces}
      />
    </Suspense>
  );
}
