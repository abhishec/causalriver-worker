"use client";

import { useState, useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
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
  FinRow,
  FinSection,
  FinTotal,
} from "./shared";

// ── Types ───────────────────────────────────────────────────────────────────

interface Variance {
  lineItem: string;
  accountType: string;
  currentAmount: number;
  priorAmount: number;
  varianceAmount: number;
  variancePct: number;
  direction: "favorable" | "unfavorable" | "neutral";
  materiality: "material" | "immaterial";
}

interface CausalAttribution {
  lineItem: string;
  totalVariance: number;
  attributions: Array<{
    cause: string;
    domain: string;
    contribution: number;
    contributionPct: number;
    causalPath: string[];
    evidenceStrength: number;
    evidence: string;
  }>;
  residualUnexplained: number;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function fmtCurrency(v: number): string {
  if (!Number.isFinite(v)) return "$0";
  const abs = Math.abs(v);
  const prefix = v < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${prefix}$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${prefix}$${(abs / 1_000).toFixed(1)}K`;
  return `${prefix}$${abs.toFixed(0)}`;
}

function fmtPct(v: number): string {
  if (!Number.isFinite(v)) return "—";
  const prefix = v > 0 ? "+" : "";
  return `${prefix}${v.toFixed(1)}%`;
}

// ── Main Component ──────────────────────────────────────────────────────────

export function CausalPLRenderer({ data }: { data: Record<string, any> }) {
  const [tab, setTab] = useState("statement");
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  // Memoized to avoid new array references on every render when data is null
  const variances: Variance[] = useMemo(() => data?.variances ?? [], [data?.variances]);
  const attributions: CausalAttribution[] = useMemo(() => data?.causalAttributions ?? [], [data?.causalAttributions]);
  const narrative: string = data?.summaryNarrative ?? data?.summary ?? "";
  const confidence: number = data?.confidenceScore ?? 0;
  const periodLabel = data?.periodLabel ?? `${data?.periodFrom ?? ""} — ${data?.periodTo ?? ""}`;

  // Build attribution lookup
  const attrMap = useMemo(() => {
    const map = new Map<string, CausalAttribution>();
    attributions.forEach((a) => map.set(a.lineItem, a));
    return map;
  }, [attributions]);

  // Stats
  const materialCount = variances.filter((v) => v.materiality === "material").length;
  const totalFavorable = variances.filter((v) => v.direction === "favorable").reduce((s, v) => s + Math.abs(v.varianceAmount), 0);
  const totalUnfavorable = variances.filter((v) => v.direction === "unfavorable").reduce((s, v) => s + Math.abs(v.varianceAmount), 0);
  const netVariance = totalFavorable - totalUnfavorable;
  const explainedPct = useMemo(() => {
    if (attributions.length === 0) return 0;
    const totalVar = attributions.reduce((s, a) => s + Math.abs(a.totalVariance), 0);
    const totalResidual = attributions.reduce((s, a) => s + Math.abs(a.residualUnexplained), 0);
    return totalVar > 0 ? ((totalVar - totalResidual) / totalVar) * 100 : 0;
  }, [attributions]);

  // Waterfall chart data
  const waterfallData = useMemo(() => {
    const material = variances.filter((v) => v.materiality === "material");
    const items: Array<{ name: string; value: number; color: string }> = material
      .sort((a, b) => Math.abs(b.varianceAmount) - Math.abs(a.varianceAmount))
      .slice(0, 8)
      .map((v) => ({
        name: v.lineItem.length > 18 ? v.lineItem.slice(0, 16) + ".." : v.lineItem,
        value: v.varianceAmount,
        color: v.direction === "favorable" ? "#10b981" : "#dc2626",
      }));
    return items;
  }, [variances]);

  // Group variances by account type for P&L display
  const groupedVariances = useMemo(() => {
    const groups = new Map<string, Variance[]>();
    variances.forEach((v) => {
      const group = v.accountType || "Other";
      if (!groups.has(group)) groups.set(group, []);
      groups.get(group)!.push(v);
    });
    return groups;
  }, [variances]);

  const tabs = [
    { id: "statement", label: "P&L Statement" },
    { id: "causes", label: "Causal Analysis", hasDot: materialCount > 0 },
    { id: "waterfall", label: "Waterfall" },
  ];

  return (
    <div className="flex flex-col h-full">
      <ArtifactHeader
        icon="🧠"
        title={data?.title ?? "Causal P&L Narrator"}
        badge={`${Math.round(explainedPct)}% explained`}
        badgeColor={explainedPct >= 80 ? "green" : explainedPct >= 60 ? "amber" : "red"}
      />

      {/* Executive summary */}
      {narrative && (
        <div className="px-3 pt-2 shrink-0">
          <InsightBox><strong>Executive Summary:</strong> {narrative}</InsightBox>
        </div>
      )}

      {/* KPI Stats */}
      <div className="px-3 py-2 shrink-0">
        <StatGrid cols={4}>
          <StatCard label="Net Variance" value={fmtCurrency(netVariance)} color={netVariance >= 0 ? "green" : "red"} />
          <StatCard label="Favorable" value={fmtCurrency(totalFavorable)} color="green" />
          <StatCard label="Unfavorable" value={fmtCurrency(totalUnfavorable)} color="red" />
          <StatCard label="Material Items" value={materialCount} color={materialCount > 5 ? "amber" : "blue"} />
        </StatGrid>
      </div>

      <ArtifactTabs tabs={tabs} active={tab} onChange={setTab} />

      <div className="flex-1 overflow-y-auto p-3">
        {tab === "statement" && (
          <>
            <div className="text-[10px] text-muted mb-1">{periodLabel}</div>
            {Array.from(groupedVariances.entries()).map(([group, items]) => (
              <div key={group} className="mb-2">
                <FinSection title={group} />
                {items.map((v) => {
                  const hasAttribution = attrMap.has(v.lineItem);
                  const isExpanded = expandedRow === v.lineItem;
                  const attr = attrMap.get(v.lineItem);
                  return (
                    <div key={v.lineItem}>
                      <div
                        className={cn(
                          "flex justify-between items-center px-3 py-1.5 transition-colors",
                          hasAttribution && "cursor-pointer hover:bg-surface-hover/50",
                          v.materiality === "material" && "font-medium",
                        )}
                        onClick={() => hasAttribution && setExpandedRow(isExpanded ? null : v.lineItem)}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          {hasAttribution && (
                            <span className={cn("text-[9px] transition-transform", isExpanded && "rotate-90")}>▸</span>
                          )}
                          <span className={cn("text-[12px] truncate", v.materiality === "material" ? "text-foreground" : "text-muted-foreground")}>
                            {v.lineItem}
                          </span>
                          {v.materiality === "material" && (
                            <span className={cn(
                              "text-[9px] font-mono tabular-nums px-1 py-0.5 rounded",
                              v.direction === "favorable" ? "bg-success/8 text-success" : v.direction === "unfavorable" ? "bg-danger/8 text-danger" : "bg-surface text-muted",
                            )}>
                              {fmtPct(v.variancePct)}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <span className="text-[11px] font-mono tabular-nums text-muted">{fmtCurrency(v.priorAmount)}</span>
                          <span className={cn("text-[11px] font-mono tabular-nums font-medium", v.direction === "favorable" ? "text-success" : v.direction === "unfavorable" ? "text-danger" : "text-foreground")}>
                            {fmtCurrency(v.currentAmount)}
                          </span>
                        </div>
                      </div>

                      {/* Expanded causal attribution */}
                      {isExpanded && attr && (
                        <div className="mx-3 mb-2 p-2.5 rounded-lg bg-surface/50 border border-border-subtle">
                          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted mb-1.5">
                            Variance: {fmtCurrency(attr.totalVariance)} — Causal Breakdown
                          </div>
                          <div className="space-y-1.5">
                            {attr.attributions.map((a, i) => (
                              <div key={i} className="flex items-start gap-2 text-[11px]">
                                <div className="flex items-center gap-1 shrink-0 mt-0.5">
                                  <div
                                    className="w-2 h-2 rounded-full"
                                    style={{
                                      backgroundColor: a.contribution >= 0 ? "#10b981" : "#dc2626",
                                      opacity: Math.min(1, Math.abs(a.contributionPct) / 50 + 0.3),
                                    }}
                                  />
                                  <span className="font-mono tabular-nums text-[10px] w-8 text-right">
                                    {Math.round(a.contributionPct)}%
                                  </span>
                                </div>
                                <div className="min-w-0">
                                  <div className="text-foreground">{a.cause}</div>
                                  {a.causalPath.length > 0 && (
                                    <div className="text-[9px] text-muted font-mono mt-0.5">{a.causalPath.join(" → ")}</div>
                                  )}
                                  {a.evidence && (
                                    <div className="text-[10px] text-muted-foreground mt-0.5">{a.evidence}</div>
                                  )}
                                </div>
                                <span className={cn("shrink-0 font-mono tabular-nums text-[10px]", a.contribution >= 0 ? "text-success" : "text-danger")}>
                                  {fmtCurrency(a.contribution)}
                                </span>
                              </div>
                            ))}
                            {attr.residualUnexplained !== 0 && (
                              <div className="flex items-center gap-2 text-[11px] text-muted pt-1 border-t border-border-subtle">
                                <span className="w-2 h-2 rounded-full bg-zinc-500" />
                                <span className="flex-1">Unexplained residual</span>
                                <span className="font-mono tabular-nums">{fmtCurrency(attr.residualUnexplained)}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}

            <FinTotal
              label="Net Income Variance"
              value={fmtCurrency(netVariance)}
              color={netVariance >= 0 ? "green" : "red"}
            />
          </>
        )}

        {tab === "causes" && (
          <>
            {attributions.length === 0 ? (
              <div className="text-center text-[12px] text-muted py-8">No causal attributions available</div>
            ) : (
              <div className="space-y-3">
                {attributions
                  .sort((a, b) => Math.abs(b.totalVariance) - Math.abs(a.totalVariance))
                  .map((attr) => (
                    <div key={attr.lineItem} className="rounded-[10px] border border-border-subtle overflow-hidden">
                      <div className="flex items-center justify-between px-3 py-2 bg-surface/50">
                        <span className="text-[12px] font-medium text-foreground">{attr.lineItem}</span>
                        <span className={cn(
                          "text-[11px] font-mono tabular-nums font-medium",
                          attr.totalVariance >= 0 ? "text-success" : "text-danger",
                        )}>
                          {fmtCurrency(attr.totalVariance)}
                        </span>
                      </div>
                      <div className="px-3 py-2 space-y-1">
                        {attr.attributions.map((a, i) => {
                          const barWidth = Math.min(100, Math.abs(a.contributionPct ?? 0));
                          return (
                            <div key={i}>
                              <div className="flex justify-between text-[10px] mb-0.5">
                                <span className="text-muted-foreground truncate">{a.cause}</span>
                                <span className="font-mono tabular-nums shrink-0 ml-2">{fmtCurrency(a.contribution)}</span>
                              </div>
                              <div className="h-1 bg-surface rounded-full overflow-hidden">
                                <div
                                  className="h-full rounded-full transition-all duration-500"
                                  style={{
                                    width: `${barWidth}%`,
                                    background: a.contribution >= 0 ? "#10b981" : "#dc2626",
                                  }}
                                />
                              </div>
                              {a.evidence && <div className="text-[9px] text-muted mt-0.5 mb-1">{a.evidence}</div>}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </>
        )}

        {tab === "waterfall" && (
          <>
            {waterfallData.length > 0 ? (
              <div className="rounded-xl bg-card border border-border-subtle overflow-hidden">
                <div className="px-4 pt-3 pb-1">
                  <h4 className="text-xs font-medium text-foreground">Variance Waterfall — Material Items</h4>
                  <p className="text-[10px] text-muted mt-0.5">Top line-item variances by absolute magnitude</p>
                </div>
                <div className="px-3 pb-3 pt-2">
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={waterfallData} margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2e" vertical={false} />
                      <XAxis
                        dataKey="name"
                        axisLine={false}
                        tickLine={false}
                        tick={{ fontSize: 9, fill: "#71717a" }}
                        interval={0}
                        angle={-30}
                        textAnchor="end"
                        height={50}
                      />
                      <YAxis
                        axisLine={false}
                        tickLine={false}
                        tick={{ fontSize: 10, fill: "#71717a" }}
                        width={50}
                        tickFormatter={(v: number) => fmtCurrency(v)}
                      />
                      <Tooltip
                        formatter={(v: number) => fmtCurrency(v)}
                        contentStyle={{ background: "#18181b", border: "1px solid #27272a", borderRadius: 8, fontSize: 10 }}
                      />
                      <ReferenceLine y={0} stroke="#71717a" strokeOpacity={0.3} />
                      <Bar dataKey="value" radius={[3, 3, 0, 0]}>
                        {waterfallData.map((entry, i) => (
                          <Cell key={i} fill={entry.color} opacity={0.85} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            ) : (
              <div className="text-center text-[12px] text-muted py-8">No material variances to display</div>
            )}

            {/* Confidence score */}
            <div className="mt-4">
              <StatGrid cols={2}>
                <StatCard
                  label="Causal Confidence"
                  value={`${Math.round(confidence * 100)}%`}
                  color={confidence >= 0.8 ? "green" : confidence >= 0.6 ? "amber" : "red"}
                />
                <StatCard
                  label="Variance Explained"
                  value={`${Math.round(explainedPct)}%`}
                  color={explainedPct >= 80 ? "green" : explainedPct >= 60 ? "amber" : "red"}
                />
              </StatGrid>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
