"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * ContextMonitor
 *
 * Displays context (token) usage for the current conversation and offers
 * manual or automatic compression when the limit is approached.
 *
 * Props:
 *   messages    — current conversation messages
 *   onCompress  — called to trigger compression (parent handles the API call)
 */

const MAX_TOKENS = 8_000;
const CHARS_PER_TOKEN = 4;
const COMPRESS_SHOW_THRESHOLD = 6_000;   // show button at 75%
const AUTO_COMPRESS_THRESHOLD = 8_000;   // auto-trigger at 100%
const AUTO_COMPRESS_DELAY_MS = 2_000;    // 2 second warning before auto-compress

interface ContextMessage {
  role: string;
  content: string;
}

interface ContextMonitorProps {
  messages: ContextMessage[];
  onCompress: () => void;
  className?: string;
}

function estimateTokens(messages: ContextMessage[]): number {
  const totalChars = messages.reduce((sum, m) => sum + (m.content?.length ?? 0), 0);
  return Math.ceil(totalChars / CHARS_PER_TOKEN);
}

export function ContextMonitor({ messages, onCompress, className }: ContextMonitorProps) {
  const tokenCount = estimateTokens(messages);
  const usagePct = Math.min(1, tokenCount / MAX_TOKENS);

  // Auto-compress state: countdown before auto-trigger
  const [autoCompressCountdown, setAutoCompressCountdown] = useState<number | null>(null);
  const autoCompressTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const countdownIntervalRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const hasAutoTriggeredRef = useRef(false);

  // Trigger auto-compress with 2s delay and countdown when over threshold
  useEffect(() => {
    if (tokenCount > AUTO_COMPRESS_THRESHOLD && !hasAutoTriggeredRef.current) {
      // Start countdown display
      setAutoCompressCountdown(2);
      countdownIntervalRef.current = setInterval(() => {
        setAutoCompressCountdown((prev) => {
          if (prev === null || prev <= 1) {
            clearInterval(countdownIntervalRef.current);
            return null;
          }
          return prev - 1;
        });
      }, 1_000);

      // Schedule actual compression
      autoCompressTimerRef.current = setTimeout(() => {
        hasAutoTriggeredRef.current = true;
        setAutoCompressCountdown(null);
        onCompress();
      }, AUTO_COMPRESS_DELAY_MS);
    }

    // Reset auto-trigger flag when token count drops back below threshold
    if (tokenCount <= AUTO_COMPRESS_THRESHOLD) {
      hasAutoTriggeredRef.current = false;
    }

    return () => {
      clearTimeout(autoCompressTimerRef.current);
      clearInterval(countdownIntervalRef.current);
    };
  // Only re-run when the threshold crossing changes, not on every render
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tokenCount > AUTO_COMPRESS_THRESHOLD]);

  // Don't render anything for very short conversations (< 4 messages)
  if (messages.length < 4) return null;

  // Color thresholds: green < 50%, amber 50-75%, red > 75%
  const barColor =
    usagePct > 0.75
      ? "bg-red-500"
      : usagePct > 0.5
      ? "bg-amber-500"
      : "bg-emerald-500";

  const textColor =
    usagePct > 0.75
      ? "text-red-500"
      : usagePct > 0.5
      ? "text-amber-500"
      : "text-muted-foreground";

  const showCompressButton = tokenCount > COMPRESS_SHOW_THRESHOLD;

  return (
    <div
      className={cn(
        "flex items-center gap-2 px-3 py-1.5 text-[10px]",
        className
      )}
    >
      {/* Token label */}
      <span className={cn("tabular-nums shrink-0 font-medium", textColor)}>
        Context: {tokenCount.toLocaleString()} / {MAX_TOKENS.toLocaleString()} tokens
      </span>

      {/* Usage bar */}
      <div className="flex-1 h-1 min-w-[48px] rounded-full bg-border-subtle overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all duration-500", barColor)}
          style={{ width: `${Math.round(usagePct * 100)}%` }}
        />
      </div>

      {/* Auto-compress warning */}
      {autoCompressCountdown !== null && (
        <span className="text-red-500 shrink-0 font-medium animate-pulse">
          Auto-compressing in {autoCompressCountdown}s…
        </span>
      )}

      {/* Manual compress button */}
      {showCompressButton && autoCompressCountdown === null && (
        <button
          onClick={onCompress}
          className={cn(
            "inline-flex items-center gap-1 px-1.5 py-0.5 rounded border transition-colors shrink-0",
            usagePct > 0.75
              ? "border-red-500/30 text-red-400 hover:bg-red-500/10"
              : "border-amber-500/30 text-amber-500 hover:bg-amber-500/10"
          )}
          title="Compress conversation history to free context space"
        >
          {/* Minimize/compress icon — inline SVG, no external dep */}
          <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 9V4.5M9 9H4.5M9 9L3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5l5.25 5.25" />
          </svg>
          Compress
        </button>
      )}
    </div>
  );
}
