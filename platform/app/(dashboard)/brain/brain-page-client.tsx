"use client";

import { useState, useEffect, useCallback } from "react";
import { timeAgo } from "@/lib/utils";

/* -------------------------------------------------------------------------- */
/*  Types                                                                      */
/* -------------------------------------------------------------------------- */

interface ServiceHealthRow {
  service_type: string;
  status: string;
  context_string: string | null;
  updated_at: string;
}

interface DomainTrend {
  domain: string;
  avgQuality: number;
  sampleCount: number;
}

interface WorkspaceOverviewData {
  serviceHealth: ServiceHealthRow[];
  knowledgeCount: number;
  qualityScore7d: number;
  learningVelocity: number;
  totalSignals7d: number;
  domainTrends: DomainTrend[];
  updatedAt: string;
}

/* -------------------------------------------------------------------------- */
/*  Layer label map (L25-L29 per BrainOS architecture)                         */
/* -------------------------------------------------------------------------- */

const LAYER_LABELS: Record<string, { id: string; name: string }> = {
  "se-aas": { id: "L26", name: "SE-aaS (Delivery Intelligence)" },
  "aas":    { id: "L27", name: "AaaS (Accounting Intelligence)" },
  "pm-aas": { id: "L28", name: "PM-aaS (Financial Crime)" },
  "brain":  { id: "L25", name: "Brain Core (Episodic Replay)" },
};

// Fallback for unknown service types
function getLayerLabel(serviceType: string): { id: string; name: string } {
  return (
    LAYER_LABELS[serviceType] ?? { id: serviceType.toUpperCase(), name: serviceType }
  );
}

/* -------------------------------------------------------------------------- */
/*  Status badge                                                                */
/* -------------------------------------------------------------------------- */

function StatusBadge({ status }: { status: string }) {
  const s = status?.toLowerCase() ?? "unknown";

  if (s === "healthy" || s === "active" || s === "ok") {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-success/10 text-success text-[10px] font-medium">
        <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
        healthy
      </span>
    );
  }
  if (s === "degraded" || s === "warning") {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-warning/10 text-warning text-[10px] font-medium">
        <span className="w-1.5 h-1.5 rounded-full bg-warning" />
        degraded
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-surface text-muted text-[10px] font-medium">
      <span className="w-1.5 h-1.5 rounded-full bg-muted" />
      unknown
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/*  Quality bar                                                                 */
/* -------------------------------------------------------------------------- */

function QualityBar({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const color =
    pct >= 70 ? "bg-success" : pct >= 40 ? "bg-warning" : "bg-danger";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 rounded-full bg-surface overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs font-mono tabular-nums text-foreground/60 w-8 text-right">
        {pct}%
      </span>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Stat card                                                                   */
/* -------------------------------------------------------------------------- */

function StatCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string | number;
  sub?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card px-5 py-4">
      <div className="text-[10px] text-foreground/50 uppercase tracking-wider mb-1">
        {label}
      </div>
      <div className="text-2xl font-semibold tabular-nums">{value}</div>
      {sub && (
        <div className="text-[11px] text-foreground/40 mt-0.5">{sub}</div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Empty state                                                                 */
/* -------------------------------------------------------------------------- */

function EmptyRow({ message }: { message: string }) {
  return (
    <div className="py-8 text-center text-sm text-foreground/40">{message}</div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Main component                                                              */
/* -------------------------------------------------------------------------- */

export default function BrainPageClient() {
  const [data, setData] = useState<WorkspaceOverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedServices, setExpandedServices] = useState<Set<string>>(
    new Set()
  );

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/brain/workspace-overview");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as WorkspaceOverviewData;
      setData(json);
      setError(null);
    } catch (err) {
      setError((err as Error).message ?? "Failed to load brain overview");
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load + 30s refresh
  useEffect(() => {
    void fetchData();
    const id = setInterval(fetchData, 30_000);
    return () => clearInterval(id);
  }, [fetchData]);

  const toggleExpand = (serviceType: string) => {
    setExpandedServices((prev) => {
      const next = new Set(prev);
      if (next.has(serviceType)) next.delete(serviceType);
      else next.add(serviceType);
      return next;
    });
  };

  /* ---------------------------------------------------------------------- */
  /*  Render                                                                  */
  /* ---------------------------------------------------------------------- */

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Brain</h1>
          <p className="text-xs text-foreground/50 mt-0.5">
            Workspace-level learning engine
          </p>
        </div>
        {data && (
          <span className="text-[10px] text-foreground/30 tabular-nums">
            Updated {timeAgo(data.updatedAt)}
          </span>
        )}
      </div>

      {/* Loading skeleton */}
      {loading && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-20 rounded-xl bg-surface animate-pulse"
            />
          ))}
        </div>
      )}

      {/* Error state */}
      {!loading && error && (
        <div className="rounded-xl border border-border bg-card px-5 py-4 text-sm text-danger">
          Failed to load brain overview: {error}
        </div>
      )}

      {/* Content */}
      {!loading && !error && data && (
        <>
          {/* Stats row */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <StatCard
              label="Quality Score (7d)"
              value={`${Math.round(data.qualityScore7d * 100)}%`}
              sub={`${data.totalSignals7d} predictions`}
            />
            <StatCard
              label="Learning Velocity (24h)"
              value={data.learningVelocity}
              sub="RL signals in last 24 hours"
            />
            <StatCard
              label="Federated Knowledge"
              value={data.knowledgeCount.toLocaleString()}
              sub="Knowledge entries indexed"
            />
          </div>

          {/* Service health — L25-L29 */}
          <section>
            <h2 className="text-xs font-medium text-foreground/50 uppercase tracking-wider mb-3">
              Service Health — L25 to L29
            </h2>
            <div className="rounded-xl border border-border bg-card divide-y divide-border">
              {data.serviceHealth.length === 0 ? (
                <EmptyRow message="No service health data — services will appear after the first Brain cycle." />
              ) : (
                data.serviceHealth.map((row) => {
                  const layer = getLayerLabel(row.service_type);
                  const isExpanded = expandedServices.has(row.service_type);
                  const contextPreview = row.context_string
                    ? row.context_string.slice(0, 120)
                    : null;
                  const hasMore =
                    row.context_string && row.context_string.length > 120;

                  return (
                    <div key={row.service_type} className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        {/* Layer badge */}
                        <span className="shrink-0 inline-flex items-center justify-center w-10 h-10 rounded-lg bg-surface text-xs font-bold text-foreground/60">
                          {layer.id}
                        </span>

                        {/* Name */}
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate">
                            {layer.name}
                          </div>
                          {contextPreview && !isExpanded && (
                            <p className="text-[11px] text-foreground/40 mt-0.5 truncate">
                              {contextPreview}
                              {hasMore && (
                                <button
                                  onClick={() =>
                                    toggleExpand(row.service_type)
                                  }
                                  className="ml-1 text-foreground/50 hover:text-foreground underline"
                                >
                                  more
                                </button>
                              )}
                            </p>
                          )}
                          {isExpanded && row.context_string && (
                            <p className="text-[11px] text-foreground/40 mt-0.5 whitespace-pre-wrap break-words">
                              {row.context_string}
                              <button
                                onClick={() => toggleExpand(row.service_type)}
                                className="ml-1 text-foreground/50 hover:text-foreground underline"
                              >
                                less
                              </button>
                            </p>
                          )}
                        </div>

                        {/* Status + time */}
                        <div className="shrink-0 flex flex-col items-end gap-1">
                          <StatusBadge status={row.status} />
                          <span className="text-[10px] text-foreground/30 tabular-nums">
                            {timeAgo(row.updated_at)}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </section>

          {/* Domain Quality Trends */}
          <section>
            <h2 className="text-xs font-medium text-foreground/50 uppercase tracking-wider mb-3">
              Domain Quality Trends (7d)
            </h2>
            <div className="rounded-xl border border-border bg-card overflow-hidden">
              {data.domainTrends.length === 0 ? (
                <EmptyRow message="No domain quality data yet — predictions will appear after agents complete tasks." />
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left px-5 py-3 text-[10px] font-medium text-foreground/40 uppercase tracking-wider">
                        Domain
                      </th>
                      <th className="text-left px-5 py-3 text-[10px] font-medium text-foreground/40 uppercase tracking-wider w-48">
                        Avg Quality
                      </th>
                      <th className="text-right px-5 py-3 text-[10px] font-medium text-foreground/40 uppercase tracking-wider">
                        Samples
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {data.domainTrends.map((row) => (
                      <tr
                        key={row.domain}
                        className="hover:bg-surface/50 transition-colors"
                      >
                        <td className="px-5 py-3 font-medium text-foreground/80 truncate max-w-[200px]">
                          {row.domain}
                        </td>
                        <td className="px-5 py-3 w-48">
                          <QualityBar value={row.avgQuality} />
                        </td>
                        <td className="px-5 py-3 text-right text-foreground/50 tabular-nums">
                          {row.sampleCount}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
