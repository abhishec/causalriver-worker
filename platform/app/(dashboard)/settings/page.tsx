import { Suspense } from "react";
import { createClient, getAuthUser } from "@/lib/supabase/server";
import { getCurrentWorkspaceId } from "@/lib/workspace-helpers";
import { SettingsClient } from "./settings-client";

export const dynamic = 'force-dynamic';

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const supabase = await createClient();
  const workspaceId = await getCurrentWorkspaceId();
  const user = await getAuthUser();

  const safe = <T,>(p: PromiseLike<{ data: T | null; error: any }>): Promise<{ data: T | null; error: any }> =>
    Promise.resolve(p).catch((err) => {
      console.error("[Settings] Query failed:", err);
      return { data: null as T | null, error: err };
    });

  // ── Query 1: Org data (no FK join — resilient to customer RLS issues) ──
  // ── Query 2-4: Budget, API keys, Connectors (parallel)
  const [orgResult, budgetResult, apiKeysResult, connectorsResult] = await Promise.all([
    safe(supabase
      .from("organizations")
      .select("id, name, slug, plan, is_core_brain, customer_id")
      .eq("id", workspaceId)
      .single()),

    safe(supabase
      .from("cost_budget_config")
      .select("*")
      .eq("organization_id", workspaceId)
      .single()),

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
  ]);

  const orgData = orgResult.data as {
    id: string; name: string; slug: string; plan: string;
    is_core_brain: boolean; customer_id: string | null;
  } | null;

  if (!orgData) {
    console.error("[Settings] Org query returned null for workspaceId:", workspaceId, "error:", orgResult.error);
  }

  // ── Query 5: Customer data (expanded — includes industry, created_at) ──
  const customerId = orgData?.customer_id ?? null;
  let customer: {
    id: string; name: string; slug: string; plan: string;
    is_design_partner: boolean; industry: string | null; created_at: string | null;
  } | null = null;

  if (customerId) {
    const { data: cust, error: custErr } = await supabase
      .from("customers")
      .select("id, name, slug, plan, is_design_partner, industry, created_at")
      .eq("id", customerId)
      .single();
    if (custErr) console.error("[Settings] Customer query failed:", custErr);
    customer = cust ?? null;
  }

  // ── Query 6: Sibling workspaces under same customer ──
  let siblingWorkspaces: { id: string; name: string; slug: string; plan: string }[] = [];

  if (customerId) {
    const { data: siblings } = await supabase
      .from("organizations")
      .select("id, name, slug, plan")
      .eq("customer_id", customerId)
      .order("created_at", { ascending: true });
    siblingWorkspaces = siblings || [];
  }

  // ── Query 7: Connectors for ALL sibling workspaces (grouped by workspace) ──
  let allWorkspaceConnectors: { organization_id: string; connector_type: string; display_name: string; status: string }[] = [];

  if (siblingWorkspaces.length > 0) {
    const allWorkspaceIds = siblingWorkspaces.map(ws => ws.id);
    const { data: wsCons } = await supabase
      .from("org_connectors")
      .select("organization_id, connector_type, display_name, status")
      .in("organization_id", allWorkspaceIds)
      .eq("status", "active");
    allWorkspaceConnectors = wsCons || [];
  }

  // ── Query 8: User's default workspace (primary_org_id from customer_members) ──
  let defaultWorkspaceId: string | null = null;

  if (customerId && user) {
    const { data: custMember } = await supabase
      .from("customer_members")
      .select("primary_org_id")
      .eq("user_id", user.id)
      .eq("customer_id", customerId)
      .single();
    defaultWorkspaceId = custMember?.primary_org_id ?? null;
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

  const siblingWorkspacesWithConnectors = siblingWorkspaces.map(ws => ({
    ...ws,
    connectors: connectorsByWorkspace[ws.id] || [],
  }));

  return (
    <Suspense fallback={<div className="p-8 text-sm text-muted">Loading settings...</div>}>
      <SettingsClient
        org={orgData}
        orgId={workspaceId}
        budget={budgetResult.data}
        apiKeys={apiKeysResult.data || []}
        connectors={connectorsResult.data || []}
        customer={customer}
        siblingWorkspaces={siblingWorkspacesWithConnectors}
        defaultWorkspaceId={defaultWorkspaceId}
      />
    </Suspense>
  );
}
