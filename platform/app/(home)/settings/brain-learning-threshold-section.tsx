"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { cn } from "@/lib/utils";

interface BrainLearningThresholdSectionProps {
  orgId: string;
}

const MIN_THRESHOLD = 5;
const MAX_THRESHOLD = 50;
const STEP = 5;
const DEBOUNCE_MS = 500;

export function BrainLearningThresholdSection({ orgId }: BrainLearningThresholdSectionProps) {
  const [threshold, setThreshold] = useState(10);
  const [signalCount, setSignalCount] = useState<number | null>(null);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [loading, setLoading] = useState(true);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const latestThresholdRef = useRef(threshold);

  // Load current config on mount
  useEffect(() => {
    let cancelled = false;
    async function loadConfig() {
      try {
        const res = await fetch("/api/workspace/ai-worker-config");
        if (!res.ok || cancelled) return;
        const data = await res.json();
        if (typeof data.brainReadinessMinIq === "number") {
          setThreshold(data.brainReadinessMinIq);
          latestThresholdRef.current = data.brainReadinessMinIq;
        }
        if (typeof data.brainSignalCount === "number") {
          setSignalCount(data.brainSignalCount);
        }
      } catch {
        // Non-critical — use defaults
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadConfig();
    return () => { cancelled = true; };
  }, [orgId]);

  // Debounced save — fires 500ms after the slider stops moving
  const saveThreshold = useCallback(async (value: number) => {
    setSaveStatus("saving");
    try {
      const res = await fetch("/api/workspace/ai-worker-config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brainReadinessMinIq: value }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 2500);
    } catch {
      setSaveStatus("error");
      setTimeout(() => setSaveStatus("idle"), 3000);
    }
  }, []);

  const handleSliderChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = parseInt(e.target.value, 10);
      setThreshold(value);
      latestThresholdRef.current = value;
      setSaveStatus("idle");

      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        saveThreshold(latestThresholdRef.current);
      }, DEBOUNCE_MS);
    },
    [saveThreshold]
  );

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  // Progress percentage for the slider fill track
  const fillPct = ((threshold - MIN_THRESHOLD) / (MAX_THRESHOLD - MIN_THRESHOLD)) * 100;

  // Readiness description based on threshold vs current signal count
  const isReady = signalCount !== null && signalCount >= threshold;
  const readinessLabel =
    signalCount === null
      ? null
      : isReady
      ? "Brain is ready at this threshold"
      : `Need ${threshold - signalCount} more signals to reach this threshold`;

  if (loading) {
    return (
      <div className="rounded-xl bg-card border border-border-subtle p-5 animate-pulse">
        <div className="h-4 w-48 bg-surface rounded mb-2" />
        <div className="h-3 w-72 bg-surface rounded mb-6" />
        <div className="h-2 w-full bg-surface rounded" />
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-card border border-border-subtle p-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-1">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-accent/10 flex items-center justify-center shrink-0">
            <svg className="w-5 h-5 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
            </svg>
          </div>
          <div>
            <h4 className="text-sm font-semibold">Brain Learning Threshold</h4>
            <p className="text-xs text-muted mt-0.5">
              Minimum signals the brain needs before it can answer queries. Lower = faster start, higher = more accurate answers.
            </p>
          </div>
        </div>
        {/* Save status badge */}
        <div className="shrink-0 min-w-[60px] text-right">
          {saveStatus === "saving" && (
            <span className="text-[10px] text-muted flex items-center gap-1 justify-end">
              <svg className="animate-spin h-2.5 w-2.5" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Saving
            </span>
          )}
          {saveStatus === "saved" && (
            <span className="text-[10px] text-success flex items-center gap-1 justify-end">
              <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
              Saved
            </span>
          )}
          {saveStatus === "error" && (
            <span className="text-[10px] text-danger">Failed</span>
          )}
        </div>
      </div>

      {/* Slider + value display */}
      <div className="mt-5">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] text-muted">Faster start ({MIN_THRESHOLD} signals)</span>
          <div className="flex items-center gap-2">
            <span className="text-base font-bold tabular-nums">{threshold}</span>
            <span className="text-xs text-muted">signals</span>
          </div>
          <span className="text-[11px] text-muted">More accurate ({MAX_THRESHOLD} signals)</span>
        </div>

        {/* Custom slider */}
        <div className="relative h-2 w-full rounded-full bg-surface overflow-hidden">
          {/* Fill track */}
          <div
            className="absolute inset-y-0 left-0 bg-accent rounded-full transition-all duration-150"
            style={{ width: `${fillPct}%` }}
          />
        </div>
        <input
          type="range"
          min={MIN_THRESHOLD}
          max={MAX_THRESHOLD}
          step={STEP}
          value={threshold}
          onChange={handleSliderChange}
          className="w-full mt-1 accent-accent cursor-pointer"
          aria-label="Brain Learning Threshold"
        />

        {/* Tick marks */}
        <div className="flex justify-between mt-1 px-0.5">
          {Array.from({ length: (MAX_THRESHOLD - MIN_THRESHOLD) / STEP + 1 }, (_, i) => MIN_THRESHOLD + i * STEP).map(
            (val) => (
              <span
                key={val}
                className={cn(
                  "text-[9px] tabular-nums",
                  val === threshold ? "text-accent font-semibold" : "text-muted"
                )}
              >
                {val}
              </span>
            )
          )}
        </div>
      </div>

      {/* Signal count + readiness */}
      <div className="mt-4 flex items-center justify-between px-3 py-2.5 rounded-lg bg-surface border border-border-subtle">
        <div className="flex items-center gap-2">
          <div
            className={cn(
              "w-2 h-2 rounded-full shrink-0",
              signalCount === null
                ? "bg-muted"
                : isReady
                ? "bg-success"
                : "bg-warning"
            )}
          />
          <span className="text-xs text-muted-foreground">
            Current:{" "}
            <span className="font-semibold text-foreground">
              {signalCount === null ? "—" : signalCount.toLocaleString()}
            </span>{" "}
            signals collected
          </span>
        </div>
        {readinessLabel && (
          <span
            className={cn(
              "text-[10px] font-medium",
              isReady ? "text-success" : "text-warning"
            )}
          >
            {readinessLabel}
          </span>
        )}
      </div>

      {/* Explanation chips */}
      <div className="mt-3 flex items-center gap-3 flex-wrap text-[10px] text-muted">
        <span className="flex items-center gap-1">
          <svg className="w-3 h-3 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Default: 10 signals
        </span>
        <span className="flex items-center gap-1">
          <svg className="w-3 h-3 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
          </svg>
          Auto-saves on change
        </span>
        <span className="flex items-center gap-1">
          <svg className="w-3 h-3 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
          </svg>
          Used by Agent Orchestrator
        </span>
      </div>
    </div>
  );
}
