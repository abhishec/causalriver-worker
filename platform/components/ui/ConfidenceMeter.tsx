"use client";

import { cn } from "@/lib/utils";

interface ConfidenceMeterProps {
  value: number; // 0-1 confidence score
  pValue?: number;
  method?: string;
  size?: "sm" | "md" | "lg";
  showLabel?: boolean;
  className?: string;
}

function getConfidenceColor(value: number): string {
  if (value >= 0.9) return "text-success bg-success";
  if (value >= 0.7) return "text-brain-discovery bg-brain-discovery";
  if (value >= 0.5) return "text-warning bg-warning";
  return "text-danger bg-danger";
}

function getConfidenceLabel(value: number): string {
  if (value >= 0.9) return "Very High";
  if (value >= 0.7) return "High";
  if (value >= 0.5) return "Moderate";
  return "Low";
}

const sizeConfig = {
  sm: { width: "w-16", height: "h-1", text: "text-[10px]" },
  md: { width: "w-24", height: "h-1.5", text: "text-[11px]" },
  lg: { width: "w-32", height: "h-2", text: "text-xs" },
};

export function ConfidenceMeter({
  value,
  pValue,
  method,
  size = "md",
  showLabel = true,
  className,
}: ConfidenceMeterProps) {
  const colorClass = getConfidenceColor(value);
  const label = getConfidenceLabel(value);
  const config = sizeConfig[size];
  const pct = Math.round(value * 100);

  return (
    <div className={cn("inline-flex flex-col gap-1", className)}>
      {/* Bar */}
      <div className="flex items-center gap-2">
        <div className={cn("rounded-full bg-surface-hover overflow-hidden", config.width, config.height)}>
          <div
            className={cn("h-full rounded-full transition-all duration-500", colorClass.split(" ")[1])}
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className={cn("font-medium tabular-nums", config.text, colorClass.split(" ")[0])}>
          {pct}%
        </span>
      </div>

      {/* Labels */}
      {showLabel && (
        <div className={cn("flex items-center gap-2", config.text, "text-muted")}>
          <span>{label}</span>
          {pValue !== undefined && (
            <>
              <span className="text-border">|</span>
              <span className="font-mono">p={pValue != null ? (pValue < 0.001 ? "<0.001" : pValue.toFixed(3)) : "—"}</span>
            </>
          )}
          {method && (
            <>
              <span className="text-border">|</span>
              <span>{method}</span>
            </>
          )}
        </div>
      )}
    </div>
  );
}
