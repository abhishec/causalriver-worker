/* eslint-disable no-console */
/**
 * Seed AI Workers for Tookitaki Demo Workspaces
 * Usage: npx tsx scripts/seed-ai-workers.ts
 */
import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import { resolve } from "path";

dotenv.config({ path: resolve(__dirname, "../.env.local") });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const WORKSPACES = [
  { id: "9f338d96-fb02-45b2-b6bf-38269c32ddc8", name: "Fincense 5.11.5", version: "5.11.5" },
  { id: "aa286f56-34f7-467f-9685-6f4ed12bf17e", name: "Fincense 6.3.4", version: "6.3.4" },
];

async function main() {
  for (const ws of WORKSPACES) {
    console.log(`\nWorkspace: ${ws.name} (${ws.id})`);

    const { data: org } = await supabase
      .from("organizations")
      .select("settings")
      .eq("id", ws.id)
      .single();

    if (!org) {
      console.error("  Not found!");
      continue;
    }

    const settings = (org.settings as Record<string, unknown>) ?? {};
    const workers: unknown[] = Array.isArray(settings.ai_workers)
      ? (settings.ai_workers as unknown[])
      : [];

    console.log(
      `  Existing workers: ${workers.length} — ${workers.map((w: any) => w.service).join(", ") || "none"}`
    );

    // Check if seaas worker already exists
    const existing = workers.find((w: any) => w.service === "seaas");
    if (existing) {
      console.log(`  [exists] SE-aaS worker: ${(existing as any).name} (${(existing as any).id})`);
      continue;
    }

    // Create SE-aaS worker
    const worker = {
      id: `aw_seaas_${Date.now()}`,
      service: "seaas",
      name: `Fincense ${ws.version} Engineering AI`,
      description: `AI Worker for Tookitaki Fincense ${ws.version} — tracks GitHub repos, Jira boards, code quality, and release progress.`,
      status: "active",
      created_at: new Date().toISOString(),
      created_by: "seed-script",
    };

    workers.push(worker);

    const { error } = await supabase
      .from("organizations")
      .update({ settings: { ...settings, ai_workers: workers } })
      .eq("id", ws.id);

    if (error) {
      console.error(`  [error] Failed to create worker:`, error.message);
    } else {
      console.log(`  [created] SE-aaS worker: ${worker.name} (${worker.id})`);
    }

    // Ensure brain_cortex_state exists
    try {
      await supabase.from("brain_cortex_state").upsert(
        { organization_id: ws.id, cycle_count: 0, last_mode: "awake_full" },
        { onConflict: "organization_id" }
      );
      console.log("  [ok] brain_cortex_state ready");
    } catch {
      console.log("  [skip] brain_cortex_state table may not exist");
    }
  }

  console.log("\nDone! AI Workers seeded.");
}

main().catch(console.error);
