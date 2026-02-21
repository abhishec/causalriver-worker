/**
 * Finance Data Seeder — Persists synthetic Xero/Volopay data into the org's DB tables
 *
 * This is how Finance Jarvis data gets into the NexusBrain database. Just like
 * a GitHub connector ingests code data into the org's tables, this seeder
 * ingests finance data so the copilot's standard DB queries naturally pick it up.
 *
 * Tables written:
 *   - ai_memory (memory_type='insight')  → Finance insights (overspending, anomalies, etc.)
 *   - ai_memory (memory_type='pattern')  → Financial patterns (seasonal trends, etc.)
 *   - ai_memory (memory_type='rule')     → Finance rules (budget thresholds, etc.)
 *   - causal_relationships_statistical   → Finance causal edges (Revenue → Burn, etc.)
 *
 * The copilot chat route already queries these tables for any org.
 * Once seeded, finance questions "just work" through the generic copilot.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { FinanceJarvisAnalysis, CausalRelationship } from "./brain-analyzer";
import { logger } from "@/lib/logger";

// ── Seed check flag (in-memory, per-process) ────────────────────────────────
const seededOrgs = new Set<string>();

/**
 * Seeds finance analysis data into the org's DB tables.
 * Idempotent: skips if already seeded in this process.
 * Uses service client (bypasses RLS) for writes.
 */
export async function seedFinanceDataToDb(
  supabase: SupabaseClient,
  organizationId: string,
  analysis: FinanceJarvisAnalysis
): Promise<{ seeded: boolean; counts: { insights: number; causalEdges: number; rules: number; patterns: number } }> {
  // Skip if already seeded in this process
  if (seededOrgs.has(organizationId)) {
    return { seeded: false, counts: { insights: 0, causalEdges: 0, rules: 0, patterns: 0 } };
  }

  const counts = { insights: 0, causalEdges: 0, rules: 0, patterns: 0 };

  try {
    // ── 1. Seed insights as ai_memory rows ──────────────────────────────
    const insightRows = analysis.insights.map((insight) => ({
      organization_id: organizationId,
      memory_type: "insight",
      domain: "finance",
      content: JSON.stringify({
        title: insight.title,
        description: insight.description,
        severity: insight.severity,
        category: insight.category,
        metric: insight.metric,
        currentValue: insight.currentValue,
        previousValue: insight.previousValue,
        changePercent: insight.changePercent,
        recommendation: insight.recommendation,
        impact: insight.impact,
        source: insight.source,
        relatedEntities: insight.relatedEntities,
      }),
      importance: insight.severity === "critical" ? 1.0
        : insight.severity === "warning" ? 0.75
        : insight.severity === "positive" ? 0.6
        : 0.5,
      metadata: {
        insight_id: insight.id,
        severity: insight.severity,
        category: insight.category,
        source: insight.source,
        confidence: insight.confidence,
        detected_at: insight.detectedAt,
        seeder: "finance-jarvis",
      },
    }));

    // Delete existing finance insights for this org (idempotent re-seed)
    await supabase
      .from("ai_memory")
      .delete()
      .eq("organization_id", organizationId)
      .eq("domain", "finance")
      .eq("memory_type", "insight");

    if (insightRows.length > 0) {
      const { error: insightErr } = await supabase
        .from("ai_memory")
        .insert(insightRows);
      if (insightErr) logger.warn("[FinanceSeeder] insight insert error:", insightErr.message);
      else counts.insights = insightRows.length;
    }

    // ── 2. Seed causal relationships ─────────────────────────────────────
    const causalRows = analysis.causalRelationships.map((rel: CausalRelationship) => ({
      organization_id: organizationId,
      source_domain: rel.source.toLowerCase().replace(/\s+/g, "-"),
      target_domain: rel.target.toLowerCase().replace(/\s+/g, "-"),
      effect_size: rel.effectSize,
      granger_p_value: rel.confidence >= 0.8 ? 0.01 : rel.confidence >= 0.6 ? 0.03 : 0.05,
      optimal_lag_days: rel.lagDays,
      sample_size: 30,
      confidence_interval_lower: rel.effectSize - 0.1,
      confidence_interval_upper: rel.effectSize + 0.1,
      is_significant: rel.confidence >= 0.6,
      natural_language: rel.description,
      discovery_method: "finance-analyzer",
    }));

    // Delete existing finance causal edges for this org
    await supabase
      .from("causal_relationships_statistical")
      .delete()
      .eq("organization_id", organizationId)
      .eq("discovery_method", "finance-analyzer");

    if (causalRows.length > 0) {
      const { error: causalErr } = await supabase
        .from("causal_relationships_statistical")
        .insert(causalRows);
      if (causalErr) logger.warn("[FinanceSeeder] causal insert error:", causalErr.message);
      else {
        counts.causalEdges = causalRows.length;

        // Surface the most important discovery in plain English for the activity feed.
        // Find the highest-confidence, longest-lag edge — that's the one that tells the
        // accountant something they couldn't see from a spreadsheet.
        const topEdge = analysis.causalRelationships
          .filter((r) => r.confidence >= 0.7 && r.lagDays > 0)
          .sort((a, b) => b.lagDays - a.lagDays)[0];

        let discoveryTitle: string;
        let discoveryDescription: string;

        if (topEdge) {
          const srcLabel = topEdge.source.replace(/-/g, " ");
          const tgtLabel = topEdge.target.replace(/-/g, " ");
          discoveryTitle = `When your ${srcLabel} moves, your ${tgtLabel} follows ${topEdge.lagDays} days later — every time`;
          discoveryDescription = `${topEdge.description} I'll now watch for breaks in this pattern, which would be an early warning sign.`;
        } else {
          const edgeSummary = analysis.causalRelationships
            .slice(0, 2)
            .map((r) => `${r.source} → ${r.target}`)
            .join(", ");
          discoveryTitle = `I've mapped ${causalRows.length} financial relationships in your data`;
          discoveryDescription = `Key patterns: ${edgeSummary}. I'm now monitoring for anything that breaks these patterns.`;
        }

        Promise.resolve(
          supabase.from("platform_events").insert({
            organization_id: organizationId,
            event_type: "causal.discovered",
            source: "finance_seeder",
            title: discoveryTitle,
            event_data: {
              title: discoveryTitle,
              description: discoveryDescription,
              domain: "finance",
              edgesDiscovered: causalRows.length,
              topEdge: topEdge
                ? { source: topEdge.source, target: topEdge.target, lagDays: topEdge.lagDays, confidence: topEdge.confidence }
                : null,
            },
          })
        ).then(({ error }: any) => {
          if (error) logger.warn("[FinanceSeeder] Failed to write discovery event:", error.message);
        }).catch((err: any) => {
          logger.warn("[FinanceSeeder] Failed to write discovery event:", err.message);
        });
      }
    }

    // ── 3. Seed finance rules from department risk data ──────────────────
    const ruleRows = analysis.departmentRisks
      .filter((d) => d.riskScore > 40)
      .map((dept) => ({
        organization_id: organizationId,
        memory_type: "rule",
        domain: "finance",
        content: JSON.stringify({
          title: `${dept.department} Budget Alert`,
          natural_language: `${dept.department} has a risk score of ${dept.riskScore}/100 with ${dept.flaggedTransactions} flagged transactions and ${dept.overBudgetMonths} months over budget. Top risk: ${dept.topRisk}.`,
          when: {
            entity_type: "department",
            conditions: [
              { field: "risk_score", operator: ">", value: 40 },
              { field: "department", operator: "=", value: dept.department },
            ],
          },
          then: {
            action: "alert",
            severity: dept.riskScore > 60 ? "critical" : "high",
          },
        }),
        importance: dept.riskScore / 100,
        metadata: {
          department: dept.department,
          risk_score: dept.riskScore,
          flagged_transactions: dept.flaggedTransactions,
          seeder: "finance-jarvis",
        },
      }));

    // Also add rules from reportSections.actions
    const actionRules = [
      ...analysis.reportSections.actions.immediate.map((a) => ({
        organization_id: organizationId,
        memory_type: "rule",
        domain: "finance",
        content: JSON.stringify({
          title: a.action,
          natural_language: `IMMEDIATE: ${a.action}. Expected savings: ${a.expectedSavings}. Owner: ${a.owner}. ${a.detail}`,
          priority: "immediate",
        }),
        importance: 0.9,
        metadata: { priority: "immediate", owner: a.owner, savings: a.expectedSavings, seeder: "finance-jarvis" },
      })),
      ...analysis.reportSections.actions.shortTerm.map((a) => ({
        organization_id: organizationId,
        memory_type: "rule",
        domain: "finance",
        content: JSON.stringify({
          title: a.action,
          natural_language: `SHORT-TERM: ${a.action}. Expected savings: ${a.expectedSavings}. Owner: ${a.owner}. ${a.detail}`,
          priority: "short-term",
        }),
        importance: 0.7,
        metadata: { priority: "short-term", owner: a.owner, savings: a.expectedSavings, seeder: "finance-jarvis" },
      })),
    ];

    const allRules = [...ruleRows, ...actionRules];

    // Delete existing finance rules for this org
    await supabase
      .from("ai_memory")
      .delete()
      .eq("organization_id", organizationId)
      .eq("domain", "finance")
      .eq("memory_type", "rule");

    if (allRules.length > 0) {
      const { error: ruleErr } = await supabase
        .from("ai_memory")
        .insert(allRules);
      if (ruleErr) logger.warn("[FinanceSeeder] rule insert error:", ruleErr.message);
      else counts.rules = allRules.length;
    }

    // ── 4. Seed finance patterns from trends + unit economics ────────────
    const patternRows = [
      // KPI snapshot pattern
      {
        organization_id: organizationId,
        memory_type: "pattern",
        domain: "finance",
        content: JSON.stringify({
          title: "Company Financial Snapshot",
          description: `ARR: $${(analysis.kpis.arr / 1000).toFixed(0)}K (${analysis.kpis.arrGrowth > 0 ? "+" : ""}${analysis.kpis.arrGrowth.toFixed(1)}% MoM). Monthly Revenue: $${(analysis.kpis.totalRevenue / 1000).toFixed(0)}K. Gross Margin: ${analysis.kpis.grossMargin}%. Net Burn: $${(analysis.kpis.netBurnRate / 1000).toFixed(0)}K/mo. Cash: $${(analysis.kpis.cashBalance / 1000000).toFixed(2)}M. Runway: ${analysis.kpis.runwayMonths} months.`,
        }),
        importance: 1.0,
        metadata: {
          kpis: analysis.kpis,
          seeder: "finance-jarvis",
          llm_pattern_name: "financial-snapshot",
          llm_pattern_description: "Current company financial KPIs and health metrics",
        },
      },
      // Unit economics pattern
      {
        organization_id: organizationId,
        memory_type: "pattern",
        domain: "finance",
        content: JSON.stringify({
          title: "Unit Economics",
          description: `LTV/CAC: ${analysis.unitEconomics.ltvCacRatio}x. CAC: $${Math.round(analysis.unitEconomics.cac / 1000)}K. CAC Payback: ${analysis.unitEconomics.cacPaybackMonths}mo. NRR: ${analysis.unitEconomics.netRevenueRetention}%. Churn: ${analysis.unitEconomics.churnRate}%. Top 5 customer concentration: ${analysis.unitEconomics.topCustomerConcentration}%.`,
        }),
        importance: 0.9,
        metadata: {
          unit_economics: analysis.unitEconomics,
          seeder: "finance-jarvis",
          llm_pattern_name: "unit-economics",
          llm_pattern_description: "SaaS unit economics metrics",
        },
      },
      // Burn rate pattern
      {
        organization_id: organizationId,
        memory_type: "pattern",
        domain: "finance",
        content: JSON.stringify({
          title: "Burn Rate Decomposition",
          description: `Current burn: $${Math.round(analysis.burnAnalysis.currentMonthBurn / 1000)}K/mo (${analysis.burnAnalysis.burnTrend}, ${analysis.burnAnalysis.burnTrendRate}% MoM). People: ${analysis.burnAnalysis.burnByFunctionPct.people}%. Marketing: ${analysis.burnAnalysis.burnByFunctionPct.marketing}%. Tech: ${analysis.burnAnalysis.burnByFunctionPct.technology}%. Break-even revenue: $${Math.round(analysis.burnAnalysis.breakEvenRevenue / 1000)}K/mo.`,
        }),
        importance: 0.85,
        metadata: {
          burn_analysis: analysis.burnAnalysis,
          seeder: "finance-jarvis",
          llm_pattern_name: "burn-decomposition",
          llm_pattern_description: "Monthly burn rate breakdown by function",
        },
      },
      // Health scorecard pattern
      {
        organization_id: organizationId,
        memory_type: "pattern",
        domain: "finance",
        content: JSON.stringify({
          title: "Financial Health Scorecard",
          description: `Overall: ${analysis.healthScorecard.overall.score}/100 (${analysis.healthScorecard.overall.rating}). Growth: ${analysis.healthScorecard.growth.score}/100. Profitability: ${analysis.healthScorecard.profitability.score}/100. Efficiency: ${analysis.healthScorecard.efficiency.score}/100. Cash Health: ${analysis.healthScorecard.cashHealth.score}/100. ${analysis.healthScorecard.overall.summary}`,
        }),
        importance: 0.95,
        metadata: {
          health_scorecard: analysis.healthScorecard,
          seeder: "finance-jarvis",
          llm_pattern_name: "health-scorecard",
          llm_pattern_description: "Multi-dimensional financial health assessment",
        },
      },
      // Efficiency metrics pattern
      {
        organization_id: organizationId,
        memory_type: "pattern",
        domain: "finance",
        content: JSON.stringify({
          title: "SaaS Efficiency Metrics",
          description: `Magic Number: ${analysis.efficiencyMetrics.magicNumber} (${analysis.efficiencyMetrics.magicNumberVerdict}). Rule of 40: ${analysis.efficiencyMetrics.ruleOf40Score} (${analysis.efficiencyMetrics.ruleOf40Verdict}). Revenue/Employee: $${Math.round(analysis.efficiencyMetrics.revenuePerEmployee / 1000)}K/yr. OPEX Ratio: ${analysis.efficiencyMetrics.opexRatio}%.`,
        }),
        importance: 0.8,
        metadata: {
          efficiency_metrics: analysis.efficiencyMetrics,
          seeder: "finance-jarvis",
          llm_pattern_name: "efficiency-metrics",
          llm_pattern_description: "SaaS efficiency benchmarks (Magic Number, Rule of 40)",
        },
      },
      // Spend breakdown patterns
      ...analysis.spendBreakdowns.map((s) => ({
        organization_id: organizationId,
        memory_type: "pattern" as const,
        domain: "finance",
        content: JSON.stringify({
          title: `${s.category} Spend Trend`,
          description: `${s.category}: $${(s.currentMonth / 1000).toFixed(0)}K this month (${s.percentOfRevenue}% of revenue, threshold ${s.thresholdPct}%). Trend: ${s.trend}. ${s.isAboveThreshold ? `ABOVE THRESHOLD by ${(s.percentOfRevenue - s.thresholdPct).toFixed(1)}%.` : "Within budget."}`,
        }),
        importance: s.isAboveThreshold ? 0.85 : 0.5,
        metadata: {
          category: s.category,
          current_month: s.currentMonth,
          percent_of_revenue: s.percentOfRevenue,
          threshold: s.thresholdPct,
          is_above_threshold: s.isAboveThreshold,
          trend: s.trend,
          seeder: "finance-jarvis",
          llm_pattern_name: `spend-${s.category.toLowerCase().replace(/\s+/g, "-")}`,
          llm_pattern_description: `${s.category} spending trend and threshold analysis`,
        },
      })),
      // Monthly P&L trend pattern
      {
        organization_id: organizationId,
        memory_type: "pattern",
        domain: "finance",
        content: JSON.stringify({
          title: "12-Month Revenue & Expense Trend",
          description: analysis.monthlyTrends
            .map((t) => `${t.month}: Rev $${(t.revenue / 1000).toFixed(0)}K, Exp $${(t.expenses / 1000).toFixed(0)}K, Net $${(t.netIncome / 1000).toFixed(0)}K, Cash $${(t.cashBalance / 1000000).toFixed(2)}M`)
            .join(". "),
        }),
        importance: 0.9,
        metadata: {
          monthly_trends: analysis.monthlyTrends,
          seeder: "finance-jarvis",
          llm_pattern_name: "monthly-pnl-trend",
          llm_pattern_description: "12-month revenue, expense, and cash balance trends",
        },
      },
      // Cash flow forecast pattern
      {
        organization_id: organizationId,
        memory_type: "pattern",
        domain: "finance",
        content: JSON.stringify({
          title: "6-Month Cash Flow Forecast",
          description: analysis.cashFlowForecast
            .map((f) => `${f.month}: Inflows $${(f.projectedInflows / 1000).toFixed(0)}K, Outflows $${(f.projectedOutflows / 1000).toFixed(0)}K, Net $${(f.projectedNetCash / 1000).toFixed(0)}K → Balance $${(f.projectedBalance / 1000000).toFixed(2)}M (${(f.confidence * 100).toFixed(0)}% confidence)${f.risks.length > 0 ? " Risks: " + f.risks.join(", ") : ""}`)
            .join(". "),
        }),
        importance: 0.9,
        metadata: {
          cash_flow_forecast: analysis.cashFlowForecast,
          seeder: "finance-jarvis",
          llm_pattern_name: "cash-forecast",
          llm_pattern_description: "6-month projected cash flow with confidence levels",
        },
      },
      // Runway scenarios pattern
      {
        organization_id: organizationId,
        memory_type: "pattern",
        domain: "finance",
        content: JSON.stringify({
          title: "Runway Scenarios",
          description: analysis.runwayProjections
            .map((r) => `${r.scenario}: ${r.runwayMonths} months (burn $${(r.monthlyBurn / 1000).toFixed(0)}K/mo) — ${r.assumptions.join(", ")}`)
            .join(". "),
        }),
        importance: 0.85,
        metadata: {
          runway_projections: analysis.runwayProjections,
          seeder: "finance-jarvis",
          llm_pattern_name: "runway-scenarios",
          llm_pattern_description: "Optimistic, base, and pessimistic runway projections",
        },
      },
      // Overspending report pattern
      {
        organization_id: organizationId,
        memory_type: "pattern",
        domain: "finance",
        content: JSON.stringify({
          title: "Overspending Analysis",
          description: `${analysis.reportSections.overspending.summary}. Total overspend: $${Math.round(analysis.reportSections.overspending.totalOverspend / 1000)}K/mo. ${analysis.reportSections.overspending.items.map((item) => `${item.area}: $${Math.round(item.overageAmount / 1000)}K over benchmark (+${item.overagePct.toFixed(1)}%)`).join(". ")}.`,
        }),
        importance: 0.9,
        metadata: {
          overspending: analysis.reportSections.overspending,
          seeder: "finance-jarvis",
          llm_pattern_name: "overspending-analysis",
          llm_pattern_description: "Areas where spending exceeds SaaS benchmarks",
        },
      },
      // Bottom line pattern
      {
        organization_id: organizationId,
        memory_type: "pattern",
        domain: "finance",
        content: JSON.stringify({
          title: "Brain's Bottom Line",
          description: analysis.reportSections.bottomLine,
        }),
        importance: 1.0,
        metadata: {
          seeder: "finance-jarvis",
          llm_pattern_name: "bottom-line",
          llm_pattern_description: "NexusBrain's overall financial verdict",
        },
      },
    ];

    // Delete existing finance patterns for this org
    await supabase
      .from("ai_memory")
      .delete()
      .eq("organization_id", organizationId)
      .eq("domain", "finance")
      .eq("memory_type", "pattern");

    if (patternRows.length > 0) {
      const { error: patternErr } = await supabase
        .from("ai_memory")
        .insert(patternRows);
      if (patternErr) logger.warn("[FinanceSeeder] pattern insert error:", patternErr.message);
      else counts.patterns = patternRows.length;
    }

    // Mark as seeded for this process
    seededOrgs.add(organizationId);

    logger.debug(`[FinanceSeeder] Seeded org ${organizationId}: ${counts.insights} insights, ${counts.causalEdges} causal edges, ${counts.rules} rules, ${counts.patterns} patterns`);

    return { seeded: true, counts };
  } catch (err) {
    logger.error("[FinanceSeeder] Failed to seed finance data:", err);
    return { seeded: false, counts };
  }
}

/**
 * Check if finance data has been seeded for this org (quick check).
 */
export async function isFinanceDataSeeded(
  supabase: SupabaseClient,
  organizationId: string
): Promise<boolean> {
  if (seededOrgs.has(organizationId)) return true;

  const { count } = await supabase
    .from("ai_memory")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .eq("domain", "finance")
    .eq("memory_type", "pattern");

  return (count ?? 0) > 0;
}
