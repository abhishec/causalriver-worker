"use client";

import { cn } from "@/lib/utils";

type TimeRange = "1h" | "6h" | "24h" | "7d" | "30d";

interface TimeRangeSelectorProps {
  value: TimeRange;
  onChange: (range: TimeRange) => void;
  options?: TimeRange[];
  className?: string;
}

const LABELS: Record<TimeRange, string> = {
  "1h": "1H",
  "6h": "6H",
  "24h": "24H",
  "7d": "7D",
  "30d": "30D",
};

export function TimeRangeSelector({
  value,
  onChange,
  options = ["1h", "6h", "24h", "7d", "30d"],
  className,
}: TimeRangeSelectorProps) {
  return (
    <div className={cn("inline-flex items-center gap-0.5 p-0.5 rounded-lg bg-surface", className)}>
      {options.map((opt) => (
        <button
          key={opt}
          onClick={() => onChange(opt)}
          className={cn(
            "px-2.5 py-1 rounded-md text-[11px] font-medium transition-all",
            value === opt
              ? "bg-accent/15 text-accent"
              : "text-muted hover:text-foreground"
          )}
        >
          {LABELS[opt]}
        </button>
      ))}
    </div>
  );
}

export function getTimeRangeDate(range: TimeRange): Date {
  const now = new Date();
  switch (range) {
    case "1h": return new Date(now.getTime() - 60 * 60 * 1000);
    case "6h": return new Date(now.getTime() - 6 * 60 * 60 * 1000);
    case "24h": return new Date(now.getTime() - 24 * 60 * 60 * 1000);
    case "7d": return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    case "30d": return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  }
}
