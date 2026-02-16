"use client";

import { cn } from "@/lib/utils";

type StatusType = "active" | "training" | "discovery" | "alert" | "error" | "inactive" | "success" | "warning";

interface StatusDotProps {
  status: StatusType;
  size?: "sm" | "md" | "lg";
  pulse?: boolean;
  label?: string;
  className?: string;
}

const statusColors: Record<StatusType, string> = {
  active: "bg-brain-active",
  training: "bg-brain-training",
  discovery: "bg-brain-discovery",
  alert: "bg-brain-alert",
  error: "bg-danger",
  inactive: "bg-muted/50",
  success: "bg-success",
  warning: "bg-warning",
};

const sizeMap = {
  sm: "w-1.5 h-1.5",
  md: "w-2 h-2",
  lg: "w-2.5 h-2.5",
};

export function StatusDot({ status, size = "md", pulse = false, label, className }: StatusDotProps) {
  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      <span className={cn("relative flex shrink-0", sizeMap[size])}>
        {pulse && (
          <span
            className={cn(
              "animate-ping absolute inline-flex h-full w-full rounded-full opacity-75",
              statusColors[status]
            )}
          />
        )}
        <span
          className={cn(
            "relative inline-flex rounded-full",
            sizeMap[size],
            statusColors[status],
            !pulse && status !== "inactive" && "brain-pulse"
          )}
        />
      </span>
      {label && <span className="text-xs text-muted-foreground">{label}</span>}
    </span>
  );
}
