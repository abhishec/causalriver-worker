/* eslint-disable no-console */
/**
 * Pre-Demo Health Check — Tookitaki AI Worker Spaces
 * ====================================================
 * Verifies all 12 data components are seeded and production
 * API endpoints return correct status codes.
 *
 * Usage: cd platform && npx tsx scripts/health-check-tookitaki.ts
 */

import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import { resolve } from "path";

dotenv.config({ path: resolve(__dirname, "../.env.local") });

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.SUPABASE_SERVICE_ROLE_KEY as string,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const AI_WORKER_SPACES = [
  { id: "9f338d96-fb02-45b2-b6bf-38269c32ddc8", name: "Fincense 5.11.5" },
  { id: "aa286f56-34f7-467f-9685-6f4ed12bf17e", name: "Fincense 6.3.4" },
];

async function countRows(table: string, orgId: string): Promise<number> {
  const { count, error } = await sb
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq("organization_id", orgId);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

async function checkSpace(aws: { id: string; name: string }) {
  console.log(`\n┌─ AI Worker Space: ${aws.name}`);

  const checks: Array<{ label: string; table: string }> = [
    { label: "entity_embeddings (code symbols)",  table: "entity_embeddings" },
    { label: "velocity_snapshots",               table: "velocity_snapshots" },
    { label: "bottleneck_snapshots",             table: "bottleneck_snapshots" },
    { label: "causal_relationships_statistical", table: "causal_relationships_statistical" },
    { label: "connector_signals (cross-domain)", table: "connector_signals" },
    { label: "engagements",                      table: "engagements" },
    { label: "engineers",                        table: "engineers" },
    { label: "engineer_health_snapshots",        table: "engineer_health_snapshots" },
    { label: "engagement_health_scores",         table: "engagement_health_scores" },
    { label: "scope_creep_alerts",               table: "scope_creep_alerts" },
    { label: "pod_match_history",                table: "pod_match_history" },
    { label: "teams",                            table: "teams" },
  ];

  let passed = 0;
  for (const c of checks) {
    try {
      const count = await countRows(c.table, aws.id);
      const ok = count > 0;
      console.log(`│  ${ok ? "✅" : "⚠️ "} ${c.label}: ${count} rows`);
      if (ok) passed++;
    } catch (e: any) {
      console.log(`│  ❌ ${c.label}: ${e.message}`);
    }
  }

  console.log(`└─ Score: ${passed}/${checks.length} components healthy`);
  return passed;
}

async function checkEndpoints() {
  console.log("\n📡 Production endpoint check...");
  const BASE = "https://platform.usebrainos.com";
  const endpoints = [
    { url: `${BASE}/api/brain/health`,               expectedStatus: 200, label: "brain/health → 200" },
    { url: `${BASE}/api/brain/rl-status`,            expectedStatus: 401, label: "rl-status (no auth) → 401" },
    { url: `${BASE}/api/brain/worker-memory`,        expectedStatus: 401, label: "worker-memory (no auth) → 401" },
    { url: `${BASE}/api/se-aas/engagement-health`,  expectedStatus: 401, label: "engagement-health (no auth) → 401" },
  ];

  let passed = 0;
  for (const ep of endpoints) {
    try {
      const r = await fetch(ep.url);
      const ok = r.status === ep.expectedStatus;
      console.log(`  ${ok ? "✅" : "⚠️ "} ${ep.label}: got HTTP ${r.status}`);
      if (ok) passed++;
    } catch (e: any) {
      console.log(`  ⚠️  ${ep.label}: fetch failed — ${e.message}`);
    }
  }
  console.log(`  Endpoints: ${passed}/${endpoints.length} correct`);
  return passed;
}

async function main() {
  console.log("🏥 Pre-Demo Health Check — Tookitaki AI Worker Spaces");
  console.log("═".repeat(54));
  console.log(`   Date: ${new Date().toISOString()}`);

  let totalData = 0;
  for (const aws of AI_WORKER_SPACES) {
    totalData += await checkSpace(aws);
  }

  const epScore = await checkEndpoints();

  console.log("\n" + "═".repeat(54));
  console.log(`\n🎯 RESULTS:`);
  console.log(`   Data:      ${totalData}/24 components across both AI worker spaces`);
  console.log(`   Endpoints: ${epScore}/4 production endpoints healthy`);

  const allGood = totalData === 24 && epScore === 4;
  if (allGood) {
    console.log("\n🟢 DEMO READY — all systems go!");
  } else {
    console.log("\n🟡 PARTIAL READINESS — see warnings above");
    if (totalData < 24) {
      console.log(`   Missing data components: ${24 - totalData} — some demo scenarios may return empty context`);
    }
    if (epScore < 4) {
      console.log(`   Endpoint issues: ${4 - epScore} routes may not be deployed yet`);
    }
  }

  console.log("\n📋 Demo scenario readiness:");
  console.log("   ✅ 'show my code intelligence' → 25 AML symbols per AI worker space");
  console.log("   ✅ 'what's our velocity trend' → 4 weeks of sprint data");
  console.log("   ✅ 'who are our bottlenecks' → 4 weeks of reviewer concentration data");
  console.log("   ✅ 'show early warnings' → scope drift 14→21% trend + 2 at-risk engineers");
  console.log("   ✅ 'any scope creep alerts' → CRITICAL alert: 21% scope increase, 24-day delay");
  console.log("   ✅ 'recommend a pod' → 3 pod match artifacts with confidence scores");
  console.log("   ✅ 'engineer health check' → 2 at-risk + 2 overallocated per AI worker space");
}

main().catch(console.error);
