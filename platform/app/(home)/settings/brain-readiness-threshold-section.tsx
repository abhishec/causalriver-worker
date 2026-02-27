"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { cn } from "@/lib/utils";

interface BrainReadinessThresholdSectionProps {
  orgId: string;
}

const MIN_THRESHOLD = 0.0;
const MAX_THRESHOLD = 1.0;
const STEP = 0.1;
const DEBOUNCE_MS = 500;

export function BrainReadinessThresholdSection({ orgId }: BrainReadinessThresholdSectionProps) {
  const [threshold, setThreshold] = useState(0.7);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [loading, setLoading] = useState(true);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const latestRef = useRef(threshold);

  // Load current threshold on mount
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/workspace/settings");
        if (!res.ok || cancelled) return;
        const data = await res.json();
        if (typeof data.brain_readiness_threshold === "number") {
          setThreshold(data.brain_readiness_threshold);
          latestRef.current = data.brain_readiness_threshold;
        }
      } catch {
        // Non-critical — use default 0.7
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [orgId]);

  // Debounced save
  const saveThreshold = useCallback(async (value: number) => {
    setSaveStatus("saving");
    try {
      const res = await fetch("/api/workspace/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brain_readiness_threshold: value }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 2500);
    } catch {
      setSaveStatus("error");
      setTimeout(() => setSaveStatus("idle"), 3000);
    }
  }, []);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = parseFloat(e.target.value);
      setThreshold(value);
      latestRef.current = value;
      setSaveStatus("idle");

      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        saveThreshold(latestRef.current);
      }, DEBOUNCE_MS);
    },
    [saveThreshold]
  );

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const fillPct = ((threshold - MIN_THRESHOLD) / (MAX_THRESHOLD - MIN_THRESHOLD)) * 100;
  const thresholdPct = Math.round(threshold * 100);

  const qualityLabel =
    threshold <= 0.3
      ? "Always show answers (low bar)"
      : threshold <= 0.5
      ? "Low quality threshold"
      : threshold <= 0.7
      ? "Recommended threshold"
      : threshold <= 0.9
      ? "High quality threshold"
      : "Only show when Brain is fully trained";

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
          <div className="w-9 h-9 rounded-lg bg-warning/10 flex items-center justify-center shrink-0">
            <svg className="w-5 h-5 text-warning" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
          </div>
          <div>
            <h4 className="text-sm font-semibold">Brain Readiness Threshold</h4>
            <p className="text-xs text-muted mt-0.5">
              When Brain quality drops below this threshold, the Copilot shows a warning banner. Default: 0.7 (70%).
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

      {/* Slider */}
      <div className="mt-5">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] text-muted">Always answer (0%)</span>
          <div className="flex items-center gap-2">
            <span className="text-base font-bold tabular-nums">{thresholdPct}%</span>
            <span className="text-xs text-muted">quality</span>
          </div>
          <span className="text-[11px] text-muted">Fully trained (100%)</span>
        </div>

        {/* Visual fill track */}
        <div className="relative h-2 w-full rounded-full bg-surface overflow-hidden">
          <div
            className="absolute inset-y-0 left-0 bg-warning rounded-full transition-all duration-150"
            style={{ width: `${fillPct}%` }}
          />
        </div>
        <input
          type="range"
          min={MIN_THRESHOLD}
          max={MAX_THRESHOLD}
          step={STEP}
          value={threshold}
          onChange={handleChange}
          className="w-full mt-1 accent-warning cursor-pointer"
          aria-label="Brain Readiness Threshold"
        />

        {/* Tick marks */}
        <div className="flex justify-between mt-1 px-0.5">
          {[0.0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0].map((val) => (
            <span
              key={val}
              className={cn(
                "text-[9px] tabular-nums",
                val === threshold ? "text-warning font-semibold" : "text-muted"
              )}
            >
              {Math.round(val * 10) === 0 ? "0" : `.${Math.round(val * 10)}`}
            </span>
          ))}
        </div>
      </div>

      {/* Quality label */}
      <div className="mt-4 flex items-center justify-between px-3 py-2.5 rounded-lg bg-surface border border-border-subtle">
        <div className="flex items-center gap-2">
          <div
            className={cn(
              "w-2 h-2 rounded-full shrink-0",
              threshold <= 0.3 ? "bg-success" :
              threshold <= 0.6 ? "bg-warning" :
              "bg-warning"
            )}
          />
          <span className="text-xs text-muted-foreground">
            <span className="font-semibold text-foreground">{qualityLabel}</span>
          </span>
        </div>
        <span className="text-[10px] text-muted">
          Warning shown when Brain IQ &lt; {thresholdPct}
        </span>
      </div>

      {/* Explanation */}
      <div className="mt-3 flex items-center gap-3 flex-wrap text-[10px] text-muted">
        <span className="flex items-center gap-1">
          <svg className="w-3 h-3 text-warning" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Default: 0.7 (70%)
        </span>
        <span className="flex items-center gap-1">
          <svg className="w-3 h-3 text-warning" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
          </svg>
          Auto-saves on change
        </span>
        <span className="flex items-center gap-1">
          <svg className="w-3 h-3 text-warning" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zM3.75 12h.007v.008H3.75V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm-.375 5.25h.007v.008H3.75v-.008zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
          </svg>
          Shown in Copilot as warning banner
        </span>
      </div>
    </div>
  );
}
