"use client";

import { cn } from "@/lib/utils";

interface StatValueProps {
  label: string;
  value: string | number;
  change?: string;
  changeType?: "positive" | "negative" | "neutral";
  subtitle?: string;
  icon?: React.ReactNode;
  pulse?: boolean;
  className?: string;
  sparkline?: number[];
}

export function StatValue({
  label,
  value,
  change,
  changeType = "neutral",
  subtitle,
  icon,
  pulse,
  className,
  sparkline,
}: StatValueProps) {
  return (
    <div
      className={cn(
        "rounded-xl bg-card border border-border-subtle p-4 hover:bg-card-hover transition-colors",
        className
      )}
    >
      <div className="flex items-start justify-between mb-2">
        <span className="text-[11px] font-medium text-muted uppercase tracking-wider">
          {label}
        </span>
        <div className="flex items-center gap-1.5">
          {pulse && <span className="w-1.5 h-1.5 rounded-full bg-brain-active brain-pulse" />}
          {icon}
        </div>
      </div>

      <div className="flex items-end justify-between">
        <div>
          <div className="text-2xl font-semibold tabular-nums tracking-tight">
            {value}
          </div>
          {change && (
            <span
              className={cn(
                "text-[11px] font-medium",
                changeType === "positive" && "text-success",
                changeType === "negative" && "text-danger",
                changeType === "neutral" && "text-muted"
              )}
            >
              {change}
            </span>
          )}
          {subtitle && (
            <div className="text-[11px] text-muted mt-0.5">{subtitle}</div>
          )}
        </div>

        {sparkline && sparkline.length > 1 && (
          <MiniSparkline data={sparkline} className="w-16 h-8" />
        )}
      </div>
    </div>
  );
}

function MiniSparkline({ data, className }: { data: number[]; className?: string }) {
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const h = 32;
  const w = 64;
  const step = w / (data.length - 1);

  const points = data
    .map((v, i) => `${i * step},${h - ((v - min) / range) * (h - 4) - 2}`)
    .join(" ");

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className={cn("text-accent/60", className)} fill="none">
      <polyline
        points={points}
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
