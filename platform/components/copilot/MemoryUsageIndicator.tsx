"use client";

import { useState, useCallback } from "react";
import { cn } from "@/lib/utils";

/**
 * MemoryUsageIndicator
 *
 * Displays a subtle context window usage bar in the copilot UI.
 * Shows how much of the model's context window has been used and
 * offers a "Clean up context" button when usage is high.
 *
 * Props:
 *   messageCount    — number of messages in the current conversation
 *   conversationId  — current conversation ID (for cleanup trigger)
 *   onCleanup       — called after successful cleanup (to refresh conversation)
 */

// Thresholds for visual feedback
const HAIKU_MAX_TOKENS = 200_000;    // claude-haiku context window
const SONNET_MAX_TOKENS = 200_000;   // claude-sonnet context window
const AVG_TOKENS_PER_MSG = 300;      // rough estimate
const WARN_THRESHOLD = 0.6;          // 60% → amber
const CRITICAL_THRESHOLD = 0.8;      // 80% → red + cleanup prompt

interface MemoryUsageIndicatorProps {
  messageCount: number;
  conversationId: string | null;
  onCleanup?: () => void;
  className?: string;
}

export function MemoryUsageIndicator({
  messageCount,
  conversationId,
  onCleanup,
  className,
}: MemoryUsageIndicatorProps) {
  const [cleaning, setCleaning] = useState(false);
  const [cleaned, setCleaned] = useState(false);

  // Estimate token usage from message count
  const estimatedTokens = messageCount * AVG_TOKENS_PER_MSG;
  const maxTokens = HAIKU_MAX_TOKENS;
  const usagePct = Math.min(1, estimatedTokens / maxTokens);
  const isWarning = usagePct >= WARN_THRESHOLD;
  const isCritical = usagePct >= CRITICAL_THRESHOLD;

  // All hooks must be declared before any early returns
  const handleCleanup = useCallback(async () => {
    if (!conversationId || cleaning) return;
    setCleaning(true);
    try {
      const res = await fetch("/api/copilot/context-cleanup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId, strategy: "summarize" }),
      });
      if (res.ok) {
        setCleaned(true);
        onCleanup?.();
        // Reset "cleaned" badge after 5s
        setTimeout(() => setCleaned(false), 5000);
      }
    } catch {
      // Silent fail — indicator is non-critical
    } finally {
      setCleaning(false);
    }
  }, [conversationId, cleaning, onCleanup]);

  // Only show the indicator when conversation is substantial (>10 messages)
  if (messageCount < 10) return null;

  const barColor = isCritical
    ? "bg-red-500"
    : isWarning
    ? "bg-amber-400"
    : "bg-accent";

  const textColor = isCritical
    ? "text-red-500"
    : isWarning
    ? "text-amber-500"
    : "text-muted-foreground";

  return (
    <div className={cn("flex items-center gap-2 px-3 py-1", className)}>
      {/* Usage bar */}
      <div className="flex items-center gap-1.5 flex-1 min-w-0">
        <svg className={cn("w-3 h-3 shrink-0", textColor)} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
        </svg>
        <div className="flex-1 h-1 rounded-full bg-border-subtle overflow-hidden">
          <div
            className={cn("h-full rounded-full transition-all duration-500", barColor)}
            style={{ width: `${Math.round(usagePct * 100)}%` }}
          />
        </div>
        <span className={cn("text-[10px] tabular-nums shrink-0", textColor)}>
          {Math.round(usagePct * 100)}%
        </span>
      </div>

      {/* Cleanup button — shown when >60% used */}
      {isWarning && conversationId && (
        <button
          onClick={handleCleanup}
          disabled={cleaning}
          className={cn(
            "text-[10px] px-1.5 py-0.5 rounded transition-colors shrink-0",
            cleaned
              ? "text-emerald-500 bg-emerald-500/10"
              : isCritical
              ? "text-red-400 hover:bg-red-500/10"
              : "text-muted-foreground hover:bg-surface-hover"
          )}
          title="Compress conversation history to free context"
        >
          {cleaning ? "Compressing…" : cleaned ? "Compressed ✓" : "Compress"}
        </button>
      )}
    </div>
  );
}
