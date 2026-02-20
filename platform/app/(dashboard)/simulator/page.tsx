import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/org-helpers";
import { SimulatorClient } from "./simulator-client";

export const dynamic = 'force-dynamic';

export const metadata = {
  title: "What-If Simulator",
};

export default async function SimulatorPage() {
  const supabase = await createClient();
  const orgId = await getCurrentOrgId();

  // Fetch entities and domains in parallel
  const [{ data: entities }, { data: edges }] = await Promise.all([
    supabase
      .from("resolved_entities")
      .select("id, canonical_name, entity_type, domain")
      .eq("organization_id", orgId)
      .order("canonical_name")
      .limit(100),
    supabase
      .from("causal_relationships_statistical")
      .select("domain")
      .eq("organization_id", orgId)
      .limit(200),
  ]);

  const domains = [...new Set((edges || []).map((e) => e.domain).filter(Boolean))].sort();

  return (
    <SimulatorClient
      entities={entities || []}
      domains={domains}
    />
  );
}
