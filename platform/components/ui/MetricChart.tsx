"use client";

import { cn } from "@/lib/utils";
import {
  AreaChart,
  Area,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

interface MetricChartProps {
  data: Record<string, any>[];
  dataKey: string;
  xKey?: string;
  type?: "area" | "line" | "bar";
  color?: string;
  height?: number;
  showGrid?: boolean;
  showAxis?: boolean;
  showTooltip?: boolean;
  formatValue?: (value: number) => string;
  formatLabel?: (label: string) => string;
  gradient?: boolean;
  className?: string;
}

const CHART_COLORS = {
  accent: "#7c6cf0",
  success: "#22c55e",
  warning: "#f59e0b",
  danger: "#ef4444",
  info: "#3b82f6",
  discovery: "#38bdf8",
};

export function MetricChart({
  data,
  dataKey,
  xKey = "timestamp",
  type = "area",
  color = "accent",
  height = 200,
  showGrid = false,
  showAxis = true,
  showTooltip = true,
  formatValue,
  formatLabel,
  gradient = true,
  className,
}: MetricChartProps) {
  const strokeColor = CHART_COLORS[color as keyof typeof CHART_COLORS] || color;
  const gradientId = `gradient-${dataKey}-${color}`;

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="bg-surface-elevated border border-border rounded-lg px-3 py-2 shadow-lg">
        <div className="text-[10px] text-muted mb-1">
          {formatLabel ? formatLabel(label) : label}
        </div>
        <div className="text-sm font-medium tabular-nums" style={{ color: strokeColor }}>
          {formatValue ? formatValue(payload[0].value) : payload[0].value}
        </div>
      </div>
    );
  };

  const commonProps = {
    data,
    margin: { top: 4, right: 4, left: showAxis ? 0 : -20, bottom: 0 },
  };

  const axisProps = {
    xAxis: (
      <XAxis
        dataKey={xKey}
        axisLine={false}
        tickLine={false}
        tick={showAxis ? { fontSize: 10, fill: "#71717a" } : false}
        tickFormatter={formatLabel}
      />
    ),
    yAxis: (
      <YAxis
        axisLine={false}
        tickLine={false}
        tick={showAxis ? { fontSize: 10, fill: "#71717a" } : false}
        tickFormatter={formatValue}
        width={showAxis ? 40 : 0}
      />
    ),
    grid: showGrid && (
      <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2e" vertical={false} />
    ),
    tooltip: showTooltip && <Tooltip content={<CustomTooltip />} />,
  };

  return (
    <div className={cn("w-full", className)}>
      <ResponsiveContainer width="100%" height={height}>
        {type === "area" ? (
          <AreaChart {...commonProps}>
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={strokeColor} stopOpacity={0.15} />
                <stop offset="95%" stopColor={strokeColor} stopOpacity={0} />
              </linearGradient>
            </defs>
            {axisProps.grid}
            {axisProps.xAxis}
            {axisProps.yAxis}
            {axisProps.tooltip}
            <Area
              type="monotone"
              dataKey={dataKey}
              stroke={strokeColor}
              strokeWidth={1.5}
              fill={gradient ? `url(#${gradientId})` : "none"}
              dot={false}
              activeDot={{ r: 3, strokeWidth: 0, fill: strokeColor }}
            />
          </AreaChart>
        ) : type === "line" ? (
          <LineChart {...commonProps}>
            {axisProps.grid}
            {axisProps.xAxis}
            {axisProps.yAxis}
            {axisProps.tooltip}
            <Line
              type="monotone"
              dataKey={dataKey}
              stroke={strokeColor}
              strokeWidth={1.5}
              dot={false}
              activeDot={{ r: 3, strokeWidth: 0, fill: strokeColor }}
            />
          </LineChart>
        ) : (
          <BarChart {...commonProps}>
            {axisProps.grid}
            {axisProps.xAxis}
            {axisProps.yAxis}
            {axisProps.tooltip}
            <Bar dataKey={dataKey} fill={strokeColor} radius={[4, 4, 0, 0]} opacity={0.8} />
          </BarChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}
