/* eslint-disable no-console */
import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import { resolve } from "path";
dotenv.config({ path: resolve(__dirname, "../.env.local") });

// Use pg connection to run NOTIFY pgrst, 'reload schema'
// For Supabase, the pg_notify approach works via a stored procedure or raw SQL
const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.SUPABASE_SERVICE_ROLE_KEY as string,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

async function main() {
  // Try querying entity_links directly with RPC
  const { data, error } = await sb.rpc("pg_notify" as any, {
    channel: "pgrst",
    payload: "reload schema"
  });
  console.log("pg_notify result:", data, error?.message);

  // Wait 2 seconds for PostgREST to reload
  await new Promise(r => setTimeout(r, 2000));

  // Now try again
  const { data: d2, error: e2 } = await sb.from("entity_links" as any).select("id").limit(1);
  console.log("entity_links after reload:", d2, e2?.message);
}
main().catch(console.error);
