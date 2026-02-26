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

const TOOKITAKI_ORG = "9f338d96-fb02-45b2-b6bf-38269c32ddc8";

async function main() {
  // Check each important table with service key (bypasses RLS)
  const checks = [
    "entity_links",
    "brain_memory_patterns",
    "org_memory_patterns",
    "causal_pattern_memory",
    "organization_context",
    "org_insights",
    "brain_causal_insights",
    "brain_insights",
    "cross_system_links",
    "issue_pr_links",
    "knowledge_edges",
  ];

  for (const t of checks) {
    try {
      // Use service role key to bypass RLS - query with org filter
      const { data, error, count } = await sb
        .from(t as any)
        .select("*", { count: "exact" })
        .eq("organization_id", TOOKITAKI_ORG)
        .limit(1);

      if (error) {
        // Try without org filter
        const { data: d2, error: e2 } = await sb.from(t as any).select("*").limit(1);
        if (e2) {
          console.log(`❌ ${t}: ${e2.message.slice(0, 80)}`);
        } else {
          console.log(`✅ ${t} (no org_id col): cols=${d2 && d2.length > 0 ? Object.keys(d2[0]).join(", ").slice(0,100) : "empty"}`);
        }
      } else {
        console.log(`✅ ${t}: count=${count}, cols=${data && data.length > 0 ? Object.keys(data[0]).join(", ").slice(0,100) : "empty"}`);
      }
    } catch (e: any) {
      console.log(`💥 ${t}: ${e.message}`);
    }
  }
}
main().catch(console.error);
