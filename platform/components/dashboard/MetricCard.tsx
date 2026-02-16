"use client";

import { cn } from "@/lib/utils";

interface MetricCardProps {
  label: string;
  value: string | number;
  change?: string;
  changeType?: "positive" | "negative" | "neutral";
  icon?: string;
  subtitle?: string;
  pulse?: boolean;
}

export function MetricCard({
  label,
  value,
  change,
  changeType = "neutral",
  icon,
  subtitle,
  pulse,
}: MetricCardProps) {
  return (
    <div className="rounded-xl bg-card border border-border-subtle p-5 hover:bg-card-hover transition-colors">
      <div className="flex items-start justify-between mb-3">
        <span className="text-xs font-medium text-muted uppercase tracking-wider">{label}</span>
        {pulse && (
          <div className="w-2 h-2 rounded-full bg-success brain-pulse" />
        )}
      </div>
      <div className="flex items-end gap-3">
        <div className="text-3xl font-bold tracking-tight">{value}</div>
        {change && (
          <span
            className={cn(
              "text-xs font-medium mb-1",
              changeType === "positive" && "text-success",
              changeType === "negative" && "text-danger",
              changeType === "neutral" && "text-muted"
            )}
          >
            {change}
          </span>
        )}
      </div>
      {subtitle && (
        <div className="mt-1.5 text-xs text-muted">{subtitle}</div>
      )}
    </div>
  );
}
