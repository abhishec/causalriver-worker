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

const ORGS = [
  { id: "9f338d96-fb02-45b2-b6bf-38269c32ddc8", name: "Fincense 5.11.5" },
  { id: "aa286f56-34f7-467f-9685-6f4ed12bf17e", name: "Fincense 6.3.4" },
];

const DELIVERY_TABLES = [
  "engagements",
  "engagement_health_scores",
  "engagement_health_latest",
  "scope_creep_alerts",
  "pod_match_history",
  "engineer_health_snapshots",
];

async function main() {
  for (const org of ORGS) {
    console.log(`\n${org.name}:`);
    for (const t of DELIVERY_TABLES) {
      const { count, error } = await sb
        .from(t as any)
        .select("*", { count: "exact", head: true })
        .eq("organization_id", org.id);
      if (error) {
        console.log(`  ❌ ${t}: ${error.message.slice(0, 60)}`);
      } else {
        console.log(`  ${count && count > 0 ? "✅" : "⚠️ "} ${t}: ${count ?? 0} rows`);
      }
    }
  }
}
main().catch(console.error);
