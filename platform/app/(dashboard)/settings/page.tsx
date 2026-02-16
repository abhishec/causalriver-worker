import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/org-helpers";
import { SettingsClient } from "./settings-client";

export const dynamic = 'force-dynamic';

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const supabase = await createClient();
  const orgId = await getCurrentOrgId();

  const [orgResult, budgetResult, apiKeysResult, connectorsResult] = await Promise.all([
    supabase
      .from("organizations")
      .select("id, name, slug, plan")
      .eq("id", orgId)
      .single(),

    supabase
      .from("cost_budget_config")
      .select("*")
      .eq("organization_id", orgId)
      .single(),

    supabase
      .from("api_keys")
      .select("id, key_prefix, name, permissions, rate_limit_per_minute, last_used_at, created_at, is_active")
      .eq("organization_id", orgId)
      .eq("is_active", true)
      .order("created_at", { ascending: false }),

    supabase
      .from("org_connectors")
      .select("id, connector_type, display_name, status, last_sync_at, config")
      .eq("organization_id", orgId)
      .order("created_at", { ascending: false }),
  ]);

  return (
    <SettingsClient
      org={orgResult.data}
      orgId={orgId}
      budget={budgetResult.data}
      apiKeys={apiKeysResult.data || []}
      connectors={connectorsResult.data || []}
    />
  );
}
