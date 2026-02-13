/**
 * Finance Jarvis — Domain Adapter for the Generic Copilot Framework
 *
 * This file implements the 5 contracts of the CopilotFramework:
 *   1. DataProvider    → getDataSnapshot()     — KPIs, P&L, Balance Sheet, Trends
 *   2. AnalysisEngine  → getInsights()         — Brain-computed insights, risks, actions
 *   3. OutputSections  → getOutputSections()   — Structured sections with tables, scorecards
 *   4. PersonaConfig   → persona               — Finance Jarvis CFO persona
 *   5. QualityRules    → getQualityRules()     — Never fabricate dollars, cite all numbers
 *
 * Usage:
 *   import { createFinanceJarvisAdapter } from './copilot-adapter';
 *   import { createCopilotInstance } from '@nexus-ai/memory-stack';
 *
 *   const adapter = createFinanceJarvisAdapter(financeData);
 *   const copilot = createCopilotInstance({ adapter, provider: 'anthropic', apiKey });
 *   const { stream, headers } = copilot.chat(message);
 */

import type {
  DomainAdapter,
  CopilotPersona,
  CopilotDataSnapshot,
  CopilotInsightBundle,
  CopilotIntent,
  CopilotAction,
  CopilotRisk,
  CopilotCausalEdge,
  CopilotScenario,
  DataPoint,
  BrainInsight,
  OutputSection,
  ScorecardDimension,
} from '@nexus-ai/memory-stack';

import type { XeroData } from './synthetic-xero';
import type { VolopayData } from './synthetic-volopay';
import type { FinanceJarvisAnalysis } from './brain-analyzer';

// ============================================================================
// PERSONA
// ============================================================================

const FINANCE_JARVIS_PERSONA: CopilotPersona = {
  name: 'Finance Jarvis',
  role: 'AI CFO Copilot for a Series A SaaS Company',
  expertise: [
    'SaaS unit economics (ARR, MRR, LTV, CAC, NRR)',
    'Cash flow forecasting and runway analysis',
    'Corporate card spend monitoring and anomaly detection',
    'Budget vs actual analysis across departments',
    'Burn rate decomposition and optimization',
    'Financial health scoring and benchmarking',
  ],
  responseStyle: 'Data-driven, numbers-first. Use markdown tables for data-dense sections. Bold critical numbers. Reference specific dollar amounts, percentages, and time periods. Never use vague language like "significant" without numbers.',
  dataSources: ['Xero (accounting — P&L, Balance Sheet, Invoices)', 'Volopay (corporate cards — transactions, budgets)'],
  rules: [
    'Every number must come from the brain\'s pre-computed analysis',
    'Always cross-reference Xero P&L categories with Volopay card data',
    'Present overspending with benchmark comparisons',
    'Flag anomalous transactions with department and reason',
    'Include confidence levels on forecasts',
  ],
};

// ============================================================================
// ADAPTER FACTORY
// ============================================================================

/**
 * Create a Finance Jarvis domain adapter from the analysis data.
 *
 * @param data - The full finance data (xero + volopay + analysis)
 * @returns A DomainAdapter that plugs into createCopilotInstance()
 */
export function createFinanceJarvisAdapter(data: {
  xero: XeroData;
  volopay: VolopayData;
  analysis: FinanceJarvisAnalysis;
}): DomainAdapter {
  const { xero, volopay, analysis } = data;
  const kpis = analysis.kpis;
  const rs = analysis.reportSections;
  const latestPnL = xero.monthlyPnL[xero.monthlyPnL.length - 1];
  const latestBS = xero.balanceSheets[xero.balanceSheets.length - 1];

  return {
    domain: 'finance',
    displayName: 'Finance Jarvis',
    persona: FINANCE_JARVIS_PERSONA,

    // ── CONTRACT 1: Data Snapshot ──────────────────────────────────────
    getDataSnapshot(): CopilotDataSnapshot {
      return {
        kpis: [
          dp('arr', 'ARR', kpis.arr, 'currency', kpis.arrGrowth > 0 ? 'up' : 'down', `${kpis.arrGrowth > 0 ? '+' : ''}${kpis.arrGrowth.toFixed(1)}% MoM`),
          dp('monthly_revenue', 'Monthly Revenue', kpis.totalRevenue, 'currency', kpis.totalRevenueGrowth > 0 ? 'up' : 'down', `${kpis.totalRevenueGrowth > 0 ? '+' : ''}${kpis.totalRevenueGrowth.toFixed(1)}% MoM`),
          dp('gross_margin', 'Gross Margin', kpis.grossMargin, 'percentage'),
          dp('net_burn', 'Net Burn Rate', kpis.netBurnRate, 'currency', undefined, undefined, 'mo'),
          dp('cash_balance', 'Cash Balance', kpis.cashBalance, 'currency'),
          dp('runway', 'Runway', kpis.runwayMonths, 'duration'),
          dp('corp_card_spend', 'Corp Card Spend', kpis.totalCorpCardSpend, 'currency', undefined, 'this month'),
          dp('flagged_tx', 'Flagged Transactions', kpis.flaggedTransactions, 'integer'),
          dp('overdue_invoices', 'Overdue Invoices', kpis.invoicesOverdue, 'integer', undefined, `$${(kpis.arOutstanding / 1000).toFixed(0)}K outstanding`),
          dp('over_budget_depts', 'Departments Over Budget', kpis.overBudgetDepartments, 'integer'),
        ],
        sections: {
          [`Latest P&L (${latestPnL.month})`]: [
            dp('sub_revenue', 'Subscription Revenue', latestPnL.revenue.subscriptionRevenue, 'currency'),
            dp('pro_services', 'Professional Services', latestPnL.revenue.professionalServices, 'currency'),
            dp('total_revenue', 'Total Revenue', latestPnL.revenue.totalRevenue, 'currency'),
            dp('total_cogs', 'Total COGS', latestPnL.cogs.totalCOGS, 'currency'),
            dp('salaries', 'Salaries', latestPnL.opex.salaries, 'currency'),
            dp('marketing', 'Marketing', latestPnL.opex.marketing, 'currency'),
            dp('software', 'Software', latestPnL.opex.software, 'currency'),
            dp('travel', 'Travel', latestPnL.opex.travel, 'currency'),
            dp('rent', 'Rent', latestPnL.opex.rent, 'currency'),
            dp('ebitda', 'EBITDA', latestPnL.ebitda, 'currency'),
            dp('net_income', 'Net Income', latestPnL.netIncome, 'currency'),
          ],
          [`Balance Sheet (${latestBS.month})`]: [
            dp('cash', 'Cash & Equivalents', latestBS.assets.cashAndEquivalents, 'currency'),
            dp('ar', 'Accounts Receivable', latestBS.assets.accountsReceivable, 'currency'),
            dp('total_assets', 'Total Assets', latestBS.assets.totalAssets, 'currency'),
            dp('total_liabilities', 'Total Liabilities', latestBS.liabilities.totalLiabilities, 'currency'),
            dp('total_equity', 'Total Equity', latestBS.equity.totalEquity, 'currency'),
          ],
          'Spend Trends (with thresholds)': analysis.spendBreakdowns.map(s =>
            dp(s.category, s.category, s.currentMonth, 'currency', s.trend === 'increasing' ? 'up' : s.trend === 'decreasing' ? 'down' : 'flat',
              `${s.percentOfRevenue}% of revenue${s.isAboveThreshold ? ` — OVER ${s.thresholdPct}% threshold` : ''}`)
          ),
          'Department Risk Scores': analysis.departmentRisks.map(d =>
            dp(d.department, d.department, d.riskScore, 'integer', undefined,
              `Risk ${d.riskScore}/100 | ${d.flaggedTransactions} flagged | ${d.overBudgetMonths} months over budget | ${d.topRisk}`)
          ),
        },
        trends: analysis.monthlyTrends.map(t => ({
          period: t.month,
          metrics: [
            dp('revenue', 'Rev', t.revenue, 'currency'),
            dp('expenses', 'Exp', t.expenses, 'currency'),
            dp('net_income', 'Net', t.netIncome, 'currency'),
            dp('cash', 'Cash', t.cashBalance, 'currency'),
            dp('cards', 'Cards', t.corpCardSpend, 'currency'),
          ],
        })),
      };
    },

    // ── CONTRACT 2: Brain Insights ─────────────────────────────────────
    getInsights(): CopilotInsightBundle {
      // Map analysis insights to generic format
      const insights: BrainInsight[] = analysis.insights.slice(0, 12).map((i, idx) => ({
        id: i.id,
        severity: mapSeverity(i.severity),
        category: i.category,
        title: i.title,
        description: i.description,
        recommendation: i.recommendation,
        evidence: [],
        confidence: i.confidence,
        impact: i.impact === 'high' ? 3 : i.impact === 'medium' ? 2 : 1,
      }));

      // Map risks
      const risks: CopilotRisk[] = rs.risks.items.map(r => ({
        type: r.type,
        description: r.description,
        probability: r.probability,
        impact: r.impact,
        mitigation: r.mitigation,
      }));

      // Map actions
      const actions: CopilotAction[] = [
        ...rs.actions.immediate.map(a => mapAction(a, 'immediate')),
        ...rs.actions.shortTerm.map(a => mapAction(a, 'short_term')),
        ...rs.actions.mediumTerm.map(a => mapAction(a, 'medium_term')),
      ];

      return {
        insights,
        risks,
        actions,
        bottomLine: rs.bottomLine,
        custom: {
          unitEconomics: analysis.unitEconomics,
          burnAnalysis: analysis.burnAnalysis,
          efficiencyMetrics: analysis.efficiencyMetrics,
          healthScorecard: analysis.healthScorecard,
        },
      };
    },

    // ── CONTRACT 3: Output Sections ────────────────────────────────────
    getOutputSections(intent: CopilotIntent): OutputSection[] {
      const sections: OutputSection[] = [];

      // Section 1: Overspending
      sections.push({
        id: 'overspending',
        title: '🔴 OVERSPENDING — WHERE WE\'RE BLEEDING',
        type: 'table',
        priority: 1,
        required: true,
        instructions: 'Present each overspending item from the data below. Show a markdown table with columns: Area | Current | Benchmark | Over By | % Over. Cross-reference Xero P&L categories with Volopay card department data.',
        data: {
          table: {
            title: 'Overspending Analysis',
            columns: ['Area', 'Current', 'Benchmark', 'Over By', '% Over'],
            rows: rs.overspending.items.map(item => [
              item.area,
              `$${Math.round(item.currentSpend / 1000)}K`,
              `$${Math.round(item.benchmark / 1000)}K`,
              `$${Math.round(item.overageAmount / 1000)}K`,
              `+${item.overagePct.toFixed(1)}%`,
            ]),
          },
          narrative: `Total overspend vs benchmarks: $${Math.round(rs.overspending.totalOverspend / 1000)}K/mo. ${rs.overspending.summary}`,
        },
      });

      // Section 2: Anomalies
      sections.push({
        id: 'anomalies',
        title: '🚩 UNUSUAL EXPENSES — ANOMALIES THE BRAIN FLAGGED',
        type: 'table',
        priority: 2,
        required: true,
        instructions: 'Show flagged transaction count and total amount. Show missing receipt stats. Present department breakdown as a table: Department | Flagged Count | Flagged Amount | Top Reasons.',
        data: {
          table: {
            title: 'Anomaly Department Breakdown',
            columns: ['Department', 'Flagged Count', 'Flagged Amount', 'Top Reasons'],
            rows: rs.anomalies.departmentBreakdown.map(d => [
              d.department,
              String(d.flaggedCount),
              `$${Math.round(d.flaggedAmount / 1000)}K`,
              d.topReasons.join(', '),
            ]),
          },
          narrative: `Flagged transactions: ${rs.anomalies.totalFlaggedCount} totaling $${Math.round(rs.anomalies.totalFlaggedAmount / 1000)}K. Missing receipts: ${rs.anomalies.missingReceiptCount} (${rs.anomalies.missingReceiptPct.toFixed(0)}%).`,
        },
      });

      // Section 3: Risks
      sections.push({
        id: 'risks',
        title: '⚠️ ANTICIPATED RISKS — WHAT THE BRAIN SEES COMING',
        type: 'table',
        priority: 3,
        required: true,
        instructions: 'Present each risk with probability tag. Include the scenario analysis table: Scenario | Runway | Monthly Burn | Outcome.',
        data: {
          table: {
            title: 'Scenario Analysis',
            columns: ['Scenario', 'Runway', 'Monthly Burn', 'Outcome'],
            rows: rs.risks.scenarioAnalysis.map(s => [
              s.scenario,
              `${analysis.runwayProjections.find(r => r.scenario === s.scenario.toLowerCase())?.runwayMonths || '?'} months`,
              `$${Math.round((analysis.runwayProjections.find(r => r.scenario === s.scenario.toLowerCase())?.monthlyBurn || 0) / 1000)}K`,
              s.outcome,
            ]),
          },
        },
      });

      // Section 4: Where to Cut
      sections.push({
        id: 'actions',
        title: '✂️ WHERE TO CUT — BRAIN\'S RECOMMENDATIONS',
        type: 'actions',
        priority: 4,
        required: true,
        instructions: 'Present actions grouped by timeline. Show each action with savings and owner. End with total potential savings.',
        data: {
          actions: {
            immediate: rs.actions.immediate.map(a => mapAction(a, 'immediate')),
            shortTerm: rs.actions.shortTerm.map(a => mapAction(a, 'short_term')),
            mediumTerm: rs.actions.mediumTerm.map(a => mapAction(a, 'medium_term')),
            longTerm: [],
            totalSavings: rs.actions.totalPotentialSavings,
          },
        },
      });

      // Section 5: Forecast
      sections.push({
        id: 'forecast',
        title: '📊 FORECAST — THE BRAIN\'S 6-MONTH OUTLOOK',
        type: 'forecast',
        priority: 5,
        required: true,
        instructions: 'Present cash flow forecast as a table: Month | Inflows | Outflows | Net | Cash Balance | Confidence. Call out months with flagged risks.',
        data: {
          forecast: {
            table: {
              columns: ['Month', 'Inflows', 'Outflows', 'Net', 'Cash Balance', 'Confidence'],
              rows: analysis.cashFlowForecast.map(f => [
                f.month,
                `$${(f.projectedInflows / 1000).toFixed(0)}K`,
                `$${(f.projectedOutflows / 1000).toFixed(0)}K`,
                `$${(f.projectedNetCash / 1000).toFixed(0)}K`,
                `$${(f.projectedBalance / 1000000).toFixed(2)}M`,
                `${(f.confidence * 100).toFixed(0)}%`,
              ]),
            },
            risks: analysis.cashFlowForecast.flatMap(f => f.risks),
            confidence: 'Confidence degrades over time as uncertainty compounds',
          },
        },
      });

      // Section 6: Causal Chains
      sections.push({
        id: 'causal',
        title: '🧬 CAUSAL CHAINS — WHY THIS IS HAPPENING',
        type: 'causal',
        priority: 6,
        required: true,
        instructions: 'Present burn spiral chains and growth driver chains. Explain the TENSION between growth investment and burn control. Show effect size percentages.',
        data: {
          causal: {
            chains: rs.causalChains.map(group => ({
              group: group.group,
              edges: group.chains.map(c => ({
                flow: c.flow,
                effectSize: c.effectSize,
                explanation: c.explanation,
              })),
            })),
          },
        },
      });

      // Section 7: Unit Economics
      if (analysis.unitEconomics) {
        const ue = analysis.unitEconomics;
        sections.push({
          id: 'unit_economics',
          title: '📈 UNIT ECONOMICS — THE REAL NUMBERS',
          type: 'kpi_grid',
          priority: 7,
          required: true,
          instructions: 'Present LTV/CAC ratio, CAC payback, NRR. Show revenue by plan table. Call out customer concentration risk. Compare against SaaS benchmarks.',
          data: {
            kpis: [
              dp('ltv_cac', 'LTV/CAC Ratio', ue.ltvCacRatio, 'decimal', undefined, ue.ltvCacRatio >= 3 ? '✅ >3x target' : '⚠️ Below 3x target'),
              dp('cac_payback', 'CAC Payback', ue.cacPaybackMonths, 'duration'),
              dp('nrr', 'Net Revenue Retention', ue.netRevenueRetention * 100, 'percentage', undefined, ue.netRevenueRetention >= 1 ? '✅ >100%' : '⚠️ Below 100%'),
              dp('churn_rate', 'Monthly Churn Rate', ue.churnRate * 100, 'percentage'),
              dp('top5_concentration', 'Top 5 Customer Concentration', ue.topCustomerConcentration * 100, 'percentage'),
            ],
            table: {
              title: 'Revenue by Plan',
              columns: ['Plan', 'Customers', 'MRR', '% of Total'],
              rows: ue.revenueByPlan.map(p => [
                p.plan,
                String(p.customers),
                `$${(p.mrr / 1000).toFixed(0)}K`,
                `${p.pctOfTotal.toFixed(1)}%`,
              ]),
            },
          },
        });
      }

      // Section 8: Burn Decomposition
      if (analysis.burnAnalysis) {
        const ba = analysis.burnAnalysis;
        sections.push({
          id: 'burn',
          title: '🔥 BURN DECOMPOSITION — WHERE THE MONEY GOES',
          type: 'table',
          priority: 8,
          required: true,
          instructions: 'Show burn by function table. Include burn trend and break-even analysis.',
          data: {
            table: {
              title: 'Burn by Function',
              columns: ['Function', 'Amount', '% of Total'],
              rows: Object.entries(ba.burnByFunction).map(([fn, amt]) => [
                fn.charAt(0).toUpperCase() + fn.slice(1),
                `$${Math.round(amt / 1000)}K`,
                `${(ba.burnByFunctionPct[fn as keyof typeof ba.burnByFunctionPct] || 0).toFixed(1)}%`,
              ]),
            },
            narrative: `Burn trend: ${ba.burnTrend} (${ba.burnTrendRate > 0 ? '+' : ''}${ba.burnTrendRate.toFixed(1)}% MoM). Break-even revenue: $${Math.round(ba.breakEvenRevenue / 1000)}K/mo. ${ba.monthsToBreakEven != null ? `Estimated ${ba.monthsToBreakEven} months to break-even at current trajectory.` : 'Break-even not achievable at current trajectory.'}`,
          },
        });
      }

      // Section 9: Health Scorecard
      if (analysis.healthScorecard) {
        const hs = analysis.healthScorecard;
        sections.push({
          id: 'health',
          title: '🏥 HEALTH SCORECARD',
          type: 'scorecard',
          priority: 9,
          required: true,
          instructions: 'Present the 4-dimension scorecard as a table: Dimension | Score | Rating | Key Detail. Include overall score and verdict. Flag any dimension rated "critical" or "poor".',
          data: {
            scorecard: {
              dimensions: [
                { dimension: 'Growth', score: hs.growth.score, rating: mapHealthRating(hs.growth.rating), detail: hs.growth.detail },
                { dimension: 'Profitability', score: hs.profitability.score, rating: mapHealthRating(hs.profitability.rating), detail: hs.profitability.detail },
                { dimension: 'Efficiency', score: hs.efficiency.score, rating: mapHealthRating(hs.efficiency.rating), detail: hs.efficiency.detail },
                { dimension: 'Cash', score: hs.cashHealth.score, rating: mapHealthRating(hs.cashHealth.rating), detail: hs.cashHealth.detail },
              ],
              overallScore: hs.overall.score,
              overallRating: hs.overall.rating,
              verdict: hs.overall.summary,
            },
          },
        });
      }

      // Section 10: Bottom Line
      sections.push({
        id: 'bottom_line',
        title: '📌 BOTTOM LINE',
        type: 'narrative',
        priority: 10,
        required: true,
        instructions: 'One paragraph using the brain\'s verdict. Bold the critical numbers. Include the health scorecard overall rating.',
        data: {
          narrative: rs.bottomLine,
        },
      });

      return sections;
    },

    // ── CONTRACT 4: Quality Rules ──────────────────────────────────────
    getQualityRules(): string[] {
      return [
        'Cross-reference Xero and Volopay data wherever possible (P&L expense vs card spend)',
        'For trend questions, use the 12-month data and compute growth rates',
        'Never fabricate dollar amounts — every $ figure must come from the data layer',
        'Include at least 3 markdown tables in every comprehensive response',
        'When comparing to benchmarks, cite the specific benchmark values from the data',
      ];
    },

    // ── CONTRACT 5: Intent Detection ───────────────────────────────────
    detectIntent(message: string): CopilotIntent {
      const lower = message.toLowerCase();

      // Finance-specific intent detection
      if (/overspend|bleed|waste|cut|reduce|save/.test(lower)) return 'recommend';
      if (/anomal|unusual|flagged|suspicious|receipt/.test(lower)) return 'diagnose';
      if (/forecast|runway|project|next.*month|cash.*flow/.test(lower)) return 'predict';
      if (/health|scorecard|score|how.*doing|overall/.test(lower)) return 'summarize';
      if (/compare|bench|versus|vs/.test(lower)) return 'compare';
      if (/everything|comprehensive|full.*analysis|all.*insight/.test(lower)) return 'deep_dive';
      if (/why|root.*cause|declining|dropping/.test(lower)) return 'diagnose';
      if (/insight|analyze|break.*down|show.*me/.test(lower)) return 'analyze';

      return 'general';
    },

    // ── Optional: Causal Edges ─────────────────────────────────────────
    getCausalEdges(): CopilotCausalEdge[] {
      return analysis.causalRelationships.map(c => ({
        source: c.source,
        target: c.target,
        effectSize: c.effectSize,
        lagDays: c.lagDays,
        pValue: 0.05, // Synthetic data doesn't have p-values
        naturalLanguage: c.description,
      }));
    },

    // ── Optional: Scenarios ────────────────────────────────────────────
    getScenarios(): CopilotScenario[] {
      return analysis.runwayProjections.map(r => ({
        name: r.scenario.charAt(0).toUpperCase() + r.scenario.slice(1),
        assumptions: r.assumptions,
        outcome: `${r.runwayMonths} months runway at $${(r.monthlyBurn / 1000).toFixed(0)}K/mo burn`,
        metrics: [
          dp('runway', 'Runway', r.runwayMonths, 'duration'),
          dp('burn', 'Monthly Burn', r.monthlyBurn, 'currency'),
        ],
      }));
    },
  };
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function dp(
  key: string,
  label: string,
  value: unknown,
  format?: DataPoint['format'],
  trend?: DataPoint['trend'],
  trendLabel?: string,
  unit?: string,
): DataPoint {
  return { key, label, value, format, trend, trendLabel, unit, domain: 'finance' };
}

function mapSeverity(s: string): 'info' | 'low' | 'medium' | 'high' | 'critical' {
  switch (s) {
    case 'critical': return 'critical';
    case 'warning': return 'high';
    case 'info': return 'medium';
    case 'positive': return 'low';
    default: return 'medium';
  }
}

function mapAction(a: { action: string; expectedSavings: string; owner: string; detail: string }, timeline: CopilotAction['timeline']): CopilotAction {
  return {
    action: a.action,
    rationale: a.detail,
    timeline,
    expectedImpact: a.expectedSavings,
    owner: a.owner,
    priority: timeline === 'immediate' ? 'critical' : timeline === 'short_term' ? 'high' : 'medium',
    detail: a.detail,
  };
}

function mapHealthRating(r: string): ScorecardDimension['rating'] {
  switch (r) {
    case 'strong': return 'excellent';
    case 'healthy': return 'good';
    case 'caution': return 'fair';
    case 'poor': return 'poor';
    case 'critical': return 'critical';
    default: return 'fair';
  }
}
