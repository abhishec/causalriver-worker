/* eslint-disable no-console */
/**
 * Seed SE-aaS Artifacts for Tookitaki Demo Workspaces
 *
 * Populates se_aas_artifacts with realistic usage history so the
 * artifact gallery and digest domain-heatmap look healthy during demo.
 *
 * Usage: npx tsx scripts/seed-se-aas-artifacts.ts
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
  { id: "9f338d96-fb02-45b2-b6bf-38269c32ddc8", name: "Fincense 5.11.5" },
  { id: "aa286f56-34f7-467f-9685-6f4ed12bf17e", name: "Fincense 6.3.4" },
];

// Spread artifacts over the last 14 days
function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

function meta(durationMs = 1200): Record<string, unknown> {
  return {
    durationMs,
    claudePowered: true,
    brainAugmented: true,
    brainCausalEdgesUsed: Math.floor(Math.random() * 8) + 2,
    brainPatternsUsed: Math.floor(Math.random() * 5) + 1,
  };
}

function artifactsForOrg(orgId: string, orgName: string) {
  return [
    // Delivery intelligence domains
    {
      organization_id: orgId,
      domain_type: "pod-match",
      artifact_data: {
        domain_type: "pod-match",
        engagement_name: `${orgName} — AML Detection Suite`,
        requested_stack: ["Python", "Apache Flink", "PostgreSQL"],
        top_recommendation: {
          podName: "AML Core Engine",
          compositeScore: 87,
          confidence: 0.87,
          avgCycleTimeHours: 27.3,
          weeklyPrCount: 14,
          techStackMatch: ["Python", "PostgreSQL"],
        },
        ranked_pods: [
          { podName: "AML Core Engine", compositeScore: 87, confidence: 0.87 },
          { podName: "Rule Engine", compositeScore: 72, confidence: 0.72 },
        ],
        summary: "AML Core Engine is the strongest match with 87% composite score and proven Python/PostgreSQL delivery.",
      },
      metadata: meta(1340),
      created_at: daysAgo(1),
    },
    {
      organization_id: orgId,
      domain_type: "early-warning",
      artifact_data: {
        domain_type: "early-warning",
        engagement_name: `${orgName} — AML Detection Suite`,
        velocityCollapse: false,
        velocityTrend: -12.4,
        bottleneckRisks: [
          { reviewerLogin: "ravi-tookitaki", reviewShare: 0.68, giniCoefficient: 0.71, severity: "high" },
        ],
        flightRiskEngineers: [
          { githubLogin: "ravi-tookitaki", flightRiskScore: 67, velocityIndex: 45 },
        ],
        summary: "Velocity declined 12.4% vs last sprint. Ravi Menon carrying 68% of reviews — bus factor risk.",
      },
      metadata: meta(980),
      created_at: daysAgo(3),
    },
    {
      organization_id: orgId,
      domain_type: "scope-creep",
      artifact_data: {
        domain_type: "scope-creep",
        engagement_name: `${orgName} — AML Detection Suite`,
        alerts: [
          {
            severity: "critical",
            delta_pct: 21.35,
            alert_message: "Scope grew 21.35% — AML ruleset expanded without capacity rebalance.",
          },
        ],
        acknowledged: 0,
        summary: "1 critical unacknowledged scope alert. Recommend capacity review before next sprint.",
      },
      metadata: meta(760),
      created_at: daysAgo(5),
    },
    {
      organization_id: orgId,
      domain_type: "delivery-intelligence",
      artifact_data: {
        domain_type: "delivery-intelligence",
        health_scores: [
          { engagement_name: "AML Detection Suite", health_score: 67, forecast_at_risk: true },
          { engagement_name: "SAR Automation Module", health_score: 82, forecast_at_risk: false },
        ],
        scope_alerts: 1,
        pod_matches: 3,
        at_risk_engineers: 2,
        summary: "2 active engagements. AML Detection Suite is at risk (score 67). SAR module is healthy (82).",
      },
      metadata: meta(1820),
      created_at: daysAgo(2),
    },
    // SE-aaS engineering domains — adds variety to the usage heatmap
    {
      organization_id: orgId,
      domain_type: "pr-review",
      artifact_data: {
        domain_type: "pr-review",
        pr_number: 247,
        title: "feat: add real-time AML rule evaluation engine",
        findings: [
          { severity: "medium", category: "performance", message: "Rule evaluation loop O(n²) — consider hash-based lookup" },
          { severity: "low", category: "style", message: "Missing docstrings on 3 public methods" },
        ],
        security_issues: 0,
        test_coverage_delta: "+4.2%",
        summary: "2 findings. No security issues. Recommend addressing performance loop before merge.",
      },
      metadata: meta(2100),
      created_at: daysAgo(4),
    },
    {
      organization_id: orgId,
      domain_type: "impact-analysis",
      artifact_data: {
        domain_type: "impact-analysis",
        change_summary: "Refactor AML entity resolution service",
        blast_radius: "medium",
        affected_services: ["entity-resolution", "alert-aggregator", "case-management"],
        risk_score: 0.42,
        summary: "Medium blast radius — 3 downstream services affected. Recommend staged rollout.",
      },
      metadata: meta(1450),
      created_at: daysAgo(7),
    },
    {
      organization_id: orgId,
      domain_type: "incident-diagnosis",
      artifact_data: {
        domain_type: "incident-diagnosis",
        severity: "high",
        title: "Alert aggregator latency spike — P99 > 5s",
        root_cause: "Missing index on alert_events.org_id + created_at composite",
        remediation: "CREATE INDEX CONCURRENTLY idx_alert_events_org_time ON alert_events(org_id, created_at DESC)",
        confidence: 0.91,
        summary: "Root cause identified: missing composite index. SQL remediation provided.",
      },
      metadata: meta(3200),
      created_at: daysAgo(9),
    },
    {
      organization_id: orgId,
      domain_type: "test-case-generator",
      artifact_data: {
        domain_type: "test-case-generator",
        target_function: "evaluateAMLRule",
        language: "python",
        test_count: 12,
        coverage: "comprehensive",
        edge_cases: ["empty transaction list", "null entity_id", "circular transaction graph"],
        summary: "12 test cases generated covering happy path + 3 edge cases.",
      },
      metadata: meta(890),
      created_at: daysAgo(11),
    },
    {
      organization_id: orgId,
      domain_type: "sql-analyzer",
      artifact_data: {
        domain_type: "sql-analyzer",
        issues: [
          { severity: "performance", message: "Missing index on transaction_events.account_id" },
          { severity: "correctness", message: "LIKE '%pattern%' prevents index scan — use full-text search" },
        ],
        score: 74,
        summary: "2 issues found. Performance improvement ~3x possible with index addition.",
      },
      metadata: meta(640),
      created_at: daysAgo(13),
    },
  ];
}

async function main() {
  let totalInserted = 0;

  for (const ws of WORKSPACES) {
    console.log(`\nSeeding artifacts for: ${ws.name} (${ws.id})`);

    // Check existing
    const { count: existing } = await supabase
      .from("se_aas_artifacts")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", ws.id);

    if ((existing ?? 0) > 0) {
      console.log(`  Already has ${existing} artifacts — skipping (delete to re-seed)`);
      continue;
    }

    const artifacts = artifactsForOrg(ws.id, ws.name);

    const { data, error } = await supabase
      .from("se_aas_artifacts")
      .insert(artifacts)
      .select("id, domain_type, created_at");

    if (error) {
      console.error(`  ERROR inserting artifacts:`, error.message);
      continue;
    }

    console.log(`  Inserted ${data?.length ?? 0} artifacts:`);
    for (const a of data ?? []) {
      console.log(`    - ${a.domain_type} @ ${new Date(a.created_at).toLocaleDateString()}`);
    }
    totalInserted += data?.length ?? 0;
  }

  console.log(`\nDone. Total inserted: ${totalInserted} artifacts across ${WORKSPACES.length} workspaces.`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
