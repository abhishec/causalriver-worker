"use client";

import { cn } from "@/lib/utils";

interface MiniAreaChartProps {
  data: number[];
  color?: "accent" | "success" | "warning" | "danger" | "info";
  height?: number;
  width?: number;
  className?: string;
}

const colorMap = {
  accent: { stroke: "#7c6cf0", fill: "rgba(124,108,240,0.15)" },
  success: { stroke: "#22c55e", fill: "rgba(34,197,94,0.15)" },
  warning: { stroke: "#f59e0b", fill: "rgba(245,158,11,0.15)" },
  danger: { stroke: "#ef4444", fill: "rgba(239,68,68,0.15)" },
  info: { stroke: "#3b82f6", fill: "rgba(59,130,246,0.15)" },
};

export function MiniAreaChart({
  data,
  color = "accent",
  height = 40,
  width = 120,
  className,
}: MiniAreaChartProps) {
  if (!data || data.length < 2) return null;

  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const step = width / (data.length - 1);
  const pad = 2;

  const points = data.map((v, i) => ({
    x: i * step,
    y: height - ((v - min) / range) * (height - pad * 2) - pad,
  }));

  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");
  const areaPath = `${linePath} L${width},${height} L0,${height} Z`;

  const colors = colorMap[color];

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className={cn("overflow-visible", className)}
      style={{ width, height }}
    >
      <defs>
        <linearGradient id={`area-grad-${color}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={colors.fill} />
          <stop offset="100%" stopColor="transparent" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#area-grad-${color})`} />
      <path d={linePath} fill="none" stroke={colors.stroke} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
