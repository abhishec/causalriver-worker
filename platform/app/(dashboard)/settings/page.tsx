import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/org-helpers";
import { SettingsClient } from "./settings-client";

export const dynamic = 'force-dynamic';

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const supabase = await createClient();
  const orgId = await getCurrentOrgId();

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
      .eq("id", orgId)
      .single()),

    safe(supabase
      .from("cost_budget_config")
      .select("*")
      .eq("organization_id", orgId)
      .single()),

    safe(supabase
      .from("api_keys")
      .select("id, key_prefix, name, permissions, rate_limit_per_minute, last_used_at, created_at, is_active")
      .eq("organization_id", orgId)
      .eq("is_active", true)
      .order("created_at", { ascending: false })),

    safe(supabase
      .from("org_connectors")
      .select("id, connector_type, instance_name, display_name, status, last_sync_at, config, metadata, signals_count, error_message")
      .eq("organization_id", orgId)
      .order("created_at", { ascending: true })),
  ]);

  const orgData = orgResult.data as {
    id: string; name: string; slug: string; plan: string;
    is_core_brain: boolean; customer_id: string | null;
  } | null;

  if (!orgData) {
    console.error("[Settings] Org query returned null for orgId:", orgId, "error:", orgResult.error);
  }

  // ── Query 5: Customer data (separate query — avoids FK join failures) ──
  const customerId = orgData?.customer_id ?? null;
  let customer: { id: string; name: string; slug: string; plan: string; is_design_partner: boolean } | null = null;

  if (customerId) {
    const { data: cust, error: custErr } = await supabase
      .from("customers")
      .select("id, name, slug, plan, is_design_partner")
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

  return (
    <Suspense fallback={<div className="p-8 text-sm text-muted">Loading settings...</div>}>
      <SettingsClient
        org={orgData}
        orgId={orgId}
        budget={budgetResult.data}
        apiKeys={apiKeysResult.data || []}
        connectors={connectorsResult.data || []}
        customer={customer}
        siblingWorkspaces={siblingWorkspaces}
      />
    </Suspense>
  );
}
