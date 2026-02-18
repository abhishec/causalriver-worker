"use client";

import { cn } from "@/lib/utils";
import { Badge, DomainTag } from "@/components/ui/Badge";
import { ConfidenceMeter } from "@/components/ui/ConfidenceMeter";
import { timeAgo } from "@/lib/utils";

export interface IntelligenceEvent {
  id: string;
  type: "discovery" | "anomaly" | "training" | "prediction" | "alert" | "agent";
  title: string;
  description?: string;
  timestamp: string;
  domain?: string;
  domains?: string[];
  confidence?: number;
  pValue?: number;
  method?: string;
  strength?: number;
  details?: string;
  actionLabel?: string;
  actionHref?: string;
}

const TYPE_CONFIG = {
  discovery: {
    icon: "M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z",
    color: "text-brain-discovery",
    bgColor: "bg-brain-discovery/10",
    label: "Discovery",
  },
  anomaly: {
    icon: "M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z",
    color: "text-warning",
    bgColor: "bg-warning/10",
    label: "Anomaly",
  },
  training: {
    icon: "M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z",
    color: "text-brain-training",
    bgColor: "bg-brain-training/10",
    label: "Training",
  },
  prediction: {
    icon: "M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941",
    color: "text-info",
    bgColor: "bg-info/10",
    label: "Prediction",
  },
  alert: {
    icon: "M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0",
    color: "text-brain-alert",
    bgColor: "bg-brain-alert/10",
    label: "Alert",
  },
  agent: {
    icon: "M5.25 14.25h13.5m-13.5 0a3 3 0 01-3-3m3 3a3 3 0 100 6h13.5a3 3 0 100-6m-16.5-3a3 3 0 013-3h13.5a3 3 0 013 3m-19.5 0a4.5 4.5 0 01.9-2.7L5.737 5.1a3.375 3.375 0 012.7-1.35h7.126c1.062 0 2.062.5 2.7 1.35l2.587 3.45a4.5 4.5 0 01.9 2.7",
    color: "text-success",
    bgColor: "bg-success/10",
    label: "Agent",
  },
};

export function StreamEvent({
  event,
  onSelect,
}: {
  event: IntelligenceEvent;
  onSelect?: (event: IntelligenceEvent) => void;
}) {
  const config = TYPE_CONFIG[event.type];
  const isClickable = event.type === "anomaly" || event.type === "alert" || event.type === "discovery";

  return (
    <div className="group relative pl-8 pb-6 last:pb-0">
      {/* Timeline line */}
      <div className="absolute left-[11px] top-6 bottom-0 w-px bg-border-subtle group-last:hidden" />

      {/* Timeline dot */}
      <div
        className={cn(
          "absolute left-0 top-1 w-6 h-6 rounded-full flex items-center justify-center",
          config.bgColor
        )}
      >
        <svg
          className={cn("w-3.5 h-3.5", config.color)}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d={config.icon} />
        </svg>
      </div>

      {/* Content — clickable for anomaly/alert/discovery */}
      <div
        className={cn(
          "rounded-xl bg-card border border-border-subtle p-4 transition-colors",
          isClickable && onSelect
            ? "hover:bg-card-hover hover:border-border cursor-pointer"
            : "hover:bg-card-hover"
        )}
        onClick={isClickable && onSelect ? () => onSelect(event) : undefined}
        role={isClickable && onSelect ? "button" : undefined}
        tabIndex={isClickable && onSelect ? 0 : undefined}
        onKeyDown={
          isClickable && onSelect
            ? (e) => { if (e.key === "Enter" || e.key === " ") onSelect(event); }
            : undefined
        }
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 mb-2">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant={event.type === "anomaly" ? "warning" : event.type === "discovery" ? "info" : "default"} size="xs">
              {config.label}
            </Badge>
            {event.domain && <DomainTag domain={event.domain} />}
            {event.domains && event.domains.map((d) => (
              <DomainTag key={d} domain={d} />
            ))}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-[10px] text-muted whitespace-nowrap tabular-nums">
              {timeAgo(event.timestamp)}
            </span>
            {/* Chevron hint for clickable events */}
            {isClickable && onSelect && (
              <svg className="w-3.5 h-3.5 text-muted opacity-0 group-hover:opacity-100 transition-opacity" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
              </svg>
            )}
          </div>
        </div>

        {/* Title */}
        <h4 className="text-sm font-medium mb-1">{event.title}</h4>

        {/* Description */}
        {event.description && (
          <p className="text-xs text-muted-foreground mb-2">{event.description}</p>
        )}

        {/* Statistical proof line */}
        {event.confidence !== undefined && (
          <div className="mt-2 pt-2 border-t border-border-subtle">
            <ConfidenceMeter
              value={event.confidence}
              pValue={event.pValue}
              method={event.method}
              size="sm"
            />
          </div>
        )}

        {/* Details */}
        {event.details && (
          <div className="mt-2 text-[11px] text-muted font-mono bg-surface rounded-md px-2.5 py-1.5">
            {event.details}
          </div>
        )}

        {/* Actions — only shown on non-clickable events or as supplementary */}
        <div className="flex items-center gap-2 mt-3" onClick={(e) => e.stopPropagation()}>
          {event.actionHref && (
            <a
              href={event.actionHref}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-accent/10 text-accent text-[11px] font-medium hover:bg-accent/20 transition-colors"
            >
              {event.actionLabel || "Explore"}
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12h15m0 0l-6.75-6.75M19.5 12l-6.75 6.75" />
              </svg>
            </a>
          )}
          {isClickable && onSelect ? (
            <button
              onClick={(e) => { e.stopPropagation(); onSelect(event); }}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] text-accent hover:bg-accent/10 transition-colors font-medium"
            >
              Brain vs Claude
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
              </svg>
            </button>
          ) : (
            <button className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] text-muted-foreground hover:text-foreground hover:bg-surface-hover transition-colors">
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.087.16 2.185.283 3.293.369V21l4.076-4.076a1.526 1.526 0 011.037-.443 48.282 48.282 0 005.68-.494c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
              </svg>
              Ask Copilot
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
