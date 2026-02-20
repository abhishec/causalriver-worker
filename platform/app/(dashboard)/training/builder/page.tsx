import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/org-helpers";
import { BuilderClient } from "./builder-client";

export const dynamic = 'force-dynamic';

export const metadata = {
  title: "Training Pack Builder",
};

export default async function TrainingBuilderPage() {
  const supabase = await createClient();
  const orgId = await getCurrentOrgId();

  // Fetch entities and domains in parallel
  const [{ data: entities }, { data: edges }] = await Promise.all([
    supabase
      .from("resolved_entities")
      .select("id, canonical_name, entity_type, domain")
      .eq("organization_id", orgId)
      .order("canonical_name")
      .limit(200),
    supabase
      .from("causal_relationships_statistical")
      .select("domain")
      .eq("organization_id", orgId)
      .limit(200),
  ]);

  const domains = [...new Set((edges || []).map((e) => e.domain).filter(Boolean))].sort();

  return (
    <BuilderClient
      entities={entities || []}
      domains={domains}
      orgId={orgId}
    />
  );
}
