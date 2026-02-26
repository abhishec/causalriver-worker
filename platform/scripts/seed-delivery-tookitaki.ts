/* eslint-disable no-console */
/**
 * Delivery Intelligence Seed: Tookitaki Orgs
 * ============================================
 *
 * Seeds realistic SE-aaS delivery context for both Tookitaki AI Worker spaces
 * so the Brain Context Mesh has rich delivery data during the demo.
 *
 * Simulates what real Jira/GitHub sync would produce.
 *
 * Populates:
 *   1. teams                   — Fincense product engineering pods
 *   2. engineers               — Engineers mapped to pods
 *   3. engagements             — Active Fincense client engagements
 *   4. engineer_health_snapshots — Weekly health metrics (at-risk signals)
 *   5. engagement_health_scores  — Delivery health per engagement
 *   6. scope_creep_alerts        — Active scope drift warnings
 *   7. pod_match_history         — Pod recommendation artifacts
 *
 * Usage:
 *   cd platform && npx tsx scripts/seed-delivery-tookitaki.ts
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

// ─── Tookitaki AI Worker Spaces ──────────────────────────────────────────────
const ORGS = [
  { id: "9f338d96-fb02-45b2-b6bf-38269c32ddc8", name: "Fincense 5.11.5" },
  { id: "aa286f56-34f7-467f-9685-6f4ed12bf17e", name: "Fincense 6.3.4" },
];

// ─── Fixed UUIDs (deterministic, org-specific to avoid cross-org upsert clobber) ─
// NOTE: Teams use org-specific prefixes because upsert-on-id would overwrite
// the first org's rows when the second org runs. Each org must have distinct IDs.
const POD_IDS_511 = {
  aml_core:   "55555555-5555-5555-5555-555555555501",
  rule_engine:"55555555-5555-5555-5555-555555555502",
  data_infra: "55555555-5555-5555-5555-555555555503",
};
const POD_IDS_634 = {
  aml_core:   "11111111-1111-1111-1111-111111111101",
  rule_engine:"11111111-1111-1111-1111-111111111102",
  data_infra: "11111111-1111-1111-1111-111111111103",
};

const ENG_IDS = {
  ravi:    "22222222-2222-2222-2222-222222222201",
  priya:   "22222222-2222-2222-2222-222222222202",
  sanjay:  "22222222-2222-2222-2222-222222222203",
  ananya:  "22222222-2222-2222-2222-222222222204",
  krishna: "22222222-2222-2222-2222-222222222205",
  meera:   "22222222-2222-2222-2222-222222222206",
};

const ENG_IDS_634 = {
  arjun:   "33333333-3333-3333-3333-333333333301",
  deepika: "33333333-3333-3333-3333-333333333302",
  vikram:  "33333333-3333-3333-3333-333333333303",
  neha:    "33333333-3333-3333-3333-333333333304",
  suresh:  "33333333-3333-3333-3333-333333333305",
};

// Get current ISO week Monday
function weekMondayStr(weeksAgo = 0): string {
  const d = new Date();
  const day = d.getDay() || 7;
  d.setDate(d.getDate() - (day - 1) - weeksAgo * 7);
  return d.toISOString().split("T")[0];
}

async function seedOrg(org: { id: string; name: string }) {
  console.log(`\n═══════════════════════════════════════════`);
  console.log(`Seeding: ${org.name} (${org.id})`);
  console.log(`═══════════════════════════════════════════`);

  const is634 = org.name.includes("6.3");
  const POD_IDS = is634 ? POD_IDS_634 : POD_IDS_511;
  // Use specific ID objects directly to avoid TS union-type narrowing errors
  const engineers = is634
    ? [
        { id: ENG_IDS_634.arjun,   github_login: "arjun-tookitaki",   name: "Arjun Sharma",   team_id: POD_IDS.aml_core,    email: "arjun@fincense.io" },
        { id: ENG_IDS_634.deepika, github_login: "deepika-tookitaki", name: "Deepika Rao",    team_id: POD_IDS.rule_engine,  email: "deepika@fincense.io" },
        { id: ENG_IDS_634.vikram,  github_login: "vikram-tookitaki",  name: "Vikram Nair",    team_id: POD_IDS.aml_core,    email: "vikram@fincense.io" },
        { id: ENG_IDS_634.neha,    github_login: "neha-tookitaki",    name: "Neha Gupta",     team_id: POD_IDS.data_infra,   email: "neha@fincense.io" },
        { id: ENG_IDS_634.suresh,  github_login: "suresh-tookitaki",  name: "Suresh Kumar",   team_id: POD_IDS.rule_engine,  email: "suresh@fincense.io" },
      ]
    : [
        { id: ENG_IDS.ravi,    github_login: "ravi-tookitaki",    name: "Ravi Menon",     team_id: POD_IDS.aml_core,    email: "ravi@fincense.io" },
        { id: ENG_IDS.priya,   github_login: "priya-tookitaki",   name: "Priya Iyer",     team_id: POD_IDS.aml_core,    email: "priya@fincense.io" },
        { id: ENG_IDS.sanjay,  github_login: "sanjay-tookitaki",  name: "Sanjay Verma",   team_id: POD_IDS.rule_engine,  email: "sanjay@fincense.io" },
        { id: ENG_IDS.ananya,  github_login: "ananya-tookitaki",  name: "Ananya Singh",   team_id: POD_IDS.rule_engine,  email: "ananya@fincense.io" },
        { id: ENG_IDS.krishna, github_login: "krishna-tookitaki", name: "Krishna Pillai", team_id: POD_IDS.data_infra,   email: "krishna@fincense.io" },
        { id: ENG_IDS.meera,   github_login: "meera-tookitaki",   name: "Meera Nambiar",  team_id: POD_IDS.data_infra,   email: "meera@fincense.io" },
      ];

  // ── 1. Teams ──────────────────────────────────────────────────────────────
  console.log("  → Seeding teams...");
  const teams = [
    { id: POD_IDS.aml_core,    organization_id: org.id, team_name: "AML Core Engine",   metadata: { focus: "AML detection, typology matching, transaction monitoring" } },
    { id: POD_IDS.rule_engine, organization_id: org.id, team_name: "Rule Engine",        metadata: { focus: "Rule authoring, backtesting, alert tuning" } },
    { id: POD_IDS.data_infra,  organization_id: org.id, team_name: "Data Infrastructure",metadata: { focus: "Data pipelines, ingestion, enrichment" } },
  ];

  for (const team of teams) {
    const { error } = await sb.from("teams").upsert(team, { onConflict: "id" });
    if (error && !error.message.includes("duplicate")) {
      console.warn(`  ⚠️  team insert warning: ${error.message}`);
    }
  }
  console.log(`  ✅ Teams: ${teams.length}`);

  // ── 2. Engineers ──────────────────────────────────────────────────────────
  console.log("  → Seeding engineers...");
  for (const eng of engineers) {
    const { error } = await sb.from("engineers").upsert(
      { ...eng, organization_id: org.id },
      { onConflict: "id" }
    );
    if (error && !error.message.includes("duplicate")) {
      console.warn(`  ⚠️  engineer insert warning [${eng.github_login}]: ${error.message}`);
    }
  }
  console.log(`  ✅ Engineers: ${engineers.length}`);

  // ── 3. Engagements ────────────────────────────────────────────────────────
  console.log("  → Seeding engagements...");
  const engagementName = is634
    ? "Fincense 6.3.4 — FinCrime AI Platform"
    : "Fincense 5.11.5 — AML Detection Suite";

  const engagementId = is634
    ? "44444444-4444-4444-4444-444444444401"
    : "44444444-4444-4444-4444-444444444402";

  const engagement2Id = is634
    ? "44444444-4444-4444-4444-444444444403"
    : "44444444-4444-4444-4444-444444444404";

  const engagements = [
    {
      id: engagementId,
      organization_id: org.id,
      client_name: "Tookitaki",
      engagement_name: engagementName,
      jira_projects: ["FIN", "AML"],
      jira_labels: ["aml-core", "transaction-monitoring", "typology-matching"],
      github_repos: ["tookitaki/fincense-core", "tookitaki/aml-rule-engine"],
      slack_channels: ["#fincense-eng", "#aml-alerts", "#sprint-review"],
      pod_id: POD_IDS.aml_core,
      pod_name: "AML Core Engine",
      status: "active",
      start_date: "2025-10-01",
      target_end_date: "2026-06-30",
      tech_stack: ["TypeScript", "Python", "PostgreSQL", "Kafka", "Kubernetes"],
      metadata: {
        contract_value: "$2.4M",
        client_tier: "enterprise",
        region: "APAC",
        compliance_frameworks: ["MAS TRM", "FATF", "Basel III"],
      },
    },
    {
      id: engagement2Id,
      organization_id: org.id,
      client_name: "Tookitaki",
      engagement_name: is634 ? "TBML Detection Engine" : "SAR Automation Module",
      jira_projects: ["TBML", "SAR"],
      jira_labels: ["trade-finance", "compliance", "reporting"],
      github_repos: ["tookitaki/tbml-detector", "tookitaki/sar-generator"],
      slack_channels: ["#tbml-eng", "#compliance-automation"],
      pod_id: POD_IDS.rule_engine,
      pod_name: "Rule Engine",
      status: "active",
      start_date: "2025-11-15",
      target_end_date: "2026-04-30",
      tech_stack: ["TypeScript", "Python", "Redis", "Elasticsearch"],
      metadata: {
        contract_value: "$1.1M",
        client_tier: "enterprise",
        region: "APAC",
        compliance_frameworks: ["MAS TRM", "FATF"],
      },
    },
  ];

  for (const eng of engagements) {
    const { error } = await sb.from("engagements").upsert(eng, {
      onConflict: "organization_id,engagement_name",
    });
    if (error) {
      console.warn(`  ⚠️  engagement upsert warning: ${error.message}`);
    }
  }
  console.log(`  ✅ Engagements: ${engagements.length}`);

  // ── 4. Engineer Health Snapshots (this week + last 3 weeks) ───────────────
  console.log("  → Seeding engineer health snapshots...");
  let snapCount = 0;

  for (let w = 0; w <= 3; w++) {
    const weekStart = weekMondayStr(w);
    for (const eng of engineers) {
      // Simulate some engineers being at risk
      const isAtRisk = eng.github_login.includes("ravi") || eng.github_login.includes("arjun");
      const isOverloaded = eng.github_login.includes("sanjay") || eng.github_login.includes("deepika");

      const snap = {
        organization_id: org.id,
        // engineer_id omitted — nullable FK, populated later when GitHub OAuth connects
        github_login: eng.github_login,
        week_start: weekStart,
        review_burden: isOverloaded ? 78 + Math.round(Math.random() * 15) : 32 + Math.round(Math.random() * 20),
        velocity_index: isAtRisk ? 45 + Math.round(Math.random() * 15) : 72 + Math.round(Math.random() * 20),
        ticket_response_lag: isAtRisk ? 4.2 + Math.random() * 2 : 1.1 + Math.random() * 1.5,
        sentiment_index: isAtRisk ? 38 + Math.round(Math.random() * 15) : 65 + Math.round(Math.random() * 25),
        flight_risk_score: isAtRisk ? 62 + Math.round(Math.random() * 20) : 18 + Math.round(Math.random() * 25),
        overallocation_flag: isOverloaded,
      };

      const { error } = await sb.from("engineer_health_snapshots").upsert(snap, {
        onConflict: "organization_id,github_login,week_start",
      });
      if (error) {
        console.warn(`    ⚠️  eng snapshot warning [${eng.github_login} wk${w}]: ${error.message}`);
      } else {
        snapCount++;
      }
    }
  }
  console.log(`  ✅ Engineer health snapshots: ${snapCount}`);

  // ── 5. Engagement Health Scores ───────────────────────────────────────────
  console.log("  → Seeding engagement health scores...");
  let healthCount = 0;

  // Primary engagement — showing some scope drift
  const primaryScores = [
    {
      organization_id: org.id,
      engagement_id: engagementId,
      computed_at: new Date(Date.now() - 0 * 86400000).toISOString(), // today
      health_score: 67,
      delivery_velocity: 71,
      jira_resolution_rate: 78,            // percentage 0-100
      scope_drift: 78,                     // 100 - 22% = 78 (lower = more drift)
      team_concentration: 39,              // (1 - 0.61) * 100 = 39
      slack_sentiment: 58,
      pr_count: 48,
      ticket_count: 127,
      message_count: 672,
      story_points_baseline: 89,
      story_points_current: 108,
      story_point_delta_pct: 21.35,        // 22% scope increase — concerning
      forecast_days_remaining: 125,
      predicted_completion_date: "2026-07-24",  // overrun predicted
      forecast_confidence: 0.78,
      forecast_at_risk: true,
    },
    {
      organization_id: org.id,
      engagement_id: engagementId,
      computed_at: new Date(Date.now() - 7 * 86400000).toISOString(), // last week
      health_score: 74,
      delivery_velocity: 79,
      jira_resolution_rate: 83,
      scope_drift: 86,
      team_concentration: 42,
      slack_sentiment: 64,
      pr_count: 44,
      ticket_count: 119,
      message_count: 621,
      story_points_baseline: 85,
      story_points_current: 97,
      story_point_delta_pct: 14.12,
      forecast_days_remaining: 132,
      predicted_completion_date: "2026-07-15",
      forecast_confidence: 0.81,
      forecast_at_risk: true,
    },
    {
      organization_id: org.id,
      engagement_id: engagementId,
      computed_at: new Date(Date.now() - 14 * 86400000).toISOString(), // 2 weeks ago
      health_score: 81,
      delivery_velocity: 85,
      jira_resolution_rate: 88,
      scope_drift: 94,
      team_concentration: 48,
      slack_sentiment: 72,
      pr_count: 41,
      ticket_count: 108,
      message_count: 585,
      story_points_baseline: 82,
      story_points_current: 87,
      story_point_delta_pct: 6.10,
      forecast_days_remaining: 139,
      predicted_completion_date: "2026-07-02",
      forecast_confidence: 0.87,
      forecast_at_risk: false,
    },
  ];

  // Secondary engagement — healthier
  const secondaryScores = [
    {
      organization_id: org.id,
      engagement_id: engagement2Id,
      computed_at: new Date(Date.now() - 0 * 86400000).toISOString(),
      health_score: 82,
      delivery_velocity: 84,
      jira_resolution_rate: 91,
      scope_drift: 92,
      team_concentration: 52,
      slack_sentiment: 76,
      pr_count: 22,
      ticket_count: 58,
      message_count: 334,
      story_points_baseline: 45,
      story_points_current: 49,
      story_point_delta_pct: 8.89,
      forecast_days_remaining: 63,
      predicted_completion_date: "2026-04-28",
      forecast_confidence: 0.91,
      forecast_at_risk: false,
    },
  ];

  for (const score of [...primaryScores, ...secondaryScores]) {
    const { error } = await sb.from("engagement_health_scores").insert(score);
    if (error && !error.message.includes("duplicate")) {
      console.warn(`  ⚠️  health score insert warning: ${error.message}`);
    } else if (!error) {
      healthCount++;
    }
  }
  console.log(`  ✅ Engagement health scores: ${healthCount}`);

  // ── 6. Scope Creep Alerts ─────────────────────────────────────────────────
  console.log("  → Seeding scope creep alerts...");

  const alerts = [
    {
      organization_id: org.id,
      engagement_id: engagementId,
      severity: "critical",   // 22% scope creep — critical threshold
      delta_pct: 21.35,
      baseline_pts: 89,
      current_pts: 108,
      sprint_name: is634 ? "6.3.4-Sprint-18" : "5.11.5-Sprint-22",
      alert_message: `Scope increased 21% in current sprint (${is634 ? "6.3.4-Sprint-18" : "5.11.5-Sprint-22"}). 19 story points added post-sprint-start. Three new typology detection modules added without corresponding capacity adjustment. Predicted delivery delay: +24 days.`,
      acknowledged: false,
      acknowledged_at: null,
      acknowledged_by: null,
    },
    {
      organization_id: org.id,
      engagement_id: engagementId,
      severity: "warning",    // 14% scope drift — warning threshold
      delta_pct: 14.12,
      baseline_pts: 85,
      current_pts: 97,
      sprint_name: is634 ? "6.3.4-Sprint-17" : "5.11.5-Sprint-21",
      alert_message: `Scope drift trend: 14% increase in previous sprint. Reviewer concentration at 61% — single point of failure risk. Team velocity declining 3 weeks consecutive.`,
      acknowledged: true,
      acknowledged_at: new Date(Date.now() - 5 * 86400000).toISOString(),
      acknowledged_by: null,
    },
  ];

  let alertCount = 0;
  for (const alert of alerts) {
    const { error } = await sb.from("scope_creep_alerts").insert(alert);
    if (error && !error.message.includes("duplicate")) {
      console.warn(`  ⚠️  alert insert warning: ${error.message}`);
    } else if (!error) {
      alertCount++;
    }
  }
  console.log(`  ✅ Scope creep alerts: ${alertCount}`);

  // ── 7. Pod Match History ──────────────────────────────────────────────────
  console.log("  → Seeding pod match history...");

  const podMatches = [
    {
      organization_id: org.id,
      engagement_id: engagementId,
      recommended_pod_id: POD_IDS.aml_core,
      recommended_pod_name: "AML Core Engine",
      evidence: {
        rationale: "AML Core Engine has highest typology-matching expertise (8/10 engineers worked on TBML detection). 3 engineers available in Q1. Prior engagement with similar compliance scope (MAS TRM).",
        skill_match_score: 0.91,
        availability_score: 0.73,
        compliance_expertise: ["MAS TRM", "FATF", "Basel III"],
        risk_factors: ["Ravi Menon flight risk (score: 67) — succession plan needed", "Review concentration at 61% — single-point-of-failure risk"],
      },
      confidence: 0.87,
      rank: 1,
      was_accepted: true,
      outcome_health_score: 67,
    },
    {
      organization_id: org.id,
      engagement_id: engagementId,
      recommended_pod_id: POD_IDS.rule_engine,
      recommended_pod_name: "Rule Engine",
      evidence: {
        rationale: "Rule Engine pod has strong alert-tuning expertise. Slightly lower AML detection experience but available full-time.",
        skill_match_score: 0.78,
        availability_score: 0.91,
        compliance_expertise: ["MAS TRM", "FATF"],
        risk_factors: ["Less exposure to transaction monitoring at scale"],
      },
      confidence: 0.72,
      rank: 2,
      was_accepted: false,
      outcome_health_score: null,
    },
    {
      organization_id: org.id,
      engagement_id: engagement2Id,
      recommended_pod_id: POD_IDS.rule_engine,
      recommended_pod_name: "Rule Engine",
      evidence: {
        rationale: "Rule Engine pod is ideal for TBML/SAR automation. Strong rule authoring, backtesting, and alert tuning background. 2 engineers who worked on SAR generation are on this pod.",
        skill_match_score: 0.94,
        availability_score: 0.85,
        compliance_expertise: ["MAS TRM", "FATF"],
        risk_factors: [],
      },
      confidence: 0.93,
      rank: 1,
      was_accepted: true,
      outcome_health_score: 82,
    },
  ];

  let podCount = 0;
  for (const match of podMatches) {
    const { error } = await sb.from("pod_match_history").insert(match);
    if (error && !error.message.includes("duplicate")) {
      console.warn(`  ⚠️  pod match insert warning: ${error.message}`);
    } else if (!error) {
      podCount++;
    }
  }
  console.log(`  ✅ Pod match history: ${podCount}`);

  console.log(`\n  ✅ ${org.name} seeding complete!`);
}

async function main() {
  console.log("🚀 Seeding Delivery Intelligence for Tookitaki AI Worker spaces...");
  console.log(`   Date: ${new Date().toISOString()}`);

  // Quick connectivity check
  const { error: pingError } = await sb.from("engagements").select("id").limit(1);
  if (pingError && pingError.message.includes("supabaseUrl")) {
    console.error("❌ Supabase connection failed — check .env.local");
    process.exit(1);
  }

  for (const org of ORGS) {
    await seedOrg(org);
  }

  console.log("\n\n✅ All Tookitaki AI Worker spaces seeded with delivery intelligence!");
  console.log("\n📊 What was seeded per AI Worker space:");
  console.log("   • 3 pods (AML Core Engine, Rule Engine, Data Infrastructure)");
  console.log("   • 5-6 engineers with realistic GitHub/Jira mapping");
  console.log("   • 2 active client engagements");
  console.log("   • 4 weeks of engineer health snapshots (with flight risk + overallocation signals)");
  console.log("   • 4 engagement health scores (scope drift trend visible)");
  console.log("   • 2 scope creep alerts (1 active HIGH severity)");
  console.log("   • 3 pod recommendation artifacts");
  console.log("\n🎯 Demo scenarios now enabled:");
  console.log("   • 'show early warnings' → scope drift 14→22% trend + flight risk on Ravi/Arjun");
  console.log("   • 'any scope creep alerts' → HIGH alert: 19 pts added, 24-day delay predicted");
  console.log("   • 'recommend a pod for [engagement]' → Pod match history with evidence");
  console.log("   • 'engineer health' → 2 at-risk engineers, 2 overallocated");
}

main().catch(console.error);
