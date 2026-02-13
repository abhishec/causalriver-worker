#!/usr/bin/env tsx
/**
 * Finance Jarvis — Full Brain Analysis Runner
 *
 * Generates realistic synthetic data from Xero + Volopay,
 * feeds it through the NexusBrain analyzer, and outputs
 * the complete financial intelligence report.
 */

// We need to import from the platform lib - let's inline everything for portability
// ─── Import the generators ──────────────────────────────────────────────────

import { generateXeroData } from "../platform/lib/finance-jarvis/synthetic-xero";
import { generateVolopayData } from "../platform/lib/finance-jarvis/synthetic-volopay";
import { analyzeFinanceData } from "../platform/lib/finance-jarvis/brain-analyzer";

// ─── Formatters ─────────────────────────────────────────────────────────────

function fmtK(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

function bar(value: number, max: number, width = 30): string {
  const filled = Math.round((Math.abs(value) / max) * width);
  const char = value >= 0 ? "█" : "░";
  return char.repeat(Math.min(filled, width));
}

function severityIcon(s: string): string {
  switch (s) {
    case "critical": return "🔴";
    case "warning": return "🟡";
    case "info": return "🔵";
    case "positive": return "🟢";
    default: return "⚪";
  }
}

// ─── Run ────────────────────────────────────────────────────────────────────

console.log("\n" + "═".repeat(80));
console.log("  FINANCE JARVIS — AI CFO Intelligence Engine");
console.log("  Powered by NexusBrain Causal Intelligence");
console.log("═".repeat(80) + "\n");

console.log("⏳ Generating synthetic data...\n");

const startDate = new Date();
startDate.setFullYear(startDate.getFullYear() - 1);

const xero = generateXeroData(startDate);
const volopay = generateVolopayData(startDate);

console.log(`  ✅ Xero: ${xero.monthlyPnL.length} months P&L | ${xero.transactions.length} transactions | ${xero.invoices.length} invoices | ${xero.bills.length} bills`);
console.log(`  ✅ Volopay: ${volopay.cardHolders.length} cardholders | ${volopay.transactions.length} transactions | ${volopay.budgets.length} budget records`);
console.log(`  ✅ Daily cash: ${xero.dailyCashBalances.length} daily balance records\n`);

console.log("🧠 Feeding data through brain analyzer...\n");

const analysis = analyzeFinanceData(xero, volopay);

// ═══════════════════════════════════════════════════════════════════════════
// KPI DASHBOARD
// ═══════════════════════════════════════════════════════════════════════════

console.log("─".repeat(80));
console.log("  📊 KEY PERFORMANCE INDICATORS");
console.log("─".repeat(80));

const k = analysis.kpis;
const kpiRows = [
  ["ARR", fmtK(k.arr), `${k.arrGrowth >= 0 ? "+" : ""}${k.arrGrowth.toFixed(1)}% MoM`],
  ["Monthly Revenue", fmtK(k.totalRevenue), `${k.totalRevenueGrowth >= 0 ? "+" : ""}${k.totalRevenueGrowth.toFixed(1)}% MoM`],
  ["Gross Margin", `${k.grossMargin}%`, k.grossMargin >= 75 ? "✅ Above benchmark" : "⚠️ Below 75% target"],
  ["Net Burn Rate", fmtK(k.netBurnRate) + "/mo", `${k.runwayMonths} months runway`],
  ["Cash Balance", fmtK(k.cashBalance), k.runwayMonths > 18 ? "✅ Healthy" : "⚠️ Monitor closely"],
  ["Corp Card Spend", fmtK(k.totalCorpCardSpend), `${k.flaggedTransactions} flagged transactions`],
  ["Overdue Invoices", String(k.invoicesOverdue), fmtK(k.arOutstanding) + " outstanding"],
  ["Depts Over Budget", `${k.overBudgetDepartments} of 6`, k.overBudgetDepartments > 2 ? "⚠️ Concerning" : "✅ Manageable"],
];

for (const [label, value, note] of kpiRows) {
  console.log(`  ${label.padEnd(22)} ${value.padStart(12)}   ${note}`);
}

// ═══════════════════════════════════════════════════════════════════════════
// P&L TREND (12 MONTHS)
// ═══════════════════════════════════════════════════════════════════════════

console.log("\n" + "─".repeat(80));
console.log("  📈 12-MONTH P&L TREND");
console.log("─".repeat(80));
console.log("  Month     Revenue    Expenses      Net     GM%     Cash       Cards");
console.log("  " + "─".repeat(74));

for (const t of analysis.monthlyTrends) {
  const netColor = t.netIncome >= 0 ? "+" : "";
  console.log(
    `  ${t.month}   ${fmtK(t.revenue).padStart(9)}  ${fmtK(t.expenses).padStart(9)}  ${(netColor + fmtK(t.netIncome)).padStart(9)}  ${(t.grossMargin.toFixed(1) + "%").padStart(6)}  ${fmtK(t.cashBalance).padStart(9)}  ${fmtK(t.corpCardSpend).padStart(8)}`
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// BRAIN INSIGHTS
// ═══════════════════════════════════════════════════════════════════════════

console.log("\n" + "─".repeat(80));
console.log(`  🧠 BRAIN INSIGHTS (${analysis.insights.length} detected)`);
console.log("─".repeat(80));

for (const insight of analysis.insights) {
  console.log(`\n  ${severityIcon(insight.severity)} [${insight.severity.toUpperCase()}] ${insight.title}`);
  console.log(`     Domain: ${insight.domain} | Category: ${insight.category} | Source: ${insight.source} | Confidence: ${Math.round(insight.confidence * 100)}%`);
  console.log(`     ${insight.description}`);
  if (insight.currentValue !== undefined) {
    let metricStr = `     Metric: ${insight.metric} = ${typeof insight.currentValue === "number" && insight.currentValue > 1000 ? fmtK(insight.currentValue) : insight.currentValue}`;
    if (insight.previousValue !== undefined) metricStr += ` (prev: ${typeof insight.previousValue === "number" && insight.previousValue > 1000 ? fmtK(insight.previousValue) : insight.previousValue})`;
    if (insight.changePercent !== undefined) metricStr += ` [${insight.changePercent > 0 ? "+" : ""}${insight.changePercent.toFixed(1)}%]`;
    console.log(metricStr);
  }
  console.log(`     💡 Recommendation: ${insight.recommendation}`);
  if (insight.relatedEntities?.length) {
    console.log(`     Related: ${insight.relatedEntities.join(", ")}`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SPEND BREAKDOWN
// ═══════════════════════════════════════════════════════════════════════════

console.log("\n\n" + "─".repeat(80));
console.log("  💰 SPEND BREAKDOWN BY CATEGORY");
console.log("─".repeat(80));
console.log("  Category                  Current   LastMo    3moAvg   %Rev  Trend       Status");
console.log("  " + "─".repeat(74));

for (const s of analysis.spendBreakdowns) {
  const trendArrow = s.trend === "increasing" ? "↑ increasing" : s.trend === "decreasing" ? "↓ decreasing" : "= stable    ";
  const status = s.isAboveThreshold ? `⚠️ >${s.thresholdPct}%` : "✅ OK";
  console.log(
    `  ${s.category.padEnd(26)} ${fmtK(s.currentMonth).padStart(8)} ${fmtK(s.previousMonth).padStart(8)} ${fmtK(s.threeMonthAvg).padStart(9)}  ${(s.percentOfRevenue.toFixed(1) + "%").padStart(5)}  ${trendArrow}  ${status}`
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// DEPARTMENT RISK SCORES (VOLOPAY)
// ═══════════════════════════════════════════════════════════════════════════

console.log("\n" + "─".repeat(80));
console.log("  🏢 DEPARTMENT RISK SCORES (Volopay Corporate Cards)");
console.log("─".repeat(80));

for (const d of analysis.departmentRisks) {
  const riskBar = bar(d.riskScore, 100, 20);
  const riskLabel = d.riskScore > 60 ? "🔴 HIGH" : d.riskScore > 40 ? "🟡 MED " : "🟢 LOW ";
  console.log(`\n  ${riskLabel} ${d.department.padEnd(14)} ${String(d.riskScore).padStart(3)}/100  ${riskBar}`);
  console.log(`     Flagged: ${d.flaggedTransactions} tx | Over budget: ${d.overBudgetMonths} months | Missing receipts: ${d.complianceIssues}`);
  if (d.factors.length > 0) {
    for (const f of d.factors) {
      console.log(`     • ${f}`);
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// FLAGGED TRANSACTIONS (ANOMALIES)
// ═══════════════════════════════════════════════════════════════════════════

console.log("\n\n" + "─".repeat(80));
console.log("  🚨 FLAGGED CORPORATE CARD TRANSACTIONS");
console.log("─".repeat(80));

const flagged = volopay.transactions
  .filter((t) => t.flagged && t.status === "COMPLETED")
  .sort((a, b) => b.amount - a.amount)
  .slice(0, 15);

console.log("  Date        Cardholder            Dept          Merchant                     Amount    Reason");
console.log("  " + "─".repeat(74));

for (const t of flagged) {
  console.log(
    `  ${t.date}  ${t.cardHolderName.padEnd(20)}  ${t.department.padEnd(12)}  ${t.merchant.padEnd(28)} ${fmtK(t.amount).padStart(8)}  ${t.flagReason || ""}`
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// OVERDUE INVOICES
// ═══════════════════════════════════════════════════════════════════════════

const overdueInvoices = xero.invoices.filter((i) => i.status === "OVERDUE").sort((a, b) => b.total - a.total).slice(0, 10);

console.log("\n" + "─".repeat(80));
console.log(`  📋 OVERDUE INVOICES (${overdueInvoices.length} total)`);
console.log("─".repeat(80));
console.log("  Invoice        Customer                    Due Date     Amount");
console.log("  " + "─".repeat(65));

for (const inv of overdueInvoices) {
  console.log(`  ${inv.invoiceNumber.padEnd(15)}  ${inv.customer.padEnd(26)}  ${inv.dateDue}  ${fmtK(inv.total).padStart(9)}`);
}

// ═══════════════════════════════════════════════════════════════════════════
// CASH FLOW FORECAST
// ═══════════════════════════════════════════════════════════════════════════

console.log("\n" + "─".repeat(80));
console.log("  🔮 CASH FLOW FORECAST (Next 6 Months)");
console.log("─".repeat(80));
console.log("  Month     Inflows     Outflows       Net       Balance    Conf  Risks");
console.log("  " + "─".repeat(74));

for (const f of analysis.cashFlowForecast) {
  const netSign = f.projectedNetCash >= 0 ? "+" : "";
  const risks = f.risks.length > 0 ? f.risks.join("; ") : "None";
  console.log(
    `  ${f.month}  ${fmtK(f.projectedInflows).padStart(9)}  ${fmtK(f.projectedOutflows).padStart(10)}  ${(netSign + fmtK(f.projectedNetCash)).padStart(9)}  ${fmtK(f.projectedBalance).padStart(10)}  ${(Math.round(f.confidence * 100) + "%").padStart(4)}  ${risks}`
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// RUNWAY SCENARIOS
// ═══════════════════════════════════════════════════════════════════════════

console.log("\n" + "─".repeat(80));
console.log("  ⏳ RUNWAY SCENARIO ANALYSIS");
console.log("─".repeat(80));

for (const r of analysis.runwayProjections) {
  const icon = r.scenario === "optimistic" ? "🟢" : r.scenario === "pessimistic" ? "🔴" : "🟡";
  console.log(`\n  ${icon} ${r.scenario.toUpperCase()} SCENARIO`);
  console.log(`     Runway: ${r.runwayMonths} months (until ${r.runwayDate})`);
  console.log(`     Monthly burn: ${fmtK(r.monthlyBurn)} | Cash: ${fmtK(r.currentCash)}`);
  console.log(`     Assumptions: ${r.assumptions.join(" | ")}`);
}

// ═══════════════════════════════════════════════════════════════════════════
// CAUSAL RELATIONSHIPS (BRAIN-DISCOVERED)
// ═══════════════════════════════════════════════════════════════════════════

console.log("\n\n" + "─".repeat(80));
console.log("  🧬 BRAIN-DISCOVERED CAUSAL RELATIONSHIPS");
console.log("─".repeat(80));

for (const c of analysis.causalRelationships) {
  const effectStr = c.effectSize > 0 ? `+${(c.effectSize * 100).toFixed(0)}%` : `${(c.effectSize * 100).toFixed(0)}%`;
  console.log(`\n  ${c.source} → ${c.target}`);
  console.log(`     Effect: ${effectStr} | Lag: ${c.lagDays} days | Confidence: ${Math.round(c.confidence * 100)}%`);
  console.log(`     ${c.description}`);
}

// ═══════════════════════════════════════════════════════════════════════════
// TOP VOLOPAY SPENDERS
// ═══════════════════════════════════════════════════════════════════════════

console.log("\n\n" + "─".repeat(80));
console.log("  👤 TOP CORPORATE CARD SPENDERS (Last 30 Days)");
console.log("─".repeat(80));

const thirtyDaysAgo = new Date();
thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

const recentTx = volopay.transactions.filter(
  (t) => t.status === "COMPLETED" && new Date(t.date) >= thirtyDaysAgo
);

const spenderMap = new Map<string, { name: string; dept: string; total: number; count: number }>();
for (const t of recentTx) {
  const existing = spenderMap.get(t.cardHolderId) || { name: t.cardHolderName, dept: t.department, total: 0, count: 0 };
  existing.total += t.amount;
  existing.count++;
  spenderMap.set(t.cardHolderId, existing);
}

const topSpenders = [...spenderMap.values()].sort((a, b) => b.total - a.total).slice(0, 10);

console.log("  Name                     Dept           Total      Tx Count");
console.log("  " + "─".repeat(65));
for (const s of topSpenders) {
  console.log(`  ${s.name.padEnd(25)}  ${s.dept.padEnd(13)}  ${fmtK(s.total).padStart(9)}   ${String(s.count).padStart(5)}`);
}

// ═══════════════════════════════════════════════════════════════════════════
// VENDOR ANALYSIS
// ═══════════════════════════════════════════════════════════════════════════

console.log("\n" + "─".repeat(80));
console.log("  🏪 TOP VENDORS BY SPEND (Volopay)");
console.log("─".repeat(80));

const vendorMap = new Map<string, { merchant: string; total: number; count: number; categories: Set<string> }>();
for (const t of volopay.transactions.filter((t) => t.status === "COMPLETED")) {
  const existing = vendorMap.get(t.merchant) || { merchant: t.merchant, total: 0, count: 0, categories: new Set() };
  existing.total += t.amount;
  existing.count++;
  existing.categories.add(t.merchantCategory);
  vendorMap.set(t.merchant, existing);
}

const topVendors = [...vendorMap.values()].sort((a, b) => b.total - a.total).slice(0, 15);

console.log("  Vendor                         Total      Tx     Category");
console.log("  " + "─".repeat(65));
for (const v of topVendors) {
  console.log(`  ${v.merchant.padEnd(30)} ${fmtK(v.total).padStart(9)}  ${String(v.count).padStart(5)}   ${[...v.categories].join(", ")}`);
}

// ═══════════════════════════════════════════════════════════════════════════
// BALANCE SHEET SNAPSHOT
// ═══════════════════════════════════════════════════════════════════════════

const latestBS = xero.balanceSheets[xero.balanceSheets.length - 1];

console.log("\n" + "─".repeat(80));
console.log(`  🏦 BALANCE SHEET (${latestBS.month})`);
console.log("─".repeat(80));

console.log("\n  ASSETS");
console.log(`    Cash & Equivalents     ${fmtK(latestBS.assets.cashAndEquivalents).padStart(12)}`);
console.log(`    Accounts Receivable    ${fmtK(latestBS.assets.accountsReceivable).padStart(12)}`);
console.log(`    Prepaid Expenses       ${fmtK(latestBS.assets.prepaidExpenses).padStart(12)}`);
console.log(`    Fixed Assets           ${fmtK(latestBS.assets.fixedAssets).padStart(12)}`);
console.log(`    ${"─".repeat(35)}`);
console.log(`    Total Assets           ${fmtK(latestBS.assets.totalAssets).padStart(12)}`);

console.log("\n  LIABILITIES");
console.log(`    Accounts Payable       ${fmtK(latestBS.liabilities.accountsPayable).padStart(12)}`);
console.log(`    Accrued Expenses       ${fmtK(latestBS.liabilities.accruedExpenses).padStart(12)}`);
console.log(`    Deferred Revenue       ${fmtK(latestBS.liabilities.deferredRevenue).padStart(12)}`);
console.log(`    ${"─".repeat(35)}`);
console.log(`    Total Liabilities      ${fmtK(latestBS.liabilities.totalLiabilities).padStart(12)}`);

console.log("\n  EQUITY");
console.log(`    Common Stock           ${fmtK(latestBS.equity.commonStock).padStart(12)}`);
console.log(`    Paid-In Capital        ${fmtK(latestBS.equity.additionalPaidInCapital).padStart(12)}`);
console.log(`    Retained Earnings      ${fmtK(latestBS.equity.retainedEarnings).padStart(12)}`);
console.log(`    ${"─".repeat(35)}`);
console.log(`    Total Equity           ${fmtK(latestBS.equity.totalEquity).padStart(12)}`);

console.log(`\n    Total L&E              ${fmtK(latestBS.totalLiabilitiesAndEquity).padStart(12)}`);

// ═══════════════════════════════════════════════════════════════════════════
// SUMMARY
// ═══════════════════════════════════════════════════════════════════════════

console.log("\n\n" + "═".repeat(80));
console.log("  FINANCE JARVIS — EXECUTIVE SUMMARY");
console.log("═".repeat(80));

const criticalCount = analysis.insights.filter((i) => i.severity === "critical").length;
const warningCount = analysis.insights.filter((i) => i.severity === "warning").length;

console.log(`\n  📊 Data Processed: ${xero.monthlyPnL.length} months Xero + ${volopay.transactions.length} Volopay transactions`);
console.log(`  🧠 Insights Generated: ${analysis.insights.length} (${criticalCount} critical, ${warningCount} warnings)`);
console.log(`  🔮 Forecast Horizon: 6 months forward`);
console.log(`  🧬 Causal Links: ${analysis.causalRelationships.length} relationships discovered`);
console.log(`  ⏳ Runway: ${analysis.runwayProjections[1].runwayMonths} months (base case)`);

if (criticalCount > 0) {
  console.log(`\n  🚨 CRITICAL ACTIONS NEEDED:`);
  for (const i of analysis.insights.filter((i) => i.severity === "critical")) {
    console.log(`     → ${i.title}: ${i.recommendation.split(".")[0]}.`);
  }
}

console.log("\n" + "═".repeat(80));
console.log("  Generated at: " + new Date().toISOString());
console.log("  Powered by NexusBrain Causal Intelligence Engine");
console.log("═".repeat(80) + "\n");
