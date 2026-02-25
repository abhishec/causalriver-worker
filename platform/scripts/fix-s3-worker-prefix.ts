/* eslint-disable no-console */
/**
 * Fix S3 connector prefix to be per AI Worker (not per org)
 * Usage: npx tsx scripts/fix-s3-worker-prefix.ts
 */
import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import { resolve } from "path";

dotenv.config({ path: resolve(__dirname, "../.env.local") });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

const sb = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const WORKSPACES = [
  { id: "9f338d96-fb02-45b2-b6bf-38269c32ddc8", label: "5.11.5" },
  { id: "aa286f56-34f7-467f-9685-6f4ed12bf17e", label: "6.3.4" },
];

async function main() {
  for (const ws of WORKSPACES) {
    console.log(`\nWorkspace ${ws.label} (${ws.id})`);

    // Get AI worker ID
    const { data: org } = await sb
      .from("organizations")
      .select("settings")
      .eq("id", ws.id)
      .single();

    const workers: any[] = org?.settings?.ai_workers || [];
    const worker = workers.find((w: any) => w.service === "seaas");

    if (!worker) {
      console.log("  No AI Worker found — skipping");
      continue;
    }

    console.log(`  AI Worker: ${worker.name} (${worker.id})`);

    // Update S3 connector prefix to be worker-scoped
    const { data: s3 } = await sb
      .from("org_connectors")
      .select("id, config")
      .eq("organization_id", ws.id)
      .eq("connector_type", "s3-storage")
      .maybeSingle();

    if (!s3) {
      console.log("  No S3 connector found — skipping");
      continue;
    }

    const oldPrefix = s3.config?.prefix || ws.id;
    const newPrefix = `${ws.id}/${worker.id}`;

    console.log(`  Old prefix: ${oldPrefix}`);
    console.log(`  New prefix: ${newPrefix}`);

    const { error } = await sb
      .from("org_connectors")
      .update({
        config: {
          ...s3.config,
          prefix: newPrefix,
          worker_id: worker.id,
          worker_name: worker.name,
          purpose: `AI Worker storage for ${worker.name} — isolated per worker`,
        },
      })
      .eq("id", s3.id);

    if (error) {
      console.error(`  [error]`, error.message);
    } else {
      console.log(`  [updated] S3 prefix now scoped to AI Worker`);
    }
  }

  // Verify
  console.log("\n=== VERIFICATION ===");
  for (const ws of WORKSPACES) {
    const { data } = await sb
      .from("org_connectors")
      .select("config")
      .eq("organization_id", ws.id)
      .eq("connector_type", "s3-storage")
      .maybeSingle();
    console.log(`  ${ws.label}: prefix=${data?.config?.prefix}  worker=${data?.config?.worker_id}`);
  }
  console.log("\nDone — S3 storage is now per AI Worker.");
}

main().catch(console.error);
