/**
 * Finance Jarvis Copilot — REAL PIPELINE RUN (v2)
 *
 * Does EXACTLY what /api/finance-jarvis/chat does:
 * 1. Generate brain data (Xero + Volopay + Analysis + Report Sections)
 * 2. Build the identical system prompt (with structured output template)
 * 3. Send to Claude Sonnet with user's question
 * 4. Print raw response — no editing
 */

import { generateXeroData } from "../platform/lib/finance-jarvis/synthetic-xero";
import { generateVolopayData } from "../platform/lib/finance-jarvis/synthetic-volopay";
import { analyzeFinanceData } from "../platform/lib/finance-jarvis/brain-analyzer";
import Anthropic from "@anthropic-ai/sdk";
import * as fs from "fs";

// Manual env loading (no dotenv dependency)
const envPath = process.cwd() + "/.env";
const envContent = fs.readFileSync(envPath, "utf-8");
for (const line of envContent.split("\n")) {
  const match = line.match(/^([A-Z_]+)=(.+)$/);
  if (match) process.env[match[1]] = match[2].trim();
}

const USER_QUESTION = process.argv[2] || "Show me insights on overspending, unusual expenses, anticipated insights where we are spending more and need to reduce, and give forecasts.";

console.log("═".repeat(80));
console.log("  FINANCE JARVIS COPILOT v2 — REAL PIPELINE RUN");
console.log("  Exact same behavior as /api/finance-jarvis/chat");
console.log("═".repeat(80));
console.log(`\n  User Question: "${USER_QUESTION}"\n`);
console.log("  Step 1: Generating brain data (with report sections)...");

const startDate = new Date();
startDate.setFullYear(startDate.getFullYear() - 1);

const xero = generateXeroData(startDate);
const volopay = generateVolopayData(startDate);
const analysis = analyzeFinanceData(xero, volopay);

const completedTx = volopay.transactions.filter(t => t.status === "COMPLETED").length;
console.log(`  Done (${xero.monthlyPnL.length} months, ${completedTx} volopay tx, ${analysis.reportSections.overspending.items.length} overspend areas, ${analysis.reportSections.anomalies.totalFlaggedCount} flagged tx)`);
console.log("  Step 2: Building system prompt v2 (with structured output template)...");

// ─── BUILD SYSTEM PROMPT (EXACT COPY FROM chat/route.ts) ───────────────

const kpis = analysis.kpis;
const topInsights = analysis.insights.slice(0, 8);
const latestPnL = xero.monthlyPnL[xero.monthlyPnL.length - 1];
const latestBS = xero.balanceSheets[xero.balanceSheets.length - 1];
const rs = analysis.reportSections;

const systemPrompt = `You are Finance Jarvis — an AI CFO copilot for a Series A SaaS company. You analyze REAL financial data from Xero (accounting) and Volopay (corporate cards). The NexusBrain engine has pre-computed all analysis below. Your job is to PRESENT this data clearly — never invent numbers.

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
OUTPUT FORMAT — Follow this EXACT structure for financial analysis questions
═══════════════════════════════════════════════════════════════════════

When the user asks about overspending, insights, forecasts, or general financial analysis, you MUST structure your response using ALL of these sections IN THIS ORDER. Use the pre-computed report sections above as your primary data source — do not invent or extrapolate beyond what the brain has computed.

**REQUIRED OUTPUT TEMPLATE:**

# Finance Jarvis — CFO Intelligence Report

## 🔴 OVERSPENDING — WHERE WE'RE BLEEDING
- Present each overspending item from the OVERSPENDING DATA section above
- For EACH item show: the area, current spend, benchmark, overage amount, and % over
- Cross-reference Xero P&L categories with Volopay card department data
- Show a markdown table with columns: Area | Current | Benchmark | Over By | % Over

## 🚩 UNUSUAL EXPENSES — ANOMALIES THE BRAIN FLAGGED
- Present flagged transaction count and total amount from ANOMALY DATA
- Show missing receipt stats
- Present department breakdown as a markdown table: Department | Flagged Count | Flagged Amount | Top Reasons
- Highlight the highest-risk departments

## ⚠️ ANTICIPATED RISKS — WHAT THE BRAIN SEES COMING
- Present each risk from RISK DATA with probability tag
- Include the scenario analysis table: Scenario | Runway | Monthly Burn | Outcome
- Specifically call out cash runway risk, revenue deceleration, and AR risk if present

## ✂️ WHERE TO CUT — BRAIN'S RECOMMENDATIONS
Present actions grouped by timeline from ACTION ITEMS data:
**🚨 IMMEDIATE (This Week):**
- Each immediate action with savings and owner

**📅 SHORT-TERM (This Quarter):**
- Each short-term action with savings and owner

**🔮 MEDIUM-TERM (3-6 Months):**
- Each medium-term action with savings and owner

End with: **Total potential savings: [amount from data]**

## 📊 FORECAST — THE BRAIN'S 6-MONTH OUTLOOK
- Present cash flow forecast as a markdown table: Month | Inflows | Outflows | Net | Cash Balance | Confidence
- Call out any months where risks are flagged
- Note confidence degradation over time

## 🧬 CAUSAL CHAINS — WHY THIS IS HAPPENING
- Present the burn spiral chains: what's accelerating cash drain
- Present the growth driver chains: what works but costs money
- Explain the TENSION between growth investment and burn control
- For each chain show the effect size percentage

## 📌 BOTTOM LINE
- One paragraph using the brain's verdict from BOTTOM LINE section
- Bold the critical numbers

**CRITICAL RULES:**
1. EVERY number in your response MUST come from the data above — never fabricate
2. Use the pre-computed report sections as your PRIMARY data — they contain the brain's actual analysis
3. Always show exact dollar amounts, percentages, and thresholds
4. Use markdown tables for data-dense sections (at least 3 tables per response)
5. Bold important numbers: **$XXK**, **XX%**, **XX months**
6. If a section has no data (e.g., no overspending items), say "Brain detected no issues in this area"
7. Cross-reference Xero and Volopay data wherever possible (P&L expense vs card spend)
8. For "what if" questions, use the causal chain effect sizes to compute projected impact
9. For trend questions, use the 12-month data and compute growth rates

When the user asks a SPECIFIC question (not a general analysis), answer that question directly using the relevant data sections, but still maintain the same data-driven, numbers-first approach with tables and bold figures.`;

console.log(`  Done (${systemPrompt.length} chars)`);
console.log("  Step 3: Sending to Claude Sonnet (claude-sonnet-4-5-20250929)...\n");
console.log("─".repeat(80));
console.log("  COPILOT RAW RESPONSE:");
console.log("─".repeat(80));
console.log("");

async function run() {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const stream = anthropic.messages.stream({
    model: "claude-sonnet-4-5-20250929",
    max_tokens: 8192,
    system: systemPrompt,
    messages: [{ role: "user", content: USER_QUESTION }],
  });

  for await (const event of stream) {
    if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
      process.stdout.write(event.delta.text);
    }
  }

  console.log("\n\n" + "─".repeat(80));
  console.log("  END OF COPILOT RESPONSE");
  console.log("─".repeat(80));
}

run().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
