import { cn } from "@/lib/utils";

interface SkeletonProps {
  className?: string;
  variant?: "text" | "card" | "circle" | "stat";
}

export function Skeleton({ className, variant = "text" }: SkeletonProps) {
  const baseStyle = "animate-shimmer rounded";

  if (variant === "card") {
    return <div className={cn(baseStyle, "rounded-xl h-32", className)} />;
  }

  if (variant === "circle") {
    return <div className={cn(baseStyle, "rounded-full w-8 h-8", className)} />;
  }

  if (variant === "stat") {
    return (
      <div className={cn("rounded-xl bg-card border border-border-subtle p-4", className)}>
        <div className={cn(baseStyle, "h-3 w-20 mb-3")} />
        <div className={cn(baseStyle, "h-7 w-16 mb-1")} />
        <div className={cn(baseStyle, "h-3 w-24")} />
      </div>
    );
  }

  return <div className={cn(baseStyle, "h-4 w-full", className)} />;
}

export function SkeletonRow({ cols = 4, className }: { cols?: number; className?: string }) {
  return (
    <div className={cn("flex items-center gap-4 py-3 px-4", className)}>
      {Array.from({ length: cols }).map((_, i) => (
        <Skeleton key={i} className={cn("h-4", i === 0 ? "w-1/3" : "w-1/6")} />
      ))}
    </div>
  );
}

export function SkeletonTable({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="rounded-xl bg-card border border-border-subtle overflow-hidden">
      <div className="border-b border-border-subtle px-4 py-2.5">
        <div className="flex items-center gap-4">
          {Array.from({ length: cols }).map((_, i) => (
            <Skeleton key={i} className="h-3 w-20" />
          ))}
        </div>
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <SkeletonRow key={i} cols={cols} className="border-b border-border-subtle/30 last:border-0" />
      ))}
    </div>
  );
}
