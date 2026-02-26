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
  // Try all known tables in the codebase that reference entity_links
  // The brain-context-mesh queries from these tables
  // Systematically check every table referenced in brain context code

  const allTables = [
    "causal_relationships_statistical",
    "cross_domain_signals",
    "brain_agent_tasks",
    "brain_agent_steps",
    "velocity_snapshots",
    "bottleneck_snapshots",
    "entity_embeddings",
    // Various possible names for entity_links
    "entity_links",
    "connector_entity_links",
    "github_entity_links",
    // Brain patterns
    "brain_memory_patterns",
    "org_memory_patterns",
    "causal_pattern_memory",
    // Org context
    "organization_context",
    "org_insights",
    "brain_insights",
    "brain_causal_insights",
    // Other possible names
    "link_registry",
    "cross_system_links",
    "issue_pr_links",
    "knowledge_edges",
  ];

  console.log("Checking all tables...\n");
  const existing: string[] = [];
  for (const t of allTables) {
    const { error } = await sb.from(t as any).select("id").limit(1);
    if (!error || !error.message.includes("not found in the schema")) {
      existing.push(t);
      console.log(`✅ ${t}`);
    }
  }

  console.log(`\nExisting tables: ${existing.join(", ")}`);
}
main().catch(console.error);
