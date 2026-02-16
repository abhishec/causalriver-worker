"use client";

import { cn } from "@/lib/utils";

interface CardProps {
  children: React.ReactNode;
  className?: string;
  variant?: "default" | "elevated" | "interactive" | "brain-highlight";
  padding?: "none" | "sm" | "md" | "lg";
}

const variantStyles = {
  default: "bg-card border border-border-subtle",
  elevated: "bg-surface-elevated border border-border-subtle",
  interactive: "bg-card border border-border-subtle hover:bg-card-hover hover:border-border transition-colors cursor-pointer",
  "brain-highlight": "bg-card border border-accent/20 shadow-[0_0_15px_rgba(124,108,240,0.05)]",
};

const paddingStyles = {
  none: "",
  sm: "p-3",
  md: "p-5",
  lg: "p-6",
};

export function Card({ children, className, variant = "default", padding = "md" }: CardProps) {
  return (
    <div className={cn("rounded-xl", variantStyles[variant], paddingStyles[padding], className)}>
      {children}
    </div>
  );
}

export function CardHeader({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("mb-4", className)}>{children}</div>;
}

export function CardTitle({ children, className }: { children: React.ReactNode; className?: string }) {
  return <h3 className={cn("text-sm font-medium", className)}>{children}</h3>;
}

export function CardDescription({ children, className }: { children: React.ReactNode; className?: string }) {
  return <p className={cn("text-xs text-muted mt-0.5", className)}>{children}</p>;
}
