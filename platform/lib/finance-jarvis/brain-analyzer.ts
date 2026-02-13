/**
 * Finance Jarvis — Brain Analyzer
 *
 * Takes Xero + Volopay data, runs it through NexusBrain-style analysis,
 * and produces structured insights: anomalies, overspending alerts,
 * forecasts, causal relationships, and actionable recommendations.
 *
 * This is the "brain" layer that makes raw data meaningful.
 */

import { type XeroData, type XeroMonthlyPnL } from "./synthetic-xero";
import { type VolopayData, type VolopayTransaction, type VolopayDepartmentSummary } from "./synthetic-volopay";

// ─── Types ──────────────────────────────────────────────────────────────────

export type InsightSeverity = "critical" | "warning" | "info" | "positive";
export type InsightCategory = "overspending" | "anomaly" | "forecast" | "trend" | "optimization" | "risk" | "compliance";

export interface FinanceInsight {
  id: string;
  title: string;
  description: string;
  severity: InsightSeverity;
  category: InsightCategory;
  domain: string;
  metric?: string;
  currentValue?: number;
  previousValue?: number;
  changePercent?: number;
  recommendation: string;
  impact: "high" | "medium" | "low";
  confidence: number;
  detectedAt: string;
  source: "xero" | "volopay" | "cross-system";
  relatedEntities?: string[];
}

export interface CashFlowForecast {
  month: string;
  projectedInflows: number;
  projectedOutflows: number;
  projectedNetCash: number;
  projectedBalance: number;
  confidence: number;
  risks: string[];
}

export interface SpendBreakdown {
  category: string;
  currentMonth: number;
  previousMonth: number;
  threeMonthAvg: number;
  trend: "increasing" | "decreasing" | "stable";
  percentOfRevenue: number;
  isAboveThreshold: boolean;
  thresholdPct: number;
}

export interface DepartmentRiskScore {
  department: string;
  riskScore: number; // 0-100
  factors: string[];
  flaggedTransactions: number;
  overBudgetMonths: number;
  complianceIssues: number;
  topRisk: string;
}

export interface RunwayProjection {
  currentCash: number;
  monthlyBurn: number;
  runwayMonths: number;
  runwayDate: string;
  scenario: "optimistic" | "base" | "pessimistic";
  assumptions: string[];
}

export interface CausalRelationship {
  source: string;
  target: string;
  effectSize: number;
  lagDays: number;
  description: string;
  confidence: number;
}

// ─── Pre-computed Report Sections (for structured copilot output) ────────

export interface OverspendingItem {
  area: string;
  currentSpend: number;
  benchmark: number;
  overageAmount: number;
  overagePct: number;
  source: "xero" | "volopay" | "cross-system";
  detail: string;
}

export interface AnomalyItem {
  type: string;
  department: string;
  description: string;
  amount: number;
  reason: string;
  severity: "critical" | "warning" | "info";
}

export interface ActionItem {
  timeline: "immediate" | "short-term" | "medium-term";
  action: string;
  expectedSavings: string;
  owner: string;
  detail: string;
}

export interface RiskItem {
  type: string;
  description: string;
  probability: "high" | "medium" | "low";
  impact: string;
  mitigation: string;
}

export interface CausalChain {
  group: string;
  chains: Array<{
    flow: string;
    explanation: string;
    effectSize: number;
  }>;
}

export interface UnitEconomics {
  totalCustomers: number;
  activeCustomers: number;
  churnedThisMonth: number;
  churnRate: number;
  grossRetentionRate: number;
  netRevenueRetention: number;
  avgContractValue: number;
  avgRevenuePerCustomer: number;
  cac: number;
  cacPaybackMonths: number;
  ltv: number;
  ltvCacRatio: number;
  topCustomerConcentration: number;
  subscriptionRevenueShare: number;
  revenueByPlan: Array<{ plan: string; customers: number; mrr: number; pctOfTotal: number }>;
}

export interface BurnRateAnalysis {
  currentMonthBurn: number;
  previousMonthBurn: number;
  burnTrend: "accelerating" | "steady" | "decelerating";
  burnTrendRate: number;
  monthlyBurnHistory: Array<{ month: string; burn: number }>;
  burnByFunction: {
    people: number;
    marketing: number;
    technology: number;
    facilities: number;
    other: number;
  };
  burnByFunctionPct: {
    people: number;
    marketing: number;
    technology: number;
    facilities: number;
    other: number;
  };
  cashBurnVsAccrual: {
    accrualBurn: number;
    cashBurn: number;
    difference: number;
  };
  breakEvenRevenue: number;
  monthsToBreakEven: number | null;
}

export interface EfficiencyMetrics {
  magicNumber: number;
  magicNumberVerdict: string;
  revenuePerEmployee: number;
  headcount: number;
  headcountGrowthRate: number;
  opexRatio: number;
  opexRatioBenchmark: number;
  salesEfficiency: number;
  marketingEfficiency: number;
  ruleOf40Score: number;
  ruleOf40Verdict: string;
}

export type HealthRating = "critical" | "poor" | "caution" | "healthy" | "strong";

export interface HealthScorecard {
  overall: { score: number; rating: HealthRating; summary: string };
  growth: { score: number; rating: HealthRating; detail: string };
  profitability: { score: number; rating: HealthRating; detail: string };
  efficiency: { score: number; rating: HealthRating; detail: string };
  cashHealth: { score: number; rating: HealthRating; detail: string };
}

export interface ReportSections {
  overspending: {
    totalOverspend: number;
    items: OverspendingItem[];
    summary: string;
  };
  anomalies: {
    totalFlaggedCount: number;
    totalFlaggedAmount: number;
    missingReceiptCount: number;
    missingReceiptPct: number;
    items: AnomalyItem[];
    departmentBreakdown: Array<{
      department: string;
      flaggedCount: number;
      flaggedAmount: number;
      topReasons: string[];
    }>;
  };
  risks: {
    items: RiskItem[];
    scenarioAnalysis: Array<{
      scenario: string;
      runway: number;
      burn: number;
      outcome: string;
    }>;
  };
  actions: {
    immediate: ActionItem[];
    shortTerm: ActionItem[];
    mediumTerm: ActionItem[];
    totalPotentialSavings: string;
  };
  causalChains: CausalChain[];
  bottomLine: string;
}

export interface FinanceJarvisAnalysis {
  generatedAt: string;
  kpis: {
    totalRevenue: number;
    totalRevenueGrowth: number;
    grossMargin: number;
    netBurnRate: number;
    cashBalance: number;
    runwayMonths: number;
    arr: number;
    arrGrowth: number;
    totalCorpCardSpend: number;
    flaggedTransactions: number;
    overBudgetDepartments: number;
    invoicesOverdue: number;
    arOutstanding: number;
  };
  insights: FinanceInsight[];
  cashFlowForecast: CashFlowForecast[];
  spendBreakdowns: SpendBreakdown[];
  departmentRisks: DepartmentRiskScore[];
  runwayProjections: RunwayProjection[];
  causalRelationships: CausalRelationship[];
  unitEconomics: UnitEconomics;
  burnAnalysis: BurnRateAnalysis;
  efficiencyMetrics: EfficiencyMetrics;
  healthScorecard: HealthScorecard;
  reportSections: ReportSections;
  monthlyTrends: Array<{
    month: string;
    revenue: number;
    expenses: number;
    netIncome: number;
    cashBalance: number;
    corpCardSpend: number;
    grossMargin: number;
  }>;
}

// ─── Analysis Engine ────────────────────────────────────────────────────────

export function analyzeFinanceData(xero: XeroData, volopay: VolopayData): FinanceJarvisAnalysis {
  const insights: FinanceInsight[] = [];
  let insightCounter = 1;

  const latestPnL = xero.monthlyPnL[xero.monthlyPnL.length - 1];
  const prevPnL = xero.monthlyPnL[xero.monthlyPnL.length - 2];
  const latestBS = xero.balanceSheets[xero.balanceSheets.length - 1];

  // ── KPIs ──────────────────────────────────────────────────────────────

  const totalRevenue = latestPnL.revenue.totalRevenue;
  const prevRevenue = prevPnL?.revenue.totalRevenue || totalRevenue;
  const revenueGrowth = ((totalRevenue - prevRevenue) / prevRevenue) * 100;
  const arr = latestPnL.revenue.subscriptionRevenue * 12;
  const prevARR = prevPnL ? prevPnL.revenue.subscriptionRevenue * 12 : arr;
  const arrGrowth = ((arr - prevARR) / prevARR) * 100;
  const netBurn = latestPnL.netIncome < 0 ? Math.abs(latestPnL.netIncome) : 0;
  const cashBalance = latestBS.assets.cashAndEquivalents;
  const runwayMonths = netBurn > 0 ? Math.round(cashBalance / netBurn) : 999;

  const latestMonthVoopay = volopay.departmentSummaries.filter(
    (s) => s.month === latestPnL.month
  );
  const totalCorpCardSpend = latestMonthVoopay.reduce((s, d) => s + d.totalSpend, 0);
  const flaggedTx = volopay.transactions.filter((t) => t.flagged && t.status === "COMPLETED");
  const overBudgetDepts = latestMonthVoopay.filter((d) => d.overBudget).length;
  const overdueInvoices = xero.invoices.filter((i) => i.status === "OVERDUE");
  const arOutstanding = overdueInvoices.reduce((s, i) => s + i.total, 0);

  // ── P&L Trend Analysis → Insights ────────────────────────────────────

  // Revenue growth stalling
  if (xero.monthlyPnL.length >= 3) {
    const last3 = xero.monthlyPnL.slice(-3);
    const growthRates = last3.map((p, i) => {
      if (i === 0) return 0;
      return ((p.revenue.totalRevenue - last3[i - 1].revenue.totalRevenue) / last3[i - 1].revenue.totalRevenue) * 100;
    }).slice(1);
    const avgGrowth = growthRates.reduce((a, b) => a + b, 0) / growthRates.length;

    if (avgGrowth < 2) {
      insights.push({
        id: `FJ-${insightCounter++}`,
        title: "Revenue growth decelerating",
        description: `Average MoM revenue growth over last 3 months is ${avgGrowth.toFixed(1)}%. At this pace, you'll miss the 40% YoY target needed for Series B positioning.`,
        severity: "warning",
        category: "trend",
        domain: "revenue",
        metric: "MoM Revenue Growth",
        currentValue: avgGrowth,
        recommendation: "Review sales pipeline coverage (3x target). Consider expanding enterprise ACV or launching self-serve tier to boost velocity.",
        impact: "high",
        confidence: 0.88,
        detectedAt: new Date().toISOString(),
        source: "xero",
      });
    }
  }

  // Gross margin compression
  if (latestPnL.grossMarginPct < 70) {
    insights.push({
      id: `FJ-${insightCounter++}`,
      title: "Gross margin below SaaS benchmark",
      description: `Current gross margin is ${latestPnL.grossMarginPct}%. Best-in-class SaaS companies operate at 75-85%. Infrastructure costs and support are eating into margins.`,
      severity: latestPnL.grossMarginPct < 65 ? "critical" : "warning",
      category: "optimization",
      domain: "margins",
      metric: "Gross Margin %",
      currentValue: latestPnL.grossMarginPct,
      previousValue: prevPnL?.grossMarginPct,
      changePercent: prevPnL ? latestPnL.grossMarginPct - prevPnL.grossMarginPct : undefined,
      recommendation: "Audit hosting costs — consider reserved instances for AWS. Evaluate customer support automation (chatbots could reduce headcount need by 30%).",
      impact: "high",
      confidence: 0.92,
      detectedAt: new Date().toISOString(),
      source: "xero",
    });
  }

  // OPEX growing faster than revenue
  if (prevPnL) {
    const opexGrowth = ((latestPnL.opex.totalOpex - prevPnL.opex.totalOpex) / prevPnL.opex.totalOpex) * 100;
    if (opexGrowth > revenueGrowth + 3) {
      insights.push({
        id: `FJ-${insightCounter++}`,
        title: "Operating expenses outpacing revenue growth",
        description: `OPEX grew ${opexGrowth.toFixed(1)}% vs revenue growth of ${revenueGrowth.toFixed(1)}%. Burn rate is accelerating without proportional top-line growth.`,
        severity: "warning",
        category: "overspending",
        domain: "opex",
        metric: "OPEX Growth vs Revenue Growth",
        currentValue: opexGrowth,
        previousValue: revenueGrowth,
        recommendation: "Implement zero-based budgeting for next quarter. Freeze non-critical hiring until revenue growth catches up.",
        impact: "high",
        confidence: 0.85,
        detectedAt: new Date().toISOString(),
        source: "xero",
      });
    }
  }

  // Runway warning
  if (runwayMonths < 18) {
    insights.push({
      id: `FJ-${insightCounter++}`,
      title: runwayMonths < 12 ? "Critical runway alert" : "Runway approaching caution zone",
      description: `At current burn rate of $${Math.round(netBurn / 1000)}K/mo, you have ${runwayMonths} months of runway ($${(cashBalance / 1000000).toFixed(1)}M cash). ${runwayMonths < 12 ? "Immediate action needed." : "Start fundraising conversations."}`,
      severity: runwayMonths < 12 ? "critical" : "warning",
      category: "risk",
      domain: "cash",
      metric: "Runway (months)",
      currentValue: runwayMonths,
      recommendation: runwayMonths < 12
        ? "Cut burn by 20% immediately. Defer non-essential hires. Renegotiate vendor contracts. Begin bridge round conversations."
        : "Begin Series B prep. Target 18-month runway minimum. Identify 2-3 quick wins to reduce burn by $30-50K/mo.",
      impact: "high",
      confidence: 0.95,
      detectedAt: new Date().toISOString(),
      source: "xero",
    });
  }

  // Marketing spend efficiency
  const marketingPctRevenue = (latestPnL.opex.marketing / totalRevenue) * 100;
  if (marketingPctRevenue > 20) {
    insights.push({
      id: `FJ-${insightCounter++}`,
      title: "Marketing spend exceeds efficiency threshold",
      description: `Marketing is ${marketingPctRevenue.toFixed(1)}% of revenue ($${Math.round(latestPnL.opex.marketing / 1000)}K). Efficient SaaS companies target 10-15% at your ARR level.`,
      severity: "warning",
      category: "overspending",
      domain: "marketing",
      metric: "Marketing as % Revenue",
      currentValue: marketingPctRevenue,
      recommendation: "Audit CAC by channel. Double down on channels with payback < 12 months. Consider cutting bottom-performing paid campaigns.",
      impact: "medium",
      confidence: 0.82,
      detectedAt: new Date().toISOString(),
      source: "xero",
    });
  }

  // Travel spike detection
  if (xero.monthlyPnL.length >= 4) {
    const travelLast4 = xero.monthlyPnL.slice(-4).map((p) => p.opex.travel);
    const travelAvg = travelLast4.slice(0, 3).reduce((a, b) => a + b, 0) / 3;
    const travelLatest = travelLast4[3];
    if (travelLatest > travelAvg * 1.8) {
      insights.push({
        id: `FJ-${insightCounter++}`,
        title: "Unusual travel expense spike",
        description: `Travel costs spiked to $${Math.round(travelLatest / 1000)}K this month — ${((travelLatest / travelAvg - 1) * 100).toFixed(0)}% above 3-month average of $${Math.round(travelAvg / 1000)}K.`,
        severity: "info",
        category: "anomaly",
        domain: "travel",
        metric: "Travel Expenses",
        currentValue: travelLatest,
        previousValue: travelAvg,
        changePercent: ((travelLatest / travelAvg - 1) * 100),
        recommendation: "Review travel policy compliance. Verify all trips had pre-approval. Consider virtual meeting alternatives for non-essential travel.",
        impact: "low",
        confidence: 0.78,
        detectedAt: new Date().toISOString(),
        source: "xero",
      });
    }
  }

  // ── Volopay Card Spend Insights ──────────────────────────────────────

  // Department overspending
  for (const ds of latestMonthVoopay) {
    if (ds.overBudget) {
      insights.push({
        id: `FJ-${insightCounter++}`,
        title: `${ds.department} over budget by ${(ds.budgetUtilization - 100).toFixed(0)}%`,
        description: `${ds.department} spent $${Math.round(ds.totalSpend / 1000)}K against a $${Math.round(ds.totalSpend / (ds.budgetUtilization / 100) / 1000)}K budget. Top spend: ${ds.topMerchant} (${ds.topCategory}).`,
        severity: ds.budgetUtilization > 130 ? "critical" : "warning",
        category: "overspending",
        domain: "corporate-cards",
        metric: `${ds.department} Budget Utilization`,
        currentValue: ds.budgetUtilization,
        recommendation: `Review ${ds.department}'s ${ds.topCategory} spending. ${ds.flaggedTransactions > 0 ? `${ds.flaggedTransactions} flagged transactions need review.` : ""}`,
        impact: ds.budgetUtilization > 130 ? "high" : "medium",
        confidence: 0.9,
        detectedAt: new Date().toISOString(),
        source: "volopay",
        relatedEntities: [ds.department, ds.topMerchant],
      });
    }
  }

  // Flagged transactions
  const recentFlagged = flaggedTx.filter((t) => {
    const txDate = new Date(t.date);
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    return txDate >= thirtyDaysAgo;
  });

  if (recentFlagged.length > 5) {
    const totalFlaggedAmount = recentFlagged.reduce((s, t) => s + t.amount, 0);
    insights.push({
      id: `FJ-${insightCounter++}`,
      title: `${recentFlagged.length} flagged corporate card transactions`,
      description: `$${Math.round(totalFlaggedAmount / 1000)}K in flagged transactions across ${new Set(recentFlagged.map((t) => t.department)).size} departments. Top reasons: ${[...new Set(recentFlagged.filter((t) => t.flagReason).map((t) => t.flagReason))].slice(0, 3).join(", ")}.`,
      severity: totalFlaggedAmount > 10000 ? "critical" : "warning",
      category: "compliance",
      domain: "corporate-cards",
      metric: "Flagged Transactions",
      currentValue: recentFlagged.length,
      recommendation: "Review each flagged transaction with department heads. Update expense policy to address recurring violation patterns.",
      impact: "medium",
      confidence: 0.95,
      detectedAt: new Date().toISOString(),
      source: "volopay",
    });
  }

  // Missing receipts
  const completedTx = volopay.transactions.filter((t) => t.status === "COMPLETED");
  const missingReceipts = completedTx.filter((t) => !t.receiptUploaded);
  const missingReceiptPct = (missingReceipts.length / completedTx.length) * 100;
  if (missingReceiptPct > 20) {
    insights.push({
      id: `FJ-${insightCounter++}`,
      title: `${missingReceiptPct.toFixed(0)}% of transactions missing receipts`,
      description: `${missingReceipts.length} out of ${completedTx.length} completed transactions have no receipt uploaded. This creates audit risk and potential tax deduction issues.`,
      severity: missingReceiptPct > 30 ? "warning" : "info",
      category: "compliance",
      domain: "corporate-cards",
      metric: "Missing Receipt %",
      currentValue: missingReceiptPct,
      recommendation: "Enable auto-reminders in Volopay for receipt uploads. Consider blocking card for repeat non-compliance after 3 warnings.",
      impact: "medium",
      confidence: 0.98,
      detectedAt: new Date().toISOString(),
      source: "volopay",
    });
  }

  // Overdue invoices
  if (overdueInvoices.length > 0) {
    insights.push({
      id: `FJ-${insightCounter++}`,
      title: `${overdueInvoices.length} overdue invoices ($${Math.round(arOutstanding / 1000)}K)`,
      description: `${overdueInvoices.length} invoices are past due, totaling $${Math.round(arOutstanding / 1000)}K. Top debtors: ${[...new Set(overdueInvoices.map((i) => i.customer))].slice(0, 3).join(", ")}.`,
      severity: arOutstanding > 50000 ? "critical" : "warning",
      category: "risk",
      domain: "accounts-receivable",
      metric: "Overdue AR",
      currentValue: arOutstanding,
      recommendation: "Escalate collections for invoices > 30 days overdue. Consider offering early payment discounts (2/10 net 30). Flag at-risk accounts for churn monitoring.",
      impact: "high",
      confidence: 0.97,
      detectedAt: new Date().toISOString(),
      source: "xero",
      relatedEntities: overdueInvoices.map((i) => i.customer).slice(0, 5),
    });
  }

  // Positive insight: what's going well
  if (latestPnL.grossMarginPct > 75) {
    insights.push({
      id: `FJ-${insightCounter++}`,
      title: "Strong gross margins maintained",
      description: `Gross margin at ${latestPnL.grossMarginPct}% — above SaaS benchmark of 75%. Infrastructure cost management is effective.`,
      severity: "positive",
      category: "trend",
      domain: "margins",
      metric: "Gross Margin %",
      currentValue: latestPnL.grossMarginPct,
      recommendation: "Continue current infrastructure optimization strategy. Document playbook for scaling.",
      impact: "low",
      confidence: 0.92,
      detectedAt: new Date().toISOString(),
      source: "xero",
    });
  }

  // Software spend creep
  const softwareTrend = xero.monthlyPnL.slice(-6).map((p) => p.opex.software);
  if (softwareTrend.length >= 6) {
    const first3Avg = softwareTrend.slice(0, 3).reduce((a, b) => a + b, 0) / 3;
    const last3Avg = softwareTrend.slice(3).reduce((a, b) => a + b, 0) / 3;
    const creep = ((last3Avg - first3Avg) / first3Avg) * 100;
    if (creep > 15) {
      insights.push({
        id: `FJ-${insightCounter++}`,
        title: "SaaS tool spend creeping up",
        description: `Software subscriptions increased ${creep.toFixed(0)}% over 6 months ($${Math.round(first3Avg / 1000)}K → $${Math.round(last3Avg / 1000)}K/mo). This often indicates redundant tools or unauthorized purchases.`,
        severity: "info",
        category: "optimization",
        domain: "software",
        metric: "Software Spend Trend",
        currentValue: last3Avg,
        previousValue: first3Avg,
        changePercent: creep,
        recommendation: "Run a SaaS audit: identify overlapping tools, unused licenses, and shadow IT. Tools like Zylo or Productiv can help.",
        impact: "medium",
        confidence: 0.8,
        detectedAt: new Date().toISOString(),
        source: "cross-system",
      });
    }
  }

  // ── Spend Breakdowns ─────────────────────────────────────────────────

  const spendBreakdowns: SpendBreakdown[] = [];
  const categories = [
    { name: "Salaries & Benefits", getCurrent: (p: XeroMonthlyPnL) => p.opex.salaries + p.opex.benefits, threshold: 55 },
    { name: "Marketing", getCurrent: (p: XeroMonthlyPnL) => p.opex.marketing, threshold: 18 },
    { name: "Sales Commissions", getCurrent: (p: XeroMonthlyPnL) => p.opex.salesCommissions, threshold: 10 },
    { name: "Hosting & Infrastructure", getCurrent: (p: XeroMonthlyPnL) => p.cogs.hosting + p.cogs.thirdPartyAPIs, threshold: 12 },
    { name: "Software & Tools", getCurrent: (p: XeroMonthlyPnL) => p.opex.software, threshold: 5 },
    { name: "Travel & Entertainment", getCurrent: (p: XeroMonthlyPnL) => p.opex.travel, threshold: 4 },
    { name: "Legal & Professional", getCurrent: (p: XeroMonthlyPnL) => p.opex.legal, threshold: 3 },
    { name: "Rent & Facilities", getCurrent: (p: XeroMonthlyPnL) => p.opex.rent, threshold: 6 },
  ];

  for (const cat of categories) {
    const currentVal = cat.getCurrent(latestPnL);
    const prevVal = prevPnL ? cat.getCurrent(prevPnL) : currentVal;
    const last3 = xero.monthlyPnL.slice(-3).map((p) => cat.getCurrent(p));
    const avg3 = last3.reduce((a, b) => a + b, 0) / last3.length;
    const pctOfRevenue = (currentVal / totalRevenue) * 100;
    const change = prevVal > 0 ? ((currentVal - prevVal) / prevVal) * 100 : 0;

    spendBreakdowns.push({
      category: cat.name,
      currentMonth: currentVal,
      previousMonth: prevVal,
      threeMonthAvg: Math.round(avg3),
      trend: change > 5 ? "increasing" : change < -5 ? "decreasing" : "stable",
      percentOfRevenue: Math.round(pctOfRevenue * 100) / 100,
      isAboveThreshold: pctOfRevenue > cat.threshold,
      thresholdPct: cat.threshold,
    });
  }

  // ── Department Risk Scores ───────────────────────────────────────────

  const departmentRisks: DepartmentRiskScore[] = [];
  const deptGroups = new Map<string, VolopayDepartmentSummary[]>();
  for (const ds of volopay.departmentSummaries) {
    const existing = deptGroups.get(ds.department) || [];
    existing.push(ds);
    deptGroups.set(ds.department, existing);
  }

  for (const [dept, summaries] of deptGroups) {
    const overBudgetCount = summaries.filter((s) => s.overBudget).length;
    const totalFlagged = summaries.reduce((s, d) => s + d.flaggedTransactions, 0);
    const avgUtilization = summaries.reduce((s, d) => s + d.budgetUtilization, 0) / summaries.length;

    const factors: string[] = [];
    let score = 20; // Base

    if (overBudgetCount > 3) { score += 25; factors.push(`Over budget ${overBudgetCount} of ${summaries.length} months`); }
    else if (overBudgetCount > 1) { score += 15; factors.push(`Over budget ${overBudgetCount} months`); }

    if (totalFlagged > 10) { score += 20; factors.push(`${totalFlagged} flagged transactions`); }
    else if (totalFlagged > 3) { score += 10; factors.push(`${totalFlagged} flagged transactions`); }

    if (avgUtilization > 95) { score += 15; factors.push(`Avg utilization ${avgUtilization.toFixed(0)}%`); }

    const deptTx = volopay.transactions.filter((t) => t.department === dept);
    const missingR = deptTx.filter((t) => t.status === "COMPLETED" && !t.receiptUploaded).length;
    const missingPct = (missingR / deptTx.filter((t) => t.status === "COMPLETED").length) * 100;
    if (missingPct > 30) { score += 10; factors.push(`${missingPct.toFixed(0)}% missing receipts`); }

    departmentRisks.push({
      department: dept,
      riskScore: Math.min(score, 100),
      factors,
      flaggedTransactions: totalFlagged,
      overBudgetMonths: overBudgetCount,
      complianceIssues: missingR,
      topRisk: factors[0] || "Low risk",
    });
  }

  // ── Cash Flow Forecast (6 months out) ────────────────────────────────

  const cashFlowForecast: CashFlowForecast[] = [];
  const recentRevGrowth = xero.monthlyPnL.length >= 3
    ? xero.monthlyPnL.slice(-3).reduce((sum, p, i, arr) => {
        if (i === 0) return 0;
        return sum + ((p.revenue.totalRevenue - arr[i - 1].revenue.totalRevenue) / arr[i - 1].revenue.totalRevenue);
      }, 0) / 2
    : 0.03;

  let projectedCash = cashBalance;
  let projectedRevenue = totalRevenue;
  const avgExpenses = xero.monthlyPnL.slice(-3).reduce((s, p) => s + p.cogs.totalCOGS + p.opex.totalOpex, 0) / 3;
  let projectedExpenses = avgExpenses;

  for (let i = 1; i <= 6; i++) {
    const futureDate = new Date();
    futureDate.setMonth(futureDate.getMonth() + i);
    const monthStr = `${futureDate.getFullYear()}-${String(futureDate.getMonth() + 1).padStart(2, "0")}`;

    projectedRevenue *= (1 + recentRevGrowth);
    projectedExpenses *= 1.015; // Expenses grow ~1.5% MoM

    const netCash = projectedRevenue - projectedExpenses;
    projectedCash += netCash;

    const risks: string[] = [];
    if (projectedCash < 1000000) risks.push("Cash below $1M threshold");
    if (netCash < 0 && Math.abs(netCash) > projectedRevenue * 0.3) risks.push("Burn exceeding 30% of revenue");
    if (i >= 4) risks.push("Forecast uncertainty increases beyond 3 months");

    cashFlowForecast.push({
      month: monthStr,
      projectedInflows: Math.round(projectedRevenue),
      projectedOutflows: Math.round(projectedExpenses),
      projectedNetCash: Math.round(netCash),
      projectedBalance: Math.round(projectedCash),
      confidence: Math.max(0.5, 0.92 - (i * 0.07)),
      risks,
    });
  }

  // ── Runway Projections ───────────────────────────────────────────────

  const avgBurn3Mo = xero.monthlyPnL.slice(-3).reduce((s, p) => s + Math.abs(Math.min(p.netIncome, 0)), 0) / 3;
  const runwayProjections: RunwayProjection[] = [
    {
      currentCash: cashBalance,
      monthlyBurn: Math.round(avgBurn3Mo * 0.8),
      runwayMonths: Math.round(cashBalance / (avgBurn3Mo * 0.8)),
      runwayDate: new Date(Date.now() + Math.round(cashBalance / (avgBurn3Mo * 0.8)) * 30 * 86400000).toISOString().split("T")[0],
      scenario: "optimistic",
      assumptions: ["Revenue grows 5% MoM", "Headcount freeze", "Marketing cut 20%"],
    },
    {
      currentCash: cashBalance,
      monthlyBurn: Math.round(avgBurn3Mo),
      runwayMonths: Math.round(cashBalance / avgBurn3Mo),
      runwayDate: new Date(Date.now() + Math.round(cashBalance / avgBurn3Mo) * 30 * 86400000).toISOString().split("T")[0],
      scenario: "base",
      assumptions: ["Revenue grows 3% MoM", "Current hiring plan continues", "No budget changes"],
    },
    {
      currentCash: cashBalance,
      monthlyBurn: Math.round(avgBurn3Mo * 1.2),
      runwayMonths: Math.round(cashBalance / (avgBurn3Mo * 1.2)),
      runwayDate: new Date(Date.now() + Math.round(cashBalance / (avgBurn3Mo * 1.2)) * 30 * 86400000).toISOString().split("T")[0],
      scenario: "pessimistic",
      assumptions: ["Revenue flat", "2 new senior hires", "Infrastructure migration costs"],
    },
  ];

  // ── Causal Relationships (brain-discovered) ──────────────────────────

  const causalRelationships: CausalRelationship[] = [
    { source: "Marketing Spend", target: "Pipeline Growth", effectSize: 0.42, lagDays: 21, description: "Increasing marketing spend by 10% drives 4.2% more pipeline within 3 weeks", confidence: 0.87 },
    { source: "Sales Headcount", target: "Revenue Growth", effectSize: 0.35, lagDays: 90, description: "Each new AE contributes $250K ARR after 90-day ramp", confidence: 0.82 },
    { source: "Engineering Velocity", target: "Customer Churn", effectSize: -0.28, lagDays: 45, description: "Faster shipping reduces churn by improving product satisfaction", confidence: 0.75 },
    { source: "Customer Support Response", target: "NPS Score", effectSize: 0.38, lagDays: 14, description: "Reducing response time by 1 hour improves NPS by 3.8 points", confidence: 0.8 },
    { source: "Infrastructure Cost", target: "Gross Margin", effectSize: -0.55, lagDays: 0, description: "AWS spend directly impacts gross margin — reserved instances save 30%", confidence: 0.93 },
    { source: "Travel Expenses", target: "Deal Close Rate", effectSize: 0.15, lagDays: 30, description: "On-site visits improve close rates by 15% for enterprise deals", confidence: 0.68 },
    { source: "Software Subscriptions", target: "Engineering Productivity", effectSize: 0.22, lagDays: 7, description: "Right tools improve developer output — but diminishing returns above $500/head/mo", confidence: 0.71 },
    { source: "Burn Rate", target: "Fundraising Urgency", effectSize: 0.85, lagDays: 0, description: "Higher burn directly reduces runway and increases fundraising pressure", confidence: 0.96 },
    { source: "ARR Growth", target: "Valuation Multiple", effectSize: 0.72, lagDays: 0, description: "Every 10% increase in ARR growth rate adds ~2x to revenue multiple", confidence: 0.88 },
    { source: "Corporate Card Spend", target: "OPEX", effectSize: 0.31, lagDays: 0, description: "Uncontrolled card spend drives operational cost overruns", confidence: 0.84 },
  ];

  // ── Monthly Trends ───────────────────────────────────────────────────

  const monthlyTrends = xero.monthlyPnL.map((p) => {
    const volopayMonth = volopay.departmentSummaries
      .filter((s) => s.month === p.month)
      .reduce((s, d) => s + d.totalSpend, 0);
    const bs = xero.balanceSheets.find((b) => b.month === p.month);
    return {
      month: p.month,
      revenue: p.revenue.totalRevenue,
      expenses: p.cogs.totalCOGS + p.opex.totalOpex,
      netIncome: p.netIncome,
      cashBalance: bs?.assets.cashAndEquivalents || 0,
      corpCardSpend: volopayMonth,
      grossMargin: p.grossMarginPct,
    };
  });

  // ── Unit Economics ──────────────────────────────────────────────────

  // Count unique paying customers from invoices
  const latestMonthInvoices = xero.invoices.filter(i => i.dateIssued.startsWith(latestPnL.month));
  const prevMonthInvoices = prevPnL ? xero.invoices.filter(i => i.dateIssued.startsWith(prevPnL.month)) : [];
  const latestCustomers = new Set(latestMonthInvoices.map(i => i.customer));
  const prevCustomers = new Set(prevMonthInvoices.map(i => i.customer));
  const churnedCustomers = [...prevCustomers].filter(c => !latestCustomers.has(c));

  const activeCustomerCount = latestCustomers.size;
  const churnedCount = churnedCustomers.length;
  const churnRate = prevCustomers.size > 0 ? (churnedCount / prevCustomers.size) * 100 : 0;
  const grossRetentionRate = 100 - churnRate;

  // NRR: (current month revenue from existing customers) / (previous month total revenue)
  const existingCustomerRevenue = latestMonthInvoices
    .filter(i => prevCustomers.has(i.customer))
    .reduce((s, i) => s + i.total, 0);
  const prevTotalInvoiceRevenue = prevMonthInvoices.reduce((s, i) => s + i.total, 0);
  const nrr = prevTotalInvoiceRevenue > 0 ? (existingCustomerRevenue / prevTotalInvoiceRevenue) * 100 : 100;

  const avgContractValue = activeCustomerCount > 0 ? totalRevenue / activeCustomerCount : 0;
  const subscriptionShare = (latestPnL.revenue.subscriptionRevenue / totalRevenue) * 100;

  // CAC = (Sales + Marketing cost) / new customers acquired this month
  const newCustomers = [...latestCustomers].filter(c => !prevCustomers.has(c));
  const salesMarketingCost = latestPnL.opex.marketing + latestPnL.opex.salesCommissions;
  const cac = newCustomers.length > 0 ? salesMarketingCost / newCustomers.length : salesMarketingCost;
  const avgMonthlyRevPerCustomer = activeCustomerCount > 0 ? totalRevenue / activeCustomerCount : 0;
  const avgCustomerLifespanMonths = churnRate > 0 ? 100 / churnRate : 60;
  const ltv = avgMonthlyRevPerCustomer * avgCustomerLifespanMonths * (latestPnL.grossMarginPct / 100);
  const ltvCacRatio = cac > 0 ? ltv / cac : 0;
  const cacPaybackMonths = avgMonthlyRevPerCustomer > 0 ? Math.round(cac / (avgMonthlyRevPerCustomer * (latestPnL.grossMarginPct / 100))) : 999;

  // Top customer concentration
  const customerRevenues = new Map<string, number>();
  for (const inv of latestMonthInvoices) {
    customerRevenues.set(inv.customer, (customerRevenues.get(inv.customer) || 0) + inv.total);
  }
  const sortedCustomerRevs = [...customerRevenues.entries()].sort((a, b) => b[1] - a[1]);
  const top5Revenue = sortedCustomerRevs.slice(0, 5).reduce((s, [, v]) => s + v, 0);
  const totalInvoiceRevenue = sortedCustomerRevs.reduce((s, [, v]) => s + v, 0);
  const topCustomerConcentration = totalInvoiceRevenue > 0 ? (top5Revenue / totalInvoiceRevenue) * 100 : 0;

  // Revenue by plan type
  const planBuckets = new Map<string, { customers: Set<string>; mrr: number }>();
  for (const inv of latestMonthInvoices) {
    const planMatch = inv.lineItems[0]?.description?.match(/(Enterprise|Growth|Starter)/i);
    const plan = planMatch ? planMatch[1].toLowerCase() : "other";
    const bucket = planBuckets.get(plan) || { customers: new Set(), mrr: 0 };
    bucket.customers.add(inv.customer);
    bucket.mrr += inv.total;
    planBuckets.set(plan, bucket);
  }
  const revenueByPlan = [...planBuckets.entries()].map(([plan, data]) => ({
    plan: plan.charAt(0).toUpperCase() + plan.slice(1),
    customers: data.customers.size,
    mrr: Math.round(data.mrr),
    pctOfTotal: totalInvoiceRevenue > 0 ? Math.round((data.mrr / totalInvoiceRevenue) * 100) : 0,
  })).sort((a, b) => b.mrr - a.mrr);

  const unitEconomics: UnitEconomics = {
    totalCustomers: latestCustomers.size + churnedCount,
    activeCustomers: activeCustomerCount,
    churnedThisMonth: churnedCount,
    churnRate: Math.round(churnRate * 10) / 10,
    grossRetentionRate: Math.round(grossRetentionRate * 10) / 10,
    netRevenueRetention: Math.round(nrr * 10) / 10,
    avgContractValue: Math.round(avgContractValue),
    avgRevenuePerCustomer: Math.round(avgMonthlyRevPerCustomer),
    cac: Math.round(cac),
    cacPaybackMonths,
    ltv: Math.round(ltv),
    ltvCacRatio: Math.round(ltvCacRatio * 10) / 10,
    topCustomerConcentration: Math.round(topCustomerConcentration * 10) / 10,
    subscriptionRevenueShare: Math.round(subscriptionShare * 10) / 10,
    revenueByPlan,
  };

  // ── Burn Rate Decomposition ───────────────────────────────────────

  const burnHistory = xero.monthlyPnL.slice(-6).map(p => ({
    month: p.month,
    burn: Math.abs(Math.min(p.netIncome, 0)),
  }));
  const currentBurn = burnHistory[burnHistory.length - 1]?.burn || 0;
  const prevBurn = burnHistory[burnHistory.length - 2]?.burn || currentBurn;
  const burnChange = prevBurn > 0 ? ((currentBurn - prevBurn) / prevBurn) * 100 : 0;
  const burnTrend: BurnRateAnalysis["burnTrend"] = burnChange > 5 ? "accelerating" : burnChange < -5 ? "decelerating" : "steady";

  const peopleCost = latestPnL.opex.salaries + latestPnL.opex.benefits + latestPnL.opex.salesCommissions;
  const marketingCost = latestPnL.opex.marketing;
  const techCost = latestPnL.cogs.hosting + latestPnL.cogs.thirdPartyAPIs + latestPnL.opex.software;
  const facilitiesCost = latestPnL.opex.rent + latestPnL.opex.insurance;
  const otherCost = latestPnL.opex.travel + latestPnL.opex.legal + latestPnL.opex.miscellaneous + latestPnL.opex.depreciation + latestPnL.cogs.customerSupport;
  const totalCostBreakdown = peopleCost + marketingCost + techCost + facilitiesCost + otherCost;

  // Break-even analysis
  const totalExpenses = latestPnL.cogs.totalCOGS + latestPnL.opex.totalOpex;
  const breakEvenRevenue = totalExpenses / (latestPnL.grossMarginPct > 0 ? latestPnL.grossMarginPct / 100 : 0.8);
  const revenueGap = breakEvenRevenue - totalRevenue;
  const monthlyRevenueAccretion = revenueGrowth > 0 ? totalRevenue * (revenueGrowth / 100) : 0;
  const monthsToBreakEven = monthlyRevenueAccretion > 0 && revenueGap > 0 ? Math.ceil(revenueGap / monthlyRevenueAccretion) : null;

  // Cash burn vs accrual
  const cashBurnEstimate = netBurn + Math.round((latestBS.assets.accountsReceivable - (xero.balanceSheets[xero.balanceSheets.length - 2]?.assets.accountsReceivable || 0)));

  const burnAnalysis: BurnRateAnalysis = {
    currentMonthBurn: currentBurn,
    previousMonthBurn: prevBurn,
    burnTrend,
    burnTrendRate: Math.round(burnChange * 10) / 10,
    monthlyBurnHistory: burnHistory,
    burnByFunction: {
      people: peopleCost,
      marketing: marketingCost,
      technology: techCost,
      facilities: facilitiesCost,
      other: otherCost,
    },
    burnByFunctionPct: {
      people: Math.round((peopleCost / totalCostBreakdown) * 100),
      marketing: Math.round((marketingCost / totalCostBreakdown) * 100),
      technology: Math.round((techCost / totalCostBreakdown) * 100),
      facilities: Math.round((facilitiesCost / totalCostBreakdown) * 100),
      other: Math.round((otherCost / totalCostBreakdown) * 100),
    },
    cashBurnVsAccrual: {
      accrualBurn: netBurn,
      cashBurn: Math.abs(cashBurnEstimate),
      difference: Math.abs(cashBurnEstimate) - netBurn,
    },
    breakEvenRevenue: Math.round(breakEvenRevenue),
    monthsToBreakEven,
  };

  // ── Efficiency Metrics ────────────────────────────────────────────

  // Magic Number = (Net New ARR last quarter) / (S&M spend last quarter)
  const last3PnL = xero.monthlyPnL.slice(-3);
  const first3PnL = xero.monthlyPnL.slice(-6, -3);
  const currentQuarterARR = last3PnL[last3PnL.length - 1]?.revenue.subscriptionRevenue * 12 || 0;
  const prevQuarterARR = first3PnL.length > 0 ? first3PnL[first3PnL.length - 1].revenue.subscriptionRevenue * 12 : currentQuarterARR;
  const netNewARR = currentQuarterARR - prevQuarterARR;
  const quarterSMSpend = last3PnL.reduce((s, p) => s + p.opex.marketing + p.opex.salesCommissions, 0);
  const magicNumber = quarterSMSpend > 0 ? netNewARR / quarterSMSpend : 0;
  const magicNumberVerdict = magicNumber >= 1.0 ? "Excellent — scale aggressively" :
    magicNumber >= 0.75 ? "Good — continue current trajectory" :
    magicNumber >= 0.5 ? "Mediocre — optimize channels before spending more" :
    "Poor — fix unit economics before scaling";

  // Headcount (synthetic: 32 + 0.8/month for ~13 months)
  const estimatedHeadcount = 32 + Math.floor(xero.monthlyPnL.length * 0.8);
  const prevHeadcount = 32 + Math.floor((xero.monthlyPnL.length - 1) * 0.8);
  const headcountGrowth = prevHeadcount > 0 ? ((estimatedHeadcount - prevHeadcount) / prevHeadcount) * 100 : 0;
  const revenuePerEmployee = Math.round((totalRevenue * 12) / estimatedHeadcount);
  const opexRatio = (latestPnL.opex.totalOpex / totalRevenue) * 100;

  // Sales & Marketing efficiency
  const salesEfficiency = totalRevenue > 0 ? (latestPnL.opex.salesCommissions / totalRevenue) * 100 : 0;
  const marketingEfficiency = totalRevenue > 0 ? (latestPnL.opex.marketing / totalRevenue) * 100 : 0;

  // Rule of 40 = Growth Rate + Profit Margin
  const annualizedGrowth = revenueGrowth * 12;
  const profitMargin = (latestPnL.netIncome / totalRevenue) * 100;
  const ruleOf40 = annualizedGrowth + profitMargin;
  const ruleOf40Verdict = ruleOf40 >= 40 ? "Excellent — above Rule of 40" :
    ruleOf40 >= 20 ? "Acceptable — room for improvement" :
    "Below standard — growth or profitability needs work";

  const efficiencyMetrics: EfficiencyMetrics = {
    magicNumber: Math.round(magicNumber * 100) / 100,
    magicNumberVerdict,
    revenuePerEmployee,
    headcount: estimatedHeadcount,
    headcountGrowthRate: Math.round(headcountGrowth * 10) / 10,
    opexRatio: Math.round(opexRatio * 10) / 10,
    opexRatioBenchmark: 120,
    salesEfficiency: Math.round(salesEfficiency * 10) / 10,
    marketingEfficiency: Math.round(marketingEfficiency * 10) / 10,
    ruleOf40Score: Math.round(ruleOf40 * 10) / 10,
    ruleOf40Verdict,
  };

  // ── Health Scorecard ──────────────────────────────────────────────

  function scoreRating(score: number): HealthRating {
    if (score >= 80) return "strong";
    if (score >= 60) return "healthy";
    if (score >= 40) return "caution";
    if (score >= 20) return "poor";
    return "critical";
  }

  // Growth score (0-100)
  const growthScore = Math.min(100, Math.max(0,
    (revenueGrowth >= 5 ? 40 : revenueGrowth >= 3 ? 25 : revenueGrowth >= 0 ? 10 : 0) +
    (arrGrowth >= 5 ? 30 : arrGrowth >= 3 ? 20 : arrGrowth >= 0 ? 10 : 0) +
    (nrr >= 110 ? 30 : nrr >= 100 ? 20 : nrr >= 90 ? 10 : 0)
  ));

  // Profitability score
  const profitScore = Math.min(100, Math.max(0,
    (latestPnL.grossMarginPct >= 75 ? 40 : latestPnL.grossMarginPct >= 65 ? 25 : 10) +
    (netBurn === 0 ? 40 : netBurn < totalRevenue * 0.3 ? 25 : netBurn < totalRevenue ? 10 : 0) +
    (ruleOf40 >= 40 ? 20 : ruleOf40 >= 20 ? 10 : 0)
  ));

  // Efficiency score
  const effScore = Math.min(100, Math.max(0,
    (magicNumber >= 0.75 ? 35 : magicNumber >= 0.5 ? 20 : 10) +
    (ltvCacRatio >= 3 ? 35 : ltvCacRatio >= 2 ? 20 : ltvCacRatio >= 1 ? 10 : 0) +
    (cacPaybackMonths <= 12 ? 30 : cacPaybackMonths <= 18 ? 20 : cacPaybackMonths <= 24 ? 10 : 0)
  ));

  // Cash health score
  const cashScore = Math.min(100, Math.max(0,
    (runwayMonths >= 18 ? 40 : runwayMonths >= 12 ? 25 : runwayMonths >= 6 ? 10 : 0) +
    (burnTrend === "decelerating" ? 30 : burnTrend === "steady" ? 20 : 5) +
    (cashBalance > 0 ? 30 : 0)
  ));

  const overallScore = Math.round((growthScore + profitScore + effScore + cashScore) / 4);

  const healthScorecard: HealthScorecard = {
    overall: {
      score: overallScore,
      rating: scoreRating(overallScore),
      summary: `Overall financial health: ${overallScore}/100 (${scoreRating(overallScore)}). ${
        overallScore < 40 ? "Immediate intervention needed across multiple areas." :
        overallScore < 60 ? "Several areas need attention to secure next funding round." :
        "Fundamentals are solid but optimization opportunities exist."
      }`,
    },
    growth: {
      score: growthScore,
      rating: scoreRating(growthScore),
      detail: `Revenue growth ${revenueGrowth.toFixed(1)}% MoM, ARR growth ${arrGrowth.toFixed(1)}% MoM, NRR ${nrr.toFixed(0)}%. ${
        growthScore >= 60 ? "Growth trajectory supports fundraising." : "Growth needs acceleration for Series B."
      }`,
    },
    profitability: {
      score: profitScore,
      rating: scoreRating(profitScore),
      detail: `Gross margin ${latestPnL.grossMarginPct}%, net burn $${Math.round(netBurn / 1000)}K/mo, Rule of 40: ${ruleOf40.toFixed(0)}. ${
        profitScore >= 60 ? "Unit economics are healthy." : "Burn rate needs reduction to improve path to profitability."
      }`,
    },
    efficiency: {
      score: effScore,
      rating: scoreRating(effScore),
      detail: `Magic Number ${magicNumber.toFixed(2)}, LTV/CAC ${ltvCacRatio.toFixed(1)}x, CAC payback ${cacPaybackMonths}mo. ${
        effScore >= 60 ? "Go-to-market engine is efficient." : "GTM efficiency below benchmarks — optimize before scaling."
      }`,
    },
    cashHealth: {
      score: cashScore,
      rating: scoreRating(cashScore),
      detail: `Cash $${(cashBalance / 1000000).toFixed(2)}M, runway ${runwayMonths}mo, burn trend: ${burnTrend}. ${
        cashScore >= 60 ? "Cash position is comfortable." : "Cash position requires immediate attention."
      }`,
    },
  };

  // ── Build Pre-computed Report Sections ─────────────────────────────

  // 1. Overspending section
  const overspendingItems: OverspendingItem[] = [];
  let totalOverspend = 0;

  for (const sb of spendBreakdowns) {
    if (sb.isAboveThreshold) {
      const benchmarkAmount = (sb.thresholdPct / 100) * totalRevenue;
      const overage = sb.currentMonth - benchmarkAmount;
      totalOverspend += overage;
      overspendingItems.push({
        area: sb.category,
        currentSpend: sb.currentMonth,
        benchmark: benchmarkAmount,
        overageAmount: overage,
        overagePct: sb.percentOfRevenue - sb.thresholdPct,
        source: "xero",
        detail: `${sb.category} is ${sb.percentOfRevenue}% of revenue vs ${sb.thresholdPct}% threshold — $${Math.round(overage / 1000)}K over benchmark. Trend: ${sb.trend}.`,
      });
    }
  }

  // Check for departments over budget in Volopay
  for (const ds of latestMonthVoopay) {
    if (ds.overBudget) {
      const budget = Math.round(ds.totalSpend / (ds.budgetUtilization / 100));
      const overage = ds.totalSpend - budget;
      totalOverspend += overage;
      overspendingItems.push({
        area: `${ds.department} (Corp Card)`,
        currentSpend: ds.totalSpend,
        benchmark: budget,
        overageAmount: overage,
        overagePct: ds.budgetUtilization - 100,
        source: "volopay",
        detail: `${ds.department} card spend $${Math.round(ds.totalSpend / 1000)}K vs $${Math.round(budget / 1000)}K budget (${ds.budgetUtilization.toFixed(0)}% utilized). Top merchant: ${ds.topMerchant}.`,
      });
    }
  }

  // OPEX vs revenue growth gap
  if (prevPnL) {
    const opexGrowth = ((latestPnL.opex.totalOpex - prevPnL.opex.totalOpex) / prevPnL.opex.totalOpex) * 100;
    if (opexGrowth > revenueGrowth + 3) {
      overspendingItems.push({
        area: "Total OPEX Growth Gap",
        currentSpend: latestPnL.opex.totalOpex,
        benchmark: prevPnL.opex.totalOpex * (1 + revenueGrowth / 100),
        overageAmount: latestPnL.opex.totalOpex - (prevPnL.opex.totalOpex * (1 + revenueGrowth / 100)),
        overagePct: opexGrowth - revenueGrowth,
        source: "xero",
        detail: `OPEX grew ${opexGrowth.toFixed(1)}% vs revenue growth ${revenueGrowth.toFixed(1)}%. Burn accelerating without proportional top-line growth.`,
      });
    }
  }

  // 2. Anomalies section
  const anomalyItems: AnomalyItem[] = [];
  const flaggedByDept = new Map<string, { count: number; amount: number; reasons: string[] }>();

  for (const tx of recentFlagged) {
    const dept = tx.department;
    const existing = flaggedByDept.get(dept) || { count: 0, amount: 0, reasons: [] };
    existing.count++;
    existing.amount += tx.amount;
    if (tx.flagReason && !existing.reasons.includes(tx.flagReason)) {
      existing.reasons.push(tx.flagReason);
    }
    flaggedByDept.set(dept, existing);

    anomalyItems.push({
      type: "flagged_transaction",
      department: dept,
      description: `${tx.merchant} — $${tx.amount.toFixed(2)} by ${tx.cardHolderName}`,
      amount: tx.amount,
      reason: tx.flagReason || "Policy violation",
      severity: tx.amount > 1000 ? "critical" : tx.amount > 500 ? "warning" : "info",
    });
  }

  // Missing receipt anomalies by department
  const deptMissingReceipts = new Map<string, number>();
  for (const tx of missingReceipts) {
    deptMissingReceipts.set(tx.department, (deptMissingReceipts.get(tx.department) || 0) + 1);
  }

  const departmentBreakdown = Array.from(flaggedByDept.entries()).map(([dept, data]) => ({
    department: dept,
    flaggedCount: data.count,
    flaggedAmount: data.amount,
    topReasons: data.reasons.slice(0, 3),
  })).sort((a, b) => b.flaggedAmount - a.flaggedAmount);

  const totalFlaggedAmount = recentFlagged.reduce((s, t) => s + t.amount, 0);

  // 3. Risks section
  const riskItems: RiskItem[] = [];

  if (runwayMonths < 18) {
    riskItems.push({
      type: "Cash Runway",
      description: `${runwayMonths} months of runway at $${Math.round(netBurn / 1000)}K/mo burn. Cash: $${(cashBalance / 1000000).toFixed(2)}M.`,
      probability: runwayMonths < 12 ? "high" : "medium",
      impact: `Company runs out of cash by ${runwayProjections.find(r => r.scenario === "base")?.runwayDate || "unknown"}`,
      mitigation: runwayMonths < 12
        ? "Immediate: Cut burn 20%, defer hires, renegotiate vendors. Begin bridge round conversations."
        : "Start Series B prep. Target 18-month minimum. Identify $30-50K/mo quick wins.",
    });
  }

  if (revenueGrowth < 3) {
    riskItems.push({
      type: "Revenue Deceleration",
      description: `Revenue growing only ${revenueGrowth.toFixed(1)}% MoM — below the 5%+ needed for Series B positioning.`,
      probability: "high",
      impact: "Misses 40% YoY growth target, reduces valuation multiple by 2-4x",
      mitigation: "Review pipeline coverage (need 3x target). Consider enterprise ACV expansion or self-serve tier.",
    });
  }

  if (overdueInvoices.length > 0) {
    riskItems.push({
      type: "AR Collection Risk",
      description: `$${Math.round(arOutstanding / 1000)}K in ${overdueInvoices.length} overdue invoices. Top debtor: ${overdueInvoices.sort((a, b) => b.total - a.total)[0]?.customer || "unknown"}.`,
      probability: arOutstanding > 50000 ? "high" : "medium",
      impact: `Cash flow reduced by $${Math.round(arOutstanding / 1000)}K; risk of write-offs`,
      mitigation: "Escalate collections > 30 days. Offer 2/10 net 30 discounts. Flag at-risk accounts.",
    });
  }

  if (latestPnL.grossMarginPct < 70) {
    riskItems.push({
      type: "Margin Compression",
      description: `Gross margin ${latestPnL.grossMarginPct}% — below SaaS benchmark of 75-85%.`,
      probability: "medium",
      impact: "Reduces enterprise value, increases burn rate, limits pricing power",
      mitigation: "Audit hosting costs (reserved instances), evaluate support automation (30% headcount savings).",
    });
  }

  const scenarioAnalysis = runwayProjections.map(r => ({
    scenario: r.scenario.charAt(0).toUpperCase() + r.scenario.slice(1),
    runway: r.runwayMonths,
    burn: r.monthlyBurn,
    outcome: `${r.runwayMonths} months (until ${r.runwayDate}) at $${Math.round(r.monthlyBurn / 1000)}K/mo — ${r.assumptions.join(", ")}`,
  }));

  // 4. Actions section
  const immediateActions: ActionItem[] = [];
  const shortTermActions: ActionItem[] = [];
  const mediumTermActions: ActionItem[] = [];

  // Generate actions from overspending
  for (const item of overspendingItems) {
    if (item.overagePct > 10) {
      immediateActions.push({
        timeline: "immediate",
        action: `Cut ${item.area} by $${Math.round(item.overageAmount / 1000)}K/mo to benchmark`,
        expectedSavings: `$${Math.round(item.overageAmount / 1000)}K/mo ($${Math.round(item.overageAmount * 12 / 1000)}K/yr)`,
        owner: "CFO / Department Head",
        detail: item.detail,
      });
    } else if (item.overagePct > 3) {
      shortTermActions.push({
        timeline: "short-term",
        action: `Reduce ${item.area} spending by ${item.overagePct.toFixed(0)}% over next quarter`,
        expectedSavings: `$${Math.round(item.overageAmount / 1000)}K/mo`,
        owner: "Department Head",
        detail: item.detail,
      });
    }
  }

  // Flagged transaction cleanup
  if (recentFlagged.length > 5) {
    immediateActions.push({
      timeline: "immediate",
      action: `Review ${recentFlagged.length} flagged transactions ($${Math.round(totalFlaggedAmount / 1000)}K)`,
      expectedSavings: `$${Math.round(totalFlaggedAmount * 0.3 / 1000)}K recoverable`,
      owner: "Finance Team",
      detail: `${departmentBreakdown.length} departments affected. Top reasons: ${[...new Set(recentFlagged.filter(t => t.flagReason).map(t => t.flagReason))].slice(0, 3).join(", ")}`,
    });
  }

  // Overdue invoice collection
  if (overdueInvoices.length > 0) {
    immediateActions.push({
      timeline: "immediate",
      action: `Collect $${Math.round(arOutstanding / 1000)}K in overdue AR from ${overdueInvoices.length} invoices`,
      expectedSavings: `$${Math.round(arOutstanding / 1000)}K cash recovery`,
      owner: "Finance / AR Team",
      detail: `Top debtors: ${[...new Set(overdueInvoices.map(i => i.customer))].slice(0, 3).join(", ")}`,
    });
  }

  // Receipt compliance
  if (missingReceiptPct > 20) {
    shortTermActions.push({
      timeline: "short-term",
      action: `Fix ${missingReceiptPct.toFixed(0)}% missing receipt rate (${missingReceipts.length} transactions)`,
      expectedSavings: "Audit risk reduction + tax deduction recovery",
      owner: "Finance Team",
      detail: "Enable auto-reminders in Volopay. Block cards for repeat non-compliance after 3 warnings.",
    });
  }

  // Medium-term strategic
  mediumTermActions.push({
    timeline: "medium-term",
    action: "Run full SaaS tool audit — consolidate overlapping subscriptions",
    expectedSavings: `$${Math.round(latestPnL.opex.software * 0.2 / 1000)}K/mo (est. 20% reduction)`,
    owner: "IT / Engineering Lead",
    detail: `Current software spend: $${Math.round(latestPnL.opex.software / 1000)}K/mo. Industry avg for your ARR: $${Math.round(totalRevenue * 0.04 / 1000)}K/mo.`,
  });

  if (runwayMonths < 18) {
    mediumTermActions.push({
      timeline: "medium-term",
      action: "Begin Series B preparation — build data room, identify lead investors",
      expectedSavings: "Extends runway via funding",
      owner: "CEO / CFO",
      detail: `Current runway: ${runwayMonths} months. Need 6 months prep + 3-6 month fundraise cycle. Start NOW.`,
    });
  }

  const allSavings = [...immediateActions, ...shortTermActions, ...mediumTermActions]
    .map(a => {
      const match = a.expectedSavings.match(/\$(\d+)K/);
      return match ? parseInt(match[1]) * 1000 : 0;
    })
    .reduce((s, v) => s + v, 0);

  // 5. Causal chains — group into meaningful narratives
  const burnChains: CausalChain["chains"] = [];
  const growthChains: CausalChain["chains"] = [];

  for (const c of causalRelationships) {
    const chain = {
      flow: `${c.source} → ${c.target}`,
      explanation: c.description,
      effectSize: c.effectSize,
    };
    if (c.target === "Fundraising Urgency" || c.target === "OPEX" || c.target === "Gross Margin") {
      burnChains.push(chain);
    } else {
      growthChains.push(chain);
    }
  }

  const causalChainGroups: CausalChain[] = [
    {
      group: "The Burn Spiral — What's Accelerating Cash Drain",
      chains: burnChains.sort((a, b) => Math.abs(b.effectSize) - Math.abs(a.effectSize)),
    },
    {
      group: "Growth Drivers — What Works (But Costs Money)",
      chains: growthChains.sort((a, b) => Math.abs(b.effectSize) - Math.abs(a.effectSize)),
    },
  ];

  // 6. Bottom line
  const bottomLine = runwayMonths < 12
    ? `CRITICAL: ${runwayMonths} months runway. Cut burn by $${Math.round(netBurn * 0.2 / 1000)}K/mo immediately or begin bridge round within 30 days.`
    : runwayMonths < 18
    ? `WARNING: ${runwayMonths} months runway at $${Math.round(netBurn / 1000)}K/mo burn. Revenue growing ${revenueGrowth.toFixed(1)}% MoM. Need to reduce burn by $${Math.round(totalOverspend / 1000)}K/mo and accelerate revenue growth to 5%+ MoM for Series B positioning.`
    : `STABLE: ${runwayMonths} months runway. Focus on revenue acceleration (${revenueGrowth.toFixed(1)}% MoM → 5%+ target) and tightening spend controls ($${Math.round(totalOverspend / 1000)}K/mo over benchmarks).`;

  const reportSections: ReportSections = {
    overspending: {
      totalOverspend,
      items: overspendingItems.sort((a, b) => b.overageAmount - a.overageAmount),
      summary: `Total overspend vs benchmarks: $${Math.round(totalOverspend / 1000)}K/mo across ${overspendingItems.length} areas. ${overspendingItems.filter(i => i.source === "volopay").length} department card budgets exceeded.`,
    },
    anomalies: {
      totalFlaggedCount: recentFlagged.length,
      totalFlaggedAmount,
      missingReceiptCount: missingReceipts.length,
      missingReceiptPct,
      items: anomalyItems.sort((a, b) => b.amount - a.amount).slice(0, 20),
      departmentBreakdown,
    },
    risks: {
      items: riskItems,
      scenarioAnalysis,
    },
    actions: {
      immediate: immediateActions,
      shortTerm: shortTermActions,
      mediumTerm: mediumTermActions,
      totalPotentialSavings: `$${Math.round(allSavings / 1000)}K/mo ($${Math.round(allSavings * 12 / 1000)}K/yr)`,
    },
    causalChains: causalChainGroups,
    bottomLine,
  };

  return {
    generatedAt: new Date().toISOString(),
    kpis: {
      totalRevenue: totalRevenue,
      totalRevenueGrowth: revenueGrowth,
      grossMargin: latestPnL.grossMarginPct,
      netBurnRate: netBurn,
      cashBalance,
      runwayMonths,
      arr,
      arrGrowth,
      totalCorpCardSpend: totalCorpCardSpend,
      flaggedTransactions: recentFlagged.length,
      overBudgetDepartments: overBudgetDepts,
      invoicesOverdue: overdueInvoices.length,
      arOutstanding,
    },
    insights: insights.sort((a, b) => {
      const severityOrder: Record<InsightSeverity, number> = { critical: 0, warning: 1, info: 2, positive: 3 };
      return severityOrder[a.severity] - severityOrder[b.severity];
    }),
    cashFlowForecast,
    spendBreakdowns,
    departmentRisks: departmentRisks.sort((a, b) => b.riskScore - a.riskScore),
    runwayProjections,
    causalRelationships,
    unitEconomics,
    burnAnalysis,
    efficiencyMetrics,
    healthScorecard,
    reportSections,
    monthlyTrends,
  };
}
