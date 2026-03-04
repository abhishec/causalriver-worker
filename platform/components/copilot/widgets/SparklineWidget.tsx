"use client";

import { LineChart, Line, ResponsiveContainer, Tooltip } from "recharts";
import { cn } from "@/lib/utils";
import type { WidgetProps } from "./widget-registry";

export function SparklineWidget({ title, data }: WidgetProps) {
  const values = Array.isArray(data.values) ? (data.values as number[]) : [];
  const trend = data.trend as "up" | "down" | "flat" | undefined;
  const chartData = values.map((v, i) => ({ i, v }));
  const color = trend === "up" ? "#10b981" : trend === "down" ? "#ef4444" : "#7c6cf0";
  const last = values[values.length - 1];
  const first = values[0];
  const delta =
    last !== undefined && first !== undefined && first !== 0
      ? ((last - first) / Math.abs(first) * 100).toFixed(1)
      : null;

  return (
    <div className="rounded-xl bg-card border border-border-subtle p-3 my-2 flex items-center gap-4">
      {title && (
        <div className="min-w-0">
          <div className="text-[10px] text-muted uppercase tracking-wider">{title}</div>
          {last !== undefined && (
            <div className="text-lg font-bold tabular-nums text-foreground">
              {last.toLocaleString()}
            </div>
          )}
          {delta && (
            <div
              className={cn(
                "text-[10px] font-medium",
                trend === "up" ? "text-success" : trend === "down" ? "text-danger" : "text-muted",
              )}
            >
              {Number(delta) > 0 ? "+" : ""}{delta}%
            </div>
          )}
        </div>
      )}
      <div className="flex-1 min-w-0 h-10">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData}>
            <Line type="monotone" dataKey="v" stroke={color} strokeWidth={1.5} dot={false} />
            <Tooltip content={() => null} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
