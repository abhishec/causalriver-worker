"use client";

import { cn } from "@/lib/utils";

const SERVICE_CONFIG = {
  aas: { label: "Accounting", color: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/25" },
  seaas: { label: "Engineering", color: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/25" },
} as const;

interface ServiceBadgeProps {
  service: "aas" | "seaas";
  onClear: () => void;
  className?: string;
}

export function ServiceBadge({ service, onClear, className }: ServiceBadgeProps) {
  const cfg = SERVICE_CONFIG[service];

  return (
    <span className={cn("inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-medium border", cfg.color, className)}>
      {cfg.label}
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onClear(); }}
        className="ml-0.5 hover:opacity-70 transition-opacity"
        aria-label="Clear service filter"
      >
        <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </span>
  );
}
