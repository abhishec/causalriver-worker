"use client";

import { cn } from "@/lib/utils";

interface StatValueProps {
  label: string;
  value: string | number;
  change?: string;
  changeType?: "positive" | "negative" | "neutral";
  trend?: "up" | "down";
  subtitle?: string;
  icon?: React.ReactNode;
  pulse?: boolean;
  className?: string;
  sparkline?: number[];
  sparklineData?: number[];
}

export function StatValue({
  label,
  value,
  change,
  changeType = "neutral",
  trend,
  subtitle,
  icon,
  pulse,
  className,
  sparkline,
  sparklineData,
}: StatValueProps) {
  const sparkData = sparkline || sparklineData;

  // Auto-detect changeType from trend if not explicitly set
  const resolvedChangeType = changeType !== "neutral" ? changeType : trend === "up" ? "positive" : trend === "down" ? "negative" : "neutral";

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
          {trend && (
            <svg
              className={cn(
                "w-3 h-3",
                trend === "up" ? "text-success" : "text-danger",
                trend === "down" && "rotate-180"
              )}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2.5}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
            </svg>
          )}
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
                resolvedChangeType === "positive" && "text-success",
                resolvedChangeType === "negative" && "text-danger",
                resolvedChangeType === "neutral" && "text-muted"
              )}
            >
              {change}
            </span>
          )}
          {subtitle && (
            <div className="text-[11px] text-muted mt-0.5">{subtitle}</div>
          )}
        </div>

        {sparkData && sparkData.length > 1 && (
          <MiniSparkline data={sparkData} className="w-16 h-8" />
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
