"use client";

import Link from "next/link";

export interface AgentCreatedInfo {
  agentId: string;
  name: string;
  domain: string;
  trigger: string;
  schedule?: string;
  brainEnabled?: boolean;
  rlEnabled?: boolean;
  memoryTracking?: boolean;
}

export function AgentCreatedCard({ agent }: { agent: AgentCreatedInfo }) {
  const domainLabel: Record<string, string> = {
    "delivery-intelligence": "Delivery Intelligence",
    "early-warning": "Early Warning",
    "pod-match": "Pod Matching",
    "scope-creep": "Scope Creep",
    custom: "Custom Agent",
  };

  const triggerLabel =
    agent.trigger === "scheduled"
      ? `Scheduled${agent.schedule ? ` (${agent.schedule})` : ""}`
      : agent.trigger === "event"
        ? "Event-Driven"
        : "On Demand";

  return (
    <div className="mt-2 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center gap-2">
        {/* Cpu icon */}
        <svg className="w-4 h-4 text-emerald-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 3v1.5M4.5 8.25H3m18 0h-1.5M4.5 12H3m18 0h-1.5m-15 3.75H3m18 0h-1.5M8.25 19.5V21M12 3v1.5m0 15V21m3.75-18v1.5m0 15V21m-9-1.5h10.5a2.25 2.25 0 002.25-2.25V6.75a2.25 2.25 0 00-2.25-2.25H6.75A2.25 2.25 0 004.5 6.75v10.5a2.25 2.25 0 002.25 2.25zm.75-12h9v9h-9v-9z" />
        </svg>
        <span className="text-sm font-semibold text-foreground truncate">
          {agent.name}
        </span>
        {/* Active badge */}
        <span className="ml-auto flex items-center gap-1 text-xs text-emerald-500 font-medium shrink-0">
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
          </svg>
          Active
        </span>
      </div>

      {/* Domain + trigger */}
      <div className="text-xs text-muted-foreground">
        {domainLabel[agent.domain] || agent.domain} &middot; {triggerLabel}
      </div>

      {/* Brain / RL / Memory badges */}
      <div className="flex items-center gap-3 text-[11px] flex-wrap">
        {agent.brainEnabled !== false && (
          <span className="flex items-center gap-1 text-accent">
            {/* Brain icon */}
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
            </svg>
            Brain: Active
          </span>
        )}
        {agent.rlEnabled !== false && (
          <span className="flex items-center gap-1 text-accent">
            {/* Zap / lightning icon */}
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
            </svg>
            RL: Enabled
          </span>
        )}
        {agent.memoryTracking !== false && (
          <span className="flex items-center gap-1 text-accent">
            {/* Database icon */}
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 5.625c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125" />
            </svg>
            Memory: Tracking
          </span>
        )}
      </div>

      {/* Dashboard link */}
      <Link
        href="/dashboard"
        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors w-fit"
      >
        {/* External link icon */}
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
        </svg>
        View in AI Worker Dashboard
      </Link>
    </div>
  );
}
