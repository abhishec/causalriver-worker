"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import type { FinanceJarvisAnalysis, InsightSeverity } from "@/lib/finance-jarvis";

// ─── Formatters ─────────────────────────────────────────────────────────────

const CURRENCY_SYMBOL = "S$"; // SGD short symbol for compact display

function fmtK(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `${CURRENCY_SYMBOL}${(n / 1_000_000).toFixed(2)}M`;
  if (Math.abs(n) >= 1_000) return `${CURRENCY_SYMBOL}${(n / 1_000).toFixed(0)}K`;
  return `${CURRENCY_SYMBOL}${n.toFixed(0)}`;
}

function fmtPct(n: number): string {
  return `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;
}

const SEVERITY_STYLES: Record<InsightSeverity, { bg: string; text: string; dot: string }> = {
  critical: { bg: "bg-red-500/10", text: "text-red-400", dot: "bg-red-500" },
  warning: { bg: "bg-amber-500/10", text: "text-amber-400", dot: "bg-amber-500" },
  info: { bg: "bg-blue-500/10", text: "text-blue-400", dot: "bg-blue-500" },
  positive: { bg: "bg-emerald-500/10", text: "text-emerald-400", dot: "bg-emerald-500" },
};

// ─── Mini Chart (sparkline-style bar chart) ─────────────────────────────────

function MiniBarChart({ data, color = "bg-accent" }: { data: number[]; color?: string }) {
  const max = Math.max(...data.map(Math.abs), 1);
  return (
    <div className="flex items-end gap-0.5 h-10">
      {data.map((v, i) => (
        <div
          key={i}
          className={cn("w-2 rounded-sm transition-all", v >= 0 ? color : "bg-red-500/60")}
          style={{ height: `${Math.max((Math.abs(v) / max) * 100, 4)}%` }}
        />
      ))}
    </div>
  );
}

// ─── Page ───────────────────────────────────────────────────────────────────

export default function FinanceJarvisPage() {
  const [data, setData] = useState<FinanceJarvisAnalysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/finance-jarvis")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d) => {
        if (!d.analysis) throw new Error("No analysis data returned");
        setData(d.analysis);
        setLoading(false);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to load finance data");
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="text-center">
          <div className="w-12 h-12 rounded-xl bg-accent/15 flex items-center justify-center mx-auto mb-4">
            <svg className="w-6 h-6 text-accent animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <p className="text-sm text-muted">Loading Finance Jarvis...</p>
          <p className="text-xs text-muted/50 mt-1">Analyzing Xero + Volopay data through the brain</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="text-center max-w-sm">
          <div className="w-12 h-12 rounded-xl bg-red-500/15 flex items-center justify-center mx-auto mb-4">
            <svg className="w-6 h-6 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
            </svg>
          </div>
          <p className="text-sm font-medium text-foreground mb-1">Failed to load Finance Jarvis</p>
          <p className="text-xs text-muted mb-4">{error || "No data returned from the API"}</p>
          <button
            onClick={() => { setError(null); setLoading(true); window.location.reload(); }}
            className="px-4 py-1.5 text-xs rounded-lg bg-accent text-white hover:bg-accent-dark transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const k = data.kpis;
  const trends = data.monthlyTrends;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/15 flex items-center justify-center">
            <svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <h1 className="text-xl font-semibold">Finance Jarvis</h1>
            <p className="text-xs text-muted">Real-time CFO intelligence from Xero + Volopay</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Link href="/finance-jarvis/reports" className="px-3 py-1.5 text-xs rounded-lg bg-card border border-border-subtle hover:border-accent/30 transition-colors">
            Reports
          </Link>
          <Link href="/copilot" className="px-3 py-1.5 text-xs rounded-lg bg-accent text-white hover:bg-accent-dark transition-colors">
            Ask Copilot
          </Link>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "ARR", value: fmtK(k.arr), sub: fmtPct(k.arrGrowth) + " MoM", trend: k.arrGrowth >= 0 },
          { label: "Monthly Revenue", value: fmtK(k.totalRevenue), sub: fmtPct(k.totalRevenueGrowth), trend: k.totalRevenueGrowth >= 0 },
          { label: "Gross Margin", value: `${k.grossMargin}%`, sub: k.grossMargin >= 75 ? "Above benchmark" : "Below 75% target", trend: k.grossMargin >= 75 },
          { label: "Net Burn", value: fmtK(k.netBurnRate), sub: `${k.runwayMonths}mo runway`, trend: false },
          { label: "Cash Balance", value: fmtK(k.cashBalance), sub: k.runwayMonths > 18 ? "Healthy" : "Monitor", trend: k.runwayMonths > 18 },
          { label: "Corp Card Spend", value: fmtK(k.totalCorpCardSpend), sub: `${k.flaggedTransactions} flagged`, trend: k.flaggedTransactions === 0 },
          { label: "Overdue Invoices", value: String(k.invoicesOverdue), sub: fmtK(k.arOutstanding) + " outstanding", trend: k.invoicesOverdue === 0 },
          { label: "Depts Over Budget", value: String(k.overBudgetDepartments), sub: `of 6 departments`, trend: k.overBudgetDepartments === 0 },
        ].map((kpi) => (
          <div key={kpi.label} className="rounded-xl bg-card border border-border-subtle p-4">
            <div className="text-[10px] uppercase tracking-wider text-muted/60 mb-1">{kpi.label}</div>
            <div className="text-xl font-semibold">{kpi.value}</div>
            <div className={cn("text-xs mt-0.5", kpi.trend ? "text-emerald-400" : "text-red-400/80")}>{kpi.sub}</div>
          </div>
        ))}
      </div>

      {/* Revenue & Expense Trend */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-xl bg-card border border-border-subtle p-5">
          <h3 className="text-sm font-medium mb-3">Revenue Trend (12mo)</h3>
          <MiniBarChart data={trends.map((t) => t.revenue)} color="bg-emerald-500/70" />
          <div className="flex justify-between text-[10px] text-muted/50 mt-1">
            <span>{trends[0]?.month}</span>
            <span>{trends[trends.length - 1]?.month}</span>
          </div>
        </div>
        <div className="rounded-xl bg-card border border-border-subtle p-5">
          <h3 className="text-sm font-medium mb-3">Net Income (12mo)</h3>
          <MiniBarChart data={trends.map((t) => t.netIncome)} color="bg-accent/70" />
          <div className="flex justify-between text-[10px] text-muted/50 mt-1">
            <span>{trends[0]?.month}</span>
            <span>{trends[trends.length - 1]?.month}</span>
          </div>
        </div>
      </div>

      {/* Insights Feed */}
      <div className="rounded-xl bg-card border border-border-subtle p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-medium">Brain Insights ({data.insights.length})</h3>
          <Link href="/finance-jarvis/reports" className="text-xs text-accent hover:underline">View all</Link>
        </div>
        <div className="space-y-3">
          {data.insights.slice(0, 6).map((insight) => {
            const style = SEVERITY_STYLES[insight.severity];
            return (
              <div key={insight.id} className={cn("rounded-lg p-3 border border-border-subtle", style.bg)}>
                <div className="flex items-start gap-2">
                  <div className={cn("w-2 h-2 rounded-full mt-1.5 shrink-0", style.dot)} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={cn("text-sm font-medium", style.text)}>{insight.title}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface text-muted">{insight.category}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface text-muted">{insight.source}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{insight.description}</p>
                    <p className="text-xs text-muted mt-2">
                      <span className="text-accent">Recommendation:</span> {insight.recommendation}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-[10px] text-muted/50">{Math.round(insight.confidence * 100)}% conf</div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Department Risk + Cash Forecast */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Department Risk Scores */}
        <div className="rounded-xl bg-card border border-border-subtle p-5">
          <h3 className="text-sm font-medium mb-4">Department Risk Scores (Volopay)</h3>
          <div className="space-y-3">
            {data.departmentRisks.map((d) => (
              <div key={d.department} className="flex items-center gap-3">
                <div className="w-24 text-xs">{d.department}</div>
                <div className="flex-1 h-2 bg-surface rounded-full overflow-hidden">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all",
                      d.riskScore > 60 ? "bg-red-500" : d.riskScore > 40 ? "bg-amber-500" : "bg-emerald-500"
                    )}
                    style={{ width: `${d.riskScore}%` }}
                  />
                </div>
                <div className="w-10 text-right text-xs font-mono">{d.riskScore}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Cash Forecast */}
        <div className="rounded-xl bg-card border border-border-subtle p-5">
          <h3 className="text-sm font-medium mb-4">Cash Forecast (6mo)</h3>
          <div className="space-y-2.5">
            {data.cashFlowForecast.map((f) => {
              const confPct = Math.round(f.confidence * 100);
              return (
                <div key={f.month}>
                  <div className="flex items-center gap-3 text-xs">
                    <div className="w-16 text-muted">{f.month}</div>
                    <div className={cn("w-20 font-mono", f.projectedNetCash >= 0 ? "text-emerald-400" : "text-red-400")}>
                      {f.projectedNetCash >= 0 ? "+" : ""}{fmtK(f.projectedNetCash)}
                    </div>
                    <div className="flex-1 text-right text-muted-foreground font-mono">{fmtK(f.projectedBalance)}</div>
                    <div className="w-10 text-right text-muted/50">{confPct}%</div>
                  </div>
                  {/* Confidence interval bar */}
                  <div className="ml-16 mt-1 h-1 bg-surface rounded-full overflow-hidden">
                    <div
                      className={cn(
                        "h-full rounded-full transition-all",
                        confPct >= 80 ? "bg-emerald-500/60" : confPct >= 60 ? "bg-amber-500/60" : "bg-red-500/40"
                      )}
                      style={{ width: `${confPct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Causal Relationships */}
      <div className="rounded-xl bg-card border border-border-subtle p-5">
        <h3 className="text-sm font-medium mb-4">Brain-Discovered Causal Relationships</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {data.causalRelationships.slice(0, 6).map((c, i) => (
            <div key={i} className="rounded-lg bg-surface p-3 border border-border-subtle">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-medium text-accent">{c.source}</span>
                <svg className="w-3 h-3 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
                <span className="text-xs font-medium">{c.target}</span>
              </div>
              <p className="text-[11px] text-muted-foreground leading-relaxed">{c.description}</p>
              <div className="flex gap-3 mt-1.5 text-[10px] text-muted/60">
                <span>Effect: {(c.effectSize * 100).toFixed(0)}%</span>
                <span>Lag: {c.lagDays}d</span>
                <span>Conf: {Math.round(c.confidence * 100)}%</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Runway Scenarios */}
      <div className="rounded-xl bg-card border border-border-subtle p-5">
        <h3 className="text-sm font-medium mb-4">Runway Scenarios</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {data.runwayProjections.map((r) => (
            <div key={r.scenario} className={cn(
              "rounded-lg p-4 border",
              r.scenario === "optimistic" ? "border-emerald-500/20 bg-emerald-500/5" :
              r.scenario === "pessimistic" ? "border-red-500/20 bg-red-500/5" :
              "border-accent/20 bg-accent/5"
            )}>
              <div className="text-[10px] uppercase tracking-wider text-muted/60 mb-1">{r.scenario}</div>
              <div className="text-2xl font-semibold">{r.runwayMonths}<span className="text-sm text-muted ml-1">months</span></div>
              <div className="text-xs text-muted mt-1">Burn: {fmtK(r.monthlyBurn)}/mo</div>
              <div className="text-xs text-muted/50 mt-2 leading-relaxed">{r.assumptions.join(" | ")}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Data Source Footer */}
      <div className="text-center py-4 text-[10px] text-muted/30">
        Data sources: Xero (accounting) + Volopay (corporate cards) | Analyzed through Brain OS causal intelligence engine
      </div>
    </div>
  );
}
