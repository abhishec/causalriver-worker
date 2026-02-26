/* eslint-disable no-console */
/**
 * Seed connector_signals with PR velocity data for Tookitaki demo.
 * Fixes podMatchDomain producing "999h cycle time, 0.2 confidence" without OAuth.
 *
 * Usage: cd platform && npx tsx scripts/seed-connector-signals-tookitaki.ts
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

// Exactly matches team_name values seeded in teams table
const TEAMS = [
  {
    name: "Rule Engine",
    avgCycleHours: 27,          // fast team → speedScore ≈ 86
    jitter: 8,                   // ±8h variance
    weeklyPrs: 2,                // 2/week → 24 over 90d → truncate to 14 for seed
    titles: [
      "feat: add TypeScript rule engine for high-risk AML transactions",
      "fix: resolve Python typology matching false positive rate",
      "feat: Kafka consumer for real-time transaction scoring pipeline",
      "feat: add rule backtesting module with PostgreSQL snapshot store",
      "fix: alert tuning threshold for SAR suspicious activity",
      "feat: TypeScript SDK for rule authoring DSL",
      "perf: optimize AML rule evaluation with Redis caching",
      "feat: add Python ML model integration for behavioral scoring",
      "fix: Kubernetes deployment config for rule engine pods",
      "feat: add TypeScript unit tests for rule condition parser",
      "feat: Kafka dead letter queue for failed rule evaluations",
      "fix: PostgreSQL index on transaction_id for rule lookups",
      "feat: add Python anomaly detection for velocity-based rules",
      "feat: AML typology coverage report generator in TypeScript",
    ],
  },
  {
    name: "AML Core Engine",
    avgCycleHours: 36,          // mid-range → speedScore ≈ 67
    jitter: 12,
    weeklyPrs: 1.5,
    titles: [
      "feat: AML detection engine TypeScript rewrite for Fincense 6.x",
      "fix: Python transaction enrichment pipeline memory leak",
      "feat: Kafka stream processor for cross-border AML signals",
      "feat: add PostgreSQL partitioning for transaction history",
      "fix: false negative rate in structuring detection algorithm",
      "feat: TypeScript API for AML alert management workflow",
      "feat: add Kubernetes HPA for detection pod autoscaling",
      "fix: Python ML feature engineering for PEP screening",
      "feat: real-time AML score streaming via Kafka",
      "feat: add TypeScript integration tests for detection pipeline",
      "fix: PostgreSQL query optimizer for bulk transaction loads",
    ],
  },
  {
    name: "Data Infrastructure",
    avgCycleHours: 48,          // slower → speedScore ≈ 50
    jitter: 16,
    weeklyPrs: 1,
    titles: [
      "feat: Kafka topic schema migration for AML event stream v2",
      "feat: Python data ingestion pipeline for SWIFT message parsing",
      "fix: PostgreSQL replication lag for transaction mirror tables",
      "feat: add TypeScript ETL orchestrator with retry logic",
      "feat: Kubernetes persistent volume setup for data lake pods",
      "feat: Python Spark job for historical AML data enrichment",
      "fix: Kafka consumer group rebalancing on pod restart",
      "feat: add PostgreSQL CDC connector for transaction events",
      "feat: TypeScript data quality checks for ingestion pipeline",
    ],
  },
];

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

function randomCycleTime(avg: number, jitter: number): number {
  return Math.max(4, avg + (Math.random() * jitter * 2 - jitter));
}

async function seedSignalsForOrg(orgId: string, orgName: string) {
  console.log(`\n── Seeding connector_signals for ${orgName} ──`);

  // Delete existing signals for clean re-seed
  const { error: delErr } = await sb
    .from("connector_signals")
    .delete()
    .eq("organization_id", orgId)
    .eq("signal_type", "pr_merged");
  if (delErr) console.warn("  Delete existing signals:", delErr.message);

  const rows: Array<{
    organization_id: string;
    source: string;
    signal_type: string;
    signal_value: number;
    signal_timestamp: string;
    metadata: Record<string, unknown>;
  }> = [];

  for (const team of TEAMS) {
    const titleCount = team.titles.length;
    for (let i = 0; i < titleCount; i++) {
      // Spread evenly over last 85 days (keep within 90-day window)
      const daysBack = Math.round((i / titleCount) * 85) + 1;
      rows.push({
        organization_id: orgId,
        source: "github",
        signal_type: "pr_merged",
        signal_value: Math.round(randomCycleTime(team.avgCycleHours, team.jitter) * 10) / 10,
        signal_timestamp: daysAgo(daysBack),
        metadata: {
          team_label: team.name,
          title: team.titles[i],
          author: `engineer-${orgName.replace(/\./g, "")}-${i % 4 + 1}`,
          repo: "fincense-aml-platform",
          pr_number: 1000 + i + TEAMS.indexOf(team) * 100,
        },
      });
    }
    console.log(`  ${team.name}: ${titleCount} PRs queued (avg ${team.avgCycleHours}h cycle)`);
  }

  const { error } = await sb.from("connector_signals").insert(rows);
  if (error) {
    console.error(`  ❌ Insert failed: ${error.message}`);
  } else {
    console.log(`  ✅ Inserted ${rows.length} PR signals`);
  }
}

async function fixPodMatchNullOutcomes() {
  console.log("\n── Fixing null outcome_health_score in pod_match_history ──");

  // Update all null outcome_health_score where was_accepted is false or null
  // Rule Engine with high confidence should have good outcomes
  for (const org of AI_WORKER_SPACES) {
    const { data: nullRows } = await sb
      .from("pod_match_history")
      .select("id, recommended_pod_name, confidence")
      .eq("organization_id", org.id)
      .is("outcome_health_score", null);

    if (!nullRows?.length) {
      console.log(`  ${org.name}: no null rows`);
      continue;
    }

    for (const row of nullRows) {
      const score = row.confidence >= 0.9 ? 85 : row.confidence >= 0.7 ? 78 : 72;
      const { error } = await sb
        .from("pod_match_history")
        .update({ outcome_health_score: score, was_accepted: true })
        .eq("id", row.id);
      if (error) {
        console.error(`  ❌ ${org.name} ${row.recommended_pod_name}: ${error.message}`);
      } else {
        console.log(`  ✅ ${org.name} ${row.recommended_pod_name}: outcome_health_score → ${score}`);
      }
    }
  }
}

async function verifyScoring() {
  console.log("\n── Verifying expected scoring after seed ──");
  const orgId = "9f338d96-fb02-45b2-b6bf-38269c32ddc8";
  const cutoff = daysAgo(90);

  const { data: signals } = await sb
    .from("connector_signals")
    .select("signal_value, metadata")
    .eq("organization_id", orgId)
    .eq("signal_type", "pr_merged")
    .gte("signal_timestamp", cutoff);

  const podPRs: Record<string, number[]> = {};
  for (const s of signals ?? []) {
    const label = (s.metadata as any)?.team_label as string;
    if (!label) continue;
    if (!podPRs[label]) podPRs[label] = [];
    podPRs[label].push(Number(s.signal_value));
  }

  for (const [pod, times] of Object.entries(podPRs)) {
    const avg = times.reduce((a, b) => a + b, 0) / times.length;
    const speed = Math.max(0, Math.min(100, 100 * (1 - (avg - 24) / 72)));
    const weekly = Math.round(times.length / 13);
    const throughput = Math.min(100, weekly * 10);
    const confidence = times.length > 5 ? 0.85 : 0.5 + (times.length / 5) * 0.35;
    console.log(
      `  ${pod}: ${times.length} PRs | avg ${avg.toFixed(1)}h | ` +
      `speed=${speed.toFixed(0)} throughput=${throughput} confidence=${confidence.toFixed(2)}`
    );
  }
}

async function main() {
  console.log("🚀 Seeding connector_signals for Tookitaki demo");
  console.log("=".repeat(55));

  for (const org of AI_WORKER_SPACES) {
    await seedSignalsForOrg(org.id, org.name);
  }

  await fixPodMatchNullOutcomes();
  await verifyScoring();

  console.log("\n✅ Done — podMatchDomain will now show realistic velocity scores");
}

main().catch(console.error);
