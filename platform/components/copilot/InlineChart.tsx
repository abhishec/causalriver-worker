"use client";

import { useMemo } from "react";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  Cell,
} from "recharts";
import { cn } from "@/lib/utils";
import type { ChartSpec } from "./chart-utils";

// Re-export types + parser so existing imports keep working
export type { ChartSpec } from "./chart-utils";
export { parseChartSpec } from "./chart-utils";

interface InlineChartProps {
  spec: ChartSpec;
  className?: string;
}

/* ── Constants ─────────────────────────────────────────────────────────────── */

const DEFAULT_COLORS = [
  "#7c6cf0", // accent
  "#3b82f6", // blue
  "#10b981", // green
  "#f59e0b", // amber
  "#f43f5e", // rose
  "#8b5cf6", // violet
  "#06b6d4", // cyan
  "#ec4899", // pink
  "#14b8a6", // teal
  "#f97316", // orange
];

/* ── Component ─────────────────────────────────────────────────────────────── */

export function InlineChart({ spec, className }: InlineChartProps) {
  const { type, title, subtitle, xKey, series, data } = spec;

  // Assign default colors to series if not provided
  const coloredSeries = useMemo(() => {
    return series.map((s, i) => ({
      ...s,
      color: s.color || DEFAULT_COLORS[i % DEFAULT_COLORS.length],
      label: s.label || s.key,
    }));
  }, [series]);

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="bg-surface-elevated border border-border rounded-lg px-3 py-2 shadow-lg">
        <div className="text-[10px] text-muted mb-1 font-medium">{label}</div>
        <div className="space-y-0.5">
          {payload.map((p: any) => (
            <div key={p.dataKey} className="flex items-center justify-between gap-4 text-[10px]">
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color || p.fill }} />
                <span className="text-muted-foreground">{p.name || p.dataKey}</span>
              </div>
              <span className="font-mono tabular-nums text-foreground font-medium">
                {typeof p.value === "number" ? p.value.toLocaleString() : p.value}
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  if (!data || data.length === 0) {
    return (
      <div className={cn("rounded-xl bg-surface/30 border border-border-subtle p-4 text-center text-xs text-muted", className)}>
        No data to display
      </div>
    );
  }

  const chartHeight = 240;
  const isStacked = type === "stacked-bar";

  return (
    <div className={cn("rounded-xl bg-card border border-border-subtle overflow-hidden my-3", className)}>
      {/* Header */}
      {(title || subtitle) && (
        <div className="px-4 pt-3 pb-1">
          {title && <h4 className="text-xs font-medium text-foreground">{title}</h4>}
          {subtitle && <p className="text-[10px] text-muted mt-0.5">{subtitle}</p>}
        </div>
      )}

      {/* Chart */}
      <div className="px-3 pb-3 pt-2">
        <ResponsiveContainer width="100%" height={chartHeight}>
          {type === "line" ? (
            <LineChart data={data} margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2e" vertical={false} />
              <XAxis dataKey={xKey} axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: "#71717a" }} />
              <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: "#71717a" }} width={40} />
              <Tooltip content={<CustomTooltip />} />
              {coloredSeries.length > 1 && <Legend iconSize={8} wrapperStyle={{ fontSize: 10 }} />}
              {coloredSeries.map((s) => (
                <Line
                  key={s.key}
                  type="monotone"
                  dataKey={s.key}
                  name={s.label}
                  stroke={s.color}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 3, strokeWidth: 0, fill: s.color }}
                />
              ))}
            </LineChart>
          ) : type === "area" ? (
            <AreaChart data={data} margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
              <defs>
                {coloredSeries.map((s) => (
                  <linearGradient key={`grad-${s.key}`} id={`grad-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={s.color} stopOpacity={0.15} />
                    <stop offset="95%" stopColor={s.color} stopOpacity={0} />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2e" vertical={false} />
              <XAxis dataKey={xKey} axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: "#71717a" }} />
              <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: "#71717a" }} width={40} />
              <Tooltip content={<CustomTooltip />} />
              {coloredSeries.length > 1 && <Legend iconSize={8} wrapperStyle={{ fontSize: 10 }} />}
              {coloredSeries.map((s) => (
                <Area
                  key={s.key}
                  type="monotone"
                  dataKey={s.key}
                  name={s.label}
                  stroke={s.color}
                  strokeWidth={1.5}
                  fill={`url(#grad-${s.key})`}
                  dot={false}
                  activeDot={{ r: 3, strokeWidth: 0, fill: s.color }}
                />
              ))}
            </AreaChart>
          ) : (
            <BarChart data={data} margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2e" vertical={false} />
              <XAxis dataKey={xKey} axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: "#71717a" }} />
              <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: "#71717a" }} width={40} allowDecimals={false} />
              <Tooltip content={<CustomTooltip />} />
              {coloredSeries.length > 1 && <Legend iconSize={8} wrapperStyle={{ fontSize: 10 }} />}
              {coloredSeries.map((s) => (
                <Bar
                  key={s.key}
                  dataKey={s.key}
                  name={s.label}
                  fill={s.color}
                  stackId={isStacked ? "stack" : undefined}
                  radius={[3, 3, 0, 0]}
                  opacity={0.85}
                />
              ))}
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  );
}

