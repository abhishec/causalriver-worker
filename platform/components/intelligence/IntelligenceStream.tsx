"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { StreamEvent, type IntelligenceEvent } from "./StreamEvent";
import { AnomalyDetailPanel } from "./AnomalyDetailPanel";
import { EmptyState } from "@/components/ui/EmptyState";

interface IntelligenceStreamProps {
  events: IntelligenceEvent[];
  orgId?: string;
  className?: string;
}

/**
 * Maps a platform_events row to an IntelligenceEvent for the stream.
 * Uses the business-language `title` field we write from Sprint A.
 */
function platformEventToIntelligenceEvent(row: any): IntelligenceEvent {
  const data = row.event_data || {};
  const typeMap: Record<string, IntelligenceEvent["type"]> = {
    "anomaly.detected": "anomaly",
    "alert.triggered": "alert",
    "brain.discovery": "discovery",
    "causal.discovered": "discovery",
    "gl.bootstrap": "discovery",
    "consolidation.complete": "training",
    "consolidation.started": "training",
    "agent.completed": "agent",
    "agent.started": "agent",
  };

  return {
    id: `live-${row.id}`,
    type: typeMap[row.event_type] || "training",
    title: row.title || data.title || row.event_type,
    description: data.description || data.summary,
    timestamp: row.created_at,
    domain: data.domain || row.source || undefined,
    confidence: data.confidence,
  };
}

export function IntelligenceStream({ events: initialEvents, orgId, className }: IntelligenceStreamProps) {
  const [events, setEvents] = useState<IntelligenceEvent[]>(initialEvents);
  const [selectedEvent, setSelectedEvent] = useState<IntelligenceEvent | null>(null);
  const [newEventIds, setNewEventIds] = useState<Set<string>>(new Set());

  // Keep in sync if server re-renders with new props
  useEffect(() => {
    setEvents(initialEvents);
  }, [initialEvents]);

  // ── Real-time Supabase subscription ──────────────────────────────────────
  // Listens for INSERT on platform_events for this org and prepends to stream.
  // This gives the "Live" pulse indicator actual meaning.
  useEffect(() => {
    if (!orgId) return;

    const supabase = createClient();

    const channel = supabase
      .channel(`platform-events-${orgId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "platform_events",
          filter: `organization_id=eq.${orgId}`,
        },
        (payload) => {
          const newEvent = platformEventToIntelligenceEvent(payload.new);

          setEvents((prev) => {
            // Deduplicate: don't add if ID already exists
            if (prev.some((e) => e.id === newEvent.id)) return prev;
            return [newEvent, ...prev].slice(0, 20); // cap at 20
          });

          // Flash the new event briefly so the user notices it
          setNewEventIds((prev) => {
            const next = new Set(prev);
            next.add(newEvent.id);
            return next;
          });
          setTimeout(() => {
            setNewEventIds((prev) => {
              const next = new Set(prev);
              next.delete(newEvent.id);
              return next;
            });
          }, 3000);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [orgId]);

  const handleSelect = useCallback((event: IntelligenceEvent) => {
    setSelectedEvent(event);
  }, []);

  const handleClosePanel = useCallback(() => {
    setSelectedEvent(null);
  }, []);

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
    <>
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
            <div
              key={event.id}
              className={
                newEventIds.has(event.id)
                  ? "animate-fade-in-up"
                  : undefined
              }
            >
              <StreamEvent
                event={event}
                onSelect={handleSelect}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Brain vs Claude detail panel — opens on anomaly/alert/discovery click */}
      <AnomalyDetailPanel
        event={selectedEvent}
        onClose={handleClosePanel}
      />
    </>
  );
}
