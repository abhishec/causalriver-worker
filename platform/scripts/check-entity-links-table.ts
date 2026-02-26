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
  // Try different possible table names
  const tablesToCheck = [
    "entity_links",
    "brain_memory_patterns",
    "causal_pattern_memory",
    "org_memory_patterns",
    "brain_patterns",
    "cross_domain_entity_links",
    "connector_entity_links",
    "jira_github_links",
  ];

  for (const t of tablesToCheck) {
    const { data, error } = await sb.from(t).select("id").limit(1);
    if (error?.code === "42P01" || error?.message?.includes("not found")) {
      // Table doesn't exist
    } else if (error) {
      console.log(`❓ ${t}: error — ${error.message}`);
    } else {
      console.log(`✅ ${t}: EXISTS (${data?.length} rows returned)`);
    }
  }

  // Also check information_schema for any tables with "entity" or "memory" or "pattern" in name
  const { data: tables } = await sb
    .rpc("exec_sql" as any, {
      sql: `SELECT table_name FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND (table_name LIKE '%entity%' OR table_name LIKE '%memory%' OR table_name LIKE '%pattern%' OR table_name LIKE '%link%')
            ORDER BY table_name`
    });
  console.log("\nTables with entity/memory/pattern/link in name:");
  console.log(tables ?? "exec_sql not available");
}
main().catch(console.error);
