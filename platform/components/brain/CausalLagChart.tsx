"use client";

import { useMemo } from "react";
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

/* ── Types ─────────────────────────────────────────────────────────────────── */

interface CausalEdge {
  id: string;
  source_entity: string;
  target_entity: string;
  strength: number;
  p_value: number;
  lag_periods: number;
  method: string;
  domain: string;
  natural_language?: string;
  created_at: string;
}

interface CausalLagChartProps {
  edges: CausalEdge[];
  onEdgeClick?: (edge: CausalEdge) => void;
  className?: string;
}

/* ── Constants ─────────────────────────────────────────────────────────────── */

const LAG_COLORS = [
  "#3b82f6", // 0d - blue
  "#06b6d4", // 1d - cyan
  "#10b981", // 2-3d - green
  "#22c55e", // 4-5d - emerald
  "#f59e0b", // 6-7d - amber
  "#f97316", // 8-14d - orange
  "#ef4444", // 15+d - red
];

function lagToColor(lag: number): string {
  if (lag === 0) return LAG_COLORS[0];
  if (lag === 1) return LAG_COLORS[1];
  if (lag <= 3) return LAG_COLORS[2];
  if (lag <= 5) return LAG_COLORS[3];
  if (lag <= 7) return LAG_COLORS[4];
  if (lag <= 14) return LAG_COLORS[5];
  return LAG_COLORS[6];
}

function lagBucketLabel(lag: number): string {
  if (lag === 0) return "Same day";
  if (lag === 1) return "+1 day";
  if (lag <= 3) return "+2-3 days";
  if (lag <= 5) return "+4-5 days";
  if (lag <= 7) return "+6-7 days";
  if (lag <= 14) return "+8-14 days";
  return "+15+ days";
}

/* ── Component ─────────────────────────────────────────────────────────────── */

export function CausalLagChart({ edges, onEdgeClick, className }: CausalLagChartProps) {
  // Group edges by lag bucket
  const { bucketData, lagEdges } = useMemo(() => {
    const buckets = [
      { label: "Same day", min: 0, max: 0, edges: [] as CausalEdge[] },
      { label: "+1 day", min: 1, max: 1, edges: [] as CausalEdge[] },
      { label: "+2-3 days", min: 2, max: 3, edges: [] as CausalEdge[] },
      { label: "+4-5 days", min: 4, max: 5, edges: [] as CausalEdge[] },
      { label: "+6-7 days", min: 6, max: 7, edges: [] as CausalEdge[] },
      { label: "+8-14 days", min: 8, max: 14, edges: [] as CausalEdge[] },
      { label: "+15+ days", min: 15, max: Infinity, edges: [] as CausalEdge[] },
    ];

    for (const edge of edges) {
      const bucket = buckets.find((b) => edge.lag_periods >= b.min && edge.lag_periods <= b.max);
      if (bucket) bucket.edges.push(edge);
    }

    const data = buckets
      .filter((b) => b.edges.length > 0)
      .map((b) => ({
        name: b.label,
        count: b.edges.length,
        avgStrength: b.edges.reduce((s, e) => s + e.strength, 0) / b.edges.length,
        color: lagToColor(b.min),
        edges: b.edges,
      }));

    return { bucketData: data, lagEdges: edges };
  }, [edges]);

  const CustomTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    const d = payload[0].payload;
    return (
      <div className="bg-surface-elevated border border-border rounded-lg px-3 py-2 shadow-lg max-w-xs">
        <div className="text-xs font-medium mb-1">{d.name}</div>
        <div className="space-y-1 text-[10px]">
          <div className="flex justify-between gap-4">
            <span className="text-muted">Relationships</span>
            <span className="font-semibold tabular-nums">{d.count}</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-muted">Avg. Strength</span>
            <span className="font-semibold tabular-nums">{(d.avgStrength * 100).toFixed(0)}%</span>
          </div>
          {d.edges.slice(0, 3).map((e: CausalEdge) => (
            <div key={e.id} className="text-muted truncate">
              {e.source_entity} &rarr; {e.target_entity}
            </div>
          ))}
          {d.edges.length > 3 && (
            <div className="text-muted">+{d.edges.length - 3} more</div>
          )}
        </div>
      </div>
    );
  };

  if (edges.length === 0) {
    return (
      <div className={cn("rounded-xl bg-card border border-border-subtle p-6", className)}>
        <div className="flex flex-col items-center justify-center h-40 text-center">
          <svg className="w-8 h-8 text-muted mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <h4 className="text-sm font-medium text-muted-foreground">No causal lag data</h4>
          <p className="text-xs text-muted mt-1">Causal lag shows how long effects take to propagate</p>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("rounded-xl bg-card border border-border-subtle", className)}>
      {/* Header */}
      <div className="px-5 py-4 border-b border-border-subtle">
        <h3 className="text-sm font-medium">Causal Time Lag Distribution</h3>
        <p className="text-[10px] text-muted mt-0.5">
          How long effects take to propagate across {edges.length} relationships
        </p>
      </div>

      {/* Chart */}
      <div className="px-4 py-4">
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={bucketData} margin={{ top: 4, right: 4, left: -10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2e" vertical={false} />
            <XAxis
              dataKey="name"
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 10, fill: "#71717a" }}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 10, fill: "#71717a" }}
              width={30}
              allowDecimals={false}
            />
            <Tooltip content={<CustomTooltip />} />
            <Bar
              dataKey="count"
              radius={[4, 4, 0, 0]}
              cursor="pointer"
              onClick={(data: any) => {
                if (onEdgeClick && data?.edges?.[0]) onEdgeClick(data.edges[0]);
              }}
            >
              {bucketData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} opacity={0.85} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Lag Breakdown Cards */}
      <div className="px-5 pb-4 space-y-1.5">
        {bucketData.map((bucket) => (
          <div
            key={bucket.name}
            className="flex items-center gap-3 px-3 py-2 rounded-lg bg-surface/30 hover:bg-surface-hover transition-colors"
          >
            <div className="w-1.5 h-8 rounded-full" style={{ backgroundColor: bucket.color }} />
            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium">{bucket.name}</div>
              <div className="text-[10px] text-muted">
                {bucket.count} relationship{bucket.count !== 1 ? "s" : ""}, avg strength {(bucket.avgStrength * 100).toFixed(0)}%
              </div>
            </div>
            <div className="text-sm font-semibold tabular-nums">{bucket.count}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
