"use client";

import { cn } from "@/lib/utils";

interface ProgressRingProps {
  value: number; // 0-100
  size?: number;
  strokeWidth?: number;
  color?: "accent" | "success" | "warning" | "danger" | "info";
  label?: string;
  sublabel?: string;
  className?: string;
}

const colorMap = {
  accent: "stroke-accent",
  success: "stroke-success",
  warning: "stroke-warning",
  danger: "stroke-danger",
  info: "stroke-info",
};

export function ProgressRing({
  value,
  size = 64,
  strokeWidth = 4,
  color = "accent",
  label,
  sublabel,
  className,
}: ProgressRingProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (Math.min(100, Math.max(0, value)) / 100) * circumference;

  const resolvedColor =
    color === "accent"
      ? value >= 80 ? "success" : value >= 50 ? "warning" : "danger"
      : color;

  return (
    <div className={cn("inline-flex flex-col items-center gap-1", className)}>
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="transform -rotate-90">
          {/* Background ring */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="currentColor"
            className="text-border-subtle"
            strokeWidth={strokeWidth}
          />
          {/* Progress ring */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            className={colorMap[resolvedColor]}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            style={{ transition: "stroke-dashoffset 0.6s ease-out" }}
          />
        </svg>
        {/* Center label */}
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-xs font-semibold tabular-nums">{Math.round(value)}%</span>
        </div>
      </div>
      {label && <span className="text-[10px] font-medium text-muted-foreground">{label}</span>}
      {sublabel && <span className="text-[9px] text-muted">{sublabel}</span>}
    </div>
  );
}
