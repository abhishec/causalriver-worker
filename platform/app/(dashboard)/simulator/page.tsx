import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspaceId } from "@/lib/workspace-helpers";
import { SimulatorClient } from "./simulator-client";


export const metadata = {
  title: "What-If Simulator",
};

export default async function SimulatorPage() {
  const supabase = await createClient();
  const workspaceId = await getCurrentWorkspaceId();

  // Fetch entities and domains in parallel
  const [{ data: entities }, { data: edges }] = await Promise.all([
    supabase
      .from("resolved_entities")
      .select("id, canonical_name, entity_type, domain")
      .eq("organization_id", workspaceId)
      .order("canonical_name")
      .limit(100),
    supabase
      .from("causal_relationships_statistical")
      .select("domain")
      .eq("organization_id", workspaceId)
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
