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
  const { data, error } = await sb.from("engagements").select("*").limit(3);
  if (error) {
    console.log("engagements error:", error.message);
  } else {
    console.log("engagements columns:", data && data.length > 0 ? Object.keys(data[0]) : "empty table — no sample available");
  }
  // Check engineer_health_snapshots
  const { data: d2, error: e2 } = await sb.from("engineer_health_snapshots").select("*").limit(1);
  console.log("engineer_health_snapshots cols:", d2 && d2.length > 0 ? Object.keys(d2[0]) : e2?.message ?? "empty");
}
main().catch(console.error);
