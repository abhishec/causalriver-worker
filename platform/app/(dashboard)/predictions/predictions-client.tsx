"use client";

import { useState, useMemo } from "react";
import { cn } from "@/lib/utils";

interface Prediction {
  id: string;
  entity_name: string;
  domain: string;
  predicted_value: number;
  actual_value: number | null;
  accuracy: number | null;
  prediction_type: string;
  created_at: string;
  verification_date: string | null;
  status: string;
}

interface AccuracyPoint {
  snapshot_date: string;
  prediction_accuracy: number | null;
}

interface PredictionsClientProps {
  predictions: Prediction[];
  accuracyTrend: AccuracyPoint[];
}

function getStatusBadge(prediction: Prediction) {
  if (!prediction.actual_value && prediction.status !== "expired") {
    return { label: "Pending", color: "bg-warning/10 text-warning", icon: "M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" };
  }
  if (prediction.status === "expired") {
    return { label: "Expired", color: "bg-muted/10 text-muted", icon: "M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" };
  }
  const acc = prediction.accuracy || 0;
  if (acc >= 90) {
    return { label: "Verified", color: "bg-success/10 text-success", icon: "M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" };
  }
  if (acc >= 75) {
    return { label: "Partial", color: "bg-info/10 text-info", icon: "M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" };
  }
  return { label: "Missed", color: "bg-danger/10 text-danger", icon: "M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" };
}

export function PredictionsClient({ predictions, accuracyTrend }: PredictionsClientProps) {
  const [domainFilter, setDomainFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  // Compute summary stats
  const stats = useMemo(() => {
    const verified = predictions.filter((p) => p.actual_value !== null && p.status !== "expired");
    const pending = predictions.filter((p) => p.actual_value === null && p.status !== "expired");
    const expired = predictions.filter((p) => p.status === "expired");
    const overallAccuracy = verified.length > 0
      ? verified.reduce((sum, p) => sum + (p.accuracy || 0), 0) / verified.length
      : 0;
    return { total: predictions.length, verified: verified.length, pending: pending.length, expired: expired.length, overallAccuracy };
  }, [predictions]);

  // Domain breakdown
  const domainStats = useMemo(() => {
    const map: Record<string, { count: number; totalAcc: number; verified: number }> = {};
    predictions.forEach((p) => {
      const d = p.domain || "unknown";
      if (!map[d]) map[d] = { count: 0, totalAcc: 0, verified: 0 };
      map[d].count++;
      if (p.actual_value !== null && p.status !== "expired") {
        map[d].verified++;
        map[d].totalAcc += p.accuracy || 0;
      }
    });
    return Object.entries(map)
      .map(([domain, { count, totalAcc, verified }]) => ({
        domain,
        count,
        accuracy: verified > 0 ? totalAcc / verified : 0,
      }))
      .sort((a, b) => b.count - a.count);
  }, [predictions]);

  const domains = domainStats.map((d) => d.domain);

  const filtered = useMemo(() => {
    return predictions.filter((p) => {
      if (domainFilter !== "all" && p.domain !== domainFilter) return false;
      if (statusFilter === "verified" && (p.actual_value === null || p.status === "expired")) return false;
      if (statusFilter === "pending" && (p.actual_value !== null || p.status === "expired")) return false;
      if (statusFilter === "expired" && p.status !== "expired") return false;
      return true;
    });
  }, [predictions, domainFilter, statusFilter]);

  // SVG accuracy trend chart
  const chartWidth = 500;
  const chartHeight = 120;
  const validPoints = accuracyTrend.filter((p) => p.prediction_accuracy !== null);

  let pathD = "";
  let areaD = "";
  if (validPoints.length > 1) {
    const xStep = chartWidth / (validPoints.length - 1);
    const points = validPoints.map((p, i) => ({
      x: i * xStep,
      y: chartHeight - ((p.prediction_accuracy || 0) / 100) * chartHeight,
    }));
    pathD = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
    areaD = pathD + ` L ${points[points.length - 1].x.toFixed(1)} ${chartHeight} L 0 ${chartHeight} Z`;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Prediction Tracker</h1>
        <p className="text-muted text-sm mt-1">
          Track the brain&apos;s prediction accuracy and verification status
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="rounded-xl bg-card border border-border/50 p-5">
          <div className="text-xs font-medium text-muted uppercase tracking-wider mb-2">Overall Accuracy</div>
          <div className="text-2xl font-bold text-accent">{stats.overallAccuracy.toFixed(1)}%</div>
          <div className="text-xs text-muted mt-1">Across verified predictions</div>
        </div>
        <div className="rounded-xl bg-card border border-border/50 p-5">
          <div className="text-xs font-medium text-muted uppercase tracking-wider mb-2">Total Predictions</div>
          <div className="text-2xl font-bold text-foreground">{stats.total}</div>
          <div className="text-xs text-muted mt-1">All time</div>
        </div>
        <div className="rounded-xl bg-card border border-border/50 p-5">
          <div className="text-xs font-medium text-muted uppercase tracking-wider mb-2">Verified</div>
          <div className="text-2xl font-bold text-success">{stats.verified}</div>
          <div className="text-xs text-muted mt-1">Outcomes confirmed</div>
        </div>
        <div className="rounded-xl bg-card border border-border/50 p-5">
          <div className="text-xs font-medium text-muted uppercase tracking-wider mb-2">Pending</div>
          <div className="text-2xl font-bold text-warning">{stats.pending}</div>
          <div className="text-xs text-muted mt-1">Awaiting outcomes</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Accuracy Trend Chart */}
        <div className="lg:col-span-2 rounded-xl bg-card border border-border/50 p-5">
          <h3 className="text-sm font-semibold mb-4">Accuracy Over Time</h3>
          {validPoints.length < 2 ? (
            <div className="flex items-center justify-center h-32 text-sm text-muted">
              Not enough data for trend chart yet
            </div>
          ) : (
            <div className="relative">
              <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="w-full h-32" preserveAspectRatio="none">
                <defs>
                  <linearGradient id="accGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="rgb(var(--color-accent))" stopOpacity="0.3" />
                    <stop offset="100%" stopColor="rgb(var(--color-accent))" stopOpacity="0.02" />
                  </linearGradient>
                </defs>
                {/* Grid lines */}
                {[0, 25, 50, 75, 100].map((pct) => (
                  <line
                    key={pct}
                    x1={0}
                    y1={chartHeight - (pct / 100) * chartHeight}
                    x2={chartWidth}
                    y2={chartHeight - (pct / 100) * chartHeight}
                    stroke="currentColor"
                    strokeOpacity={0.05}
                    strokeDasharray="4 4"
                  />
                ))}
                {/* Area fill */}
                <path d={areaD} fill="url(#accGrad)" />
                {/* Line */}
                <path d={pathD} fill="none" stroke="rgb(var(--color-accent))" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                {/* Data dots */}
                {validPoints.map((p, i) => {
                  const xStep = chartWidth / (validPoints.length - 1);
                  const x = i * xStep;
                  const y = chartHeight - ((p.prediction_accuracy || 0) / 100) * chartHeight;
                  return (
                    <circle key={i} cx={x} cy={y} r="3" fill="rgb(var(--color-accent))" opacity="0.8" />
                  );
                })}
              </svg>
              <div className="flex justify-between text-[10px] text-muted mt-1">
                <span>{validPoints[0]?.snapshot_date}</span>
                <span>{validPoints[validPoints.length - 1]?.snapshot_date}</span>
              </div>
            </div>
          )}
        </div>

        {/* Domain Breakdown */}
        <div className="rounded-xl bg-card border border-border/50 p-5">
          <h3 className="text-sm font-semibold mb-4">Accuracy by Domain</h3>
          {domainStats.length === 0 ? (
            <div className="flex items-center justify-center h-32 text-sm text-muted">
              No domain data yet
            </div>
          ) : (
            <div className="space-y-3">
              {domainStats.map((d) => (
                <div key={d.domain}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs capitalize">{d.domain}</span>
                    <span className="text-xs font-medium text-muted-foreground">
                      {d.accuracy > 0 ? `${d.accuracy.toFixed(0)}%` : "N/A"}
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-surface overflow-hidden">
                    <div
                      className={cn(
                        "h-full rounded-full transition-all",
                        d.accuracy >= 80 ? "bg-success" : d.accuracy >= 60 ? "bg-info" : d.accuracy > 0 ? "bg-warning" : "bg-muted/30"
                      )}
                      style={{ width: `${Math.max(d.accuracy, 5)}%` }}
                    />
                  </div>
                  <div className="text-[10px] text-muted mt-0.5">{d.count} predictions</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Prediction List */}
      <div className="rounded-xl bg-card border border-border/50 p-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
          <h3 className="text-sm font-semibold">All Predictions</h3>
          <div className="flex gap-2">
            <select
              value={domainFilter}
              onChange={(e) => setDomainFilter(e.target.value)}
              className="rounded-lg bg-input border border-input-border px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-accent/40"
            >
              <option value="all">All domains</option>
              {domains.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-lg bg-input border border-input-border px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-accent/40"
            >
              <option value="all">All status</option>
              <option value="verified">Verified</option>
              <option value="pending">Pending</option>
              <option value="expired">Expired</option>
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-muted border-b border-border/30">
                <th className="text-left py-2 font-medium">Entity</th>
                <th className="text-left py-2 font-medium">Domain</th>
                <th className="text-right py-2 font-medium">Predicted</th>
                <th className="text-right py-2 font-medium">Actual</th>
                <th className="text-right py-2 font-medium">Accuracy</th>
                <th className="text-center py-2 font-medium">Status</th>
                <th className="text-right py-2 font-medium">Date</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-muted">
                    <svg className="w-10 h-10 text-muted/20 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                    </svg>
                    <p>No predictions match your filters</p>
                    <p className="text-xs mt-1">The brain will generate predictions as it learns from your data</p>
                  </td>
                </tr>
              ) : (
                filtered.map((p) => {
                  const badge = getStatusBadge(p);
                  return (
                    <tr key={p.id} className="border-b border-border/10 hover:bg-surface-hover">
                      <td className="py-2.5 font-medium text-xs">{p.entity_name}</td>
                      <td className="py-2.5">
                        <span className="text-xs capitalize text-muted-foreground">{p.domain}</span>
                      </td>
                      <td className="py-2.5 text-right font-mono text-xs">
                        {p.predicted_value?.toFixed(2)}
                      </td>
                      <td className="py-2.5 text-right font-mono text-xs">
                        {p.actual_value !== null ? p.actual_value.toFixed(2) : <span className="text-muted">--</span>}
                      </td>
                      <td className="py-2.5 text-right">
                        {p.accuracy !== null ? (
                          <span className={cn(
                            "font-medium text-xs",
                            (p.accuracy || 0) >= 90 ? "text-success" : (p.accuracy || 0) >= 75 ? "text-info" : "text-danger"
                          )}>
                            {p.accuracy?.toFixed(1)}%
                          </span>
                        ) : (
                          <span className="text-xs text-muted">--</span>
                        )}
                      </td>
                      <td className="py-2.5 text-center">
                        <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium", badge.color)}>
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d={badge.icon} />
                          </svg>
                          {badge.label}
                        </span>
                      </td>
                      <td className="py-2.5 text-right text-xs text-muted font-mono">
                        {new Date(p.created_at).toLocaleDateString()}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
