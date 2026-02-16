"use client";

import { cn } from "@/lib/utils";

type BadgeVariant = "default" | "accent" | "success" | "warning" | "danger" | "info" | "domain" | "outline";

interface BadgeProps {
  children: React.ReactNode;
  variant?: BadgeVariant;
  domain?: string;
  size?: "xs" | "sm";
  className?: string;
  pulse?: boolean;
}

const variantStyles: Record<BadgeVariant, string> = {
  default: "bg-surface-hover text-muted-foreground",
  accent: "bg-accent/10 text-accent",
  success: "bg-success/10 text-success",
  warning: "bg-warning/10 text-warning",
  danger: "bg-danger/10 text-danger",
  info: "bg-info/10 text-info",
  domain: "", // handled dynamically
  outline: "border border-border text-muted-foreground",
};

const DOMAIN_COLORS: Record<string, string> = {
  finance: "bg-domain-finance/10 text-domain-finance",
  engineering: "bg-domain-engineering/10 text-domain-engineering",
  sales: "bg-domain-sales/10 text-domain-sales",
  support: "bg-domain-support/10 text-domain-support",
  marketing: "bg-domain-marketing/10 text-domain-marketing",
  product: "bg-domain-product/10 text-domain-product",
  operations: "bg-domain-operations/10 text-domain-operations",
  knowledge: "bg-domain-knowledge/10 text-domain-knowledge",
  communication: "bg-domain-communication/10 text-domain-communication",
  cs: "bg-domain-support/10 text-domain-support",
  any: "bg-surface-hover text-muted-foreground",
};

const sizeStyles = {
  xs: "px-1.5 py-0.5 text-[10px]",
  sm: "px-2 py-0.5 text-[11px]",
};

export function Badge({ children, variant = "default", domain, size = "xs", className, pulse }: BadgeProps) {
  const colorStyle = variant === "domain" && domain
    ? DOMAIN_COLORS[domain.toLowerCase()] || DOMAIN_COLORS.any
    : variantStyles[variant];

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full font-medium uppercase tracking-wider whitespace-nowrap",
        sizeStyles[size],
        colorStyle,
        className
      )}
    >
      {pulse && (
        <span className="relative flex h-1.5 w-1.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 bg-current" />
          <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-current" />
        </span>
      )}
      {children}
    </span>
  );
}

export function DomainTag({ domain, className }: { domain: string; className?: string }) {
  return (
    <Badge variant="domain" domain={domain} size="xs" className={className}>
      {domain}
    </Badge>
  );
}
