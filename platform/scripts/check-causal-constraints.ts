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
  // See what's already in the table for Tookitaki orgs
  const ORGS = [
    "9f338d96-fb02-45b2-b6bf-38269c32ddc8",
    "aa286f56-34f7-467f-9685-6f4ed12bf17e",
  ];

  for (const orgId of ORGS) {
    const { data, count } = await sb
      .from("causal_relationships_statistical")
      .select("source_domain, target_domain, evidence_weight", { count: "exact" })
      .eq("organization_id", orgId);
    console.log(`Org ${orgId.slice(0,8)}: ${count} rows`, JSON.stringify(data?.slice(0,3)));
  }

  // Test insert with ignoreDuplicates
  const testRow = {
    organization_id: "9f338d96-fb02-45b2-b6bf-38269c32ddc8",
    source_domain: "test_eng",
    target_domain: "test_del",
    effect_size: 0.5,
    evidence_weight: 10,
    natural_language: "Test insert",
    last_validated_at: new Date().toISOString(),
  };

  const { error: insertErr } = await sb
    .from("causal_relationships_statistical")
    .insert([testRow]);
  console.log("insert error:", insertErr?.message, insertErr?.code);

  // Clean up test row
  await sb.from("causal_relationships_statistical")
    .delete()
    .eq("organization_id", testRow.organization_id)
    .eq("source_domain", "test_eng");
}

main().catch(console.error);
