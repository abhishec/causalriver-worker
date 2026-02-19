"use client";

import { useState, useEffect, useRef, useCallback } from "react";
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

interface TransactionInterpretation {
  date: string;
  account: string;
  description: string;
  reference: string;
  amount: number;
  direction: 'debit' | 'credit';
  accountType: string;
  narrative: string;
  businessImpact: 'positive' | 'neutral' | 'watch';
  category: string;
}

interface PriorPeriodComparison {
  currentPeriodMonths: string[];
  priorPeriodMonths: string[];
  current: { totalRevenue: number; totalExpenses: number; netProfit: number };
  prior: { totalRevenue: number; totalExpenses: number; netProfit: number };
  variance: {
    revenue: number;
    revenuePct: number;
    expenses: number;
    expensesPct: number;
    netProfit: number;
    netProfitPct: number;
  };
  autoCommentary: string[];
  hasEnoughData: boolean;
}

interface BalanceMovementAlert {
  account: string;
  accountType: string;
  currentBalance: number;
  priorBalance: number;
  movementPct: number;
  direction: 'increase' | 'decrease';
  severity: 'critical' | 'high' | 'medium';
  narrative: string;
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
  priorPeriodComparison?: PriorPeriodComparison;
  balanceMovementAlerts?: BalanceMovementAlert[];
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
  transactionInterpretations?: TransactionInterpretation[];
}

interface AgentStreamEvent {
  type: "progress" | "result" | "error";
  progress?: number;
  message?: string;
  data?: Record<string, unknown>;
  agentName?: string;
  action?: string;
  timing?: { totalMs: number };
  brainMetadata?: {
    brainAugmented: boolean;
    causalEdgesUsed: number;
    patternsUsed: number;
    intelligenceScore: number;
    brainAccuracy: number;
    federationEnabled?: boolean;
  };
  error?: string;
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

function fmtMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
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

// ── Prior-Period Comparison Panel ───────────────────────────────────────────

function PriorPeriodPanel({ comparison }: { comparison: PriorPeriodComparison }) {
  if (!comparison.hasEnoughData) {
    return (
      <div className="rounded-xl bg-card border border-border-subtle p-5">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-7 h-7 rounded-lg bg-blue-500/15 flex items-center justify-center shrink-0">
            <svg className="w-3.5 h-3.5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
            </svg>
          </div>
          <div>
            <h3 className="text-sm font-medium">Prior-Period Comparison</h3>
            <p className="text-[11px] text-muted/60">Need 2+ periods of GL data for comparison</p>
          </div>
        </div>
        <p className="text-xs text-muted/50">Upload at least 2 periods of Xero GL data to enable prior-period comparison and 20% movement alerts.</p>
      </div>
    );
  }

  const v = comparison.variance;
  const fmt = (n: number) => `$${Math.abs(n / 1000).toFixed(0)}K`;
  const varColor = (pct: number) => pct > 0 ? 'text-emerald-400' : 'text-red-400';
  const varIcon = (pct: number) => pct > 0 ? '↑' : '↓';

  return (
    <div className="rounded-xl bg-card border border-border-subtle overflow-hidden">
      <div className="flex items-center gap-3 px-5 py-4 border-b border-border-subtle">
        <div className="w-7 h-7 rounded-lg bg-blue-500/15 flex items-center justify-center shrink-0">
          <svg className="w-3.5 h-3.5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
          </svg>
        </div>
        <div>
          <h3 className="text-sm font-semibold">Prior-Period P&L Comparison</h3>
          <p className="text-[11px] text-muted/60">
            Current: {comparison.currentPeriodMonths[0]} → {comparison.currentPeriodMonths[comparison.currentPeriodMonths.length - 1] || comparison.currentPeriodMonths[0]}
            {' '}&nbsp;|&nbsp; Prior: {comparison.priorPeriodMonths[0]} → {comparison.priorPeriodMonths[comparison.priorPeriodMonths.length - 1] || comparison.priorPeriodMonths[0]}
          </p>
        </div>
        <div className="ml-auto">
          <span className="text-[10px] bg-blue-500/10 text-blue-400 px-2 py-0.5 rounded-full font-medium">Function 01</span>
        </div>
      </div>

      <div className="p-5 space-y-4">
        {/* 3-column comparison table */}
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border-subtle">
                <th className="text-left py-2 text-muted/60 font-normal">Metric</th>
                <th className="text-right py-2 text-muted/60 font-normal">Current Period</th>
                <th className="text-right py-2 text-muted/60 font-normal">Prior Period</th>
                <th className="text-right py-2 text-muted/60 font-normal">Variance</th>
              </tr>
            </thead>
            <tbody>
              {[
                {
                  label: 'Total Revenue',
                  cur: comparison.current.totalRevenue,
                  pri: comparison.prior.totalRevenue,
                  pct: v.revenuePct,
                  colorCur: 'text-emerald-400',
                },
                {
                  label: 'Total Expenses',
                  cur: comparison.current.totalExpenses,
                  pri: comparison.prior.totalExpenses,
                  pct: v.expensesPct,
                  colorCur: 'text-red-400',
                },
                {
                  label: 'Net Profit / (Loss)',
                  cur: comparison.current.netProfit,
                  pri: comparison.prior.netProfit,
                  pct: v.netProfitPct,
                  colorCur: comparison.current.netProfit >= 0 ? 'text-emerald-400' : 'text-red-400',
                  bold: true,
                },
              ].map((row) => (
                <tr key={row.label} className={cn("border-b border-border-subtle/40", row.bold && "font-semibold")}>
                  <td className="py-2 text-muted/70">{row.label}</td>
                  <td className={cn("py-2 text-right font-mono", row.colorCur)}>{fmt(row.cur)}</td>
                  <td className="py-2 text-right font-mono text-muted/60">{fmt(row.pri)}</td>
                  <td className={cn("py-2 text-right font-mono", varColor(row.pct))}>
                    {varIcon(row.pct)} {Math.abs(row.pct).toFixed(1)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Auto-commentary */}
        <div className="rounded-lg bg-blue-500/5 border border-blue-500/20 p-3">
          <p className="text-[10px] uppercase tracking-wider text-blue-400/70 mb-1.5">Auto-Commentary</p>
          <ul className="space-y-1">
            {comparison.autoCommentary.map((c, i) => (
              <li key={i} className="flex gap-2 text-[11px] text-muted/80">
                <span className="text-blue-400/50 shrink-0">→</span>
                {c}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

// ── Balance Movement Alerts Panel ───────────────────────────────────────────

function BalanceMovementAlertsPanel({ alerts }: { alerts: BalanceMovementAlert[] }) {
  const [expanded, setExpanded] = useState<number | null>(null);
  const critical = alerts.filter(a => a.severity === 'critical');
  const high = alerts.filter(a => a.severity === 'high');
  const medium = alerts.filter(a => a.severity === 'medium');

  if (alerts.length === 0) return null;

  const sevConfig = {
    critical: { badge: 'bg-red-500/10 text-red-400 border-red-500/20', dot: 'bg-red-400', label: 'Critical' },
    high:     { badge: 'bg-amber-500/10 text-amber-400 border-amber-500/20', dot: 'bg-amber-400', label: 'High' },
    medium:   { badge: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20', dot: 'bg-yellow-400', label: 'Medium' },
  };

  return (
    <div className="rounded-xl bg-card border border-border-subtle overflow-hidden">
      <div className="flex items-center gap-3 px-5 py-4 border-b border-border-subtle">
        <div className="w-7 h-7 rounded-lg bg-amber-500/15 flex items-center justify-center shrink-0">
          <svg className="w-3.5 h-3.5 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
          </svg>
        </div>
        <div>
          <h3 className="text-sm font-semibold">20% Balance Movement Alerts</h3>
          <p className="text-[11px] text-muted/60">
            {alerts.length} accounts moved ≥20% vs prior period
            {critical.length > 0 && ` · ${critical.length} critical`}
            {high.length > 0 && ` · ${high.length} high`}
          </p>
        </div>
        <div className="ml-auto flex gap-1">
          {critical.length > 0 && <span className="text-[10px] bg-red-500/10 text-red-400 px-2 py-0.5 rounded-full">{critical.length} Critical</span>}
          {high.length > 0 && <span className="text-[10px] bg-amber-500/10 text-amber-400 px-2 py-0.5 rounded-full">{high.length} High</span>}
        </div>
      </div>

      <div className="divide-y divide-border-subtle/50">
        {alerts.slice(0, 10).map((alert, idx) => {
          const sc = sevConfig[alert.severity];
          const isOpen = expanded === idx;
          return (
            <div
              key={idx}
              className="group cursor-pointer hover:bg-surface/50 transition-colors"
              onClick={() => setExpanded(isOpen ? null : idx)}
            >
              <div className="flex items-center gap-3 px-5 py-3">
                <div className={cn("w-2 h-2 rounded-full shrink-0", sc.dot)} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-xs font-medium truncate">{alert.account}</p>
                    <span className={cn("text-[9px] px-1.5 py-0.5 rounded border shrink-0", sc.badge)}>{alert.accountType}</span>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className={cn("text-xs font-mono font-semibold", alert.direction === 'increase' ? 'text-amber-400' : 'text-blue-400')}>
                    {alert.direction === 'increase' ? '↑' : '↓'} {Math.abs(alert.movementPct).toFixed(1)}%
                  </div>
                  <div className={cn("text-[9px] px-1.5 py-0.5 rounded border mt-0.5", sc.badge)}>{sc.label}</div>
                </div>
                <svg className={cn("w-3.5 h-3.5 text-muted/30 shrink-0 transition-transform", isOpen && "rotate-180")} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                </svg>
              </div>
              {isOpen && (
                <div className="px-5 pb-4 pt-0">
                  <div className="ml-5 pl-3 border-l-2 border-amber-500/20">
                    <p className="text-[11px] text-muted/80 leading-relaxed">{alert.narrative}</p>
                    <div className="flex gap-4 mt-2 text-[10px] text-muted/50 font-mono">
                      <span>Prior: SGD {Math.abs(alert.priorBalance).toLocaleString('en-SG', { maximumFractionDigits: 0 })}</span>
                      <span>Current: SGD {Math.abs(alert.currentBalance).toLocaleString('en-SG', { maximumFractionDigits: 0 })}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
      {alerts.length > 10 && (
        <div className="px-5 py-2 border-t border-border-subtle/50 text-[10px] text-muted/40">
          +{alerts.length - 10} more alerts — export CSV for full list
        </div>
      )}
    </div>
  );
}

// ── CAS Score Panel (Causal Anomaly Score) ───────────────────────────────────

interface CASData {
  casScore?: number;
  casRating?: string;
  casBreakdown?: {
    completeness: number;
    consistency: number;
    conformity: number;
    conditionAlerts: number;
    brainIntelligence: number;
  };
  highRiskConditions?: Array<{ type: string; condition?: string; description: string; severity: string }>;
  causalAnomalies?: Array<{ type: string; condition?: string; description: string; severity: string }>;
  brainValueAdd?: string;
  edgesAnalyzed?: number;
}

function CASScorePanel({ data }: { data: CASData }) {
  if (data.casScore === undefined) return null;

  const score = data.casScore;
  const rating = data.casRating || '';
  const bd = data.casBreakdown;

  const ratingConfig = {
    low_risk:      { label: 'Low Risk', color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20', bar: 'bg-emerald-400' },
    elevated_risk: { label: 'Elevated Risk', color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/20', bar: 'bg-amber-400' },
    high_risk:     { label: 'High Risk', color: 'text-orange-400', bg: 'bg-orange-500/10 border-orange-500/20', bar: 'bg-orange-400' },
    critical_risk: { label: 'Critical Risk', color: 'text-red-400', bg: 'bg-red-500/10 border-red-500/20', bar: 'bg-red-400' },
  };
  const rc = ratingConfig[rating as keyof typeof ratingConfig] || ratingConfig.elevated_risk;

  const conditionLabels: Record<string, string> = {
    A: 'Revenue Recognition Risk',
    B: 'Audit-Window Expense Spike',
    C: 'CPF / Payroll Link Absent',
    D: 'Weak Causal Relationship',
  };

  return (
    <div className={cn("rounded-xl border overflow-hidden", rc.bg)}>
      <div className="flex items-center gap-3 px-5 py-4 border-b border-border-subtle">
        <div className="w-7 h-7 rounded-lg bg-purple-500/20 flex items-center justify-center shrink-0">
          <svg className="w-3.5 h-3.5 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
          </svg>
        </div>
        <div>
          <h3 className="text-sm font-semibold">Causal Anomaly Score (CAS)</h3>
          <p className="text-[11px] text-muted/60">0–100 · 5 structured dimensions · Function 02</p>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <span className={cn("text-[10px] px-2 py-0.5 rounded-full font-medium border", rc.bg, rc.color)}>{rc.label}</span>
          <span className={cn("text-3xl font-bold tabular-nums", rc.color)}>{score}</span>
          <span className="text-muted/40 text-xs">/100</span>
        </div>
      </div>

      <div className="p-5 space-y-4">
        {/* Score bar */}
        <div>
          <div className="h-2 bg-surface/60 rounded-full overflow-hidden">
            <div className={cn("h-full rounded-full transition-all", rc.bar)} style={{ width: `${score}%` }} />
          </div>
          <div className="flex justify-between text-[10px] text-muted/40 mt-1">
            <span>0 — Critical</span><span>40</span><span>60</span><span>80</span><span>100 — Clean</span>
          </div>
        </div>

        {/* 5-dimension breakdown */}
        {bd && (
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted/50 mb-2">Score Breakdown (5 Dimensions, max 20 each)</p>
            <div className="space-y-1.5">
              {[
                { key: 'completeness', label: 'Causal Edge Completeness', value: bd.completeness },
                { key: 'consistency', label: 'Statistical Consistency', value: bd.consistency },
                { key: 'conformity', label: 'Distributional Conformity', value: bd.conformity },
                { key: 'conditionAlerts', label: 'High-Risk Condition Alerts (A–D)', value: bd.conditionAlerts },
                { key: 'brainIntelligence', label: 'Brain Intelligence Level', value: bd.brainIntelligence },
              ].map(dim => (
                <div key={dim.key} className="flex items-center gap-3">
                  <span className="text-[10px] text-muted/60 w-52 shrink-0 truncate">{dim.label}</span>
                  <div className="flex-1 h-1.5 bg-surface/60 rounded-full overflow-hidden">
                    <div className={cn("h-full rounded-full", dim.value >= 15 ? 'bg-emerald-400' : dim.value >= 8 ? 'bg-amber-400' : 'bg-red-400')}
                      style={{ width: `${(dim.value / 20) * 100}%` }} />
                  </div>
                  <span className="text-[10px] font-mono w-8 text-right text-muted/60">{dim.value}/20</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* High-risk conditions A-D */}
        {data.highRiskConditions && data.highRiskConditions.length > 0 && (
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted/50 mb-2">
              High-Risk Conditions Triggered ({data.highRiskConditions.length})
            </p>
            <div className="space-y-2">
              {data.highRiskConditions.map((c, i) => (
                <div key={i} className="rounded-lg border border-red-500/20 bg-red-500/5 p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[9px] bg-red-500/20 text-red-400 px-2 py-0.5 rounded font-mono font-bold">
                      Condition {c.condition}
                    </span>
                    <span className="text-xs font-medium text-red-300">
                      {conditionLabels[c.condition || ''] || c.type.replace(/_/g, ' ')}
                    </span>
                  </div>
                  <p className="text-[11px] text-muted/80 leading-relaxed">{c.description}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Brain value add */}
        {data.brainValueAdd && (
          <div className="rounded-lg bg-purple-500/10 border border-purple-500/20 p-3">
            <p className="text-[10px] uppercase tracking-wider text-purple-400/70 mb-1">🧠 NexusBrain vs Pure AI</p>
            <p className="text-[11px] text-purple-200/80 leading-relaxed">{data.brainValueAdd}</p>
            {data.edgesAnalyzed !== undefined && (
              <p className="text-[10px] text-purple-400/50 mt-1">{data.edgesAnalyzed} causal edges analysed · invisible to Claude, GPT, or any base LLM</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Transaction Interpretations Panel ──────────────────────────────────────

function TransactionInterpretationsPanel({
  interpretations,
}: {
  interpretations: TransactionInterpretation[];
}) {
  const [expanded, setExpanded] = useState<number | null>(null);
  const [filter, setFilter] = useState<'all' | 'positive' | 'neutral' | 'watch'>('all');

  const filtered = interpretations.filter(i => filter === 'all' || i.businessImpact === filter);

  const impactConfig = {
    positive: { label: 'Revenue / Cash In', dot: 'bg-emerald-400', badge: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20', icon: '↑' },
    neutral: { label: 'Neutral / Operational', dot: 'bg-zinc-400', badge: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20', icon: '→' },
    watch: { label: 'Watch / Outflow', dot: 'bg-amber-400', badge: 'bg-amber-500/10 text-amber-400 border-amber-500/20', icon: '!' },
  };

  if (!interpretations || interpretations.length === 0) return null;

  return (
    <div className="rounded-xl bg-card border border-border-subtle overflow-hidden">
      <div className="flex items-center gap-3 px-5 py-4 border-b border-border-subtle">
        <div className="w-7 h-7 rounded-lg bg-emerald-500/15 flex items-center justify-center shrink-0">
          <svg className="w-3.5 h-3.5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
          </svg>
        </div>
        <div>
          <h3 className="text-sm font-semibold">Transaction Interpretations</h3>
          <p className="text-[11px] text-muted/60">Top {interpretations.length} transactions by value — plain-English business context</p>
        </div>
        <div className="ml-auto flex items-center gap-1">
          {(['all', 'positive', 'neutral', 'watch'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                "px-2 py-0.5 rounded text-[10px] transition-colors capitalize",
                filter === f
                  ? f === 'positive' ? 'bg-emerald-500/15 text-emerald-400'
                    : f === 'watch' ? 'bg-amber-500/15 text-amber-400'
                    : f === 'neutral' ? 'bg-zinc-500/15 text-zinc-400'
                    : 'bg-accent/15 text-accent'
                  : 'text-muted/50 hover:text-muted/80'
              )}
            >
              {f === 'all' ? `All (${interpretations.length})` :
               f === 'positive' ? `↑ Rev/In (${interpretations.filter(i => i.businessImpact === 'positive').length})` :
               f === 'watch' ? `! Watch (${interpretations.filter(i => i.businessImpact === 'watch').length})` :
               `→ Neutral (${interpretations.filter(i => i.businessImpact === 'neutral').length})`}
            </button>
          ))}
        </div>
      </div>

      <div className="divide-y divide-border-subtle/50">
        {filtered.map((txn, idx) => {
          const ic = impactConfig[txn.businessImpact];
          const isOpen = expanded === idx;
          return (
            <div
              key={idx}
              className="group cursor-pointer hover:bg-surface/50 transition-colors"
              onClick={() => setExpanded(isOpen ? null : idx)}
            >
              <div className="flex items-center gap-3 px-5 py-3">
                {/* Impact dot */}
                <div className={cn("w-2 h-2 rounded-full shrink-0", ic.dot)} />

                {/* Date + account */}
                <div className="w-20 shrink-0">
                  <div className="text-[10px] font-mono text-muted/50">{txn.date}</div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-xs font-medium truncate">{txn.account}</p>
                    <span className={cn("text-[9px] px-1.5 py-0.5 rounded border shrink-0", ic.badge)}>
                      {txn.category}
                    </span>
                  </div>
                  {txn.description && (
                    <p className="text-[10px] text-muted/50 truncate">{txn.description}</p>
                  )}
                </div>

                {/* Amount */}
                <div className="text-right shrink-0">
                  <div className={cn(
                    "text-xs font-mono font-semibold",
                    txn.direction === 'credit' ? "text-emerald-400" : "text-foreground"
                  )}>
                    {txn.direction === 'credit' ? '+' : '-'} SGD {txn.amount.toLocaleString('en-SG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                  <div className="text-[10px] text-muted/40 capitalize">{txn.direction}</div>
                </div>

                {/* Expand icon */}
                <svg
                  className={cn("w-3.5 h-3.5 text-muted/30 shrink-0 transition-transform", isOpen && "rotate-180")}
                  fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                </svg>
              </div>

              {/* Expanded narrative */}
              {isOpen && (
                <div className="px-5 pb-4 pt-0">
                  <div className="ml-5 pl-3 border-l-2 border-emerald-500/20">
                    <p className="text-[11px] text-muted/80 leading-relaxed">{txn.narrative}</p>
                    {txn.reference && (
                      <p className="text-[10px] text-muted/40 mt-1">Ref: {txn.reference}</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-8 text-[11px] text-muted/40">No transactions match this filter</div>
      )}
    </div>
  );
}

// ── GL Upload Panel ──────────────────────────────────────────────────────────

interface UploadState {
  status: "idle" | "dragging" | "uploading" | "success" | "error";
  fileName?: string;
  fileSize?: number;
  progress?: number;
  result?: {
    transactionCount?: number;
    signalsIngested?: number;
    brainTriggered?: boolean;
    causalEdgesSeeded?: number;
    causalStatus?: string;
    key?: string;
  };
  error?: string;
}

function GLUploadPanel({
  onUploadComplete,
}: {
  onUploadComplete: () => void;
}) {
  const [state, setState] = useState<UploadState>({ status: "idle" });
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(async (file: File) => {
    if (!file) return;

    // Validate
    const isJson = file.name.endsWith(".json") || file.type === "application/json";
    if (!isJson) {
      setState({ status: "error", error: "Only JSON files are supported. Export your Xero GL as JSON." });
      return;
    }
    if (file.size > 50 * 1024 * 1024) {
      setState({ status: "error", error: "File too large (max 50MB)." });
      return;
    }

    setState({ status: "uploading", fileName: file.name, fileSize: file.size, progress: 10 });

    const formData = new FormData();
    formData.append("file", file);
    formData.append("fileType", "gl-data");

    try {
      setState(s => ({ ...s, progress: 30 }));

      const res = await fetch("/api/connectors/s3-upload", {
        method: "POST",
        body: formData,
      });

      setState(s => ({ ...s, progress: 80 }));

      const data = await res.json();

      if (!res.ok || !data.success) {
        setState({
          status: "error",
          fileName: file.name,
          error: data.error || "Upload failed. Please try again.",
        });
        return;
      }

      setState({
        status: "success",
        fileName: file.name,
        fileSize: file.size,
        progress: 100,
        result: {
          transactionCount: data.brainIngestion?.transactionCount,
          signalsIngested: data.brainIngestion?.signalsIngested,
          brainTriggered: data.brainIngestion?.triggered,
          causalEdgesSeeded: data.brainIngestion?.causalBootstrap?.seeded,
          causalStatus: data.brainIngestion?.causalBootstrap?.status,
          key: data.upload?.key,
        },
      });

      // Refresh dashboard after short delay
      setTimeout(() => {
        onUploadComplete();
      }, 1500);
    } catch (err: any) {
      setState({
        status: "error",
        fileName: file.name,
        error: err.message || "Network error during upload.",
      });
    }
  }, [onUploadComplete]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setState(s => s.status === "idle" ? { ...s, status: "dragging" } : s);
  };

  const onDragLeave = () => {
    setState(s => s.status === "dragging" ? { ...s, status: "idle" } : s);
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = "";
  };

  const reset = () => setState({ status: "idle" });

  return (
    <div className="rounded-xl bg-card border border-border-subtle overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-4 border-b border-border-subtle">
        <div className="w-8 h-8 rounded-lg bg-emerald-500/15 flex items-center justify-center shrink-0">
          <svg className="w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
          </svg>
        </div>
        <div>
          <h2 className="text-sm font-semibold">Upload GL Data</h2>
          <p className="text-[11px] text-muted/70">Xero General Ledger export · JSON format · max 50MB</p>
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <span className="text-[10px] bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded-full font-medium">Self-serve</span>
          <span className="text-[10px] bg-blue-500/10 text-blue-400 px-2 py-0.5 rounded-full font-medium">Auto brain training</span>
        </div>
      </div>

      <div className="p-5">
        {/* Drop Zone */}
        {(state.status === "idle" || state.status === "dragging") && (
          <div
            onDrop={onDrop}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onClick={() => fileInputRef.current?.click()}
            className={cn(
              "border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all",
              state.status === "dragging"
                ? "border-emerald-400/70 bg-emerald-500/5"
                : "border-border-subtle hover:border-emerald-400/40 hover:bg-emerald-500/3"
            )}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,application/json"
              onChange={onFileChange}
              className="hidden"
            />
            <div className={cn(
              "w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-4 transition-colors",
              state.status === "dragging" ? "bg-emerald-500/20" : "bg-surface"
            )}>
              <svg className={cn("w-6 h-6 transition-colors", state.status === "dragging" ? "text-emerald-400" : "text-muted/60")} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m6.75 12l-3-3m0 0l-3 3m3-3v6m-1.5-15H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
              </svg>
            </div>
            {state.status === "dragging" ? (
              <p className="text-sm font-medium text-emerald-400">Drop your GL file here</p>
            ) : (
              <>
                <p className="text-sm font-medium mb-1">Drag & drop your Xero GL export</p>
                <p className="text-xs text-muted/60 mb-4">or click to browse files</p>
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-500/10 text-emerald-400 text-xs font-medium hover:bg-emerald-500/20 transition-colors">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                  </svg>
                  Choose JSON file
                </div>
              </>
            )}
          </div>
        )}

        {/* Uploading */}
        {state.status === "uploading" && (
          <div className="rounded-xl border border-border-subtle bg-surface/50 p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-8 h-8 rounded-lg bg-blue-500/15 flex items-center justify-center shrink-0">
                <svg className="w-4 h-4 text-blue-400 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium">{state.fileName}</p>
                <p className="text-[11px] text-muted/60">{((state.fileSize || 0) / 1024 / 1024).toFixed(2)} MB · Uploading & ingesting signals...</p>
              </div>
            </div>
            <div className="h-1.5 bg-surface rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-400 rounded-full transition-all duration-500"
                style={{ width: `${state.progress || 0}%` }}
              />
            </div>
            <p className="text-[10px] text-muted/50 mt-2">Uploading to secure storage → ingesting GL signals → queueing brain training...</p>
          </div>
        )}

        {/* Success */}
        {state.status === "success" && (
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-5">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-emerald-500/20 flex items-center justify-center shrink-0 mt-0.5">
                <svg className="w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-emerald-400 mb-1">GL data uploaded successfully</p>
                <p className="text-xs text-muted/70 mb-3">{state.fileName}</p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  {state.result?.transactionCount && (
                    <div className="rounded-lg bg-emerald-500/10 p-2.5 text-center">
                      <div className="text-base font-bold text-emerald-400">{state.result.transactionCount.toLocaleString()}</div>
                      <div className="text-[10px] text-muted/60">Transactions</div>
                    </div>
                  )}
                  {state.result?.signalsIngested !== undefined && (
                    <div className="rounded-lg bg-blue-500/10 p-2.5 text-center">
                      <div className="text-base font-bold text-blue-400">{state.result.signalsIngested}</div>
                      <div className="text-[10px] text-muted/60">Signals ingested</div>
                    </div>
                  )}
                  {state.result?.causalEdgesSeeded !== undefined && (
                    <div className="rounded-lg bg-indigo-500/10 p-2.5 text-center">
                      <div className="text-base font-bold text-indigo-400">{state.result.causalEdgesSeeded}</div>
                      <div className="text-[10px] text-muted/60">
                        Causal edges {state.result.causalStatus === "new" ? "seeded" : "refreshed"}
                      </div>
                    </div>
                  )}
                  <div className={cn("rounded-lg p-2.5 text-center", state.result?.brainTriggered ? "bg-purple-500/10" : "bg-surface")}>
                    <div className={cn("text-base font-bold", state.result?.brainTriggered ? "text-purple-400" : "text-muted/50")}>
                      {state.result?.brainTriggered ? "✓" : "–"}
                    </div>
                    <div className="text-[10px] text-muted/60">Brain queued</div>
                  </div>
                </div>
                <p className="text-[10px] text-muted/50 mt-3">Dashboard refreshing...</p>
              </div>
            </div>
            <button onClick={reset} className="mt-3 text-[11px] text-muted/50 hover:text-muted transition-colors">
              Upload another file →
            </button>
          </div>
        )}

        {/* Error */}
        {state.status === "error" && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-5">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-red-500/15 flex items-center justify-center shrink-0">
                <svg className="w-4 h-4 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                </svg>
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-red-400 mb-1">Upload failed</p>
                <p className="text-xs text-muted/70">{state.error}</p>
                <button onClick={reset} className="mt-3 text-xs text-red-400/70 hover:text-red-400 transition-colors">
                  Try again →
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Instructions */}
        {state.status === "idle" && (
          <div className="mt-4 rounded-lg bg-surface/70 border border-border-subtle p-3">
            <p className="text-[10px] text-muted/60 font-medium uppercase tracking-wider mb-2">How to export from Xero</p>
            <ol className="space-y-1 text-[11px] text-muted/70">
              <li>1. Xero → Accounting → Reports → General Ledger</li>
              <li>2. Set date range → Export → <strong className="text-muted">JSON format</strong></li>
              <li>3. Drop the file above — analysis runs automatically</li>
            </ol>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Brain Training Panel ────────────────────────────────────────────────────

interface BrainTrainState {
  status: "idle" | "running" | "done" | "error";
  progress?: number;
  message?: string;
  result?: {
    durationMs?: number;
    intelligenceScore?: number;
    causalEdges?: number;
    patterns?: number;
  };
  error?: string;
}

function BrainTrainingPanel({ organizationId }: { organizationId?: string }) {
  const [state, setState] = useState<BrainTrainState>({ status: "idle" });

  const triggerTraining = async () => {
    setState({ status: "running", progress: 5, message: "Initiating brain cycle..." });

    try {
      setState(s => ({ ...s, progress: 20, message: "Assembling causal graph from GL signals..." }));

      const res = await fetch("/api/brain/cycle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId,
          mode: "lightweight",
          input: {
            query: "[manual-trigger] AAS partner initiated brain training from accounting dashboard",
          },
        }),
      });

      setState(s => ({ ...s, progress: 70, message: "Running cognitive layers L1–L15..." }));

      const data = await res.json();

      if (!res.ok) {
        setState({ status: "error", error: data.error || "Brain cycle failed." });
        return;
      }

      setState({
        status: "done",
        progress: 100,
        result: {
          durationMs: data.duration_ms,
          intelligenceScore: data.intelligence_score,
          causalEdges: data.causal_edges,
          patterns: data.patterns,
        },
      });

      // Auto-reset after 8s
      setTimeout(() => setState({ status: "idle" }), 8000);
    } catch (err: any) {
      setState({ status: "error", error: err.message || "Network error." });
    }
  };

  return (
    <div className="rounded-xl bg-card border border-border-subtle overflow-hidden">
      <div className="flex items-center gap-3 px-5 py-4 border-b border-border-subtle">
        <div className="w-8 h-8 rounded-lg bg-purple-500/15 flex items-center justify-center shrink-0">
          <svg className="w-4 h-4 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
          </svg>
        </div>
        <div>
          <h2 className="text-sm font-semibold">Brain Training</h2>
          <p className="text-[11px] text-muted/70">Run causal learning on your GL signals</p>
        </div>
        <div className="ml-auto">
          <span className="text-[10px] bg-purple-500/10 text-purple-400 px-2 py-0.5 rounded-full font-medium">Phase 1.5</span>
        </div>
      </div>

      <div className="p-5">
        {state.status === "idle" && (
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <p className="text-xs text-muted/70 leading-relaxed">
                Train NexusBrain on your GL signals to unlock causal insights — links between revenue changes, expense spikes, and operational events.
              </p>
            </div>
            <button
              onClick={triggerTraining}
              className="shrink-0 flex items-center gap-2 px-4 py-2 rounded-lg bg-purple-500/15 text-purple-400 text-xs font-medium hover:bg-purple-500/25 transition-colors border border-purple-500/20"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z" />
              </svg>
              Run Training
            </button>
          </div>
        )}

        {state.status === "running" && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <svg className="w-4 h-4 text-purple-400 animate-spin shrink-0" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              <p className="text-xs text-purple-300">{state.message}</p>
            </div>
            <div className="h-1 bg-surface rounded-full overflow-hidden">
              <div
                className="h-full bg-purple-400 rounded-full transition-all duration-700"
                style={{ width: `${state.progress || 0}%` }}
              />
            </div>
            <p className="text-[10px] text-muted/40 mt-2">Running cognitive layers L1–L15 → Bayesian weight updates → causal graph evolution</p>
          </div>
        )}

        {state.status === "done" && (
          <div className="flex items-start gap-3">
            <div className="w-7 h-7 rounded-lg bg-purple-500/20 flex items-center justify-center shrink-0">
              <svg className="w-3.5 h-3.5 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
            </div>
            <div className="flex-1">
              <p className="text-xs font-medium text-purple-300 mb-2">Brain training complete</p>
              <div className="flex gap-3 flex-wrap">
                {state.result?.durationMs && (
                  <span className="text-[11px] text-muted/60">⏱ {fmtMs(state.result.durationMs)}</span>
                )}
                {state.result?.causalEdges !== undefined && (
                  <span className="text-[11px] text-muted/60">🔗 {state.result.causalEdges} causal edges</span>
                )}
                {state.result?.patterns !== undefined && (
                  <span className="text-[11px] text-muted/60">🧩 {state.result.patterns} patterns</span>
                )}
                {state.result?.intelligenceScore !== undefined && (
                  <span className="text-[11px] text-muted/60">🧠 IQ {(state.result.intelligenceScore * 100).toFixed(0)}</span>
                )}
              </div>
            </div>
          </div>
        )}

        {state.status === "error" && (
          <div className="flex items-center gap-3">
            <svg className="w-4 h-4 text-red-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
            </svg>
            <div>
              <p className="text-xs text-red-400">{state.error}</p>
              <button onClick={() => setState({ status: "idle" })} className="text-[11px] text-muted/50 hover:text-muted mt-1">
                Try again →
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Req 2: Agent Execution Panel (Phase 1.5) ────────────────────────────────

type AgentAction = "full" | "bookkeep" | "reconcile" | "statements" | "tax" | "audit" | "anomaly" | "causal-analysis";

const AGENT_ACTIONS: { value: AgentAction; label: string; desc: string; badge: string }[] = [
  { value: "full", label: "Full Causal Analysis", desc: "All 7 agents + V9 causal accountant", badge: "Recommended" },
  { value: "causal-analysis", label: "Causal Analysis", desc: "Why revenue/expense patterns changed", badge: "Phase 1.5" },
  { value: "anomaly", label: "Anomaly Detection", desc: "Benford's Law + vendor concentration + duplicates", badge: "" },
  { value: "statements", label: "Financial Statements", desc: "P&L, Balance Sheet, Cash Flow", badge: "" },
  { value: "audit", label: "Audit Preparation", desc: "Audit readiness workpapers", badge: "" },
  { value: "tax", label: "Tax Compliance", desc: "GST/WHT computation (SG)", badge: "" },
  { value: "bookkeep", label: "Bookkeeping", desc: "Journal entries + account classification", badge: "" },
  { value: "reconcile", label: "Reconciliation", desc: "Month-end account reconciliation", badge: "" },
];

interface AgentRunState {
  status: "idle" | "running" | "done" | "error";
  action?: AgentAction;
  messages: string[];
  progress: number;
  result?: Record<string, unknown>;
  agentName?: string;
  timing?: { totalMs: number };
  brainMetadata?: AgentStreamEvent["brainMetadata"];
  error?: string;
}

function AgentExecutionPanel({ onRunComplete }: { onRunComplete?: () => void }) {
  const [selectedAction, setSelectedAction] = useState<AgentAction>("full");
  const [runState, setRunState] = useState<AgentRunState>({ status: "idle", messages: [], progress: 0 });
  const abortRef = useRef<AbortController | null>(null);

  const runAgent = async () => {
    if (runState.status === "running") {
      abortRef.current?.abort();
      setRunState(s => ({ ...s, status: "idle" }));
      return;
    }

    abortRef.current = new AbortController();
    setRunState({ status: "running", action: selectedAction, messages: [], progress: 0 });

    try {
      const res = await fetch("/api/aaas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: selectedAction }),
        signal: abortRef.current.signal,
      });

      if (!res.ok) {
        const err = await res.json();
        setRunState(s => ({ ...s, status: "error", error: err.error || "Agent execution failed." }));
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) return;

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const raw = line.slice(6).trim();
          if (raw === "[DONE]") break;

          try {
            const event = JSON.parse(raw) as AgentStreamEvent;

            if (event.type === "progress") {
              setRunState(s => ({
                ...s,
                progress: Math.round((event.progress || 0) * 100),
                messages: event.message ? [...s.messages, event.message] : s.messages,
              }));
            } else if (event.type === "result") {
              setRunState(s => ({
                ...s,
                status: "done",
                progress: 100,
                result: event.data,
                agentName: event.agentName,
                timing: event.timing,
                brainMetadata: event.brainMetadata,
              }));
              // Notify parent to refresh artifacts panel (artifact is persisted ~fire-and-forget)
              setTimeout(() => onRunComplete?.(), 1200);
            } else if (event.type === "error") {
              setRunState(s => ({
                ...s,
                status: "error",
                error: event.error,
              }));
            }
          } catch {
            // ignore parse errors
          }
        }
      }
    } catch (err: any) {
      if (err.name !== "AbortError") {
        setRunState(s => ({ ...s, status: "error", error: err.message || "Network error." }));
      }
    }
  };

  const reset = () => setRunState({ status: "idle", messages: [], progress: 0 });

  return (
    <div className="rounded-xl bg-card border border-border-subtle overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-4 border-b border-border-subtle">
        <div className="w-8 h-8 rounded-lg bg-indigo-500/15 flex items-center justify-center shrink-0">
          <svg className="w-4 h-4 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 3v1.5M4.5 8.25H3m18 0h-1.5M4.5 12H3m18 0h-1.5m-15 3.75H3m18 0h-1.5M8.25 19.5V21M12 3v1.5m0 15V21m3.75-18v1.5m0 15V21m-9-1.5h10.5a2.25 2.25 0 002.25-2.25V6.75a2.25 2.25 0 00-2.25-2.25H6.75A2.25 2.25 0 004.5 6.75v10.5a2.25 2.25 0 002.25 2.25zm.75-12h9v9h-9v-9z" />
          </svg>
        </div>
        <div>
          <h2 className="text-sm font-semibold">Req 2 — AI Agent Execution</h2>
          <p className="text-[11px] text-muted/70">Phase 1.5 · 7 Brain-connected agents · SSE streaming</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {runState.status === "done" && runState.brainMetadata?.brainAugmented && (
            <span className="text-[10px] bg-purple-500/10 text-purple-400 px-2 py-0.5 rounded-full">
              🧠 Brain-augmented
            </span>
          )}
          {runState.status === "done" && runState.brainMetadata?.federationEnabled && (
            <span className="text-[10px] bg-blue-500/10 text-blue-400 px-2 py-0.5 rounded-full">
              🌐 Federated
            </span>
          )}
          {runState.status === "done" && runState.timing && (
            <span className="text-[10px] text-muted/50">{fmtMs(runState.timing.totalMs)}</span>
          )}
        </div>
      </div>

      <div className="p-5 space-y-4">
        {/* Action Selector */}
        <div>
          <label className="text-[10px] uppercase tracking-wider text-muted/60 mb-2 block">Select Agent</label>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-1.5">
            {AGENT_ACTIONS.map(a => (
              <button
                key={a.value}
                onClick={() => setSelectedAction(a.value)}
                disabled={runState.status === "running"}
                className={cn(
                  "text-left px-3 py-2 rounded-lg border text-xs transition-all",
                  selectedAction === a.value
                    ? "border-indigo-500/50 bg-indigo-500/10 text-indigo-300"
                    : "border-border-subtle bg-surface/50 text-muted/70 hover:border-indigo-500/30 hover:bg-indigo-500/5"
                )}
              >
                <div className="font-medium truncate">{a.label}</div>
                {a.badge && (
                  <span className="text-[9px] bg-indigo-500/20 text-indigo-400 px-1 py-0.5 rounded mt-0.5 inline-block">{a.badge}</span>
                )}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-muted/50 mt-1.5">
            {AGENT_ACTIONS.find(a => a.value === selectedAction)?.desc}
          </p>
        </div>

        {/* Run Button */}
        <button
          onClick={runAgent}
          className={cn(
            "w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all",
            runState.status === "running"
              ? "bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20"
              : "bg-indigo-500/15 text-indigo-300 border border-indigo-500/20 hover:bg-indigo-500/25"
          )}
        >
          {runState.status === "running" ? (
            <>
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 7.5A2.25 2.25 0 017.5 5.25h9a2.25 2.25 0 012.25 2.25v9a2.25 2.25 0 01-2.25 2.25h-9a2.25 2.25 0 01-2.25-2.25v-9z" />
              </svg>
              Stop
            </>
          ) : (
            <>
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z" />
              </svg>
              Run {AGENT_ACTIONS.find(a => a.value === selectedAction)?.label}
            </>
          )}
        </button>

        {/* Progress Stream */}
        {runState.status === "running" && (
          <div className="rounded-lg border border-border-subtle bg-surface/50 p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[11px] text-muted/60">Running agents...</p>
              <span className="text-[11px] font-mono text-indigo-400">{runState.progress}%</span>
            </div>
            <div className="h-1 bg-surface rounded-full overflow-hidden mb-3">
              <div
                className="h-full bg-indigo-400 rounded-full transition-all duration-300"
                style={{ width: `${runState.progress}%` }}
              />
            </div>
            <div className="space-y-1 max-h-24 overflow-y-auto">
              {runState.messages.map((msg, i) => (
                <p key={i} className={cn("text-[10px]", i === runState.messages.length - 1 ? "text-indigo-300" : "text-muted/40")}>
                  {i === runState.messages.length - 1 ? "→ " : "✓ "}{msg}
                </p>
              ))}
            </div>
          </div>
        )}

        {/* Result */}
        {runState.status === "done" && runState.result && (
          <div className="space-y-3">
            {/* Brain metadata */}
            {runState.brainMetadata && (
              <div className="rounded-lg border border-purple-500/20 bg-purple-500/5 p-3">
                <p className="text-[10px] uppercase tracking-wider text-purple-400/70 mb-2">Brain Intelligence Used</p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  <div className="text-center">
                    <div className="text-sm font-bold text-purple-400">{runState.brainMetadata.causalEdgesUsed}</div>
                    <div className="text-[10px] text-muted/50">Causal edges</div>
                  </div>
                  <div className="text-center">
                    <div className="text-sm font-bold text-purple-400">{runState.brainMetadata.patternsUsed}</div>
                    <div className="text-[10px] text-muted/50">Patterns</div>
                  </div>
                  <div className="text-center">
                    <div className="text-sm font-bold text-purple-400">{(runState.brainMetadata.intelligenceScore * 100).toFixed(0)}</div>
                    <div className="text-[10px] text-muted/50">IQ score</div>
                  </div>
                  <div className="text-center">
                    <div className="text-sm font-bold text-purple-400">{(runState.brainMetadata.brainAccuracy * 100).toFixed(0)}%</div>
                    <div className="text-[10px] text-muted/50">Accuracy</div>
                  </div>
                </div>
              </div>
            )}

            {/* Agent result — rendered key sections */}
            <div className="rounded-lg border border-border-subtle bg-surface/30 p-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-[10px] uppercase tracking-wider text-muted/60">Agent Output · {runState.agentName}</p>
                <button
                  onClick={reset}
                  className="text-[10px] text-muted/40 hover:text-muted transition-colors"
                >
                  Clear
                </button>
              </div>
              <AgentResultView result={runState.result} action={runState.action} />
            </div>
          </div>
        )}

        {/* Error */}
        {runState.status === "error" && (
          <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-3 flex items-center gap-3">
            <svg className="w-4 h-4 text-red-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
            </svg>
            <div>
              <p className="text-xs text-red-400">{runState.error}</p>
              <button onClick={reset} className="text-[11px] text-muted/50 hover:text-muted mt-1">Dismiss</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Agent Result Renderer ───────────────────────────────────────────────────
// Each agent type gets a purpose-built renderer so the design partner sees
// structured output — not raw JSON. Falls back gracefully for unknown shapes.

function AgentResultView({ result, action }: { result: Record<string, unknown>; action?: AgentAction }) {
  // ── Tax / GST F5 renderer (priority — design partner will test this) ──
  const gstReturn = result.gstReturn as Record<string, number | boolean | string | undefined> | undefined;
  const corporateTax = result.corporateTax as Record<string, unknown> | undefined;
  if (gstReturn || action === "tax") {
    return <TaxResultView result={result} />;
  }

  // ── Audit renderer ──
  const auditReadiness = result.auditReadiness as Record<string, unknown> | undefined;
  if (auditReadiness || action === "audit") {
    return <AuditResultView result={result} />;
  }

  // ── Statement generator renderer ──
  const profitAndLoss = result.profitAndLoss as Record<string, unknown> | undefined;
  if (profitAndLoss || action === "statements") {
    return <StatementsResultView result={result} />;
  }

  // ── Reconciler renderer ──
  const trialBalance = result.trialBalance as Record<string, unknown> | undefined;
  if (trialBalance || action === "reconcile") {
    return <ReconcilerResultView result={result} />;
  }

  // ── Generic renderer (bookkeeper, anomaly, causal-analysis, full) ──
  return <GenericResultView result={result} />;
}

// ── GST F5 / Tax Compliance Result View ────────────────────────────────────
function TaxResultView({ result }: { result: Record<string, unknown> }) {
  const gst = result.gstReturn as Record<string, any> | undefined;
  const corp = result.corporateTax as Record<string, any> | undefined;
  const checklist = result.filingChecklist as Array<{ form: string; description: string; deadline: string; mandatory: boolean }> | undefined;
  const wht = result.withholdingTax as Record<string, any> | undefined;
  const complianceScore = result.complianceScore as number | undefined;
  const narrative = result.narrative as string | undefined;
  const recommendations = result.recommendations as string[] | undefined;

  const fmt = (n: number) => `SGD ${(n || 0).toLocaleString("en-SG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <div className="space-y-4 text-xs">
      {narrative && (
        <p className="text-muted/80 leading-relaxed text-[11px]">{narrative}</p>
      )}

      {/* Compliance Score */}
      {complianceScore !== undefined && (
        <div className="flex items-center gap-3">
          <span className="text-muted/60">Compliance Score</span>
          <div className="flex-1 h-1.5 bg-surface rounded-full overflow-hidden">
            <div className={cn("h-full rounded-full", complianceScore > 0.8 ? "bg-emerald-400" : complianceScore > 0.5 ? "bg-amber-400" : "bg-red-400")}
              style={{ width: `${complianceScore * 100}%` }} />
          </div>
          <span className="font-mono font-bold text-emerald-400">{(complianceScore * 100).toFixed(0)}%</span>
        </div>
      )}

      {/* IRAS GST F5 Return — 8 Boxes */}
      {gst && (
        <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/3 overflow-hidden">
          <div className="px-4 py-2.5 bg-emerald-500/8 border-b border-emerald-500/15 flex items-center justify-between">
            <span className="text-[11px] font-semibold text-emerald-300">IRAS GST F5 Return</span>
            {gst.gstRefundExpected && (
              <span className="text-[10px] bg-blue-500/15 text-blue-400 px-2 py-0.5 rounded-full">Refund expected</span>
            )}
          </div>
          <div className="p-4 space-y-0">
            {/* Supplies section */}
            <div className="text-[10px] uppercase tracking-wider text-muted/50 mb-1.5">Part I — GST on Supplies</div>
            {[
              { box: "Box 1", label: "Standard-Rated Supplies", value: gst.box1StandardRatedSupplies as number, highlight: false },
              { box: "Box 2", label: "Zero-Rated Supplies", value: gst.box2ZeroRatedSupplies as number, highlight: false },
              { box: "Box 3", label: "Exempt Supplies", value: gst.box3ExemptSupplies as number, highlight: false },
              { box: "Box 4", label: "Total Value of Supplies", value: gst.box4TotalSupplies as number, highlight: true },
            ].map(row => (
              <div key={row.box} className={cn("flex items-center justify-between py-1.5 border-b border-border-subtle/30", row.highlight && "font-semibold")}>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-muted/40 font-mono w-10">{row.box}</span>
                  <span className={row.highlight ? "text-foreground" : "text-muted/70"}>{row.label}</span>
                </div>
                <span className={cn("font-mono", row.highlight ? "text-emerald-400" : "text-muted/60")}>{fmt(row.value)}</span>
              </div>
            ))}
            {/* Purchases section */}
            <div className="text-[10px] uppercase tracking-wider text-muted/50 mt-3 mb-1.5">Part II — GST on Purchases</div>
            {[
              { box: "Box 5", label: "Total Value of Taxable Purchases", value: gst.box5TaxablePurchases as number, highlight: false },
              { box: "Box 6", label: "Output Tax Due", value: gst.box6OutputTax as number, highlight: false },
              { box: "Box 7", label: "Input Tax Claimable", value: gst.box7InputTax as number, highlight: false },
            ].map(row => (
              <div key={row.box} className="flex items-center justify-between py-1.5 border-b border-border-subtle/30">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-muted/40 font-mono w-10">{row.box}</span>
                  <span className="text-muted/70">{row.label}</span>
                </div>
                <span className="font-mono text-muted/60">{fmt(row.value)}</span>
              </div>
            ))}
            {/* Net GST — Box 8 */}
            <div className={cn(
              "flex items-center justify-between py-2.5 mt-1 rounded-lg px-2",
              (gst.netGST as number) < 0 ? "bg-blue-500/8 border border-blue-500/20" : "bg-amber-500/8 border border-amber-500/20"
            )}>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-muted/40 font-mono w-10">Box 8</span>
                <span className="font-semibold">Net GST {(gst.netGST as number) < 0 ? "Refundable" : "Payable"}</span>
              </div>
              <span className={cn("font-mono font-bold text-sm", (gst.netGST as number) < 0 ? "text-blue-400" : "text-amber-400")}>
                {fmt(Math.abs(gst.netGST as number))}
              </span>
            </div>
          </div>
          {gst.note && (
            <div className="px-4 pb-3">
              <p className="text-[10px] text-muted/50 italic mt-1">{gst.note as string}</p>
            </div>
          )}
        </div>
      )}

      {/* Corporate Tax */}
      {corp && (
        <div className="rounded-lg border border-border-subtle bg-surface/30 p-3">
          <p className="text-[10px] uppercase tracking-wider text-muted/50 mb-2">Corporate Tax ({corp.jurisdiction as string})</p>
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: "Taxable Income", value: fmt(corp.taxableIncome as number) },
              { label: `Tax Rate (${((corp.corporateTaxRate as number) * 100).toFixed(0)}%)`, value: fmt(corp.estimatedTax as number) },
              { label: "Standard", value: corp.accountingStandard as string },
            ].map(item => (
              <div key={item.label} className="text-center rounded bg-card p-2">
                <div className="text-[10px] text-muted/50 mb-0.5">{item.label}</div>
                <div className="text-[11px] font-semibold">{item.value}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Withholding Tax */}
      {wht && (wht.totalWHT as number) > 0 && (
        <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
          <p className="text-[10px] uppercase tracking-wider text-amber-400/70 mb-2">Withholding Tax</p>
          <div className="flex items-center justify-between">
            <span className="text-muted/70">Total WHT Obligations</span>
            <span className="font-mono font-bold text-amber-400">{fmt(wht.totalWHT as number)}</span>
          </div>
        </div>
      )}

      {/* Filing Checklist */}
      {checklist && checklist.length > 0 && (
        <div>
          <p className="text-[10px] uppercase tracking-wider text-muted/50 mb-2">Filing Checklist</p>
          <div className="space-y-1.5">
            {checklist.slice(0, 6).map((item, i) => (
              <div key={i} className="flex items-center justify-between py-1.5 border-b border-border-subtle/40">
                <div className="flex items-center gap-2">
                  <span className={cn("text-[9px] px-1.5 py-0.5 rounded font-mono", item.mandatory ? "bg-red-500/10 text-red-400" : "bg-surface text-muted/50")}>
                    {item.mandatory ? "Required" : "Optional"}
                  </span>
                  <span className="text-muted/70">{item.form}: {item.description}</span>
                </div>
                <span className="text-[10px] text-muted/40 font-mono shrink-0 ml-2">{item.deadline}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {recommendations && recommendations.length > 0 && (
        <div>
          <p className="text-[10px] uppercase tracking-wider text-muted/50 mb-1.5">Recommendations</p>
          <ul className="space-y-1">
            {recommendations.slice(0, 4).map((r, i) => (
              <li key={i} className="flex gap-2">
                <span className="text-emerald-400/50 shrink-0">✓</span>
                <span className="text-muted/70">{r}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ── Audit Readiness Result View ─────────────────────────────────────────────
function AuditResultView({ result }: { result: Record<string, unknown> }) {
  const readiness = result.auditReadiness as { overallScore: number; rating: string; areas: Array<{ area: string; score: number; findings: string[]; recommendations: string[] }> } | undefined;
  const workpapers = result.workpapers as Array<{ title: string; area: string; summary: string; balanceTested: number; sampleSize: number; exceptionsFound: number; conclusion: string }> | undefined;
  const riskAreas = result.riskAreas as Array<{ area: string; riskLevel: string; description: string }> | undefined;
  const materiality = result.materialityAnalysis as { overallMateriality: number; performanceMateriality: number; itemsAboveMateriality: number } | undefined;
  const narrative = result.narrative as string | undefined;

  const ratingColor = readiness?.rating === "audit-ready" ? "text-emerald-400" : readiness?.rating === "minor-gaps" ? "text-amber-400" : "text-red-400";
  const ratingBg = readiness?.rating === "audit-ready" ? "bg-emerald-500/8 border-emerald-500/20" : readiness?.rating === "minor-gaps" ? "bg-amber-500/8 border-amber-500/20" : "bg-red-500/8 border-red-500/20";

  return (
    <div className="space-y-4 text-xs">
      {narrative && <p className="text-muted/80 leading-relaxed text-[11px]">{narrative}</p>}

      {/* Audit Readiness Score */}
      {readiness && (
        <div className={cn("rounded-lg border p-4", ratingBg)}>
          <div className="flex items-center justify-between mb-3">
            <span className="text-[11px] font-semibold">Audit Readiness</span>
            <span className={cn("text-sm font-bold", ratingColor)}>{readiness.rating.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase())}</span>
          </div>
          <div className="flex items-center gap-2 mb-3">
            <div className="flex-1 h-2 bg-surface rounded-full overflow-hidden">
              <div className={cn("h-full rounded-full", readiness.overallScore > 0.75 ? "bg-emerald-400" : readiness.overallScore > 0.5 ? "bg-amber-400" : "bg-red-400")}
                style={{ width: `${readiness.overallScore * 100}%` }} />
            </div>
            <span className="font-mono text-sm font-bold">{(readiness.overallScore * 100).toFixed(0)}%</span>
          </div>
          {/* Per-area scores */}
          <div className="space-y-1.5">
            {readiness.areas?.slice(0, 5).map((area, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="text-muted/50 w-36 truncate">{area.area}</span>
                <div className="flex-1 h-1 bg-surface rounded-full overflow-hidden">
                  <div className={cn("h-full rounded-full", area.score > 0.75 ? "bg-emerald-400/70" : area.score > 0.5 ? "bg-amber-400/70" : "bg-red-400/70")}
                    style={{ width: `${area.score * 100}%` }} />
                </div>
                <span className="font-mono text-[10px] text-muted/60 w-8 text-right">{(area.score * 100).toFixed(0)}%</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Materiality */}
      {materiality && (
        <div className="rounded-lg border border-border-subtle bg-surface/30 p-3">
          <p className="text-[10px] uppercase tracking-wider text-muted/50 mb-2">Materiality Analysis</p>
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: "Overall Materiality", value: `$${(materiality.overallMateriality / 1000).toFixed(0)}K` },
              { label: "Performance", value: `$${(materiality.performanceMateriality / 1000).toFixed(0)}K` },
              { label: "Items Above", value: materiality.itemsAboveMateriality.toString() },
            ].map(item => (
              <div key={item.label} className="text-center rounded bg-card p-2">
                <div className="text-[10px] text-muted/50 mb-0.5">{item.label}</div>
                <div className="text-[11px] font-semibold">{item.value}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Risk Areas */}
      {riskAreas && riskAreas.length > 0 && (
        <div>
          <p className="text-[10px] uppercase tracking-wider text-muted/50 mb-2">Risk Areas ({riskAreas.length})</p>
          <div className="space-y-1.5">
            {riskAreas.slice(0, 5).map((r, i) => (
              <div key={i} className={cn("rounded px-3 py-2 border flex items-start gap-2",
                r.riskLevel === "high" ? "border-red-500/20 bg-red-500/5" : r.riskLevel === "medium" ? "border-amber-500/20 bg-amber-500/5" : "border-border-subtle bg-surface/30")}>
                <span className={cn("text-[9px] px-1.5 py-0.5 rounded shrink-0 mt-0.5",
                  r.riskLevel === "high" ? "bg-red-500/20 text-red-400" : r.riskLevel === "medium" ? "bg-amber-500/20 text-amber-400" : "bg-surface text-muted/50")}>
                  {r.riskLevel.toUpperCase()}
                </span>
                <div>
                  <div className="font-medium">{r.area}</div>
                  <div className="text-muted/60 mt-0.5">{r.description}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Workpapers */}
      {workpapers && workpapers.length > 0 && (
        <div>
          <p className="text-[10px] uppercase tracking-wider text-muted/50 mb-2">Workpapers Prepared ({workpapers.length})</p>
          <div className="space-y-1.5">
            {workpapers.slice(0, 4).map((wp, i) => (
              <div key={i} className="rounded border border-border-subtle bg-surface/30 px-3 py-2">
                <div className="flex items-center justify-between mb-0.5">
                  <span className="font-medium">{wp.title}</span>
                  <span className={cn("text-[9px] px-1.5 py-0.5 rounded", wp.exceptionsFound === 0 ? "bg-emerald-500/10 text-emerald-400" : "bg-amber-500/10 text-amber-400")}>
                    {wp.exceptionsFound === 0 ? "Clean" : `${wp.exceptionsFound} exceptions`}
                  </span>
                </div>
                <div className="text-muted/50 text-[10px]">{wp.conclusion}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Financial Statements Result View ───────────────────────────────────────
function StatementsResultView({ result }: { result: Record<string, unknown> }) {
  const pnl = result.profitAndLoss as Record<string, any> | undefined;
  const bs = result.balanceSheet as Record<string, any> | undefined;
  const tb = result.trialBalance as Record<string, any> | undefined;
  const narrative = result.narrative as string | undefined;
  const recommendations = result.recommendations as string[] | undefined;
  const fmt = (n: number) => `$${((n || 0) / 1000).toFixed(0)}K`;

  return (
    <div className="space-y-4 text-xs">
      {narrative && <p className="text-muted/80 leading-relaxed text-[11px]">{narrative}</p>}

      {/* P&L Summary */}
      {pnl && (
        <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/3 p-4">
          <p className="text-[10px] uppercase tracking-wider text-emerald-400/70 mb-3">Profit & Loss Statement</p>
          <div className="space-y-1.5">
            {[
              { label: "Revenue", value: pnl.totalRevenue, color: "text-emerald-400" },
              { label: "Cost of Sales (COGS)", value: pnl.grossProfit !== undefined ? pnl.totalRevenue - pnl.grossProfit : undefined, color: "text-red-400/70", prefix: "−" },
              { label: "Gross Profit", value: pnl.grossProfit, color: "text-emerald-300", bold: true },
              { label: "Operating Expenses", value: pnl.totalOpex, color: "text-red-400/70", prefix: "−" },
              { label: "Operating Profit", value: pnl.operatingProfit, color: "text-foreground" },
              { label: "Net Profit", value: pnl.netProfit, color: (pnl.netProfit as number) >= 0 ? "text-emerald-400" : "text-red-400", bold: true },
            ].filter(r => r.value !== undefined).map((row, i) => (
              <div key={i} className={cn("flex items-center justify-between py-1 border-b border-border-subtle/20", row.bold && "font-semibold border-t border-border-subtle/40 mt-1 pt-2")}>
                <span className={row.bold ? "text-foreground" : "text-muted/70"}>{row.label}</span>
                <span className={cn("font-mono", row.color)}>{row.prefix}{fmt(row.value as number)}</span>
              </div>
            ))}
            {pnl.grossMargin !== undefined && (
              <div className="flex items-center gap-2 mt-2">
                <span className="text-muted/50">Gross Margin</span>
                <div className="flex-1 h-1 bg-surface rounded-full overflow-hidden">
                  <div className="h-full bg-emerald-400/60 rounded-full" style={{ width: `${Math.min(Math.max(pnl.grossMargin, 0), 100)}%` }} />
                </div>
                <span className="font-mono text-emerald-400">{(pnl.grossMargin as number).toFixed(1)}%</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Balance Sheet summary */}
      {bs && (
        <div className="rounded-lg border border-blue-500/20 bg-blue-500/3 p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-[10px] uppercase tracking-wider text-blue-400/70">Balance Sheet</p>
            <span className={cn("text-[10px] px-2 py-0.5 rounded-full", bs.balanced ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400")}>
              {bs.balanced ? "Balanced ✓" : "Unbalanced ⚠"}
            </span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: "Total Assets", value: fmt(bs.totalAssets as number), color: "text-blue-400" },
              { label: "Total Liabilities", value: fmt(bs.totalLiabilities as number), color: "text-amber-400" },
              { label: "Total Equity", value: fmt(bs.totalEquity as number), color: "text-purple-400" },
            ].map(item => (
              <div key={item.label} className="text-center rounded bg-card p-2">
                <div className="text-[10px] text-muted/50 mb-0.5">{item.label}</div>
                <div className={cn("text-sm font-bold", item.color)}>{item.value}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Trial Balance */}
      {tb && (
        <div className="rounded-lg border border-border-subtle bg-surface/30 p-3">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[10px] uppercase tracking-wider text-muted/50">Trial Balance</p>
            <span className={cn("text-[10px] px-2 py-0.5 rounded-full", tb.balanced ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400")}>
              {tb.balanced ? "Balanced" : "Variance"}
            </span>
          </div>
          <div className="flex gap-4 text-[11px]">
            <div><span className="text-muted/50">Total Debits: </span><span className="font-mono">{fmt(tb.totalDebits as number)}</span></div>
            <div><span className="text-muted/50">Total Credits: </span><span className="font-mono">{fmt(tb.totalCredits as number)}</span></div>
          </div>
        </div>
      )}

      {recommendations && recommendations.length > 0 && (
        <ul className="space-y-1">
          {recommendations.slice(0, 4).map((r, i) => (
            <li key={i} className="flex gap-2">
              <span className="text-emerald-400/50 shrink-0">✓</span>
              <span className="text-muted/70">{r}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── Reconciler Result View ──────────────────────────────────────────────────
function ReconcilerResultView({ result }: { result: Record<string, unknown> }) {
  const tb = result.trialBalance as { accounts: Array<{ name: string; type: string; debit: number; credit: number }>; totalDebits: number; totalCredits: number; balanced: boolean } | undefined;
  const completeness = result.completeness as { score: number; missingCategories: string[]; presentCategories: string[] } | undefined;
  const status = result.monthEndStatus as string | undefined;
  const reconciliations = result.reconciliations as Array<{ account: string; accountType: string; openingBalance: number; closingBalance: number; variance: number; status: string }> | undefined;
  const narrative = result.narrative as string | undefined;

  const statusColor = status === "ready" ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/20" : status === "adjustments-needed" ? "text-amber-400 bg-amber-500/10 border-amber-500/20" : "text-red-400 bg-red-500/10 border-red-500/20";
  const fmt = (n: number) => `$${Math.abs(n || 0).toLocaleString("en-SG", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

  return (
    <div className="space-y-4 text-xs">
      {narrative && <p className="text-muted/80 leading-relaxed text-[11px]">{narrative}</p>}

      {/* Month-end status banner */}
      {status && (
        <div className={cn("rounded-lg border px-4 py-3 flex items-center justify-between", statusColor)}>
          <span className="font-semibold">Month-End Status</span>
          <span className="font-bold capitalize">{status.replace(/-/g, " ")}</span>
        </div>
      )}

      {/* Trial Balance */}
      {tb && (
        <div className="rounded-lg border border-border-subtle bg-surface/30 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2.5 bg-surface/60 border-b border-border-subtle">
            <span className="text-[11px] font-semibold">Trial Balance</span>
            <span className={cn("text-[10px] px-2 py-0.5 rounded-full", tb.balanced ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400")}>
              {tb.balanced ? "Balanced ✓" : "Out of balance ⚠"}
            </span>
          </div>
          <div className="p-3">
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div className="text-center rounded bg-card p-2.5">
                <div className="text-[10px] text-muted/50 mb-0.5">Total Debits</div>
                <div className="font-mono font-bold text-sm">{fmt(tb.totalDebits)}</div>
              </div>
              <div className="text-center rounded bg-card p-2.5">
                <div className="text-[10px] text-muted/50 mb-0.5">Total Credits</div>
                <div className="font-mono font-bold text-sm">{fmt(tb.totalCredits)}</div>
              </div>
            </div>
            {/* Top accounts */}
            {tb.accounts && tb.accounts.slice(0, 8).map((acc, i) => (
              <div key={i} className="flex items-center justify-between py-1 border-b border-border-subtle/30 text-[10px]">
                <span className="text-muted/60 truncate max-w-[180px]">{acc.name}</span>
                <div className="flex gap-3">
                  {acc.debit > 0 && <span className="font-mono text-muted/60">Dr {fmt(acc.debit)}</span>}
                  {acc.credit > 0 && <span className="font-mono text-muted/60">Cr {fmt(acc.credit)}</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Completeness */}
      {completeness && (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-muted/60">Data Completeness</span>
            <div className="flex-1 h-1.5 bg-surface rounded-full overflow-hidden">
              <div className={cn("h-full rounded-full", completeness.score > 0.8 ? "bg-emerald-400" : "bg-amber-400")}
                style={{ width: `${completeness.score * 100}%` }} />
            </div>
            <span className="font-mono font-bold">{(completeness.score * 100).toFixed(0)}%</span>
          </div>
          {completeness.missingCategories.length > 0 && (
            <p className="text-amber-400/70 text-[10px]">Missing: {completeness.missingCategories.join(", ")}</p>
          )}
        </div>
      )}
    </div>
  );
}

// ── Generic Result View (bookkeeper, anomaly, causal-analysis) ───────────────
function GenericResultView({ result }: { result: Record<string, unknown> }) {
  const narrative = result.narrative as string | undefined;
  const summary = result.summary as string | undefined;
  const anomalies = result.anomalies as Array<{ reason: string; severity?: string; transaction?: unknown }> | undefined;
  const causalAnomalies = (result.causalAnomalies as Array<{ type: string; condition?: string; description: string; severity: string }>) || [];
  const findings = result.findings as Array<{ description: string }> | undefined;
  const recommendations = result.recommendations as string[] | undefined;
  const confidence = result.confidence as number | undefined;
  const brainValueAdd = result.brainValueAdd as string | undefined;
  const triageReport = result.triageReport as { autoPosted: number; flagged: number; escalated: number } | undefined;
  const doubleEntryCheck = result.doubleEntryCheck as { totalDebits: number; totalCredits: number; balanced: boolean; variance: number } | undefined;
  const transactionInterpretations = result.transactionInterpretations as Array<{ account: string; narrative: string; businessImpact: string; category: string; amount: number }> | undefined;
  const benfordsLaw = result.benfordsLaw as { conforming: boolean; chiSquare: number } | undefined;
  const innerData = result.data as Record<string, unknown> | undefined;

  // CAS fields (causal-analysis / full agent)
  const casData: CASData = {
    casScore: result.casScore as number | undefined,
    casRating: result.casRating as string | undefined,
    casBreakdown: result.casBreakdown as CASData['casBreakdown'],
    highRiskConditions: result.highRiskConditions as CASData['highRiskConditions'],
    causalAnomalies: causalAnomalies,
    brainValueAdd,
    edgesAnalyzed: result.edgesAnalyzed as number | undefined,
  };

  const hasContent = narrative || summary || anomalies?.length || causalAnomalies.length || findings?.length || recommendations?.length || brainValueAdd || triageReport || transactionInterpretations?.length || casData.casScore !== undefined;

  return (
    <div className="space-y-3 text-xs">
      {/* CAS Score Panel — shown first for causal-analysis / full agent */}
      {casData.casScore !== undefined && (
        <CASScorePanel data={casData} />
      )}

      {confidence !== undefined && (
        <div className="flex items-center gap-2">
          <span className="text-muted/60">Confidence:</span>
          <div className="flex-1 h-1.5 bg-surface rounded-full overflow-hidden">
            <div className={cn("h-full rounded-full", confidence > 0.7 ? "bg-emerald-400" : confidence > 0.4 ? "bg-amber-400" : "bg-red-400")}
              style={{ width: `${confidence * 100}%` }} />
          </div>
          <span className="font-mono text-[11px]">{(confidence * 100).toFixed(0)}%</span>
        </div>
      )}

      {narrative && <p className="text-muted/80 leading-relaxed">{narrative}</p>}
      {summary && !narrative && <p className="text-muted/80 leading-relaxed">{summary}</p>}

      {/* Only show brainValueAdd if not already rendered inside CASScorePanel */}
      {brainValueAdd && casData.casScore === undefined && (
        <div className="rounded-lg bg-purple-500/10 border border-purple-500/20 p-2.5">
          <p className="text-[10px] uppercase tracking-wider text-purple-400/70 mb-1">🧠 Causal Intelligence</p>
          <p className="text-purple-200/80">{brainValueAdd}</p>
        </div>
      )}

      {/* Bookkeeper triage */}
      {triageReport && (
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: "Auto-Posted", value: triageReport.autoPosted, color: "text-emerald-400" },
            { label: "Flagged", value: triageReport.flagged, color: "text-amber-400" },
            { label: "Escalated", value: triageReport.escalated, color: "text-red-400" },
          ].map(item => (
            <div key={item.label} className="text-center rounded bg-surface/50 p-2">
              <div className={cn("text-lg font-bold", item.color)}>{item.value}</div>
              <div className="text-[10px] text-muted/50">{item.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Double entry check */}
      {doubleEntryCheck && (
        <div className={cn("rounded px-3 py-2 border flex items-center justify-between", doubleEntryCheck.balanced ? "border-emerald-500/20 bg-emerald-500/5" : "border-red-500/20 bg-red-500/5")}>
          <span>Double-Entry Check</span>
          <span className={doubleEntryCheck.balanced ? "text-emerald-400 font-semibold" : "text-red-400 font-semibold"}>
            {doubleEntryCheck.balanced ? "Balanced ✓" : `Variance: $${doubleEntryCheck.variance.toFixed(2)}`}
          </span>
        </div>
      )}

      {/* Benford's Law */}
      {benfordsLaw && (
        <div className={cn("rounded px-3 py-2 border flex items-center justify-between", benfordsLaw.conforming ? "border-emerald-500/20 bg-emerald-500/5" : "border-amber-500/20 bg-amber-500/5")}>
          <span>Benford&apos;s Law</span>
          <span className={benfordsLaw.conforming ? "text-emerald-400" : "text-amber-400"}>
            {benfordsLaw.conforming ? "Conforming ✓" : `Non-conforming (χ²=${benfordsLaw.chiSquare.toFixed(1)})`}
          </span>
        </div>
      )}

      {causalAnomalies.length > 0 && (
        <div>
          <p className="text-[10px] uppercase tracking-wider text-muted/50 mb-1.5">Causal Anomalies ({causalAnomalies.length})</p>
          <div className="space-y-1.5">
            {causalAnomalies.slice(0, 5).map((a, i) => (
              <div key={i} className={cn("rounded px-2.5 py-2 border", a.severity === "high" ? "border-red-500/20 bg-red-500/5" : "border-amber-500/20 bg-amber-500/5")}>
                <p className={a.severity === "high" ? "text-red-300/80" : "text-amber-300/80"}>{a.description}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {anomalies && anomalies.length > 0 && (
        <div>
          <p className="text-[10px] uppercase tracking-wider text-muted/50 mb-1.5">Anomalies ({anomalies.length})</p>
          <div className="space-y-1.5">
            {anomalies.slice(0, 5).map((a, i) => (
              <div key={i} className="rounded px-2.5 py-2 border border-amber-500/20 bg-amber-500/5">
                <p className="text-amber-300/80">{a.reason}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {findings && findings.length > 0 && (
        <div>
          <p className="text-[10px] uppercase tracking-wider text-muted/50 mb-1.5">Findings ({findings.length})</p>
          <ul className="space-y-1">
            {findings.slice(0, 5).map((f, i) => (
              <li key={i} className="flex gap-2">
                <span className="text-muted/40 shrink-0">·</span>
                <span className="text-muted/70">{f.description}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Transaction Interpretations (bookkeeper agent) */}
      {transactionInterpretations && transactionInterpretations.length > 0 && (
        <div>
          <p className="text-[10px] uppercase tracking-wider text-muted/50 mb-1.5">Transaction Interpretations (top {transactionInterpretations.length})</p>
          <div className="space-y-1.5">
            {transactionInterpretations.slice(0, 5).map((ti, i) => (
              <div key={i} className="rounded border border-border-subtle bg-surface/30 px-3 py-2">
                <div className="flex items-center justify-between mb-0.5">
                  <span className="font-medium truncate max-w-[200px]">{ti.account}</span>
                  <span className={cn("text-[9px] px-1.5 py-0.5 rounded",
                    ti.businessImpact === "positive" ? "bg-emerald-500/10 text-emerald-400" :
                    ti.businessImpact === "watch" ? "bg-amber-500/10 text-amber-400" :
                    "bg-surface text-muted/50")}>
                    {ti.category}
                  </span>
                </div>
                <p className="text-muted/60 leading-relaxed text-[10px]">{ti.narrative}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {recommendations && recommendations.length > 0 && (
        <ul className="space-y-1">
          {recommendations.slice(0, 5).map((r, i) => (
            <li key={i} className="flex gap-2">
              <span className="text-emerald-400/50 shrink-0">✓</span>
              <span className="text-muted/70">{r}</span>
            </li>
          ))}
        </ul>
      )}

      {/* Raw fallback */}
      {!hasContent && (
        <pre className="text-[10px] text-muted/50 overflow-x-auto whitespace-pre-wrap max-h-48 overflow-y-auto">
          {JSON.stringify(innerData || result, null, 2).slice(0, 2000)}
        </pre>
      )}
    </div>
  );
}

// ── Recent AAS Artifacts Panel ──────────────────────────────────────────────
// Matches the SE-AAS capabilities page "Recent Artifacts" pattern.
// Fetches from se_aas_artifacts where domain_type LIKE 'aas-%'

interface AASArtifact {
  id: string;
  domain_type: string;
  label: string;
  metadata: {
    agentName?: string;
    action?: string;
    durationMs?: number;
    brainAugmented?: boolean;
    causalEdgesUsed?: number;
    intelligenceScore?: number;
    jurisdiction?: string;
  };
  created_at: string;
}

const AAS_DOMAIN_ICONS: Record<string, string> = {
  "aas-tax":             "🧾",
  "aas-audit":           "📋",
  "aas-statements":      "📊",
  "aas-reconcile":       "⚖️",
  "aas-bookkeep":        "📒",
  "aas-anomaly":         "🔍",
  "aas-causal-analysis": "🔗",
  "aas-full":            "🤖",
};

function RecentAASArtifactsPanel({ refreshTrigger }: { refreshTrigger: number }) {
  const [artifacts, setArtifacts] = useState<AASArtifact[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch("/api/aaas/artifacts?limit=8")
      .then(r => r.json())
      .then(d => {
        setArtifacts(d.artifacts || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [refreshTrigger]);

  if (loading) {
    return (
      <div className="rounded-xl bg-card border border-border-subtle p-5">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse" />
          <h3 className="text-sm font-medium">Recent Agent Artifacts</h3>
        </div>
        <div className="space-y-2">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-10 rounded-lg bg-surface/50 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (artifacts.length === 0) {
    return (
      <div className="rounded-xl bg-card border border-border-subtle p-5">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-6 h-6 rounded flex items-center justify-center bg-indigo-500/10">
            <svg className="w-3.5 h-3.5 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
            </svg>
          </div>
          <h3 className="text-sm font-medium">Recent Agent Artifacts</h3>
        </div>
        <p className="text-xs text-muted/50">
          No artifacts yet — run an agent above to generate your first AAS artifact.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-card border border-border-subtle overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-4 border-b border-border-subtle">
        <div className="w-7 h-7 rounded-lg bg-indigo-500/15 flex items-center justify-center shrink-0">
          <svg className="w-3.5 h-3.5 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
          </svg>
        </div>
        <div>
          <h3 className="text-sm font-semibold">Recent Agent Artifacts</h3>
          <p className="text-[11px] text-muted/60">{artifacts.length} most recent · persisted to brain artifact store</p>
        </div>
        <div className="ml-auto">
          <span className="text-[10px] bg-indigo-500/10 text-indigo-400 px-2 py-0.5 rounded-full font-medium">se_aas_artifacts</span>
        </div>
      </div>

      {/* Artifact list */}
      <div className="divide-y divide-border-subtle/50">
        {artifacts.map((artifact) => {
          const icon = AAS_DOMAIN_ICONS[artifact.domain_type] || "🤖";
          const ts = new Date(artifact.created_at);
          const timeLabel = ts.toLocaleDateString("en-SG", { month: "short", day: "numeric" }) +
            " " + ts.toLocaleTimeString("en-SG", { hour: "2-digit", minute: "2-digit" });

          return (
            <div key={artifact.id} className="flex items-center gap-3 px-5 py-3 hover:bg-surface/40 transition-colors">
              {/* Icon */}
              <div className="w-7 h-7 rounded-lg bg-surface flex items-center justify-center shrink-0 text-sm">
                {icon}
              </div>

              {/* Label + meta */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-xs font-medium truncate">{artifact.label}</p>
                  {artifact.metadata?.brainAugmented && (
                    <span className="text-[9px] bg-purple-500/10 text-purple-400 px-1.5 py-0.5 rounded shrink-0">🧠 Brain</span>
                  )}
                </div>
                <div className="flex items-center gap-3 mt-0.5">
                  <p className="text-[10px] text-muted/50">{timeLabel}</p>
                  {artifact.metadata?.durationMs !== undefined && (
                    <span className="text-[10px] text-muted/40">⏱ {fmtMs(artifact.metadata.durationMs)}</span>
                  )}
                  {artifact.metadata?.causalEdgesUsed !== undefined && artifact.metadata.causalEdgesUsed > 0 && (
                    <span className="text-[10px] text-muted/40">🔗 {artifact.metadata.causalEdgesUsed} edges</span>
                  )}
                </div>
              </div>

              {/* ID chip — matches SE-AAS capabilities page pattern */}
              <span className="text-[10px] text-muted/40 font-mono shrink-0">{artifact.id.slice(0, 8)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Empty State (no GL data) ────────────────────────────────────────────────

function NoDataState({ onUploadComplete }: { onUploadComplete: () => void }) {
  return (
    <div className="space-y-6">
      <div className="rounded-xl bg-amber-500/5 border border-amber-500/20 p-5 flex items-start gap-3">
        <svg className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
        </svg>
        <div>
          <p className="text-sm font-medium text-amber-300">No GL data found for your organisation</p>
          <p className="text-xs text-muted/60 mt-0.5">Upload your Xero GL export below to get started with AAS.</p>
        </div>
      </div>
      <GLUploadPanel onUploadComplete={onUploadComplete} />
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function AaasPage() {
  const [data, setData] = useState<AccountingAnalysis | null>(null);
  const [meta, setMeta] = useState<{ company?: string; organizationId?: string; brainMetadata?: Record<string, unknown> } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [noData, setNoData] = useState(false);
  const [activeTab, setActiveTab] = useState<"req1" | "req2" | "upload">("req1");
  const [refreshKey, setRefreshKey] = useState(0);
  const [req2RefreshKey, setReq2RefreshKey] = useState(0);

  const fetchData = useCallback(() => {
    setLoading(true);
    setError(null);
    setNoData(false);

    fetch("/api/aaas")
      .then(r => r.json())
      .then(d => {
        if (d.error && !d.analysis) {
          if (d.error.includes("No GL data")) {
            setNoData(true);
          } else {
            setError(d.error);
          }
        } else {
          setData(d.analysis);
          setMeta({ company: d.company, organizationId: d.organizationId, brainMetadata: d.brainMetadata });
        }
        setLoading(false);
      })
      .catch(() => {
        setError("Failed to connect to AAS API");
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData, refreshKey]);

  const onUploadComplete = () => {
    setRefreshKey(k => k + 1);
    setActiveTab("req1");
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="text-center">
          <div className="w-12 h-12 rounded-xl bg-emerald-500/15 flex items-center justify-center mx-auto mb-4">
            <svg className="w-6 h-6 text-emerald-400 animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
            </svg>
          </div>
          <p className="text-sm text-muted">Loading AAS...</p>
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
            Upload your Xero GL export via the Upload & Training tab
          </code>
        </div>
      </div>
    );
  }

  if (noData) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/15 flex items-center justify-center">
              <svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
              </svg>
            </div>
            <div>
              <h1 className="text-xl font-semibold">AAAS — Accounting as a Service</h1>
              <p className="text-xs text-muted">Accounting as a Service · Xero GL Intelligence</p>
            </div>
          </div>
        </div>
        <NoDataState onUploadComplete={onUploadComplete} />
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
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/15 flex items-center justify-center">
            <svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
            </svg>
          </div>
          <div>
            <h1 className="text-xl font-semibold">AAAS — Accounting as a Service</h1>
            <p className="text-xs text-muted">
              {meta?.company} · {s.jurisdiction} · {s.currency} · {s.dateRange.from} → {s.dateRange.to}
            </p>
          </div>
          {meta?.brainMetadata && (meta.brainMetadata as any).connected && (
            <span className="text-[10px] bg-purple-500/10 text-purple-400 px-2 py-0.5 rounded-full">
              🧠 Brain connected
            </span>
          )}
        </div>
        <div className="flex gap-2">
          <a
            href="/api/aaas/export"
            download
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
            </svg>
            Export CSV
          </a>
          <Link href="/finance-jarvis" className="px-3 py-1.5 text-xs rounded-lg bg-card border border-border-subtle hover:border-accent/30 transition-colors">
            Finance Jarvis
          </Link>
          <Link href="/copilot" className="px-3 py-1.5 text-xs rounded-lg bg-accent text-white hover:bg-accent-dark transition-colors">
            Ask Copilot
          </Link>
        </div>
      </div>

      {/* Tab Bar */}
      <div className="flex gap-1 p-1 rounded-xl bg-surface border border-border-subtle w-fit">
        {[
          { key: "req1" as const, label: "Req 1 — GL Analysis", icon: "📊", badge: "Phase 1" },
          { key: "req2" as const, label: "Req 2 — AI Agents", icon: "🤖", badge: "Phase 1.5" },
          { key: "upload" as const, label: "Upload & Training", icon: "⬆️", badge: "" },
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all",
              activeTab === tab.key
                ? "bg-card text-foreground shadow-sm"
                : "text-muted/60 hover:text-muted"
            )}
          >
            <span>{tab.icon}</span>
            <span>{tab.label}</span>
            {tab.badge && (
              <span className={cn(
                "text-[9px] px-1.5 py-0.5 rounded-full",
                tab.key === "req1" ? "bg-emerald-500/15 text-emerald-400" : "bg-indigo-500/15 text-indigo-400"
              )}>
                {tab.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* REQ 1 TAB — Phase 1: Deterministic GL Analysis            */}
      {/* ═══════════════════════════════════════════════════════════ */}
      {activeTab === "req1" && (
        <div className="space-y-6">
          {/* Req 1 explanation banner */}
          <div className="rounded-xl bg-emerald-500/5 border border-emerald-500/20 p-4">
            <div className="flex items-start gap-3">
              <div className="w-7 h-7 rounded-lg bg-emerald-500/15 flex items-center justify-center shrink-0">
                <svg className="w-3.5 h-3.5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                </svg>
              </div>
              <div>
                <p className="text-xs font-semibold text-emerald-300 mb-0.5">Req 1 — Phase 1: Core Bookkeeping (Pure GL Processing)</p>
                <p className="text-[11px] text-muted/70 leading-relaxed">
                  Deterministic in-memory processing of your Xero GL export. No AI required — <strong className="text-muted">account classification, P&L, Balance Sheet, and Benford&apos;s Law anomaly detection</strong> computed instantly from raw GL data. This is what the accounting partner gets on GET <code className="bg-surface rounded px-1">/api/aaas</code>.
                </p>
              </div>
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
                      <p className="text-emerald-400">Transaction amounts follow the expected Benford distribution. Consistent with naturally occurring financial data — no systemic manipulation detected.</p>
                    ) : (
                      <p className="text-amber-400">Transaction amounts deviate from Benford&apos;s Law. Could indicate rounding, threshold-based entries, or data quality issues worth investigating.</p>
                    )}
                  </div>
                  <div className="rounded-lg bg-surface p-3 border border-border-subtle">
                    <div className="text-[10px] uppercase tracking-wider text-muted/60 mb-1">→ Phase 1.5 (Req 2)</div>
                    <p className="text-muted/70">Switch to the <strong>Req 2 — AI Agents</strong> tab to run the Brain&apos;s causal anomaly detection — correlates financial signals with operational events.</p>
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

          {/* Transaction Interpretations — Req 1 Key Deliverable */}
          {data.transactionInterpretations && data.transactionInterpretations.length > 0 && (
            <TransactionInterpretationsPanel interpretations={data.transactionInterpretations} />
          )}

          {/* Prior-Period P&L Comparison — Function 01 requirement */}
          {data.priorPeriodComparison && (
            <PriorPeriodPanel comparison={data.priorPeriodComparison} />
          )}

          {/* 20% Balance Movement Alerts — Function 01 automated check */}
          {data.balanceMovementAlerts && data.balanceMovementAlerts.length > 0 && (
            <BalanceMovementAlertsPanel alerts={data.balanceMovementAlerts} />
          )}

          {/* Req 1 Artifacts Summary */}
          <div className="rounded-xl bg-emerald-500/5 border border-emerald-500/20 p-4">
            <p className="text-[11px] font-semibold text-emerald-300 mb-2">✅ Req 1 Artifacts Delivered</p>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
              {[
                { label: "Trial Balance", status: s.doubleEntryBalanced ? "Balanced ✓" : "Variance !", ok: s.doubleEntryBalanced },
                { label: "P&L + Prior Period", status: data.priorPeriodComparison?.hasEnoughData ? `Rev ${data.priorPeriodComparison.variance.revenuePct >= 0 ? '+' : ''}${data.priorPeriodComparison.variance.revenuePct.toFixed(1)}% vs prior` : `Net ${fmtK(pnl.netProfit)}`, ok: true },
                { label: "Balance Sheet", status: bs.balanced ? "Balanced ✓" : "Check equity", ok: bs.balanced },
                { label: "GST F5", status: "Run Tax agent →", ok: true },
                { label: "Transaction NL", status: `${(data.transactionInterpretations || []).length} narratives`, ok: (data.transactionInterpretations || []).length > 0 },
              ].map(a => (
                <div key={a.label} className="rounded-lg bg-card/60 border border-border-subtle p-2">
                  <div className={cn("text-[9px] uppercase tracking-wider mb-0.5", a.ok ? "text-emerald-400/70" : "text-amber-400/70")}>{a.label}</div>
                  <div className="text-[11px] font-medium">{a.status}</div>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between mt-3">
              <p className="text-[10px] text-muted/40">
                GST F5 computation is in Req 2 — run the Tax Compliance agent. Export CSV for Excel-ready output package.
              </p>
              <a
                href="/api/aaas/export"
                download
                className="shrink-0 flex items-center gap-1 text-[10px] text-emerald-400/70 hover:text-emerald-400 transition-colors"
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                </svg>
                Download Excel Package →
              </a>
            </div>
          </div>

          {/* Data Source Footer */}
          <div className="text-center py-4 text-[10px] text-muted/30">
            Data source: Xero General Ledger Detail | Processed through NexusBrain AAS agents | {s.totalTransactions.toLocaleString()} transactions across {s.totalAccounts} accounts
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* REQ 2 TAB — Phase 1.5: Brain-Connected Agent Execution    */}
      {/* ═══════════════════════════════════════════════════════════ */}
      {activeTab === "req2" && (
        <div className="space-y-6">
          {/* Req 2 explanation banner */}
          <div className="rounded-xl bg-indigo-500/5 border border-indigo-500/20 p-4">
            <div className="flex items-start gap-3">
              <div className="w-7 h-7 rounded-lg bg-indigo-500/15 flex items-center justify-center shrink-0">
                <svg className="w-3.5 h-3.5 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 3v1.5M4.5 8.25H3m18 0h-1.5M4.5 12H3m18 0h-1.5m-15 3.75H3m18 0h-1.5M8.25 19.5V21M12 3v1.5m0 15V21m3.75-18v1.5m0 15V21m-9-1.5h10.5a2.25 2.25 0 002.25-2.25V6.75a2.25 2.25 0 00-2.25-2.25H6.75A2.25 2.25 0 004.5 6.75v10.5a2.25 2.25 0 002.25 2.25zm.75-12h9v9h-9v-9z" />
                </svg>
              </div>
              <div>
                <p className="text-xs font-semibold text-indigo-300 mb-0.5">Req 2 — Phase 1.5: NexusBrain Causal Layer</p>
                <p className="text-[11px] text-muted/70 leading-relaxed">
                  <strong className="text-muted">7 Brain-connected AI agents</strong> run against your GL data with full causal context. Goes beyond raw numbers — correlates financial signals with operational events. Result streams in real-time via SSE from <code className="bg-surface rounded px-1">POST /api/aaas</code>. Artifacts fed back into the Brain for continuous learning.
                </p>
                <div className="flex flex-wrap gap-2 mt-2">
                  {["brain-bookkeeper", "brain-reconciler", "brain-statement-gen", "brain-tax-compliance", "brain-audit-preparer", "brain-anomaly-detect", "brain-causal-accountant ✦"].map(a => (
                    <span key={a} className="text-[10px] bg-indigo-500/10 text-indigo-400/70 px-2 py-0.5 rounded-full">{a}</span>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <AgentExecutionPanel onRunComplete={() => setReq2RefreshKey(k => k + 1)} />

          {/* Recent AAS Artifacts — same pattern as SE-AAS capabilities page */}
          <RecentAASArtifactsPanel refreshTrigger={req2RefreshKey} />

          {/* Req 2 Artifacts Summary */}
          <div className="rounded-xl bg-indigo-500/5 border border-indigo-500/20 p-4">
            <p className="text-[11px] font-semibold text-indigo-300 mb-2">🤖 Req 2 Intelligence Layer — Function 02</p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mb-3">
              {[
                { label: "CAS Score (0–100)", desc: "Causal Anomaly Score across 5 dimensions: completeness, consistency, conformity, condition alerts (A–D), and brain intelligence.", icon: "🎯" },
                { label: "4 High-Risk Conditions", desc: "Conditions A (revenue recognition), B (audit-window expenses), C (CPF/payroll link), D (weak causal relationships) — invisible to pure LLMs.", icon: "⚠️" },
                { label: "Federated Learning", desc: "After each agent run, causal delta is promoted to CORE brain via FedAvg (privacy-preserving). Your insights improve AAS for all orgs.", icon: "🌐" },
              ].map(item => (
                <div key={item.label} className="rounded-lg bg-card/60 border border-border-subtle p-3">
                  <div className="text-base mb-1">{item.icon}</div>
                  <div className="text-[11px] font-medium mb-0.5">{item.label}</div>
                  <div className="text-[10px] text-muted/50 leading-relaxed">{item.desc}</div>
                </div>
              ))}
            </div>
            <p className="text-[10px] text-muted/40">
              Run "Full Causal Analysis" or "Causal Analysis" above to generate the CAS score and high-risk condition report. brain-causal-accountant is the differentiator — uses the causal graph to find anomalies invisible to pure LLMs.
            </p>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* UPLOAD & TRAINING TAB                                     */}
      {/* ═══════════════════════════════════════════════════════════ */}
      {activeTab === "upload" && (
        <div className="space-y-4">
          <GLUploadPanel onUploadComplete={onUploadComplete} />
          <BrainTrainingPanel organizationId={meta?.organizationId} />

          {/* How it all connects */}
          <div className="rounded-xl bg-card border border-border-subtle p-5">
            <h3 className="text-sm font-medium mb-4">How the Partner Flow Works</h3>
            <div className="space-y-3">
              {[
                { step: "1", title: "Upload GL export", desc: "Partner exports Xero GL as JSON → drags & drops here → auto-uploaded to secure org-scoped Supabase/S3 storage", color: "emerald" },
                { step: "2", title: "Auto signal + causal bootstrap", desc: "API parses transactions → generates monthly_revenue / expenses / net_income signals + seeds 9 accounting causal edges into brain's causal graph (Revenue→Cash, Payroll→CPF, GST→IRAS, etc.)", color: "blue" },
                { step: "3", title: "Req 1 available instantly", desc: "GL Analysis tab: Trial Balance, P&L, Balance Sheet, transaction interpretations (NL narratives for top 30 txns), Benford's Law — no AI, pure deterministic", color: "emerald" },
                { step: "4", title: "Brain training (optional)", desc: "Click 'Run Training' or let it auto-trigger after 10+ signals — Brain runs L1-L15 cycle, builds statistical causal graph on top of domain-expert priors", color: "purple" },
                { step: "5", title: "Req 2 unlocked + federated", desc: "AI Agents tab — 7 agents run with Brain causal context → streaming real-time insights. Each run promotes causal deltas to CORE brain via FedAvg federation", color: "indigo" },
              ].map(item => (
                <div key={item.step} className="flex items-start gap-3">
                  <div className={cn(
                    "w-6 h-6 rounded-full flex items-center justify-center shrink-0 text-[11px] font-bold",
                    item.color === "emerald" ? "bg-emerald-500/15 text-emerald-400" :
                    item.color === "blue" ? "bg-blue-500/15 text-blue-400" :
                    item.color === "purple" ? "bg-purple-500/15 text-purple-400" :
                    "bg-indigo-500/15 text-indigo-400"
                  )}>
                    {item.step}
                  </div>
                  <div>
                    <p className="text-xs font-medium">{item.title}</p>
                    <p className="text-[11px] text-muted/60">{item.desc}</p>
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
