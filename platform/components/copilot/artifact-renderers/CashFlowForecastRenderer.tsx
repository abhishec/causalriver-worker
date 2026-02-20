"use client";

import { useState, useMemo } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { cn } from "@/lib/utils";
import {
  ArtifactHeader,
  StatGrid,
  StatCard,
  ArtifactTabs,
  SeverityBadge,
  InsightBox,
  ActionItem,
} from "./shared";

// ── Types ───────────────────────────────────────────────────────────────────

interface WeeklyProjection {
  weekStart: string;
  weekEnd: string;
  projectedInflow: number;
  projectedOutflow: number;
  netCashPosition: number;
  lower95: number;
  upper95: number;
  riskLevel: "critical" | "watch" | "safe";
  drivers: string[];
}

interface ForecastRisk {
  description: string;
  severity: "high" | "medium" | "low";
  affectedWeeks: number[];
  potentialImpact: number;
}

interface Recommendation {
  action: string;
  urgency: "immediate" | "this_week" | "this_month";
  potentialImpact: number;
}

interface ForecastComparison {
  mape: number;
  directionalAccuracy: number;
  biasDirection: "over" | "under" | "neutral";
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function fmtCurrency(v: number): string {
  const abs = Math.abs(v);
  const prefix = v < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${prefix}$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${prefix}$${(abs / 1_000).toFixed(0)}K`;
  return `${prefix}$${abs.toFixed(0)}`;
}

function fmtWeek(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    return `W${Math.ceil((d.getDate()) / 7)} ${d.toLocaleDateString("en", { month: "short" })}`;
  } catch {
    return dateStr?.slice(0, 10) ?? "";
  }
}

const urgencyToSeverity = (u: string) =>
  u === "immediate" ? "critical" as const : u === "this_week" ? "high" as const : "medium" as const;

// ── Custom Tooltip ──────────────────────────────────────────────────────────

function ForecastTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  return (
    <div className="bg-surface-elevated border border-border rounded-lg px-3 py-2 shadow-lg min-w-[180px]">
      <div className="text-[10px] text-muted mb-1 font-medium">{label}</div>
      <div className="space-y-0.5 text-[10px]">
        <div className="flex justify-between gap-3">
          <span className="text-muted-foreground">Net Cash</span>
          <span className="font-mono tabular-nums font-medium text-foreground">{fmtCurrency(d?.netCashPosition ?? 0)}</span>
        </div>
        <div className="flex justify-between gap-3">
          <span className="text-muted-foreground">Inflow</span>
          <span className="font-mono tabular-nums text-success">{fmtCurrency(d?.projectedInflow ?? 0)}</span>
        </div>
        <div className="flex justify-between gap-3">
          <span className="text-muted-foreground">Outflow</span>
          <span className="font-mono tabular-nums text-danger">{fmtCurrency(d?.projectedOutflow ?? 0)}</span>
        </div>
        <div className="flex justify-between gap-3 border-t border-border-subtle pt-0.5 mt-0.5">
          <span className="text-muted-foreground">95% Range</span>
          <span className="font-mono tabular-nums text-muted">{fmtCurrency(d?.lower95 ?? 0)} - {fmtCurrency(d?.upper95 ?? 0)}</span>
        </div>
      </div>
    </div>
  );
}

// ── Main Component ──────────────────────────────────────────────────────────

export function CashFlowForecastRenderer({ data }: { data: Record<string, any> }) {
  const [tab, setTab] = useState("forecast");

  const forecast = data?.forecast ?? data;
  const predictions: WeeklyProjection[] = forecast?.predictions ?? [];
  const risks: ForecastRisk[] = forecast?.risks ?? [];
  const recommendations: Recommendation[] = data?.recommendations ?? [];
  const priorComparison: ForecastComparison | undefined = data?.priorComparison;
  const narrative: string = forecast?.causalNarrative ?? data?.summary ?? "";

  // Chart data
  const chartData = useMemo(() =>
    predictions.map((p) => ({
      ...p,
      week: fmtWeek(p.weekStart),
      band: [p.lower95, p.upper95],
    })),
    [predictions],
  );

  // Stats
  const currentCash = predictions[0]?.netCashPosition ?? 0;
  const minCash = Math.min(...predictions.map((p) => p.netCashPosition));
  const minWeek = predictions.findIndex((p) => p.netCashPosition === minCash) + 1;
  const runwayWeeks = forecast?.runwayWeeks ?? predictions.length;
  const confidence = forecast?.overallConfidence ?? 0;

  const tabs = [
    { id: "forecast", label: "Forecast" },
    { id: "risks", label: "Risks", hasDot: risks.some((r) => r.severity === "high") },
    { id: "actions", label: "Actions", hasDot: recommendations.some((r) => r.urgency === "immediate") },
  ];

  return (
    <div className="flex flex-col h-full">
      <ArtifactHeader
        icon="💰"
        title={data?.title ?? "Cash Flow Prophet — 13 Week Forecast"}
        badge={`${Math.round(confidence * 100)}%`}
        badgeColor={confidence >= 0.7 ? "green" : confidence >= 0.5 ? "amber" : "red"}
      />

      {/* KPI Stats */}
      <div className="px-3 py-2 shrink-0">
        <StatGrid cols={4}>
          <StatCard label="Current Cash" value={fmtCurrency(currentCash)} color={currentCash > 0 ? "green" : "red"} />
          <StatCard label="Min Cash (Wk)" value={`${fmtCurrency(minCash)} (W${minWeek})`} color={minCash > 0 ? "amber" : "red"} />
          <StatCard label="Runway" value={`${runwayWeeks} wks`} color={runwayWeeks >= 12 ? "green" : runwayWeeks >= 8 ? "amber" : "red"} />
          <StatCard
            label="Prior Accuracy"
            value={priorComparison ? `${(100 - priorComparison.mape).toFixed(0)}%` : "—"}
            color={priorComparison && priorComparison.mape < 15 ? "green" : "amber"}
          />
        </StatGrid>
      </div>

      <ArtifactTabs tabs={tabs} active={tab} onChange={setTab} />

      <div className="flex-1 overflow-y-auto p-3">
        {tab === "forecast" && (
          <>
            {/* Area chart: net cash position + 95% CI band */}
            {chartData.length > 0 && (
              <div className="rounded-xl bg-card border border-border-subtle overflow-hidden mb-3">
                <div className="px-4 pt-3 pb-1">
                  <h4 className="text-xs font-medium text-foreground">Projected Cash Position</h4>
                  <p className="text-[10px] text-muted mt-0.5">Net cash with 95% confidence interval</p>
                </div>
                <div className="px-3 pb-3 pt-2">
                  <ResponsiveContainer width="100%" height={220}>
                    <AreaChart data={chartData} margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
                      <defs>
                        <linearGradient id="grad-band" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#7c6cf0" stopOpacity={0.08} />
                          <stop offset="95%" stopColor="#7c6cf0" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="grad-net" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#10b981" stopOpacity={0.15} />
                          <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2e" vertical={false} />
                      <XAxis dataKey="week" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: "#71717a" }} />
                      <YAxis
                        axisLine={false}
                        tickLine={false}
                        tick={{ fontSize: 10, fill: "#71717a" }}
                        width={50}
                        tickFormatter={(v: number) => fmtCurrency(v)}
                      />
                      <Tooltip content={<ForecastTooltip />} />
                      <ReferenceLine y={0} stroke="#dc2626" strokeDasharray="4 4" strokeOpacity={0.5} />
                      {/* 95% confidence band */}
                      <Area type="monotone" dataKey="upper95" stroke="none" fill="url(#grad-band)" />
                      <Area type="monotone" dataKey="lower95" stroke="none" fill="#0a0a0a" />
                      {/* Net cash position */}
                      <Area
                        type="monotone"
                        dataKey="netCashPosition"
                        stroke="#10b981"
                        strokeWidth={2}
                        fill="url(#grad-net)"
                        dot={false}
                        activeDot={{ r: 3, strokeWidth: 0, fill: "#10b981" }}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* Causal narrative */}
            {narrative && <InsightBox><strong>Causal Summary:</strong> {narrative}</InsightBox>}

            {/* Weekly breakdown table */}
            <div className="text-[10px] font-semibold uppercase tracking-wider text-muted mb-1.5 mt-3">Weekly Breakdown</div>
            <div className="rounded-lg border border-border-subtle overflow-hidden">
              <table className="w-full text-[11px]">
                <thead>
                  <tr className="bg-surface/50 border-b border-border-subtle">
                    <th className="text-left px-2 py-1.5 text-muted font-medium">Week</th>
                    <th className="text-right px-2 py-1.5 text-muted font-medium">Inflow</th>
                    <th className="text-right px-2 py-1.5 text-muted font-medium">Outflow</th>
                    <th className="text-right px-2 py-1.5 text-muted font-medium">Net Cash</th>
                    <th className="text-center px-2 py-1.5 text-muted font-medium">Risk</th>
                  </tr>
                </thead>
                <tbody>
                  {predictions.map((p, i) => (
                    <tr
                      key={i}
                      className={cn(
                        "border-b border-border-subtle last:border-b-0 transition-colors hover:bg-surface-hover/50",
                        p.riskLevel === "critical" && "bg-danger/3",
                      )}
                    >
                      <td className="px-2 py-1.5 text-muted-foreground">{fmtWeek(p.weekStart)}</td>
                      <td className="px-2 py-1.5 text-right font-mono tabular-nums text-success">{fmtCurrency(p.projectedInflow)}</td>
                      <td className="px-2 py-1.5 text-right font-mono tabular-nums text-danger">{fmtCurrency(p.projectedOutflow)}</td>
                      <td className={cn("px-2 py-1.5 text-right font-mono tabular-nums font-medium", p.netCashPosition >= 0 ? "text-foreground" : "text-danger")}>
                        {fmtCurrency(p.netCashPosition)}
                      </td>
                      <td className="px-2 py-1.5 text-center">
                        <span className={cn(
                          "inline-block w-2 h-2 rounded-full",
                          p.riskLevel === "critical" ? "bg-danger" : p.riskLevel === "watch" ? "bg-warning" : "bg-success",
                        )} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {tab === "risks" && (
          <>
            {risks.length === 0 ? (
              <div className="text-center text-[12px] text-muted py-8">No significant risks identified</div>
            ) : (
              <div className="space-y-2">
                {risks.map((r, i) => (
                  <div
                    key={i}
                    className={cn(
                      "px-3 py-2.5 rounded-[10px] border",
                      r.severity === "high"
                        ? "bg-danger/4 border-danger/12"
                        : r.severity === "medium"
                          ? "bg-warning/4 border-warning/12"
                          : "bg-info/4 border-info/12",
                    )}
                  >
                    <div className="flex items-start gap-2">
                      <SeverityBadge level={r.severity === "high" ? "critical" : r.severity} />
                      <div className="flex-1 min-w-0">
                        <div className="text-[12px] text-foreground leading-snug">{r.description}</div>
                        <div className="flex gap-3 mt-1 text-[10px] text-muted">
                          <span>Weeks: {r.affectedWeeks.join(", ")}</span>
                          <span>Impact: {fmtCurrency(r.potentialImpact)}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {tab === "actions" && (
          <>
            {recommendations.length === 0 ? (
              <div className="text-center text-[12px] text-muted py-8">No action items at this time</div>
            ) : (
              <div className="space-y-1.5">
                {recommendations.map((r, i) => (
                  <ActionItem
                    key={i}
                    priority={urgencyToSeverity(r.urgency) === "critical" ? "high" : urgencyToSeverity(r.urgency) === "high" ? "high" : "medium"}
                    title={r.action}
                    description={`Impact: ${fmtCurrency(r.potentialImpact)}`}
                  />
                ))}
              </div>
            )}

            {/* Prior forecast accuracy */}
            {priorComparison && (
              <div className="mt-4">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-muted mb-1.5">Forecast Accuracy (vs Prior)</div>
                <StatGrid cols={3}>
                  <StatCard
                    label="MAPE"
                    value={`${priorComparison.mape.toFixed(1)}%`}
                    color={priorComparison.mape < 10 ? "green" : priorComparison.mape < 20 ? "amber" : "red"}
                  />
                  <StatCard
                    label="Direction Accuracy"
                    value={`${Math.round(priorComparison.directionalAccuracy * 100)}%`}
                    color={priorComparison.directionalAccuracy >= 0.7 ? "green" : "amber"}
                  />
                  <StatCard
                    label="Bias"
                    value={priorComparison.biasDirection === "neutral" ? "Balanced" : `${priorComparison.biasDirection}-estimating`}
                    color={priorComparison.biasDirection === "neutral" ? "green" : "amber"}
                  />
                </StatGrid>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
