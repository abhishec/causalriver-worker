"use client";

import { StreamEvent, type IntelligenceEvent } from "./StreamEvent";
import { EmptyState } from "@/components/ui/EmptyState";

interface IntelligenceStreamProps {
  events: IntelligenceEvent[];
  className?: string;
}

export function IntelligenceStream({ events, className }: IntelligenceStreamProps) {
  if (events.length === 0) {
    return (
      <EmptyState
        title="No intelligence events yet"
        description="The brain will surface discoveries, anomalies, and predictions as it processes signals from your connected data sources."
        icon={
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
          </svg>
        }
        className={className}
      />
    );
  }

  return (
    <div className={className}>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-medium">Intelligence Stream</h2>
        <div className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-brain-active brain-pulse" />
          <span className="text-[10px] text-muted">Live</span>
        </div>
      </div>
      <div className="space-y-0">
        {events.map((event) => (
          <StreamEvent key={event.id} event={event} />
        ))}
      </div>
    </div>
  );
}
