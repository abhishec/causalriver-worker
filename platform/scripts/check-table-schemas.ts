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
  // Check which tables exist and their columns
  const tables = [
    "entity_embeddings",
    "velocity_snapshots",
    "bottleneck_snapshots",
    "entity_links",
    "brain_memory_patterns",
    "connector_entity_links",
    "causal_pattern_memory",
  ];

  for (const table of tables) {
    // Try fetching one row to see columns + check if table exists
    const { data, error } = await sb.from(table).select("*").limit(1);
    if (error) {
      console.log(`❌ ${table}: ${error.message}`);
    } else {
      const cols = data && data.length > 0 ? Object.keys(data[0]) : "(empty, exists)";
      console.log(`✅ ${table}: ${JSON.stringify(cols)}`);
    }
  }
}
main().catch(console.error);
