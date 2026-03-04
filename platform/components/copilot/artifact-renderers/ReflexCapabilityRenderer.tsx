"use client";

import { ArtifactHeader, InsightBox } from "./shared";

/**
 * ReflexCapabilityRenderer — ADR-031 Phase 3b
 * ============================================
 * Renders structured output from the Reflex Engine's Universal Capability Executor.
 *
 * Two modes:
 *   async-wait  — workflow paused (e.g. PA ingestion started, pending cron resumption)
 *   default     — capability completed, shows narrative + any structured result data
 *
 * Receives `data` = reflexDelegateResult from chat/route.ts:
 *   { handler, reflexName, narrative, type, ...resultData }
 */
export function ReflexCapabilityRenderer({ data }: { data: Record<string, unknown> }) {
  const capabilityName = String(data.handler ?? data.reflexName ?? "Capability")
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());

  const narrative = data.narrative as string | undefined;
  const isAsyncWait = data.type === "async-wait";

  // Extract any extra result keys (skip internal meta-keys)
  const SKIP_KEYS = new Set(["handler", "reflexName", "narrative", "type", "asyncWait"]);
  const resultEntries = Object.entries(data).filter(
    ([k, v]) => !SKIP_KEYS.has(k) && v != null && typeof v !== "object",
  );

  return (
    <div className="flex flex-col h-full">
      <ArtifactHeader
        icon="⚡"
        title={capabilityName}
        badge={isAsyncWait ? "processing" : "complete"}
        badgeColor={isAsyncWait ? "amber" : "green"}
      />

      <div className="flex-1 overflow-y-auto p-4">
        {/* ── Async-wait mode ───────────────────────────────────────────── */}
        {isAsyncWait && (
          <div className="mb-3 flex items-start gap-3 px-3 py-2.5 rounded-[10px] border border-amber-500/15 bg-amber-500/4">
            {/* Pulsing amber dot */}
            <span className="relative flex h-2 w-2 mt-1 shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500" />
            </span>
            <div className="flex-1">
              <p className="text-[12px] font-medium text-amber-400 mb-0.5">
                Running in background
              </p>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                {narrative ?? "Workflow is processing. You can continue chatting — it will complete automatically."}
              </p>
            </div>
          </div>
        )}

        {/* ── Narrative (completed result) ──────────────────────────────── */}
        {!isAsyncWait && narrative && (
          <InsightBox>{narrative}</InsightBox>
        )}

        {/* ── Structured result key-value pairs (if any) ────────────────── */}
        {resultEntries.length > 0 && (
          <div className="mt-3 space-y-1">
            {resultEntries.map(([k, v]) => (
              <div key={k} className="flex items-start gap-2 text-[11px]">
                <span className="text-muted-foreground/60 uppercase tracking-wide font-medium w-28 shrink-0">
                  {k.replace(/_/g, " ")}
                </span>
                <span className="text-foreground/80 break-all">{String(v)}</span>
              </div>
            ))}
          </div>
        )}

        {/* ── Empty state ───────────────────────────────────────────────── */}
        {!isAsyncWait && !narrative && resultEntries.length === 0 && (
          <div className="text-[12px] text-muted-foreground/50 text-center py-6">
            Capability executed — no output data returned.
          </div>
        )}
      </div>
    </div>
  );
}
