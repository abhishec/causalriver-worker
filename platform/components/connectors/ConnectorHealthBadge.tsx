"use client";

/**
 * ConnectorHealthBadge — color-coded status badge with error detail + reconnect.
 *
 * Status mapping:
 *   connected / active / synced → green
 *   syncing / pending / ingesting → amber (pulsing)
 *   error / failed               → red + error detail + reconnect button
 *   other                        → gray
 */

import { cn } from "@/lib/utils";

interface ConnectorHealthBadgeProps {
  status: string;
  errorMessage?: string | null;
  lastSyncAt?: string | null;
  onReconnect?: () => void;
}

function statusColor(status: string): "green" | "amber" | "red" | "gray" {
  const s = status?.toLowerCase() ?? "";
  if (s === "connected" || s === "active" || s === "synced") return "green";
  if (s === "syncing" || s === "pending" || s === "ingesting") return "amber";
  if (s === "error" || s === "failed" || s === "disconnected_error") return "red";
  return "gray";
}

const COLOR_CLASSES: Record<string, string> = {
  green: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
  amber: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
  red: "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20",
  gray: "bg-muted/10 text-muted border-border",
};

const DOT_CLASSES: Record<string, string> = {
  green: "bg-emerald-500",
  amber: "bg-amber-500 animate-pulse",
  red: "bg-red-500",
  gray: "bg-muted",
};

export function ConnectorHealthBadge({ status, errorMessage, lastSyncAt, onReconnect }: ConnectorHealthBadgeProps) {
  const color = statusColor(status);
  const label = status ? status.charAt(0).toUpperCase() + status.slice(1).toLowerCase() : "Unknown";

  return (
    <div className="flex flex-col gap-1">
      <div
        className={cn(
          "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium border w-fit",
          COLOR_CLASSES[color],
        )}
      >
        <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", DOT_CLASSES[color])} />
        {label}
      </div>

      {/* Error detail */}
      {color === "red" && errorMessage && (
        <div className="text-[10px] text-red-600 dark:text-red-400 bg-red-500/5 border border-red-500/10 rounded px-2 py-1 max-w-[220px]">
          <span className="font-medium">Error: </span>
          {errorMessage.slice(0, 120)}
          {errorMessage.length > 120 && "\u2026"}
        </div>
      )}

      {/* Last sync */}
      {lastSyncAt && color !== "red" && (
        <span className="text-[9px] text-muted">
          Last sync:{" "}
          {new Date(lastSyncAt).toLocaleString(undefined, {
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </span>
      )}

      {/* Reconnect action */}
      {color === "red" && onReconnect && (
        <button type="button" onClick={onReconnect} className="text-[10px] text-accent hover:underline w-fit">
          Reconnect \u2192
        </button>
      )}
    </div>
  );
}
