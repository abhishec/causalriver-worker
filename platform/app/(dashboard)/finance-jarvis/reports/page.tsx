"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import type { FinanceJarvisAnalysis, InsightSeverity, InsightCategory } from "@/lib/finance-jarvis";

function fmtK(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

const SEVERITY_COLORS: Record<InsightSeverity, string> = {
  critical: "text-red-400 bg-red-500/10 border-red-500/20",
  warning: "text-amber-400 bg-amber-500/10 border-amber-500/20",
  info: "text-blue-400 bg-blue-500/10 border-blue-500/20",
  positive: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
};

const CATEGORY_LABELS: Record<InsightCategory, string> = {
  overspending: "Overspending",
  anomaly: "Anomaly",
  forecast: "Forecast",
  trend: "Trend",
  optimization: "Optimization",
  risk: "Risk",
  compliance: "Compliance",
};

export default function FinanceReportsPage() {
  const [data, setData] = useState<FinanceJarvisAnalysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<InsightSeverity | "all">("all");
  const [categoryFilter, setCategoryFilter] = useState<InsightCategory | "all">("all");
  const [activeTab, setActiveTab] = useState<"insights" | "spend" | "departments" | "forecast">("insights");

  useEffect(() => {
    fetch("/api/finance-jarvis")
      .then((r) => r.json())
      .then((d) => { setData(d.analysis); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="text-center">
          <div className="w-12 h-12 rounded-xl bg-accent/15 flex items-center justify-center mx-auto mb-4 animate-pulse">
            <svg className="w-6 h-6 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <p className="text-sm text-muted">Generating reports...</p>
        </div>
      </div>
    );
  }

  if (!data) return <div className="text-center py-20 text-muted">Failed to load data</div>;

  const filteredInsights = data.insights.filter((i) => {
    if (filter !== "all" && i.severity !== filter) return false;
    if (categoryFilter !== "all" && i.category !== categoryFilter) return false;
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-accent/15 flex items-center justify-center">
            <svg className="w-5 h-5 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <div>
            <h1 className="text-xl font-semibold">Finance Reports</h1>
            <p className="text-xs text-muted">Detailed insights, spend analysis, and forecasts</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Link href="/finance-jarvis" className="px-3 py-1.5 text-xs rounded-lg bg-card border border-border/50 hover:border-accent/30 transition-colors">
            Dashboard
          </Link>
          <Link href="/copilot" className="px-3 py-1.5 text-xs rounded-lg bg-accent text-white hover:bg-accent-dark transition-colors">
            Ask Copilot
          </Link>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-1 p-1 bg-surface rounded-lg w-fit">
        {(["insights", "spend", "departments", "forecast"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              "px-4 py-1.5 text-xs rounded-md transition-colors capitalize",
              activeTab === tab ? "bg-accent text-white" : "text-muted hover:text-foreground"
            )}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* ── Insights Tab ── */}
      {activeTab === "insights" && (
        <div className="space-y-4">
          {/* Filters */}
          <div className="flex gap-4 items-center">
            <div className="flex gap-1">
              {(["all", "critical", "warning", "info", "positive"] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setFilter(s)}
                  className={cn(
                    "px-2.5 py-1 text-[11px] rounded-md transition-colors capitalize",
                    filter === s ? "bg-accent text-white" : "bg-surface text-muted hover:text-foreground"
                  )}
                >
                  {s} {s !== "all" && `(${data.insights.filter((i) => i.severity === s).length})`}
                </button>
              ))}
            </div>
            <div className="flex gap-1">
              {(["all", ...Object.keys(CATEGORY_LABELS)] as Array<InsightCategory | "all">).map((c) => (
                <button
                  key={c}
                  onClick={() => setCategoryFilter(c)}
                  className={cn(
                    "px-2.5 py-1 text-[11px] rounded-md transition-colors",
                    categoryFilter === c ? "bg-accent/20 text-accent" : "bg-surface text-muted hover:text-foreground"
                  )}
                >
                  {c === "all" ? "All" : CATEGORY_LABELS[c]}
                </button>
              ))}
            </div>
          </div>

          {/* Insights List */}
          <div className="space-y-3">
            {filteredInsights.map((insight) => (
              <div key={insight.id} className={cn("rounded-xl p-4 border", SEVERITY_COLORS[insight.severity])}>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-semibold uppercase">{insight.severity}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface/50 text-muted">{CATEGORY_LABELS[insight.category]}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface/50 text-muted">{insight.source}</span>
                      <span className="text-[10px] text-muted/50">|</span>
                      <span className="text-[10px] text-muted/50">{insight.domain}</span>
                    </div>
                    <h4 className="text-sm font-medium mb-1">{insight.title}</h4>
                    <p className="text-xs text-muted-foreground leading-relaxed">{insight.description}</p>

                    {insight.metric && (
                      <div className="flex gap-4 mt-2 text-xs">
                        {insight.currentValue !== undefined && (
                          <span>Current: <strong>{typeof insight.currentValue === "number" && insight.currentValue > 1000 ? fmtK(insight.currentValue) : insight.currentValue?.toFixed?.(1) ?? insight.currentValue}</strong></span>
                        )}
                        {insight.previousValue !== undefined && (
                          <span className="text-muted">Previous: {typeof insight.previousValue === "number" && insight.previousValue > 1000 ? fmtK(insight.previousValue) : insight.previousValue?.toFixed?.(1)}</span>
                        )}
                        {insight.changePercent !== undefined && (
                          <span className={insight.changePercent > 0 ? "text-red-400" : "text-emerald-400"}>
                            {insight.changePercent > 0 ? "+" : ""}{insight.changePercent.toFixed(1)}%
                          </span>
                        )}
                      </div>
                    )}

                    <div className="mt-3 p-2 rounded-lg bg-surface/30 border border-border/20">
                      <span className="text-[10px] uppercase tracking-wider text-accent/60">Recommendation</span>
                      <p className="text-xs text-foreground mt-0.5">{insight.recommendation}</p>
                    </div>

                    {insight.relatedEntities && insight.relatedEntities.length > 0 && (
                      <div className="flex gap-1 mt-2">
                        {insight.relatedEntities.map((e, i) => (
                          <span key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-surface text-muted">{e}</span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-sm font-mono font-semibold">{Math.round(insight.confidence * 100)}%</div>
                    <div className="text-[10px] text-muted/50">confidence</div>
                    <div className="mt-2 text-[10px] text-muted/50">{insight.impact} impact</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Spend Tab ── */}
      {activeTab === "spend" && (
        <div className="space-y-4">
          <div className="rounded-xl bg-card border border-border/50 overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border/30">
                  <th className="text-left px-4 py-3 text-[11px] uppercase tracking-wider text-muted/60">Category</th>
                  <th className="text-right px-4 py-3 text-[11px] uppercase tracking-wider text-muted/60">This Month</th>
                  <th className="text-right px-4 py-3 text-[11px] uppercase tracking-wider text-muted/60">Last Month</th>
                  <th className="text-right px-4 py-3 text-[11px] uppercase tracking-wider text-muted/60">3mo Avg</th>
                  <th className="text-center px-4 py-3 text-[11px] uppercase tracking-wider text-muted/60">Trend</th>
                  <th className="text-right px-4 py-3 text-[11px] uppercase tracking-wider text-muted/60">% of Revenue</th>
                  <th className="text-center px-4 py-3 text-[11px] uppercase tracking-wider text-muted/60">Status</th>
                </tr>
              </thead>
              <tbody>
                {data.spendBreakdowns.map((s) => (
                  <tr key={s.category} className="border-b border-border/10 hover:bg-surface-hover/50">
                    <td className="px-4 py-3 text-sm">{s.category}</td>
                    <td className="px-4 py-3 text-sm text-right font-mono">{fmtK(s.currentMonth)}</td>
                    <td className="px-4 py-3 text-sm text-right font-mono text-muted">{fmtK(s.previousMonth)}</td>
                    <td className="px-4 py-3 text-sm text-right font-mono text-muted">{fmtK(s.threeMonthAvg)}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={cn(
                        "text-xs px-2 py-0.5 rounded",
                        s.trend === "increasing" ? "bg-red-500/10 text-red-400" :
                        s.trend === "decreasing" ? "bg-emerald-500/10 text-emerald-400" :
                        "bg-surface text-muted"
                      )}>
                        {s.trend === "increasing" ? "^" : s.trend === "decreasing" ? "v" : "="} {s.trend}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-right font-mono">{s.percentOfRevenue.toFixed(1)}%</td>
                    <td className="px-4 py-3 text-center">
                      {s.isAboveThreshold ? (
                        <span className="text-[10px] px-2 py-0.5 rounded bg-red-500/10 text-red-400">ABOVE {s.thresholdPct}%</span>
                      ) : (
                        <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400">OK</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Monthly P&L Trend Table */}
          <div className="rounded-xl bg-card border border-border/50 p-5">
            <h3 className="text-sm font-medium mb-4">Monthly P&L Summary</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border/30">
                    <th className="text-left py-2 pr-4 text-[10px] uppercase tracking-wider text-muted/60">Month</th>
                    <th className="text-right py-2 px-3 text-[10px] uppercase tracking-wider text-muted/60">Revenue</th>
                    <th className="text-right py-2 px-3 text-[10px] uppercase tracking-wider text-muted/60">Expenses</th>
                    <th className="text-right py-2 px-3 text-[10px] uppercase tracking-wider text-muted/60">Net</th>
                    <th className="text-right py-2 px-3 text-[10px] uppercase tracking-wider text-muted/60">GM%</th>
                    <th className="text-right py-2 px-3 text-[10px] uppercase tracking-wider text-muted/60">Cash</th>
                    <th className="text-right py-2 pl-3 text-[10px] uppercase tracking-wider text-muted/60">Cards</th>
                  </tr>
                </thead>
                <tbody>
                  {data.monthlyTrends.map((t) => (
                    <tr key={t.month} className="border-b border-border/10">
                      <td className="py-2 pr-4 text-muted">{t.month}</td>
                      <td className="py-2 px-3 text-right font-mono text-emerald-400">{fmtK(t.revenue)}</td>
                      <td className="py-2 px-3 text-right font-mono text-red-400/70">{fmtK(t.expenses)}</td>
                      <td className={cn("py-2 px-3 text-right font-mono", t.netIncome >= 0 ? "text-emerald-400" : "text-red-400")}>
                        {fmtK(t.netIncome)}
                      </td>
                      <td className="py-2 px-3 text-right font-mono">{t.grossMargin.toFixed(1)}%</td>
                      <td className="py-2 px-3 text-right font-mono">{fmtK(t.cashBalance)}</td>
                      <td className="py-2 pl-3 text-right font-mono text-muted">{fmtK(t.corpCardSpend)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── Departments Tab ── */}
      {activeTab === "departments" && (
        <div className="space-y-4">
          {data.departmentRisks.map((dept) => (
            <div key={dept.department} className={cn(
              "rounded-xl border p-5",
              dept.riskScore > 60 ? "bg-red-500/5 border-red-500/20" :
              dept.riskScore > 40 ? "bg-amber-500/5 border-amber-500/20" :
              "bg-card border-border/50"
            )}>
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className="text-sm font-semibold">{dept.department}</h3>
                  <p className="text-xs text-muted">{dept.topRisk}</p>
                </div>
                <div className={cn(
                  "text-2xl font-bold",
                  dept.riskScore > 60 ? "text-red-400" : dept.riskScore > 40 ? "text-amber-400" : "text-emerald-400"
                )}>
                  {dept.riskScore}
                  <span className="text-xs text-muted ml-1">/100</span>
                </div>
              </div>

              <div className="h-2 bg-surface rounded-full overflow-hidden mb-3">
                <div
                  className={cn(
                    "h-full rounded-full",
                    dept.riskScore > 60 ? "bg-red-500" : dept.riskScore > 40 ? "bg-amber-500" : "bg-emerald-500"
                  )}
                  style={{ width: `${dept.riskScore}%` }}
                />
              </div>

              <div className="grid grid-cols-3 gap-3 mb-3">
                <div className="text-center p-2 rounded-lg bg-surface/50">
                  <div className="text-lg font-semibold">{dept.flaggedTransactions}</div>
                  <div className="text-[10px] text-muted">Flagged Tx</div>
                </div>
                <div className="text-center p-2 rounded-lg bg-surface/50">
                  <div className="text-lg font-semibold">{dept.overBudgetMonths}</div>
                  <div className="text-[10px] text-muted">Over Budget Mo</div>
                </div>
                <div className="text-center p-2 rounded-lg bg-surface/50">
                  <div className="text-lg font-semibold">{dept.complianceIssues}</div>
                  <div className="text-[10px] text-muted">Missing Receipts</div>
                </div>
              </div>

              {dept.factors.length > 0 && (
                <div className="space-y-1">
                  <div className="text-[10px] uppercase tracking-wider text-muted/50">Risk Factors</div>
                  {dept.factors.map((f, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs text-muted-foreground">
                      <div className="w-1.5 h-1.5 rounded-full bg-amber-500/60" />
                      {f}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── Forecast Tab ── */}
      {activeTab === "forecast" && (
        <div className="space-y-4">
          {/* Cash Flow Forecast */}
          <div className="rounded-xl bg-card border border-border/50 p-5">
            <h3 className="text-sm font-medium mb-4">6-Month Cash Flow Projection</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border/30">
                    <th className="text-left py-2 text-[10px] uppercase tracking-wider text-muted/60">Month</th>
                    <th className="text-right py-2 text-[10px] uppercase tracking-wider text-muted/60">Inflows</th>
                    <th className="text-right py-2 text-[10px] uppercase tracking-wider text-muted/60">Outflows</th>
                    <th className="text-right py-2 text-[10px] uppercase tracking-wider text-muted/60">Net</th>
                    <th className="text-right py-2 text-[10px] uppercase tracking-wider text-muted/60">Balance</th>
                    <th className="text-right py-2 text-[10px] uppercase tracking-wider text-muted/60">Conf</th>
                    <th className="text-left py-2 pl-4 text-[10px] uppercase tracking-wider text-muted/60">Risks</th>
                  </tr>
                </thead>
                <tbody>
                  {data.cashFlowForecast.map((f) => (
                    <tr key={f.month} className="border-b border-border/10">
                      <td className="py-2.5 text-muted">{f.month}</td>
                      <td className="py-2.5 text-right font-mono text-emerald-400">{fmtK(f.projectedInflows)}</td>
                      <td className="py-2.5 text-right font-mono text-red-400/70">{fmtK(f.projectedOutflows)}</td>
                      <td className={cn("py-2.5 text-right font-mono font-medium", f.projectedNetCash >= 0 ? "text-emerald-400" : "text-red-400")}>
                        {f.projectedNetCash >= 0 ? "+" : ""}{fmtK(f.projectedNetCash)}
                      </td>
                      <td className="py-2.5 text-right font-mono">{fmtK(f.projectedBalance)}</td>
                      <td className="py-2.5 text-right font-mono text-muted">{Math.round(f.confidence * 100)}%</td>
                      <td className="py-2.5 pl-4 text-muted/70">
                        {f.risks.length > 0 ? f.risks.join("; ") : "None"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Runway Scenarios Detail */}
          <div className="rounded-xl bg-card border border-border/50 p-5">
            <h3 className="text-sm font-medium mb-4">Runway Scenario Analysis</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {data.runwayProjections.map((r) => (
                <div key={r.scenario} className={cn(
                  "rounded-xl p-5 border",
                  r.scenario === "optimistic" ? "border-emerald-500/20 bg-emerald-500/5" :
                  r.scenario === "pessimistic" ? "border-red-500/20 bg-red-500/5" :
                  "border-accent/20 bg-accent/5"
                )}>
                  <div className="text-xs uppercase tracking-wider text-muted/60 mb-2">{r.scenario} scenario</div>
                  <div className="text-3xl font-bold mb-1">{r.runwayMonths}<span className="text-sm text-muted ml-1">months</span></div>
                  <div className="text-xs text-muted mb-1">Until: {r.runwayDate}</div>
                  <div className="text-xs text-muted mb-3">Monthly burn: {fmtK(r.monthlyBurn)}</div>
                  <div className="text-[10px] uppercase tracking-wider text-muted/50 mb-1">Assumptions</div>
                  <ul className="space-y-1">
                    {r.assumptions.map((a, i) => (
                      <li key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
                        <span className="text-muted/40 mt-0.5">-</span>
                        {a}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>

          {/* Causal Drivers of Forecast */}
          <div className="rounded-xl bg-card border border-border/50 p-5">
            <h3 className="text-sm font-medium mb-4">Causal Drivers (What Moves the Needle)</h3>
            <div className="space-y-3">
              {data.causalRelationships.map((c, i) => (
                <div key={i} className="flex items-center gap-4 p-3 rounded-lg bg-surface/50 border border-border/20">
                  <div className="flex items-center gap-2 w-48 shrink-0">
                    <span className="text-xs font-medium text-accent">{c.source}</span>
                    <svg className="w-4 h-4 text-muted/40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                    </svg>
                    <span className="text-xs font-medium">{c.target}</span>
                  </div>
                  <div className="flex-1 text-xs text-muted-foreground">{c.description}</div>
                  <div className="flex gap-3 text-[10px] text-muted/50 shrink-0">
                    <span className={cn("font-mono", c.effectSize > 0 ? "text-emerald-400/70" : "text-red-400/70")}>
                      {c.effectSize > 0 ? "+" : ""}{(c.effectSize * 100).toFixed(0)}%
                    </span>
                    <span>{c.lagDays}d lag</span>
                    <span>{Math.round(c.confidence * 100)}% conf</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
