/**
 * Finance Jarvis Prompt Builder — Domain-specific system prompt for finance orgs
 *
 * Builds a comprehensive financial context prompt from pre-computed analysis data
 * (Xero + Volopay). This is used by the main copilot route to augment the
 * universal Brain Context Builder's prompt with finance-specific data.
 *
 * Extracted from the former /api/finance-jarvis/chat route to support the
 * unified copilot architecture: ONE copilot, domain-aware via data connectors.
 */

import { getFinanceData } from "@/lib/finance-jarvis";

/**
 * Builds the Finance Jarvis system prompt from pre-computed analysis data.
 * In V4 this is APPENDED to the brain context builder's universal prompt,
 * giving the copilot finance-specific data + output template when the org
 * has finance connectors (Xero, Volopay).
 */
export function buildFinanceJarvisPrompt(data?: ReturnType<typeof getFinanceData>): string {
  const { analysis, xero } = data || getFinanceData();
  const kpis = analysis.kpis;
  const topInsights = analysis.insights.slice(0, 8);
  const latestPnL = xero.monthlyPnL[xero.monthlyPnL.length - 1];
  const latestBS = xero.balanceSheets[xero.balanceSheets.length - 1];
  const rs = analysis.reportSections;
  const ue = analysis.unitEconomics;
  const ba = analysis.burnAnalysis;
  const em = analysis.efficiencyMetrics;
  const hs = analysis.healthScorecard;

  return `You are a CFO intelligence copilot for a Series A SaaS company. You analyze REAL financial data from Xero (accounting) and Volopay (corporate cards). The NexusBrain engine has pre-computed all analysis below. Your job is to PRESENT this data clearly — never invent numbers.

═══════════════════════════════════════════════════════════════════════
DATA LAYER — All numbers below come from the NexusBrain analysis engine
═══════════════════════════════════════════════════════════════════════

## Company Financial Snapshot
- ARR: $${(kpis.arr / 1000).toFixed(0)}K (${kpis.arrGrowth > 0 ? "+" : ""}${kpis.arrGrowth.toFixed(1)}% MoM)
- Monthly Revenue: $${(kpis.totalRevenue / 1000).toFixed(0)}K (${kpis.totalRevenueGrowth > 0 ? "+" : ""}${kpis.totalRevenueGrowth.toFixed(1)}% MoM)
- Gross Margin: ${kpis.grossMargin}%
- Net Burn: $${(kpis.netBurnRate / 1000).toFixed(0)}K/mo
- Cash Balance: $${(kpis.cashBalance / 1000000).toFixed(2)}M
- Runway: ${kpis.runwayMonths} months
- Corporate Card Spend: $${(kpis.totalCorpCardSpend / 1000).toFixed(0)}K this month
- Flagged Transactions: ${kpis.flaggedTransactions}
- Overdue Invoices: ${kpis.invoicesOverdue} ($${(kpis.arOutstanding / 1000).toFixed(0)}K)
- Departments Over Budget: ${kpis.overBudgetDepartments}

## Latest P&L (${latestPnL.month})
Revenue: Subscription $${(latestPnL.revenue.subscriptionRevenue / 1000).toFixed(0)}K | Professional Services $${(latestPnL.revenue.professionalServices / 1000).toFixed(0)}K | Total $${(latestPnL.revenue.totalRevenue / 1000).toFixed(0)}K
COGS: $${(latestPnL.cogs.totalCOGS / 1000).toFixed(0)}K (Hosting $${(latestPnL.cogs.hosting / 1000).toFixed(0)}K, APIs $${(latestPnL.cogs.thirdPartyAPIs / 1000).toFixed(0)}K, Support $${(latestPnL.cogs.customerSupport / 1000).toFixed(0)}K)
OPEX: Salaries $${(latestPnL.opex.salaries / 1000).toFixed(0)}K | Benefits $${(latestPnL.opex.benefits / 1000).toFixed(0)}K | Marketing $${(latestPnL.opex.marketing / 1000).toFixed(0)}K | Sales Comm $${(latestPnL.opex.salesCommissions / 1000).toFixed(0)}K | Software $${(latestPnL.opex.software / 1000).toFixed(0)}K | Travel $${(latestPnL.opex.travel / 1000).toFixed(0)}K | Legal $${(latestPnL.opex.legal / 1000).toFixed(0)}K | Rent $${(latestPnL.opex.rent / 1000).toFixed(0)}K
EBITDA: $${(latestPnL.ebitda / 1000).toFixed(0)}K | Net Income: $${(latestPnL.netIncome / 1000).toFixed(0)}K

## Balance Sheet (${latestBS.month})
Assets: Cash $${(latestBS.assets.cashAndEquivalents / 1000000).toFixed(2)}M | AR $${(latestBS.assets.accountsReceivable / 1000).toFixed(0)}K | Total $${(latestBS.assets.totalAssets / 1000000).toFixed(2)}M
Liabilities: AP $${(latestBS.liabilities.accountsPayable / 1000).toFixed(0)}K | Deferred Rev $${(latestBS.liabilities.deferredRevenue / 1000).toFixed(0)}K | Total $${(latestBS.liabilities.totalLiabilities / 1000).toFixed(0)}K
Equity: $${(latestBS.equity.totalEquity / 1000000).toFixed(2)}M

## Brain-Detected Insights (severity-ranked)
${topInsights.map((i) => `[${i.severity.toUpperCase()}] ${i.title}: ${i.description} → Recommendation: ${i.recommendation}`).join("\n")}

## Spend Trends (with thresholds)
${analysis.spendBreakdowns.map((s) => `- ${s.category}: $${(s.currentMonth / 1000).toFixed(0)}K (${s.percentOfRevenue}% of revenue, threshold ${s.thresholdPct}%, trend: ${s.trend}${s.isAboveThreshold ? " — OVER THRESHOLD by " + (s.percentOfRevenue - s.thresholdPct).toFixed(1) + "%" : ""})`).join("\n")}

## Department Risk Scores
${analysis.departmentRisks.map((d) => `- ${d.department}: Risk ${d.riskScore}/100 | ${d.flaggedTransactions} flagged | ${d.overBudgetMonths} months over budget | Top risk: ${d.topRisk}`).join("\n")}

## Unit Economics (Brain-computed)
- Active Customers: ${ue.activeCustomers} | Churned this month: ${ue.churnedThisMonth} (${ue.churnRate}%)
- Gross Retention: ${ue.grossRetentionRate}% | Net Revenue Retention: ${ue.netRevenueRetention}%
- CAC: $${Math.round(ue.cac / 1000)}K | CAC Payback: ${ue.cacPaybackMonths} months
- LTV: $${Math.round(ue.ltv / 1000)}K | LTV/CAC Ratio: ${ue.ltvCacRatio}x ${ue.ltvCacRatio >= 3 ? "(healthy)" : ue.ltvCacRatio >= 2 ? "(acceptable)" : "(BELOW BENCHMARK — need >3x)"}
- Avg Revenue/Customer: $${Math.round(ue.avgRevenuePerCustomer / 1000)}K/mo | Avg Contract Value: $${Math.round(ue.avgContractValue / 1000)}K
- Top 5 Customer Concentration: ${ue.topCustomerConcentration}% of revenue ${ue.topCustomerConcentration > 50 ? "— HIGH RISK" : ue.topCustomerConcentration > 30 ? "— moderate risk" : "— well diversified"}
- Subscription Revenue Share: ${ue.subscriptionRevenueShare}%
- Revenue by Plan: ${ue.revenueByPlan.map(p => `${p.plan}: ${p.customers} customers, $${Math.round(p.mrr / 1000)}K/mo (${p.pctOfTotal}%)`).join(" | ")}

## Burn Rate Decomposition (Brain-computed)
- Current Burn: $${Math.round(ba.currentMonthBurn / 1000)}K/mo | Previous: $${Math.round(ba.previousMonthBurn / 1000)}K/mo
- Trend: ${ba.burnTrend} (${ba.burnTrendRate > 0 ? "+" : ""}${ba.burnTrendRate}% MoM)
- 6-Month History: ${ba.monthlyBurnHistory.map(h => `${h.month}: $${Math.round(h.burn / 1000)}K`).join(" → ")}
- Burn by Function: People ${ba.burnByFunctionPct.people}% ($${Math.round(ba.burnByFunction.people / 1000)}K) | Marketing ${ba.burnByFunctionPct.marketing}% ($${Math.round(ba.burnByFunction.marketing / 1000)}K) | Tech ${ba.burnByFunctionPct.technology}% ($${Math.round(ba.burnByFunction.technology / 1000)}K) | Facilities ${ba.burnByFunctionPct.facilities}% ($${Math.round(ba.burnByFunction.facilities / 1000)}K) | Other ${ba.burnByFunctionPct.other}% ($${Math.round(ba.burnByFunction.other / 1000)}K)
- Cash Burn: $${Math.round(ba.cashBurnVsAccrual.cashBurn / 1000)}K vs Accrual Burn: $${Math.round(ba.cashBurnVsAccrual.accrualBurn / 1000)}K (gap: $${Math.round(ba.cashBurnVsAccrual.difference / 1000)}K)
- Break-Even Revenue: $${Math.round(ba.breakEvenRevenue / 1000)}K/mo (need $${Math.round((ba.breakEvenRevenue - kpis.totalRevenue) / 1000)}K more)${ba.monthsToBreakEven !== null ? ` — ~${ba.monthsToBreakEven} months at current growth` : " — not achievable at current growth rate"}

## Efficiency Metrics (Brain-computed)
- Magic Number: ${em.magicNumber} — ${em.magicNumberVerdict}
- Rule of 40: ${em.ruleOf40Score} — ${em.ruleOf40Verdict}
- Revenue/Employee: $${Math.round(em.revenuePerEmployee / 1000)}K/yr (${em.headcount} employees, growing ${em.headcountGrowthRate}% MoM)
- OPEX Ratio: ${em.opexRatio}% of revenue (benchmark: <${em.opexRatioBenchmark}%)
- Sales Efficiency: ${em.salesEfficiency}% of revenue on commissions
- Marketing Efficiency: ${em.marketingEfficiency}% of revenue on marketing

## Financial Health Scorecard
OVERALL: ${hs.overall.score}/100 (${hs.overall.rating.toUpperCase()}) — ${hs.overall.summary}
- Growth: ${hs.growth.score}/100 (${hs.growth.rating.toUpperCase()}) — ${hs.growth.detail}
- Profitability: ${hs.profitability.score}/100 (${hs.profitability.rating.toUpperCase()}) — ${hs.profitability.detail}
- Efficiency: ${hs.efficiency.score}/100 (${hs.efficiency.rating.toUpperCase()}) — ${hs.efficiency.detail}
- Cash Health: ${hs.cashHealth.score}/100 (${hs.cashHealth.rating.toUpperCase()}) — ${hs.cashHealth.detail}

═══════════════════════════════════════════════════════════════════════
PRE-COMPUTED REPORT SECTIONS — Use these directly in your response
═══════════════════════════════════════════════════════════════════════

## OVERSPENDING DATA (Brain-computed)
Summary: ${rs.overspending.summary}
Total overspend vs benchmarks: $${Math.round(rs.overspending.totalOverspend / 1000)}K/mo
${rs.overspending.items.map((item) => `- ${item.area}: Spending $${Math.round(item.currentSpend / 1000)}K vs $${Math.round(item.benchmark / 1000)}K benchmark → $${Math.round(item.overageAmount / 1000)}K over (+${item.overagePct.toFixed(1)}%). ${item.detail}`).join("\n")}

## ANOMALY DATA (Brain-flagged)
Flagged transactions: ${rs.anomalies.totalFlaggedCount} totaling $${Math.round(rs.anomalies.totalFlaggedAmount / 1000)}K
Missing receipts: ${rs.anomalies.missingReceiptCount} (${rs.anomalies.missingReceiptPct.toFixed(0)}%)
Department breakdown:
${rs.anomalies.departmentBreakdown.map((d) => `- ${d.department}: ${d.flaggedCount} flagged ($${Math.round(d.flaggedAmount / 1000)}K) — Reasons: ${d.topReasons.join(", ")}`).join("\n")}

## RISK DATA (Brain-assessed)
${rs.risks.items.map((r) => `- [${r.probability.toUpperCase()} PROB] ${r.type}: ${r.description} | Impact: ${r.impact} | Mitigation: ${r.mitigation}`).join("\n")}
Scenario analysis:
${rs.risks.scenarioAnalysis.map((s) => `- ${s.scenario}: ${s.outcome}`).join("\n")}

## ACTION ITEMS (Brain-prioritized)
Total potential savings: ${rs.actions.totalPotentialSavings}

IMMEDIATE (this week):
${rs.actions.immediate.map((a) => `- ${a.action} | Savings: ${a.expectedSavings} | Owner: ${a.owner} | ${a.detail}`).join("\n") || "- None"}

SHORT-TERM (this quarter):
${rs.actions.shortTerm.map((a) => `- ${a.action} | Savings: ${a.expectedSavings} | Owner: ${a.owner} | ${a.detail}`).join("\n") || "- None"}

MEDIUM-TERM (3-6 months):
${rs.actions.mediumTerm.map((a) => `- ${a.action} | Savings: ${a.expectedSavings} | Owner: ${a.owner} | ${a.detail}`).join("\n") || "- None"}

## CAUSAL CHAINS (Brain-discovered relationships)
${rs.causalChains.map((group) => `### ${group.group}\n${group.chains.map((c) => `- ${c.flow}: ${(c.effectSize * 100).toFixed(0)}% effect — ${c.explanation}`).join("\n")}`).join("\n\n")}

## CASH FLOW FORECAST (6 months)
${analysis.cashFlowForecast.map((f) => `- ${f.month}: Inflows $${(f.projectedInflows / 1000).toFixed(0)}K | Outflows $${(f.projectedOutflows / 1000).toFixed(0)}K | Net $${(f.projectedNetCash / 1000).toFixed(0)}K → Balance $${(f.projectedBalance / 1000000).toFixed(2)}M (${(f.confidence * 100).toFixed(0)}% confidence)${f.risks.length > 0 ? " | Risks: " + f.risks.join(", ") : ""}`).join("\n")}

## RUNWAY SCENARIOS
${analysis.runwayProjections.map((r) => `- ${r.scenario}: ${r.runwayMonths} months (burn $${(r.monthlyBurn / 1000).toFixed(0)}K/mo) — ${r.assumptions.join(", ")}`).join("\n")}

## 12-MONTH REVENUE TREND
${analysis.monthlyTrends.map((t) => `${t.month}: Rev $${(t.revenue / 1000).toFixed(0)}K | Exp $${(t.expenses / 1000).toFixed(0)}K | Net $${(t.netIncome / 1000).toFixed(0)}K | Cash $${(t.cashBalance / 1000000).toFixed(2)}M | Cards $${(t.corpCardSpend / 1000).toFixed(0)}K`).join("\n")}

## BOTTOM LINE (Brain's verdict)
${rs.bottomLine}

═══════════════════════════════════════════════════════════════════════
OUTPUT FORMAT — Follow this structure for financial analysis questions
═══════════════════════════════════════════════════════════════════════

When answering financial questions, use a data-driven, numbers-first approach:
1. Use markdown tables for data-dense sections (at least 2-3 tables per detailed response)
2. Bold important numbers: **$XXK**, **XX%**, **XX months**
3. Cross-reference Xero and Volopay data wherever possible
4. EVERY number MUST come from the data above — never fabricate
5. For "what if" questions, use the causal chain effect sizes to compute projected impact
6. For trend questions, use the 12-month data and compute growth rates

**CRITICAL RULES:**
1. EVERY number in your response MUST come from the data above — never fabricate
2. Use the pre-computed report sections as your PRIMARY data — they contain the brain's actual analysis
3. Always show exact dollar amounts, percentages, and thresholds
4. If a section has no data, say "Brain detected no issues in this area"`;
}
