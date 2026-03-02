"use client";

import Link from "next/link";
import { getConnectorDisplayName } from "@/lib/connectors/connector-auth-map";

export interface ConnectorSummary {
  connector_type: string;
  status: string;
  signals_count?: number | null;
  last_sync_at?: string | null;
}

export interface ConnectorStatusInfo {
  connectors: ConnectorSummary[];
}

function StatusDot({ status }: { status: string }) {
  const cls =
    status === "active"
      ? "bg-emerald-500"
      : status === "error"
      ? "bg-red-500"
      : status === "pending"
      ? "bg-amber-400"
      : "bg-muted/40";
  return <span className={`w-2 h-2 rounded-full shrink-0 ${cls}`} />;
}

function StatusLabel({ status }: { status: string }) {
  if (status === "active") return <span className="text-emerald-600 dark:text-emerald-400">Active</span>;
  if (status === "error")  return <span className="text-red-500">Error</span>;
  if (status === "pending") return <span className="text-amber-500">Pending</span>;
  return <span className="text-muted-foreground capitalize">{status}</span>;
}

export function ConnectorStatusCard({ data }: { data: ConnectorStatusInfo }) {
  const { connectors } = data;

  const active  = connectors.filter(c => c.status === "active");
  const pending = connectors.filter(c => c.status === "pending");
  const errored = connectors.filter(c => c.status === "error");
  const other   = connectors.filter(c => !["active", "pending", "error"].includes(c.status));

  if (connectors.length === 0) {
    return (
      <div className="my-3 rounded-xl border border-border bg-surface/50 p-4">
        <div className="flex items-center gap-2 mb-2">
          <svg className="w-4 h-4 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
          </svg>
          <span className="text-sm font-medium text-foreground">No connectors configured</span>
        </div>
        <p className="text-xs text-muted mb-3">
          Connect your tools — GitHub, Jira, Slack, Freshdesk and more — to give me live data.
        </p>
        <Link
          href="/connectors"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-accent hover:underline"
        >
          Add connectors →
        </Link>
      </div>
    );
  }

  return (
    <div className="my-3 rounded-xl border border-border bg-surface/50 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-surface">
        <div className="flex items-center gap-2">
          <svg className="w-3.5 h-3.5 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
          </svg>
          <span className="text-xs font-medium text-foreground">
            Connected Services · {connectors.length} configured
          </span>
        </div>
        <Link href="/connectors" className="text-[10px] text-muted hover:text-accent transition-colors">
          Manage →
        </Link>
      </div>

      {/* Summary pills */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-border/50 text-[11px]">
        {active.length > 0 && (
          <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
            {active.length} active
          </span>
        )}
        {pending.length > 0 && (
          <span className="flex items-center gap-1 text-amber-500 font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block" />
            {pending.length} pending
          </span>
        )}
        {errored.length > 0 && (
          <span className="flex items-center gap-1 text-red-500 font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500 inline-block" />
            {errored.length} error
          </span>
        )}
        {other.length > 0 && (
          <span className="flex items-center gap-1 text-muted font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-muted/40 inline-block" />
            {other.length} other
          </span>
        )}
      </div>

      {/* Connector rows */}
      <div className="divide-y divide-border/40">
        {connectors.map((c) => {
          const signals = c.signals_count ?? 0;
          const lastSync = c.last_sync_at
            ? new Date(c.last_sync_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })
            : null;

          return (
            <div key={c.connector_type} className="flex items-center justify-between px-4 py-2.5">
              <div className="flex items-center gap-2.5 min-w-0">
                <StatusDot status={c.status} />
                <span className="text-xs font-medium text-foreground truncate">
                  {getConnectorDisplayName(c.connector_type)}
                </span>
              </div>
              <div className="flex items-center gap-3 shrink-0 text-[10px] text-muted">
                {signals > 0 && (
                  <span>{signals.toLocaleString()} signals</span>
                )}
                {lastSync && <span>synced {lastSync}</span>}
                <StatusLabel status={c.status} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
