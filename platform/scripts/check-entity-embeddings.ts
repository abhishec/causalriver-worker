/* eslint-disable no-console */
import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import { resolve } from "path";
dotenv.config({ path: resolve(__dirname, "../.env.local") });

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.SUPABASE_SERVICE_ROLE_KEY as string,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

async function main() {
  const ORGS = [
    { id: "9f338d96-fb02-45b2-b6bf-38269c32ddc8", name: "Fincense 5.11.5" },
    { id: "aa286f56-34f7-467f-9685-6f4ed12bf17e", name: "Fincense 6.3.4" },
  ];

  for (const org of ORGS) {
    // Check entity_embeddings
    const { count: embedCount } = await sb
      .from("entity_embeddings")
      .select("*", { count: "exact", head: true })
      .eq("organization_id", org.id);

    // Check velocity_snapshots
    const { count: velCount } = await sb
      .from("velocity_snapshots")
      .select("*", { count: "exact", head: true })
      .eq("organization_id", org.id);

    // Check entity_links
    const { count: linkCount } = await sb
      .from("entity_links")
      .select("*", { count: "exact", head: true })
      .eq("organization_id", org.id);

    // Check bottleneck_snapshots
    const { count: bnCount } = await sb
      .from("bottleneck_snapshots")
      .select("*", { count: "exact", head: true })
      .eq("organization_id", org.id);

    // Check causal relationships
    const { count: causalCount } = await sb
      .from("causal_relationships_statistical")
      .select("*", { count: "exact", head: true })
      .eq("organization_id", org.id);

    // Check brain memory patterns
    const { count: memCount } = await sb
      .from("brain_memory_patterns")
      .select("*", { count: "exact", head: true })
      .eq("organization_id", org.id);

    console.log(`\n${org.name} (${org.id.slice(0,8)}):`);
    console.log(`  entity_embeddings (code symbols): ${embedCount ?? 0}`);
    console.log(`  velocity_snapshots:               ${velCount ?? 0}`);
    console.log(`  bottleneck_snapshots:             ${bnCount ?? 0}`);
    console.log(`  entity_links:                     ${linkCount ?? 0}`);
    console.log(`  causal_relationships:             ${causalCount ?? 0}`);
    console.log(`  brain_memory_patterns:            ${memCount ?? 0}`);
  }
}
main().catch(console.error);
