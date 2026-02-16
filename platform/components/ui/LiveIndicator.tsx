"use client";

import { cn } from "@/lib/utils";

interface LiveIndicatorProps {
  label?: string;
  variant?: "pulse" | "dot" | "bar";
  color?: "green" | "blue" | "amber" | "red";
  className?: string;
}

const dotColors = {
  green: "bg-brain-active",
  blue: "bg-brain-discovery",
  amber: "bg-brain-alert",
  red: "bg-danger",
};

const ringColors = {
  green: "ring-brain-active/30",
  blue: "ring-brain-discovery/30",
  amber: "ring-brain-alert/30",
  red: "ring-danger/30",
};

export function LiveIndicator({
  label = "Live",
  variant = "pulse",
  color = "green",
  className,
}: LiveIndicatorProps) {
  if (variant === "bar") {
    return (
      <div className={cn("flex items-center gap-2 px-2.5 py-1 rounded-full bg-surface border border-border-subtle", className)}>
        <div className="flex gap-0.5">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className={cn("w-0.5 rounded-full", dotColors[color])}
              style={{
                height: `${8 + Math.random() * 6}px`,
                animation: `signal-flow ${1 + i * 0.3}s ease-in-out infinite alternate`,
              }}
            />
          ))}
        </div>
        <span className="text-[10px] text-muted font-medium">{label}</span>
      </div>
    );
  }

  if (variant === "dot") {
    return (
      <div className={cn("flex items-center gap-1.5", className)}>
        <span className={cn("w-1.5 h-1.5 rounded-full", dotColors[color])} />
        <span className="text-[10px] text-muted">{label}</span>
      </div>
    );
  }

  // pulse variant (default)
  return (
    <div className={cn("flex items-center gap-1.5", className)}>
      <span className={cn("relative flex h-2 w-2")}>
        <span className={cn("animate-ping absolute inline-flex h-full w-full rounded-full opacity-75", dotColors[color])} />
        <span className={cn("relative inline-flex rounded-full h-2 w-2", dotColors[color])} />
      </span>
      <span className="text-[10px] text-muted font-medium">{label}</span>
    </div>
  );
}
