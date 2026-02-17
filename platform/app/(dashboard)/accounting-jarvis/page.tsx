"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

// ── Types ───────────────────────────────────────────────────────────────────

interface AccountTypeSummary {
  type: string;
  accountCount: number;
  totalDebit: number;
  totalCredit: number;
}

interface MonthlyTrend {
  month: string;
  revenue: number;
  expenses: number;
  netIncome: number;
}

interface BenfordsLaw {
  expected: number[];
  observed: number[];
  chiSquare: number;
  conforming: boolean;
}

interface AccountEntry {
  account: string;
  amount: number;
}

interface ExpenseCategory {
  category: string;
  amount: number;
}

interface SourceType {
  source: string;
  count: number;
}

interface AccountingAnalysis {
  summary: {
    totalTransactions: number;
    totalAccounts: number;
    dateRange: { from: string; to: string };
    totalDebits: number;
    totalCredits: number;
    doubleEntryBalanced: boolean;
    doubleEntryVariance: number;
    jurisdiction: string;
    currency: string;
  };
  profitAndLoss: {
    revenueAccounts: AccountEntry[];
    totalRevenue: number;
    expenseAccounts: AccountEntry[];
    totalExpenses: number;
    netProfit: number;
    grossMargin: number;
    topExpenseCategories: ExpenseCategory[];
  };
  balanceSheet: {
    totalAssets: number;
    totalLiabilities: number;
    totalEquity: number;
    balanced: boolean;
    assets: AccountEntry[];
    liabilities: AccountEntry[];
    equity: AccountEntry[];
  };
  keyRatios: {
    cashBalance: number;
    burnRate: number;
    runwayMonths: number;
    netMargin: number;
  };
  monthlyTrends: MonthlyTrend[];
  anomalyDetection: {
    benfordsLaw: BenfordsLaw;
  };
  accountTypeSummary: AccountTypeSummary[];
  sourceTypeDistribution: SourceType[];
}

// ── Formatters ──────────────────────────────────────────────────────────────

function fmtK(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

function fmtPct(n: number): string {
  return `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;
}

const TYPE_COLORS: Record<string, string> = {
  revenue: "bg-emerald-500",
  expense: "bg-red-500",
  asset: "bg-blue-500",
  liability: "bg-amber-500",
  equity: "bg-purple-500",
  bank: "bg-cyan-500",
  unclassified: "bg-zinc-500",
};

// ── Mini Bar Chart ──────────────────────────────────────────────────────────

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

// ── Benford's Law Chart ─────────────────────────────────────────────────────

function BenfordsChart({ expected, observed }: { expected: number[]; observed: number[] }) {
  const maxVal = Math.max(...expected, ...observed);
  return (
    <div className="space-y-1">
      {expected.map((exp, i) => (
        <div key={i} className="flex items-center gap-2 text-xs">
          <div className="w-4 text-right text-muted/60 font-mono">{i + 1}</div>
          <div className="flex-1 flex gap-1 items-center">
            <div className="flex-1 h-3 bg-surface rounded-sm overflow-hidden relative">
              <div
                className="absolute inset-y-0 left-0 bg-accent/40 rounded-sm"
                style={{ width: `${(exp / maxVal) * 100}%` }}
              />
              <div
                className={cn(
                  "absolute inset-y-0 left-0 rounded-sm",
                  Math.abs(observed[i] - exp) > 0.02 ? "bg-amber-500/70" : "bg-emerald-500/70"
                )}
                style={{ width: `${(observed[i] / maxVal) * 100}%` }}
              />
            </div>
            <div className="w-16 text-[10px] text-muted font-mono">
              {(observed[i] * 100).toFixed(1)}% / {(exp * 100).toFixed(1)}%
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function AccountingJarvisPage() {
  const [data, setData] = useState<AccountingAnalysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/accounting-jarvis")
      .then((r) => r.json())
      .then((d) => {
        if (d.error && !d.analysis) {
          setError(d.error);
        } else {
          setData(d.analysis);
        }
        setLoading(false);
      })
      .catch(() => {
        setError("Failed to connect to Accounting Jarvis API");
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="text-center">
          <div className="w-12 h-12 rounded-xl bg-emerald-500/15 flex items-center justify-center mx-auto mb-4">
            <svg className="w-6 h-6 text-emerald-400 animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
            </svg>
          </div>
          <p className="text-sm text-muted">Loading Accounting Jarvis...</p>
          <p className="text-xs text-muted/50 mt-1">Processing Xero GL data through the brain</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="text-center max-w-md">
          <div className="w-12 h-12 rounded-xl bg-amber-500/15 flex items-center justify-center mx-auto mb-4">
            <svg className="w-6 h-6 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
            </svg>
          </div>
          <p className="text-sm text-muted mb-2">{error}</p>
          <code className="text-[10px] text-muted/50 bg-surface rounded px-2 py-1">
            npx tsx scripts/setup-accounting-jarvis.ts
          </code>
        </div>
      </div>
    );
  }

  if (!data) return <div className="text-center py-20 text-muted">No data available</div>;

  const s = data.summary;
  const pnl = data.profitAndLoss;
  const bs = data.balanceSheet;
  const kr = data.keyRatios;
  const trends = data.monthlyTrends;
  const benford = data.anomalyDetection.benfordsLaw;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/15 flex items-center justify-center">
            <svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
            </svg>
          </div>
          <div>
            <h1 className="text-xl font-semibold">Accounting Jarvis</h1>
            <p className="text-xs text-muted">
              Design Partner GL Analysis ({s.jurisdiction}) | {s.currency} | {s.dateRange.from} to {s.dateRange.to}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Link href="/finance-jarvis" className="px-3 py-1.5 text-xs rounded-lg bg-card border border-border-subtle hover:border-accent/30 transition-colors">
            Finance Jarvis
          </Link>
          <Link href="/copilot" className="px-3 py-1.5 text-xs rounded-lg bg-accent text-white hover:bg-accent-dark transition-colors">
            Ask Copilot
          </Link>
        </div>
      </div>

      {/* KPI Cards — Row 1: Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Total Transactions", value: s.totalTransactions.toLocaleString(), sub: `${s.totalAccounts} accounts`, trend: true },
          { label: "Total Debits", value: fmtK(s.totalDebits), sub: fmtK(s.totalCredits) + " credits", trend: true },
          { label: "Double-Entry", value: s.doubleEntryBalanced ? "Balanced" : "Variance", sub: s.doubleEntryBalanced ? "Debits = Credits" : `$${s.doubleEntryVariance.toFixed(2)} gap`, trend: s.doubleEntryBalanced },
          { label: "Net Profit", value: fmtK(pnl.netProfit), sub: `Margin: ${fmtPct(kr.netMargin)}`, trend: pnl.netProfit >= 0 },
        ].map((kpi) => (
          <div key={kpi.label} className="rounded-xl bg-card border border-border-subtle p-4">
            <div className="text-[10px] uppercase tracking-wider text-muted/60 mb-1">{kpi.label}</div>
            <div className="text-xl font-semibold">{kpi.value}</div>
            <div className={cn("text-xs mt-0.5", kpi.trend ? "text-emerald-400" : "text-red-400/80")}>{kpi.sub}</div>
          </div>
        ))}
      </div>

      {/* KPI Cards — Row 2: Financial Health */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Total Revenue", value: fmtK(pnl.totalRevenue), sub: `${pnl.revenueAccounts.length} accounts`, trend: pnl.totalRevenue > 0 },
          { label: "Total Expenses", value: fmtK(pnl.totalExpenses), sub: `${pnl.expenseAccounts.length} accounts`, trend: false },
          { label: "Cash Balance", value: fmtK(kr.cashBalance), sub: `${kr.runwayMonths.toFixed(0)}mo runway`, trend: kr.runwayMonths > 12 },
          { label: "Monthly Burn", value: fmtK(kr.burnRate), sub: kr.burnRate > 0 ? "6mo avg" : "No burn data", trend: false },
        ].map((kpi) => (
          <div key={kpi.label} className="rounded-xl bg-card border border-border-subtle p-4">
            <div className="text-[10px] uppercase tracking-wider text-muted/60 mb-1">{kpi.label}</div>
            <div className="text-xl font-semibold">{kpi.value}</div>
            <div className={cn("text-xs mt-0.5", kpi.trend ? "text-emerald-400" : "text-red-400/80")}>{kpi.sub}</div>
          </div>
        ))}
      </div>

      {/* Revenue & Expense Trends */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-xl bg-card border border-border-subtle p-5">
          <h3 className="text-sm font-medium mb-3">Revenue Trend ({trends.length}mo)</h3>
          <MiniBarChart data={trends.map((t) => t.revenue)} color="bg-emerald-500/70" />
          <div className="flex justify-between text-[10px] text-muted/50 mt-1">
            <span>{trends[0]?.month}</span>
            <span>{trends[trends.length - 1]?.month}</span>
          </div>
        </div>
        <div className="rounded-xl bg-card border border-border-subtle p-5">
          <h3 className="text-sm font-medium mb-3">Net Income ({trends.length}mo)</h3>
          <MiniBarChart data={trends.map((t) => t.netIncome)} color="bg-accent/70" />
          <div className="flex justify-between text-[10px] text-muted/50 mt-1">
            <span>{trends[0]?.month}</span>
            <span>{trends[trends.length - 1]?.month}</span>
          </div>
        </div>
      </div>

      {/* P&L Detail */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Revenue Breakdown */}
        <div className="rounded-xl bg-card border border-border-subtle p-5">
          <h3 className="text-sm font-medium mb-4">Revenue Accounts (Top {pnl.revenueAccounts.length})</h3>
          <div className="space-y-2">
            {pnl.revenueAccounts.slice(0, 10).map((a) => (
              <div key={a.account} className="flex items-center gap-3">
                <div className="flex-1 min-w-0 text-xs truncate">{a.account}</div>
                <div className="flex-1 h-2 bg-surface rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-500/70 rounded-full"
                    style={{ width: `${Math.min((a.amount / pnl.totalRevenue) * 100, 100)}%` }}
                  />
                </div>
                <div className="w-20 text-right text-xs font-mono text-emerald-400">{fmtK(a.amount)}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Top Expense Categories */}
        <div className="rounded-xl bg-card border border-border-subtle p-5">
          <h3 className="text-sm font-medium mb-4">Top Expense Categories</h3>
          <div className="space-y-2">
            {pnl.topExpenseCategories.map((c) => (
              <div key={c.category} className="flex items-center gap-3">
                <div className="w-24 text-xs capitalize">{c.category}</div>
                <div className="flex-1 h-2 bg-surface rounded-full overflow-hidden">
                  <div
                    className="h-full bg-red-500/60 rounded-full"
                    style={{ width: `${Math.min((c.amount / pnl.totalExpenses) * 100, 100)}%` }}
                  />
                </div>
                <div className="w-20 text-right text-xs font-mono text-red-400/80">{fmtK(c.amount)}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Balance Sheet */}
      <div className="rounded-xl bg-card border border-border-subtle p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-medium">Balance Sheet Summary</h3>
          <span className={cn(
            "text-[10px] px-2 py-0.5 rounded-full",
            bs.balanced ? "bg-emerald-500/15 text-emerald-400" : "bg-amber-500/15 text-amber-400"
          )}>
            {bs.balanced ? "Balanced" : "Imbalanced"}
          </span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Assets */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <div className="w-2 h-2 rounded-full bg-blue-500" />
              <span className="text-xs font-medium">Total Assets</span>
              <span className="ml-auto text-xs font-mono text-blue-400">{fmtK(bs.totalAssets)}</span>
            </div>
            <div className="space-y-1">
              {bs.assets.slice(0, 8).map((a) => (
                <div key={a.account} className="flex justify-between text-[11px]">
                  <span className="text-muted truncate mr-2">{a.account}</span>
                  <span className="font-mono shrink-0">{fmtK(a.amount)}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Liabilities */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <div className="w-2 h-2 rounded-full bg-amber-500" />
              <span className="text-xs font-medium">Total Liabilities</span>
              <span className="ml-auto text-xs font-mono text-amber-400">{fmtK(bs.totalLiabilities)}</span>
            </div>
            <div className="space-y-1">
              {bs.liabilities.slice(0, 8).map((a) => (
                <div key={a.account} className="flex justify-between text-[11px]">
                  <span className="text-muted truncate mr-2">{a.account}</span>
                  <span className="font-mono shrink-0">{fmtK(a.amount)}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Equity */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <div className="w-2 h-2 rounded-full bg-purple-500" />
              <span className="text-xs font-medium">Total Equity</span>
              <span className="ml-auto text-xs font-mono text-purple-400">{fmtK(bs.totalEquity)}</span>
            </div>
            <div className="space-y-1">
              {bs.equity.map((a) => (
                <div key={a.account} className="flex justify-between text-[11px]">
                  <span className="text-muted truncate mr-2">{a.account}</span>
                  <span className="font-mono shrink-0">{fmtK(a.amount)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Account Type Distribution + Source Types */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Account Type Distribution */}
        <div className="rounded-xl bg-card border border-border-subtle p-5">
          <h3 className="text-sm font-medium mb-4">Account Type Distribution</h3>
          <div className="space-y-3">
            {data.accountTypeSummary.map((at) => {
              const total = data.accountTypeSummary.reduce((s, a) => s + a.accountCount, 0);
              return (
                <div key={at.type} className="flex items-center gap-3">
                  <div className={cn("w-2 h-2 rounded-full", TYPE_COLORS[at.type] || TYPE_COLORS.unclassified)} />
                  <div className="w-24 text-xs capitalize">{at.type}</div>
                  <div className="flex-1 h-2 bg-surface rounded-full overflow-hidden">
                    <div
                      className={cn("h-full rounded-full", TYPE_COLORS[at.type] || TYPE_COLORS.unclassified)}
                      style={{ width: `${(at.accountCount / total) * 100}%`, opacity: 0.6 }}
                    />
                  </div>
                  <div className="w-16 text-right text-xs font-mono">{at.accountCount} accts</div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Source Type Distribution */}
        <div className="rounded-xl bg-card border border-border-subtle p-5">
          <h3 className="text-sm font-medium mb-4">Transaction Source Types</h3>
          <div className="space-y-2">
            {data.sourceTypeDistribution.slice(0, 10).map((st) => {
              const maxCount = data.sourceTypeDistribution[0]?.count || 1;
              return (
                <div key={st.source} className="flex items-center gap-3">
                  <div className="w-32 text-xs truncate">{st.source}</div>
                  <div className="flex-1 h-2 bg-surface rounded-full overflow-hidden">
                    <div
                      className="h-full bg-accent/50 rounded-full"
                      style={{ width: `${(st.count / maxCount) * 100}%` }}
                    />
                  </div>
                  <div className="w-16 text-right text-xs font-mono">{st.count.toLocaleString()}</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Anomaly Detection — Benford's Law */}
      <div className="rounded-xl bg-card border border-border-subtle p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-medium">Anomaly Detection: Benford&apos;s Law</h3>
            <p className="text-[10px] text-muted/60 mt-0.5">
              First-digit frequency analysis | Chi-square: {benford.chiSquare.toFixed(2)} (critical: 15.51)
            </p>
          </div>
          <span className={cn(
            "text-[10px] px-2 py-0.5 rounded-full",
            benford.conforming ? "bg-emerald-500/15 text-emerald-400" : "bg-red-500/15 text-red-400"
          )}>
            {benford.conforming ? "Conforming" : "Anomaly Detected"}
          </span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <div className="text-[10px] text-muted/60 mb-2">Observed (bars) vs Expected (background) — digits 1-9</div>
            <BenfordsChart expected={benford.expected} observed={benford.observed} />
          </div>
          <div className="flex flex-col justify-center">
            <div className="space-y-3 text-xs">
              <div className="rounded-lg bg-surface p-3 border border-border-subtle">
                <div className="text-[10px] uppercase tracking-wider text-muted/60 mb-1">Interpretation</div>
                {benford.conforming ? (
                  <p className="text-emerald-400">Transaction amounts follow the expected Benford distribution. This is consistent with naturally occurring financial data and suggests no systemic manipulation.</p>
                ) : (
                  <p className="text-amber-400">Transaction amounts deviate from Benford&apos;s Law. This could indicate rounding, threshold-based entries, or data quality issues worth investigating.</p>
                )}
              </div>
              <div className="rounded-lg bg-surface p-3 border border-border-subtle">
                <div className="text-[10px] uppercase tracking-wider text-muted/60 mb-1">NexusBrain Causal Layer</div>
                <p className="text-muted-foreground">Phase 1.5: The brain&apos;s causal intelligence detects patterns a pure LLM would miss — temporal clustering, vendor concentration, and cross-account cascade risks.</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Top Expense Accounts Table */}
      <div className="rounded-xl bg-card border border-border-subtle p-5">
        <h3 className="text-sm font-medium mb-4">Top Expense Accounts (by volume)</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border-subtle">
                <th className="text-left py-2 text-muted/60 font-normal">Account</th>
                <th className="text-right py-2 text-muted/60 font-normal">Amount</th>
                <th className="text-right py-2 text-muted/60 font-normal">% of Expenses</th>
                <th className="text-left py-2 pl-3 text-muted/60 font-normal">Bar</th>
              </tr>
            </thead>
            <tbody>
              {pnl.expenseAccounts.slice(0, 15).map((a) => (
                <tr key={a.account} className="border-b border-border-subtle/50 hover:bg-surface/50 transition-colors">
                  <td className="py-1.5 truncate max-w-[200px]">{a.account}</td>
                  <td className="text-right py-1.5 font-mono">{fmtK(a.amount)}</td>
                  <td className="text-right py-1.5 text-muted font-mono">
                    {pnl.totalExpenses > 0 ? ((a.amount / pnl.totalExpenses) * 100).toFixed(1) : "0.0"}%
                  </td>
                  <td className="py-1.5 pl-3 w-32">
                    <div className="h-1.5 bg-surface rounded-full overflow-hidden">
                      <div
                        className="h-full bg-red-500/50 rounded-full"
                        style={{ width: `${pnl.totalExpenses > 0 ? Math.min((a.amount / pnl.totalExpenses) * 100, 100) : 0}%` }}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Data Source Footer */}
      <div className="text-center py-4 text-[10px] text-muted/30">
        Data source: Xero General Ledger Detail (Design Partner) | Processed through NexusBrain Accounting-as-a-Service agents | {s.totalTransactions.toLocaleString()} transactions across {s.totalAccounts} accounts
      </div>
    </div>
  );
}
