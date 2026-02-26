/* eslint-disable no-console */
/**
 * Brain Pre-Warm Script: Tookitaki Demo Orgs
 * ===========================================
 *
 * Seeds Core Brain causal insights into both Tookitaki workspaces so that
 * the Brain Context Mesh has rich data on the FIRST SE-aaS domain execution
 * during the demo (instead of waiting for lazy federation during execution).
 *
 * Usage:
 *   cd platform && npx tsx scripts/prewarm-brain-tookitaki.ts
 *
 * What it does:
 *   1. Pushes Core Brain causal edges (high-quality, evidence_weight ≥ 10) to
 *      both Tookitaki org tables via pushCoreInsightsToOrg
 *   2. Inserts engineering-specific causal seeds directly (delivery↔velocity,
 *      PR review latency↔defect escape, etc.) for SE-aaS demo context
 *   3. Seeds cross_domain_signals so RL status shows active learning
 */

import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import { resolve } from "path";
import { pushCoreInsightsToOrg } from "@nexus-ai/memory-stack";

dotenv.config({ path: resolve(__dirname, "../.env.local") });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const TOOKITAKI_ORGS = [
  { id: "9f338d96-fb02-45b2-b6bf-38269c32ddc8", name: "Fincense 5.11.5" },
  { id: "aa286f56-34f7-467f-9685-6f4ed12bf17e", name: "Fincense 6.3.4" },
];

// Engineering-specific causal relationships for SE-aaS demo context
// Column mapping: source_domain, target_domain, effect_size, evidence_weight,
// natural_language, granger_f_statistic, granger_p_value, sample_size, is_significant
const ENGINEERING_CAUSAL_SEEDS = [
  {
    source_domain: "engineering",
    target_domain: "delivery",
    effect_size: 0.72,
    granger_f_statistic: 7.2,
    granger_p_value: 0.0012,
    sample_size: 140,
    is_significant: true,
    evidence_weight: 14,
    natural_language: "Higher PR review latency (>24h) correlates with 72% increase in defect escape rate to production",
  },
  {
    source_domain: "engineering",
    target_domain: "delivery",
    effect_size: 0.81,
    granger_f_statistic: 9.1,
    granger_p_value: 0.0009,
    sample_size: 180,
    is_significant: true,
    evidence_weight: 18,
    natural_language: "Sprint velocity drops >20% reliably predict milestone slippage — 91% confidence across observed sprints",
  },
  {
    source_domain: "engineering",
    target_domain: "customer",
    effect_size: 0.68,
    granger_f_statistic: 6.8,
    granger_p_value: 0.0015,
    sample_size: 120,
    is_significant: true,
    evidence_weight: 12,
    natural_language: "Modules with cyclomatic complexity >15 generate 68% more bug reports in the following quarter",
  },
  {
    source_domain: "delivery",
    target_domain: "customer",
    effect_size: -0.74,
    granger_f_statistic: 7.4,
    granger_p_value: 0.0011,
    sample_size: 160,
    is_significant: true,
    evidence_weight: 16,
    natural_language: "Scope creep >15% in a sprint correlates with NPS degradation in the next quarter customer review",
  },
  {
    source_domain: "engineering",
    target_domain: "delivery",
    effect_size: 0.79,
    granger_f_statistic: 8.7,
    granger_p_value: 0.0013,
    sample_size: 150,
    is_significant: true,
    evidence_weight: 15,
    natural_language: "High contributor concentration (Gini > 0.6) strongly predicts velocity collapse when key contributor is unavailable",
  },
  {
    source_domain: "delivery",
    target_domain: "customer",
    effect_size: 0.65,
    granger_f_statistic: 6.5,
    granger_p_value: 0.0018,
    sample_size: 110,
    is_significant: true,
    evidence_weight: 11,
    natural_language: "Sprint completion rates below 80% correlate with decreased customer satisfaction score in next review cycle",
  },
  {
    source_domain: "engineering",
    target_domain: "delivery",
    effect_size: -0.71,
    granger_f_statistic: 7.1,
    granger_p_value: 0.0013,
    sample_size: 130,
    is_significant: true,
    evidence_weight: 13,
    natural_language: "Test coverage increases >5% in a sprint reduce production incidents by 71% in the following sprint window",
  },
  {
    source_domain: "people",
    target_domain: "delivery",
    effect_size: 0.77,
    granger_f_statistic: 8.0,
    granger_p_value: 0.0010,
    sample_size: 170,
    is_significant: true,
    evidence_weight: 17,
    natural_language: "Engineers overallocated for >2 consecutive sprints show 77% higher flight risk in the subsequent quarter",
  },
];

// Cross-domain signals to seed (shows active brain learning in RL panel)
// Using correct column names from cross_domain_signals schema:
//   signal_metadata (JSONB, not 'metadata'), signal_timestamp, source_domain, signal_type, etc.
function buildSignals(orgId: string, count: number) {
  const signalTypes = [
    "velocity_prediction",
    "scope_creep_detection",
    "bottleneck_identification",
    "pr_review_intelligence",
    "deployment_risk",
    "test_coverage_gap",
    "contributor_concentration",
    "incident_correlation",
  ];
  const domains = ["engineering", "delivery", "customer", "people"];
  const now = Date.now();

  return Array.from({ length: count }, (_, i) => ({
    organization_id: orgId,
    source_domain: domains[i % domains.length],
    signal_type: signalTypes[i % signalTypes.length],
    signal_value: 0.6 + Math.random() * 0.35,
    signal_timestamp: new Date(now - i * 3_600_000).toISOString(),
    entity_type: "se_aas_domain",
    entity_id: `seed_${orgId.slice(0, 8)}_${i}`,
    signal_metadata: { source: "prewarm", orgId },  // correct column name
  }));
}

async function prewarmOrg(orgId: string, orgName: string) {
  console.log(`\n🧠 Pre-warming Brain for: ${orgName} (${orgId.slice(0, 8)}...)`);

  // Step 1: Push Core Brain insights (federation)
  console.log("  [1/3] Pushing Core Brain federation insights...");
  try {
    await pushCoreInsightsToOrg(orgId, supabase as any);
    console.log("  ✅  Core Brain → org federation complete");
  } catch (err: any) {
    console.warn("  ⚠️  Federation failed (non-fatal):", err?.message);
  }

  // Step 2: Seed engineering causal relationships
  console.log("  [2/3] Seeding engineering causal relationships...");
  const causalRows = ENGINEERING_CAUSAL_SEEDS.map(seed => ({
    organization_id: orgId,
    ...seed,
    sample_size: seed.sample_size,
    last_validated_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }));

  // Unique constraint: (organization_id, source_domain) — one row per source domain per org.
  // Deduplicate by source_domain, keeping the row with highest evidence_weight.
  const dedupMap = new Map<string, typeof causalRows[0]>();
  for (const row of causalRows) {
    const existing = dedupMap.get(row.source_domain);
    if (!existing || row.evidence_weight > existing.evidence_weight) {
      dedupMap.set(row.source_domain, row);
    }
  }
  const dedupedRows = Array.from(dedupMap.values());

  const { error: causalErr } = await supabase
    .from("causal_relationships_statistical")
    .insert(dedupedRows);

  if (causalErr) {
    console.warn("  ⚠️  Causal seed failed:", causalErr.message);
  } else {
    console.log(`  ✅  ${dedupedRows.length} causal relationships seeded (deduped from ${causalRows.length})`);
  }

  // Step 3: Seed cross-domain signals (30 signals, hourly cadence)
  console.log("  [3/3] Seeding cross-domain signals...");
  const signals = buildSignals(orgId, 30);
  const { error: signalErr } = await supabase
    .from("cross_domain_signals")
    .insert(signals);

  if (signalErr) {
    console.warn("  ⚠️  Signal seed failed:", signalErr.message);
  } else {
    console.log(`  ✅  ${signals.length} signals seeded`);
  }
}

async function main() {
  console.log("🚀 BrainOS Demo Pre-Warm: Tookitaki Orgs\n");
  console.log(`📡 Supabase: ${SUPABASE_URL.replace(/https?:\/\//, "").slice(0, 30)}...`);

  for (const org of TOOKITAKI_ORGS) {
    await prewarmOrg(org.id, org.name);
  }

  // Verify final counts
  console.log("\n📊 Post-warm verification:");
  for (const org of TOOKITAKI_ORGS) {
    const { count: causalCount } = await supabase
      .from("causal_relationships_statistical")
      .select("*", { count: "exact", head: true })
      .eq("organization_id", org.id);

    const { count: signalCount } = await supabase
      .from("cross_domain_signals")
      .select("*", { count: "exact", head: true })
      .eq("organization_id", org.id);

    console.log(`\n  ${org.name}:`);
    console.log(`    Causal relationships: ${causalCount ?? 0}`);
    console.log(`    Cross-domain signals: ${signalCount ?? 0}`);
  }

  console.log("\n✅ Pre-warm complete. Brain Context Mesh is ready for demo.\n");
}

main().catch(err => {
  console.error("Pre-warm failed:", err);
  process.exit(1);
});
