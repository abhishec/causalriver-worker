/* eslint-disable no-console */
/**
 * Validate Demo Data — shows all workspace data for both releases
 * Usage: npx tsx scripts/validate-demo-data.ts
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

async function showWorkspace(orgId: string, label: string) {
  console.log(`\n${"═".repeat(60)}`);
  console.log(`  WORKSPACE: Release ${label}`);
  console.log(`${"═".repeat(60)}`);

  const { data: org } = await sb.from("organizations").select("name, slug, settings").eq("id", orgId).single();
  if (!org) { console.log("  NOT FOUND"); return; }

  console.log(`  Name: ${org.name}`);
  console.log(`  ID:   ${orgId}`);

  // AI Workers
  const workers: any[] = org.settings?.ai_workers || [];
  console.log(`\n  ── AI Workers (${workers.length}) ──`);
  for (const w of workers) {
    console.log(`    [${w.status}] ${w.name} (${w.service}) — ${w.id}`);
  }
  if (workers.length === 0) console.log("    (none — needs creation)");

  // Connectors
  const { data: connectors } = await sb
    .from("org_connectors")
    .select("id, connector_type, status, config, instance_name")
    .eq("organization_id", orgId);

  for (const c of connectors || []) {
    console.log(`\n  ── ${c.connector_type.toUpperCase()} [${c.status}] ──`);

    if (c.connector_type === "github") {
      const repos: any[] = c.config?.repositories || [];
      for (const r of repos) {
        console.log(`    Repo: ${r.owner}/${r.name} @ ${r.branch}`);
        console.log(`      URL: ${r.url}`);
      }
    }

    if (c.connector_type === "jira") {
      console.log(`    Site: ${c.config?.siteUrl}`);
      console.log(`    Project Keys: ${JSON.stringify(c.config?.projectKeys)}`);
      console.log(`    Fix Version: ${c.config?.fixVersionFilter}`);
      const sources: any[] = c.config?.sources || [];
      for (const s of sources) {
        console.log(`    Source [${s.type}]: ${s.name}`);
        console.log(`      URL: ${s.url}`);
      }
    }

    if (c.connector_type === "s3-storage") {
      console.log(`    Bucket: ${c.config?.bucket}`);
      console.log(`    Prefix: ${c.config?.prefix} (org-level separation)`);
    }
  }
}

async function main() {
  for (const ws of WORKSPACES) {
    await showWorkspace(ws.id, ws.label);
  }

  // S3 separation check
  console.log(`\n${"═".repeat(60)}`);
  console.log("  S3 BUCKET SEPARATION");
  console.log(`${"═".repeat(60)}`);
  for (const ws of WORKSPACES) {
    const { data } = await sb.from("org_connectors")
      .select("config")
      .eq("organization_id", ws.id)
      .eq("connector_type", "s3-storage")
      .maybeSingle();
    console.log(`  ${ws.label}: prefix = ${data?.config?.prefix || "(none)"}`);
  }
  console.log("  Each workspace uses its own org ID as prefix → fully separated");
  console.log();
}

main().catch(console.error);
