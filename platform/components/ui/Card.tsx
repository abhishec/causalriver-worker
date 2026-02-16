"use client";

import { cn } from "@/lib/utils";

interface CardProps {
  children: React.ReactNode;
  className?: string;
  variant?: "default" | "elevated" | "interactive" | "brain-highlight";
  padding?: "none" | "sm" | "md" | "lg";
  onClick?: () => void;
}

const variantStyles = {
  default: "bg-card border border-border-subtle shadow-[var(--shadow-card)]",
  elevated: "bg-surface-elevated border border-border-subtle shadow-[var(--shadow-elevated)]",
  interactive: "bg-card border border-border-subtle shadow-[var(--shadow-card)] hover:bg-card-hover hover:border-border hover:shadow-[var(--shadow-card-hover)] transition-all duration-200 cursor-pointer",
  "brain-highlight": "bg-card border border-accent/20 shadow-[0_0_20px_rgba(124,108,240,0.08),0_4px_12px_rgba(0,0,0,0.2)]",
};

const paddingStyles = {
  none: "",
  sm: "p-3",
  md: "p-5",
  lg: "p-6",
};

export function Card({ children, className, variant = "default", padding = "md", onClick }: CardProps) {
  return (
    <div
      className={cn("rounded-xl", variantStyles[variant], paddingStyles[padding], className)}
      onClick={onClick}
      role={onClick ? "button" : undefined}
    >
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
