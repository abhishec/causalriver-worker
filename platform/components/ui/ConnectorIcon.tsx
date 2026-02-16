"use client";

import { cn } from "@/lib/utils";

/* ── Connector icon mapping ─────────────────────────────────────────────── */
const CONNECTOR_COLORS: Record<string, string> = {
  github: "bg-[#24292f]/20 text-[#c9d1d9]",
  slack: "bg-[#4a154b]/20 text-[#e01e5a]",
  jira: "bg-[#0052cc]/20 text-[#2684ff]",
  linear: "bg-[#5e6ad2]/20 text-[#5e6ad2]",
  stripe: "bg-[#635bff]/20 text-[#635bff]",
  hubspot: "bg-[#ff7a59]/20 text-[#ff7a59]",
  intercom: "bg-[#1f8ded]/20 text-[#1f8ded]",
  salesforce: "bg-[#00a1e0]/20 text-[#00a1e0]",
  notion: "bg-white/10 text-white",
  xero: "bg-[#13b5ea]/20 text-[#13b5ea]",
  google_analytics: "bg-[#e37400]/20 text-[#f9ab00]",
  volopay: "bg-[#7c6cf0]/20 text-[#7c6cf0]",
  postgres: "bg-[#336791]/20 text-[#336791]",
  freshdesk: "bg-[#25c16f]/20 text-[#25c16f]",
};

const CONNECTOR_LABELS: Record<string, string> = {
  github: "GH",
  slack: "SL",
  jira: "JR",
  linear: "LN",
  stripe: "ST",
  hubspot: "HS",
  intercom: "IC",
  salesforce: "SF",
  notion: "NO",
  xero: "XE",
  google_analytics: "GA",
  volopay: "VP",
  postgres: "PG",
  freshdesk: "FD",
};

interface ConnectorIconProps {
  type: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const sizeClasses = {
  sm: "w-6 h-6 text-[8px]",
  md: "w-8 h-8 text-[10px]",
  lg: "w-10 h-10 text-xs",
};

export function ConnectorIcon({ type, size = "md", className }: ConnectorIconProps) {
  const key = type.toLowerCase().replace(/\s+/g, "_");
  const colorClass = CONNECTOR_COLORS[key] || "bg-surface text-muted";
  const label = CONNECTOR_LABELS[key] || type.slice(0, 2).toUpperCase();

  return (
    <div
      className={cn(
        "rounded-lg flex items-center justify-center font-bold shrink-0",
        sizeClasses[size],
        colorClass,
        className
      )}
    >
      {label}
    </div>
  );
}
