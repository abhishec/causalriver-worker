"use client";

/**
 * BrainLearningFeed
 *
 * Surfaces what NexusBrain is actively learning in plain English.
 * Polls /api/brain/emergence and renders events in a compact timeline,
 * with Supabase Realtime push for live updates.
 *
 * Used by:
 *   - Overview / Command Center (all orgs)
 *   - Copilot sidebar (BrainLearningFeed widget)
 *   - AAS marketplace service
 *   - SE-aaS marketplace service
 *
 * Accepts an optional `service` prop ("aas" | "seaas") to filter events
 * to the relevant domain. When omitted, shows all events.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { cn } from "@/lib/utils";
import { timeAgo } from "@/lib/utils";
import { Badge } from "@/components/ui/Badge";
import type { LearningEvent } from "@/app/api/brain/emergence/route";

// ─── Event-type visual config ────────────────────────────────────────────────

const TYPE_CONFIG: Record<
  string,
  { icon: string; color: string; bgColor: string; label: string }
> = {
  training: {
    icon: "M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z",
    color: "text-brain-training",
    bgColor: "bg-brain-training/10",
    label: "Training",
  },
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
  alert: {
    icon: "M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0",
    color: "text-brain-alert",
    bgColor: "bg-brain-alert/10",
    label: "Alert",
  },
  prediction: {
    icon: "M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941",
    color: "text-info",
    bgColor: "bg-info/10",
    label: "Prediction",
  },
  agent: {
    icon: "M5.25 14.25h13.5m-13.5 0a3 3 0 01-3-3m3 3a3 3 0 100 6h13.5a3 3 0 100-6m-16.5-3a3 3 0 013-3h13.5a3 3 0 013 3m-19.5 0a4.5 4.5 0 01.9-2.7L5.737 5.1a3.375 3.375 0 012.7-1.35h7.126c1.062 0 2.062.5 2.7 1.35l2.587 3.45a4.5 4.5 0 01.9 2.7",
    color: "text-success",
    bgColor: "bg-success/10",
    label: "Agent",
  },
};

// ─── Intelligence score mini-bar ─────────────────────────────────────────────

function ScoreBar({ score }: { score: number }) {
  const pct = Math.min(100, Math.max(0, score));
  const color =
    pct >= 75
      ? "bg-success"
      : pct >= 50
      ? "bg-warning"
      : "bg-brain-alert";

  return (
    <div className="flex items-center gap-1.5">
      <div className="h-1 w-12 rounded-full bg-border-subtle overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all duration-500", color)}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-[10px] tabular-nums text-muted">{score.toFixed(1)}</span>
    </div>
  );
}

// ─── Single event row ─────────────────────────────────────────────────────────

function LearningEventRow({
  event,
  isNew,
}: {
  event: LearningEvent;
  isNew?: boolean;
}) {
  const cfg = TYPE_CONFIG[event.type] ?? TYPE_CONFIG.training;

  return (
    <div
      className={cn(
        "group relative pl-8 pb-5 last:pb-0",
        isNew && "animate-fade-in-up"
      )}
    >
      {/* Timeline line */}
      <div className="absolute left-[11px] top-6 bottom-0 w-px bg-border-subtle group-last:hidden" />

      {/* Timeline dot */}
      <div
        className={cn(
          "absolute left-0 top-1 w-6 h-6 rounded-full flex items-center justify-center",
          cfg.bgColor
        )}
      >
        <svg
          className={cn("w-3.5 h-3.5", cfg.color)}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d={cfg.icon} />
        </svg>
      </div>

      {/* Content */}
      <div className="rounded-xl bg-card border border-border-subtle p-3.5 hover:bg-card-hover transition-colors">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 mb-2">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge
              variant={
                event.type === "anomaly"
                  ? "warning"
                  : event.type === "discovery"
                  ? "info"
                  : "default"
              }
              size="xs"
            >
              {cfg.label}
            </Badge>
          </div>
          <span className="text-[10px] text-muted whitespace-nowrap tabular-nums shrink-0">
            {timeAgo(event.created_at)}
          </span>
        </div>

        {/* Title */}
        <h4 className="text-sm font-medium mb-1 leading-snug">{event.title}</h4>

        {/* Plain-English summary — the key value prop */}
        <p className="text-xs text-muted-foreground leading-relaxed">{event.summary}</p>

        {/* Intelligence score mini-bar (if present) */}
        {event.intelligence_score != null && (
          <div className="mt-2 pt-2 border-t border-border-subtle flex items-center justify-between">
            <span className="text-[10px] text-muted">Intelligence score</span>
            <ScoreBar score={event.intelligence_score} />
          </div>
        )}

        {/* Duration pill */}
        {event.duration_ms != null && event.duration_ms > 0 && (
          <div className="mt-1.5 flex items-center gap-1 text-[10px] text-muted">
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {event.duration_ms < 1000
              ? `${event.duration_ms}ms`
              : `${(event.duration_ms / 1000).toFixed(1)}s`}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Meta strip ───────────────────────────────────────────────────────────────

function MetaStrip({
  latestScore,
  predictionAccuracy,
  autonomousCycles,
  dreamInsights,
}: {
  latestScore: number | null;
  predictionAccuracy: number | null;
  autonomousCycles: number | null;
  dreamInsights: number | null;
}) {
  if (
    latestScore == null &&
    predictionAccuracy == null &&
    autonomousCycles == null &&
    dreamInsights == null
  ) {
    return null;
  }

  return (
    <div className="flex items-center gap-4 flex-wrap px-1 pb-3 text-[10px] text-muted tabular-nums">
      {latestScore != null && (
        <span>
          Score{" "}
          <span className="font-semibold text-foreground">{latestScore.toFixed(1)}</span>
        </span>
      )}
      {predictionAccuracy != null && (
        <span>
          Accuracy{" "}
          <span className="font-semibold text-foreground">
            {predictionAccuracy.toFixed(1)}%
          </span>
        </span>
      )}
      {autonomousCycles != null && (
        <span>
          <span className="font-semibold text-foreground">{autonomousCycles}</span> cycles
        </span>
      )}
      {dreamInsights != null && (
        <span>
          💡{" "}
          <span className="font-semibold text-foreground">{dreamInsights}</span> insights
        </span>
      )}
    </div>
  );
}

// ─── Props ────────────────────────────────────────────────────────────────────

export interface BrainLearningFeedProps {
  /** SSR-rendered initial events (from /api/brain/emergence). */
  initialEvents?: LearningEvent[];
  /** SSR-rendered meta. */
  initialMeta?: {
    latest_score: number | null;
    prediction_accuracy: number | null;
    autonomous_cycles_run: number | null;
    dream_insights_surfaced: number | null;
  };
  /** Filter events to a specific marketplace service. */
  service?: "aas" | "seaas";
  /** Org ID — used for Supabase Realtime subscription. */
  orgId?: string;
  /** Max events to show. Default: 10 */
  limit?: number;
  className?: string;
  /** Show compact header (for sidebar / widget use). */
  compact?: boolean;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function BrainLearningFeed({
  initialEvents = [],
  initialMeta,
  service,
  orgId,
  limit = 10,
  className,
  compact = false,
}: BrainLearningFeedProps) {
  const [events, setEvents] = useState<LearningEvent[]>(initialEvents);
  const [meta, setMeta] = useState(initialMeta);
  const [newEventIds, setNewEventIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(initialEvents.length === 0);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Fetch from /api/brain/emergence ──────────────────────────────────────
  const fetchEvents = useCallback(async () => {
    try {
      const params = new URLSearchParams({ limit: String(limit) });
      if (service) params.set("service", service);

      const res = await fetch(`/api/brain/emergence?${params}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const json = await res.json();
      const incoming: LearningEvent[] = json.events ?? [];

      setEvents((prev) => {
        // Identify genuinely new events (not in previous set)
        const prevIds = new Set(prev.map((e) => e.id));
        const brandNew = incoming.filter((e) => !prevIds.has(e.id));

        if (brandNew.length > 0) {
          // Flash new events
          setNewEventIds((ids) => {
            const next = new Set(ids);
            brandNew.forEach((e) => next.add(e.id));
            return next;
          });
          setTimeout(() => {
            setNewEventIds((ids) => {
              const next = new Set(ids);
              brandNew.forEach((e) => next.delete(e.id));
              return next;
            });
          }, 3000);
        }

        return incoming;
      });

      if (json.meta) setMeta(json.meta);
      setError(null);
    } catch (err: any) {
      setError(err?.message ?? "Failed to load learning feed");
    } finally {
      setLoading(false);
    }
  }, [limit, service]);

  // Initial fetch (if no SSR data) + polling every 60 s
  useEffect(() => {
    if (initialEvents.length === 0) {
      fetchEvents();
    }

    // Poll every 60 s for fresh events (brain runs cycles async)
    pollRef.current = setInterval(fetchEvents, 60_000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [fetchEvents, initialEvents.length]);

  // ── Supabase Realtime — push on new brain_emergence_log INSERT ────────────
  useEffect(() => {
    if (!orgId) return;

    // Dynamically import to avoid server-side issues
    import("@/lib/supabase/client").then(({ createClient }) => {
      const supabase = createClient();

      const channel = supabase
        .channel(`brain-emergence-${orgId}`)
        .on(
          "postgres_changes" as any,
          {
            event: "INSERT",
            schema: "public",
            table: "brain_emergence_log",
            filter: `organization_id=eq.${orgId}`,
          },
          () => {
            // Re-fetch on any new emergence event (keeps data fresh + typed)
            fetchEvents();
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    });
  }, [orgId, fetchEvents]);

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className={cn("space-y-3", className)}>
        {!compact && (
          <div className="flex items-center justify-between mb-4">
            <div className="h-4 w-32 bg-surface rounded animate-pulse" />
            <div className="h-3 w-10 bg-surface rounded animate-pulse" />
          </div>
        )}
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-20 rounded-xl bg-surface animate-pulse" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className={cn("rounded-xl border border-border-subtle p-4 text-center", className)}>
        <p className="text-xs text-muted">{error}</p>
        <button
          onClick={fetchEvents}
          className="mt-2 text-[11px] text-accent hover:text-accent/80 transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className={cn("rounded-xl border border-border-subtle p-6 text-center", className)}>
        <div className="w-8 h-8 rounded-full bg-brain-training/10 flex items-center justify-center mx-auto mb-2">
          <svg className="w-4 h-4 text-brain-training" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
          </svg>
        </div>
        <p className="text-xs text-muted">
          Brain hasn&apos;t logged any learning cycles yet.
          <br />
          Events appear after the first connector sync.
        </p>
      </div>
    );
  }

  return (
    <div className={className}>
      {/* Header */}
      {!compact && (
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-medium">Brain Learning Feed</h2>
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-brain-active brain-pulse" />
            <span className="text-[10px] text-muted">Live</span>
          </div>
        </div>
      )}

      {/* Meta strip — score, accuracy, cycles */}
      {meta && (
        <MetaStrip
          latestScore={meta.latest_score}
          predictionAccuracy={meta.prediction_accuracy}
          autonomousCycles={meta.autonomous_cycles_run}
          dreamInsights={meta.dream_insights_surfaced}
        />
      )}

      {/* Event timeline */}
      <div className="space-y-0">
        {events.slice(0, limit).map((event) => (
          <LearningEventRow
            key={event.id}
            event={event}
            isNew={newEventIds.has(event.id)}
          />
        ))}
      </div>
    </div>
  );
}
