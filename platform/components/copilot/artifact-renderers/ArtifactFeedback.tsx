"use client";

import { useState, useCallback, useRef } from "react";
import { cn } from "@/lib/utils";
import { useOrg } from "@/lib/org-context";

/**
 * ArtifactFeedback — Thumbs up/down + correction on every domain artifact.
 *
 * Mirrors the MessageFeedbackToolbar from CopilotChat but for artifacts.
 * Calls the EXISTING POST /api/copilot/feedback endpoint — no new API needed.
 *
 * This is the key missing piece: without this, the brain records that it
 * executed a domain, but never learns whether the result was RIGHT or WRONG.
 */

interface ArtifactFeedbackProps {
  organizationId?: string;
  artifactId: string;
  domainId: string;
  service?: "seaas" | "aas" | "general";
  className?: string;
}

export function ArtifactFeedback({
  organizationId: orgIdProp,
  artifactId,
  domainId,
  service,
  className,
}: ArtifactFeedbackProps) {
  const { currentOrg } = useOrg();
  const organizationId = orgIdProp || currentOrg?.id;
  const [feedback, setFeedback] = useState<"up" | "down" | null>(null);
  const [showCorrection, setShowCorrection] = useState(false);
  const [correction, setCorrection] = useState("");
  const [feedbackSent, setFeedbackSent] = useState(false);
  const correctionRef = useRef<HTMLTextAreaElement>(null);

  const sendFeedback = useCallback(
    async (
      rating: "helpful" | "not_helpful" | "incorrect",
      correctionText?: string
    ) => {
      if (!organizationId) return;
      try {
        await fetch("/api/copilot/feedback", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            organizationId,
            conversationId: `artifact_${artifactId}`,
            messageIndex: 0,
            rating,
            correction: correctionText || undefined,
            domain: domainId,
          }),
        });
        setFeedbackSent(true);
      } catch {
        // Silently fail — don't disrupt artifact UX
      }
    },
    [organizationId, artifactId, domainId]
  );

  const handleThumbsUp = useCallback(() => {
    if (feedback === "up") {
      setFeedback(null);
      return;
    }
    setFeedback("up");
    setShowCorrection(false);
    sendFeedback("helpful");
  }, [feedback, sendFeedback]);

  const handleThumbsDown = useCallback(() => {
    if (feedback === "down") {
      setFeedback(null);
      setShowCorrection(false);
      return;
    }
    setFeedback("down");
    setShowCorrection(true);
    sendFeedback("not_helpful");
    setTimeout(() => correctionRef.current?.focus(), 100);
  }, [feedback, sendFeedback]);

  const handleSubmitCorrection = useCallback(() => {
    const trimmed = correction.trim();
    if (!trimmed) return;
    sendFeedback("incorrect", trimmed);
    setCorrection("");
    setShowCorrection(false);
  }, [correction, sendFeedback]);

  if (!organizationId) return null;

  return (
    <div className={cn("border-t border-border-subtle/50 pt-3 mt-4", className)}>
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-muted/60 font-medium">
          Was this result accurate?
        </span>

        <button
          onClick={handleThumbsUp}
          className={cn(
            "flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-medium transition-colors",
            feedback === "up"
              ? "text-success bg-success/10"
              : "text-muted hover:text-foreground hover:bg-surface"
          )}
          title="Accurate result — helps the Brain learn"
        >
          <svg
            className="w-3.5 h-3.5"
            fill={feedback === "up" ? "currentColor" : "none"}
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M6.633 10.25c.806 0 1.533-.446 2.031-1.08a9.041 9.041 0 012.861-2.4c.723-.384 1.35-.956 1.653-1.715a4.498 4.498 0 00.322-1.672V3a.75.75 0 01.75-.75 2.25 2.25 0 012.25 2.25c0 1.152-.26 2.243-.723 3.218-.266.558.107 1.282.725 1.282m0 0h3.126c1.026 0 1.945.694 2.054 1.715.045.422.068.85.068 1.285a11.95 11.95 0 01-2.649 7.521c-.388.482-.987.729-1.605.729H13.48c-.483 0-.964-.078-1.423-.23l-3.114-1.04a4.501 4.501 0 00-1.423-.23H5.904m7.594-9.052A4.5 4.5 0 019 12.75H3.75a2.25 2.25 0 01-2.25-2.25V6.108c0-1.135.845-2.098 1.976-2.192a48.424 48.424 0 013.497-.23"
            />
          </svg>
        </button>

        <button
          onClick={handleThumbsDown}
          className={cn(
            "flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-medium transition-colors",
            feedback === "down"
              ? "text-danger bg-danger/10"
              : "text-muted hover:text-foreground hover:bg-surface"
          )}
          title="Inaccurate result — help the Brain improve"
        >
          <svg
            className="w-3.5 h-3.5"
            fill={feedback === "down" ? "currentColor" : "none"}
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M7.498 15.25H4.372c-1.026 0-1.945-.694-2.054-1.715A12.137 12.137 0 012.25 12c0-2.848.992-5.464 2.649-7.521C5.287 3.997 5.886 3.75 6.504 3.75h4.016a4.5 4.5 0 011.423.23l3.114 1.04a4.5 4.5 0 001.423.23h1.294M7.498 15.25c.618 0 .991.724.725 1.282A7.471 7.471 0 007.5 19.5a2.25 2.25 0 002.25 2.25.75.75 0 00.75-.75v-.633c0-.573.11-1.14.322-1.672.304-.76.93-1.33 1.653-1.715a9.04 9.04 0 002.86-2.4c.498-.634 1.226-1.08 2.032-1.08h.384"
            />
          </svg>
        </button>

        {feedbackSent && feedback && (
          <span className="text-[10px] text-accent/70 font-medium animate-message-in ml-1">
            {feedback === "up" ? "Brain learned" : "Brain noted"} ✓
          </span>
        )}
      </div>

      {/* Correction input — appears when thumbs down clicked */}
      {showCorrection && feedback === "down" && (
        <div className="mt-2 animate-message-in">
          <div className="flex items-start gap-2 p-3 rounded-xl bg-surface/50 border border-border-subtle">
            <svg
              className="w-4 h-4 text-accent shrink-0 mt-0.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 18v-5.25m0 0a6.01 6.01 0 001.5-.189m-1.5.189a6.01 6.01 0 01-1.5-.189m3.75 7.478a12.06 12.06 0 01-4.5 0m3.75 2.383a14.406 14.406 0 01-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 10-7.517 0c.85.493 1.509 1.333 1.509 2.316V18"
              />
            </svg>
            <div className="flex-1 min-w-0">
              <p className="text-[11px] text-muted mb-1.5">
                What was wrong? Your correction teaches the Brain.
              </p>
              <textarea
                ref={correctionRef}
                value={correction}
                onChange={(e) => setCorrection(e.target.value)}
                placeholder="e.g. The actual velocity didn't drop, Sprint 14 delivered 42 points..."
                className="w-full bg-background/50 rounded-lg border border-border-subtle px-3 py-2 text-xs text-foreground placeholder:text-muted/60 focus:outline-none focus:border-accent/30 resize-none"
                rows={2}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSubmitCorrection();
                  }
                }}
              />
              <div className="flex items-center justify-between mt-2">
                <span className="text-[10px] text-muted/50">
                  Enter to submit
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowCorrection(false)}
                    className="px-2.5 py-1 rounded-lg text-[10px] font-medium text-muted hover:text-foreground hover:bg-surface transition-colors"
                  >
                    Skip
                  </button>
                  <button
                    onClick={handleSubmitCorrection}
                    disabled={!correction.trim()}
                    className="px-3 py-1 rounded-lg bg-accent text-accent-foreground text-[10px] font-medium hover:bg-accent-dark transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Teach Brain
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
