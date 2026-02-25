"use client";

import React, { useState, useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { cn } from "@/lib/utils";
import {
  ArtifactHeader,
  StatGrid,
  StatCard,
  ArtifactTabs,
  SeverityBadge,
  InsightBox,
} from "./shared";

// ── Types ───────────────────────────────────────────────────────────────────

interface LeakageFinding {
  findingType: string;
  clientId: string;
  clientName: string;
  amountLeaked: number;
  currency: string;
  evidence: {
    contractRate?: number;
    billedRate?: number;
    usage?: number;
    gapDescription?: string;
    affectedInvoices?: string[];
    affectedPeriod?: string;
  };
  correctiveAction: string;
  urgency: "critical" | "high" | "medium" | "low";
  status: string;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function fmtCurrency(v: number | null | undefined, currency = "SGD"): string {
  if (v == null || !isFinite(v)) return "—";
  const abs = Math.abs(v);
  const prefix = v < 0 ? "-" : "";
  const sym = currency === "USD" ? "$" : currency === "SGD" ? "S$" : `${currency} `;
  if (abs >= 1_000_000) return `${prefix}${sym}${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${prefix}${sym}${(abs / 1_000).toFixed(1)}K`;
  return `${prefix}${sym}${abs.toFixed(0)}`;
}

const TYPE_LABELS: Record<string, string> = {
  under_billing: "Under-Billing",
  missed_renewal: "Missed Renewal",
  unapplied_escalation: "Unapplied Escalation",
  overage_gap: "Overage Gap",
  pricing_error: "Pricing Error",
};

const TYPE_COLORS: Record<string, string> = {
  under_billing: "#dc2626",
  missed_renewal: "#f59e0b",
  unapplied_escalation: "#8b5cf6",
  overage_gap: "#3b82f6",
  pricing_error: "#f43f5e",
};

// ── Main Component ──────────────────────────────────────────────────────────

export function RevenueLeakageRenderer({ data }: { data: Record<string, any> }) {
  const [tab, setTab] = useState("overview");
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);

  const findings: LeakageFinding[] = data?.findings ?? [];
  const summary = data?.summary ?? {};
  const currency = findings[0]?.currency ?? "SGD";

  // Aggregate stats
  const totalLeakage = useMemo(() => findings.reduce((s, f) => s + f.amountLeaked, 0), [findings]);
  const uniqueClients = useMemo(() => new Set(findings.map((f) => f.clientId)).size, [findings]);
  const criticalCount = useMemo(() => findings.filter((f) => f.urgency === "critical" || f.urgency === "high").length, [findings]);
  const resolvedCount = useMemo(() => findings.filter((f) => f.status === "resolved").length, [findings]);

  // Chart: leakage by type
  const byTypeData = useMemo(() => {
    const map = new Map<string, number>();
    findings.forEach((f) => {
      map.set(f.findingType, (map.get(f.findingType) ?? 0) + f.amountLeaked);
    });
    return Array.from(map.entries())
      .map(([type, amount]) => ({ type: TYPE_LABELS[type] ?? type, amount, key: type }))
      .sort((a, b) => b.amount - a.amount);
  }, [findings]);

  const tabs = [
    { id: "overview", label: "Overview" },
    { id: "findings", label: `Findings (${findings.length})`, hasDot: criticalCount > 0 },
  ];

  return (
    <div className="flex flex-col h-full">
      <ArtifactHeader
        icon="🔍"
        title={data?.title ?? "Revenue Leakage Detector"}
        badge={fmtCurrency(totalLeakage, currency)}
        badgeColor="red"
      />

      {/* KPI Stats */}
      <div className="px-3 py-2 shrink-0">
        <StatGrid cols={4}>
          <StatCard label="Total Leakage" value={fmtCurrency(totalLeakage, currency)} color="red" />
          <StatCard label="Accounts Affected" value={uniqueClients} color="amber" />
          <StatCard label="Critical/High" value={criticalCount} color={criticalCount > 0 ? "red" : "green"} />
          <StatCard label="Resolved" value={`${resolvedCount}/${findings.length}`} color={resolvedCount === findings.length ? "green" : "amber"} />
        </StatGrid>
      </div>

      <ArtifactTabs tabs={tabs} active={tab} onChange={setTab} />

      <div className="flex-1 overflow-y-auto p-3">
        {tab === "overview" && (
          <>
            {/* Leakage by type bar chart */}
            {byTypeData.length > 0 && (
              <div className="rounded-xl bg-card border border-border-subtle overflow-hidden mb-3">
                <div className="px-4 pt-3 pb-1">
                  <h4 className="text-xs font-medium text-foreground">Leakage by Type</h4>
                </div>
                <div className="px-3 pb-3 pt-2">
                  <ResponsiveContainer width="100%" height={180}>
                    <BarChart data={byTypeData} layout="vertical" margin={{ top: 4, right: 8, left: 60, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2e" horizontal={false} />
                      <XAxis
                        type="number"
                        axisLine={false}
                        tickLine={false}
                        tick={{ fontSize: 10, fill: "#71717a" }}
                        tickFormatter={(v: number) => fmtCurrency(v, currency)}
                      />
                      <YAxis
                        dataKey="type"
                        type="category"
                        axisLine={false}
                        tickLine={false}
                        tick={{ fontSize: 10, fill: "#71717a" }}
                        width={80}
                      />
                      <Tooltip
                        formatter={(v: number) => fmtCurrency(v, currency)}
                        contentStyle={{ background: "#18181b", border: "1px solid #27272a", borderRadius: 8, fontSize: 10 }}
                      />
                      <Bar dataKey="amount" radius={[0, 4, 4, 0]}>
                        {byTypeData.map((entry) => (
                          <Cell key={entry.key} fill={TYPE_COLORS[entry.key] ?? "#7c6cf0"} opacity={0.85} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {/* Top leaking accounts */}
            {findings.length > 0 && <div className="text-[10px] font-semibold uppercase tracking-wider text-muted mb-1.5">Top Accounts by Leakage</div>}
            <div className="space-y-1.5">
              {Array.from(
                findings.reduce((map, f) => {
                  const current = map.get(f.clientName ?? f.clientId) ?? 0;
                  map.set(f.clientName ?? f.clientId, current + f.amountLeaked);
                  return map;
                }, new Map<string, number>()),
              )
                .sort(([, a], [, b]) => b - a)
                .slice(0, 5)
                .map(([client, amount]) => (
                  <div key={client} className="flex items-center justify-between px-3 py-2 rounded-lg bg-surface border border-border-subtle">
                    <span className="text-[12px] text-foreground font-medium truncate">{client}</span>
                    <span className="text-[12px] font-mono tabular-nums text-danger font-semibold shrink-0 ml-2">{fmtCurrency(amount, currency)}</span>
                  </div>
                ))}
            </div>

            {summary?.narrative && <InsightBox><strong>Analysis:</strong> {summary.narrative}</InsightBox>}
          </>
        )}

        {tab === "findings" && (
          <div className="rounded-lg border border-border-subtle overflow-hidden">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="bg-surface/50 border-b border-border-subtle">
                  <th className="text-left px-2 py-1.5 text-muted font-medium">Client</th>
                  <th className="text-left px-2 py-1.5 text-muted font-medium">Type</th>
                  <th className="text-right px-2 py-1.5 text-muted font-medium">Amount</th>
                  <th className="text-center px-2 py-1.5 text-muted font-medium">Urgency</th>
                </tr>
              </thead>
              <tbody>
                {findings.map((f, i) => (
                  <React.Fragment key={i}>
                    <tr
                      className={cn(
                        "border-b border-border-subtle last:border-b-0 cursor-pointer transition-colors hover:bg-surface-hover/50",
                        expandedIdx === i && "bg-surface-hover/30",
                      )}
                      onClick={() => setExpandedIdx(expandedIdx === i ? null : i)}
                    >
                      <td className="px-2 py-1.5 text-foreground font-medium truncate max-w-[120px]">{f.clientName ?? f.clientId}</td>
                      <td className="px-2 py-1.5 text-muted-foreground">{TYPE_LABELS[f.findingType] ?? f.findingType}</td>
                      <td className="px-2 py-1.5 text-right font-mono tabular-nums text-danger">{fmtCurrency(f.amountLeaked, f.currency)}</td>
                      <td className="px-2 py-1.5 text-center"><SeverityBadge level={f.urgency} /></td>
                    </tr>
                    {expandedIdx === i && (
                      <tr key={`${i}-detail`} className="border-b border-border-subtle">
                        <td colSpan={4} className="px-3 py-2.5 bg-surface/30">
                          <div className="space-y-1.5 text-[11px]">
                            {f.evidence?.gapDescription && (
                              <div><span className="text-muted">Gap:</span> <span className="text-muted-foreground">{f.evidence.gapDescription}</span></div>
                            )}
                            {f.evidence?.contractRate != null && (
                              <div className="flex gap-4">
                                <span><span className="text-muted">Contract Rate:</span> <span className="text-foreground font-mono">{f.evidence.contractRate}</span></span>
                                <span><span className="text-muted">Billed Rate:</span> <span className="text-foreground font-mono">{f.evidence.billedRate}</span></span>
                              </div>
                            )}
                            {f.evidence?.affectedPeriod && (
                              <div><span className="text-muted">Period:</span> <span className="text-muted-foreground">{f.evidence.affectedPeriod}</span></div>
                            )}
                            {f.correctiveAction && (
                              <div className="mt-1 px-2 py-1.5 rounded bg-accent/4 border border-accent/15 text-accent text-[11px]">
                                <strong>Action:</strong> {f.correctiveAction}
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
