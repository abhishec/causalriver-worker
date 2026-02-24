"use client";

import { useState, useCallback } from "react";
import { logger } from "@/lib/logger";

interface MessageFeedbackProps {
  messageIndex: number;
  organizationId: string;
  conversationId?: string;
  serviceMode: string;
}

/**
 * Thumbs up/down feedback on assistant messages.
 * Sends RL signals (dopamine/gaba) to the brain via /api/copilot/feedback.
 */
export function MessageFeedback({ messageIndex, organizationId, conversationId, serviceMode }: MessageFeedbackProps) {
  const [rating, setRating] = useState<"helpful" | "not_helpful" | null>(null);
  const [showCorrection, setShowCorrection] = useState(false);
  const [correction, setCorrection] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const submitFeedback = useCallback(async (r: "helpful" | "not_helpful", correctionText?: string) => {
    setRating(r);
    setSubmitted(true);

    try {
      await fetch("/api/copilot/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId,
          conversationId: conversationId || undefined,
          messageIndex,
          rating: correctionText ? "incorrect" : r,
          correction: correctionText || undefined,
          domain: serviceMode,
        }),
      });
    } catch (err) {
      logger.warn("[MessageFeedback] submit failed:", err);
    }
  }, [organizationId, conversationId, messageIndex, serviceMode]);

  const handleThumbsUp = useCallback(() => {
    if (rating) return;
    submitFeedback("helpful");
  }, [rating, submitFeedback]);

  const handleThumbsDown = useCallback(() => {
    if (rating) return;
    setRating("not_helpful");
    setShowCorrection(true);
    submitFeedback("not_helpful");
  }, [rating, submitFeedback]);

  const handleCorrectionSubmit = useCallback(() => {
    if (!correction.trim()) return;
    submitFeedback("not_helpful", correction.trim());
    setShowCorrection(false);
  }, [correction, submitFeedback]);

  if (submitted && !showCorrection) {
    return (
      <div className="flex items-center gap-1.5 mt-1 opacity-60">
        {rating === "helpful" ? (
          <svg className="w-3.5 h-3.5 text-emerald-400" fill="currentColor" viewBox="0 0 24 24">
            <path d="M7.493 18.75c-.425 0-.82-.236-.975-.632A7.48 7.48 0 016 15.375c0-1.75.599-3.358 1.602-4.634.151-.192.373-.309.6-.397.473-.183.89-.514 1.212-.924a9.042 9.042 0 012.861-2.4c.723-.384 1.35-.956 1.653-1.715a4.498 4.498 0 00.322-1.672V3a.75.75 0 01.75-.75 2.25 2.25 0 012.25 2.25c0 1.152-.26 2.243-.723 3.218-.266.558.107 1.282.725 1.282h3.126c1.026 0 1.945.694 2.054 1.715.045.422.068.85.068 1.285a11.95 11.95 0 01-2.649 7.521c-.388.482-.987.729-1.605.729H14.23c-.483 0-.964-.078-1.423-.23l-3.114-1.04a4.501 4.501 0 00-1.423-.23h-.777zM2.331 10.977a11.969 11.969 0 00-.831 4.398 12 12 0 00.52 3.507c.26.85 1.084 1.368 1.973 1.368H4.9c.445 0 .72-.498.523-.898a8.963 8.963 0 01-.924-3.977c0-1.708.476-3.305 1.302-4.666.245-.403-.028-.959-.5-.959H4.25c-.832 0-1.612.453-1.918 1.227z" />
          </svg>
        ) : (
          <svg className="w-3.5 h-3.5 text-amber-400" fill="currentColor" viewBox="0 0 24 24">
            <path d="M15.73 5.25h1.035A7.984 7.984 0 0118 9.375c0 .621-.504 1.125-1.125 1.125H14.25l-1.5 6.75h-.003a.75.75 0 01-.727.563h-.002a.75.75 0 01-.727-.563L9.75 10.5H7.125A1.125 1.125 0 016 9.375c0-1.538.434-2.974 1.187-4.193l.06-.098A1.125 1.125 0 018.18 4.5h7.55z" />
          </svg>
        )}
        <span className="text-[10px] text-muted-foreground">Feedback recorded</span>
      </div>
    );
  }

  return (
    <div className="mt-1">
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={handleThumbsUp}
          disabled={!!rating}
          className={`p-1 rounded hover:bg-surface-hover transition-colors ${rating === "helpful" ? "text-emerald-400" : "text-muted-foreground/40 hover:text-muted-foreground"}`}
          title="Helpful"
        >
          <svg className="w-3.5 h-3.5" fill={rating === "helpful" ? "currentColor" : "none"} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6.633 10.5c.806 0 1.533-.446 2.031-1.08a9.041 9.041 0 012.861-2.4c.723-.384 1.35-.956 1.653-1.715a4.498 4.498 0 00.322-1.672V3a.75.75 0 01.75-.75A2.25 2.25 0 0116.5 4.5c0 1.152-.26 2.243-.723 3.218-.266.558.107 1.282.725 1.282m0 0h3.126c1.026 0 1.945.694 2.054 1.715.045.422.068.85.068 1.285a11.95 11.95 0 01-2.649 7.521c-.388.482-.987.729-1.605.729H13.48c-.483 0-.964-.078-1.423-.23l-3.114-1.04a4.501 4.501 0 00-1.423-.23H3.35" />
          </svg>
        </button>
        <button
          onClick={handleThumbsDown}
          disabled={!!rating}
          className={`p-1 rounded hover:bg-surface-hover transition-colors ${rating === "not_helpful" ? "text-amber-400" : "text-muted-foreground/40 hover:text-muted-foreground"}`}
          title="Not helpful"
        >
          <svg className="w-3.5 h-3.5" fill={rating === "not_helpful" ? "currentColor" : "none"} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 15h2.25m8.024-9.75c.011.05.028.1.052.148.591 1.2.924 2.55.924 3.977a8.96 8.96 0 01-.999 4.125m.023-8.25c-.076-.365.183-.75.575-.75h.908c.889 0 1.713.518 1.972 1.368.339 1.11.521 2.287.521 3.507 0 1.553-.295 3.036-.831 4.398C20.613 14.547 19.833 15 19 15h-1.053c-.472 0-.745-.556-.5-.96a8.95 8.95 0 00.303-.54m.023-8.25H16.48a4.5 4.5 0 01-1.423-.23l-3.114-1.04a4.5 4.5 0 00-1.423-.23H6.504c-.618 0-1.217.247-1.605.729A11.95 11.95 0 002.25 12c0 .434.023.863.068 1.285C2.427 14.306 3.346 15 4.372 15H7.5" />
          </svg>
        </button>
      </div>

      {/* Correction input */}
      {showCorrection && (
        <div className="mt-2 flex items-center gap-2">
          <input
            type="text"
            value={correction}
            onChange={(e) => setCorrection(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCorrectionSubmit()}
            placeholder="What was wrong? (optional)"
            className="flex-1 px-2 py-1 rounded-md bg-input border border-input-border text-xs text-foreground placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-input-focus"
            autoFocus
          />
          <button
            onClick={handleCorrectionSubmit}
            className="text-xs text-accent hover:text-accent/80"
          >
            Submit
          </button>
          <button
            onClick={() => { setShowCorrection(false); setSubmitted(true); }}
            className="text-xs text-muted-foreground"
          >
            Skip
          </button>
        </div>
      )}
    </div>
  );
}
