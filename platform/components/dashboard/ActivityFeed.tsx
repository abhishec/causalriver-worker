"use client";

import { timeAgo } from "@/lib/utils";

export interface ActivityItem {
  id: string;
  type: "training" | "anomaly" | "prediction" | "connector" | "discovery" | "error";
  title: string;
  timestamp: string;
  details?: string;
}

const TYPE_CONFIG = {
  training: { icon: "13 10V3L4 14h7v7l9-11h-7z", color: "text-accent", bg: "bg-accent/10" },
  anomaly: { icon: "12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z", color: "text-warning", bg: "bg-warning/10" },
  prediction: { icon: "9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z", color: "text-info", bg: "bg-info/10" },
  connector: { icon: "13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1", color: "text-success", bg: "bg-success/10" },
  discovery: { icon: "9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z", color: "text-accent-light", bg: "bg-accent-light/10" },
  error: { icon: "6 18L18 6M6 6l12 12", color: "text-danger", bg: "bg-danger/10" },
};

export function ActivityFeed({ items }: { items: ActivityItem[] }) {
  if (items.length === 0) {
    return (
      <div className="text-center py-8 text-muted text-sm">
        No recent activity. NexusBrain is in sleep cycle...
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {items.map((item) => {
        const config = TYPE_CONFIG[item.type];
        return (
          <div
            key={item.id}
            className="flex items-start gap-3 px-3 py-2.5 rounded-lg hover:bg-surface-hover transition-colors"
          >
            <div className={`mt-0.5 w-7 h-7 rounded-lg ${config.bg} flex items-center justify-center shrink-0`}>
              <svg className={`w-3.5 h-3.5 ${config.color}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d={config.icon} />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm">{item.title}</div>
              {item.details && (
                <div className="text-xs text-muted mt-0.5 truncate">{item.details}</div>
              )}
            </div>
            <span className="text-[10px] text-muted shrink-0 mt-0.5">{timeAgo(item.timestamp)}</span>
          </div>
        );
      })}
    </div>
  );
}
