import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgId } from "@/lib/org-helpers";
import { BrainClient } from "./brain-client";

export const dynamic = 'force-dynamic';

export const metadata = {
  title: "Brain Explorer",
};

export default async function BrainPage() {
  const supabase = await createClient();
  const CORE_ORG_ID = await getCurrentOrgId();

  const [causalResult, entitiesResult, snapshotResult] = await Promise.all([
    // Top 50 causal relationships by strength
    supabase
      .from("causal_relationships_statistical")
      .select(
        "id, source_entity, target_entity, strength, p_value, lag_periods, method, domain, created_at"
      )
      .eq("organization_id", CORE_ORG_ID)
      .order("strength", { ascending: false })
      .limit(50),

    // Top 30 resolved entities
    supabase
      .from("resolved_entities")
      .select("id, canonical_name, entity_type, domain, aliases, confidence, created_at")
      .eq("organization_id", CORE_ORG_ID)
      .order("created_at", { ascending: false })
      .limit(30),

    // Latest snapshot for discoveries and region status
    supabase
      .from("brain_daily_snapshots")
      .select("*")
      .eq("organization_id", CORE_ORG_ID)
      .order("snapshot_date", { ascending: false })
      .limit(1),
  ]);

  const causalEdges = causalResult.data || [];
  const entities = entitiesResult.data || [];
  const snapshot = snapshotResult.data?.[0] || null;

  return (
    <BrainClient
      causalEdges={causalEdges}
      entities={entities}
      snapshot={snapshot}
    />
  );
}
