"use client";

import { formatUSD } from "@/lib/utils";

interface CostWidgetProps {
  costToday: number;
  dailyBudget: number;
  projectedMonthly: number;
  monthlyBudget: number;
}

export function CostWidget({ costToday, dailyBudget, projectedMonthly, monthlyBudget }: CostWidgetProps) {
  const dailyPct = dailyBudget > 0 ? (costToday / dailyBudget) * 100 : 0;
  const monthlyPct = monthlyBudget > 0 ? (projectedMonthly / monthlyBudget) * 100 : 0;

  const barColor =
    dailyPct >= 100 ? "bg-danger" :
    dailyPct >= 80 ? "bg-warning" :
    "bg-accent";

  return (
    <div className="rounded-xl bg-card border border-border/50 p-5">
      <div className="flex items-center justify-between mb-4">
        <span className="text-xs font-medium text-muted uppercase tracking-wider">Cost Today</span>
        <svg className="w-4 h-4 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </div>

      <div className="text-2xl font-bold mb-1">{formatUSD(costToday)}</div>
      <div className="text-xs text-muted mb-3">of {formatUSD(dailyBudget)} daily budget</div>

      {/* Budget bar */}
      <div className="h-1.5 rounded-full bg-surface overflow-hidden mb-4">
        <div
          className={`h-full rounded-full ${barColor} transition-all duration-500`}
          style={{ width: `${Math.min(100, dailyPct)}%` }}
        />
      </div>

      <div className="flex items-center justify-between text-xs">
        <span className="text-muted">Projected monthly</span>
        <span className={monthlyPct > 80 ? "text-warning font-medium" : "text-muted-foreground"}>
          {formatUSD(projectedMonthly)} / {formatUSD(monthlyBudget)}
        </span>
      </div>
    </div>
  );
}
