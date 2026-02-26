"use client";

/**
 * MemoryTokenCounter
 *
 * Displays total token usage across the current memory items and offers a
 * "Clean up" button when token count exceeds the threshold.
 *
 * Token estimation: 4 chars ≈ 1 token (rough GPT-family heuristic).
 *
 * Props:
 *   items      — array of memory items (each must have a `content` string)
 *   onCleanup  — called when the user clicks "Clean up"
 *   className  — optional Tailwind class overrides
 */

const CHARS_PER_TOKEN = 4;
const CLEANUP_THRESHOLD_TOKENS = 8_000;

interface MemoryItem {
  content: string;
}

interface MemoryTokenCounterProps {
  items: MemoryItem[];
  onCleanup?: () => void;
  className?: string;
}

export function MemoryTokenCounter({
  items,
  onCleanup,
  className,
}: MemoryTokenCounterProps) {
  const totalChars = items.reduce((sum, item) => sum + (item.content?.length ?? 0), 0);
  const totalTokens = Math.ceil(totalChars / CHARS_PER_TOKEN);
  const isOverThreshold = totalTokens > CLEANUP_THRESHOLD_TOKENS;

  return (
    <div
      className={[
        "flex items-center gap-2 text-xs tabular-nums",
        isOverThreshold ? "text-amber-500" : "text-muted-foreground",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <span>
        Memory: {totalTokens.toLocaleString()} tokens
      </span>
      {isOverThreshold && (
        <button
          onClick={onCleanup}
          className="px-1.5 py-0.5 rounded border border-amber-500/30 text-amber-500 hover:bg-amber-500/10 transition-colors"
          title="Remove oldest or least-important memories to free space"
        >
          Clean up
        </button>
      )}
    </div>
  );
}
