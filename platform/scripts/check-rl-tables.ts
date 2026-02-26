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
  // Check RL-specific tables referenced in rl-status route
  const tables = [
    "copilot_response_feedback",
    "brain_feedback_queue",
    "cross_domain_signals",
  ];

  for (const t of tables) {
    const { data, error } = await sb.from(t as any).select("*").limit(1);
    if (error) {
      console.log(`❌ ${t}: ${error.message}`);
    } else {
      console.log(`✅ ${t}: exists, sample cols=${data && data.length > 0 ? Object.keys(data[0]).slice(0,5).join(",") : "empty"}`);
    }
  }
}
main().catch(console.error);
