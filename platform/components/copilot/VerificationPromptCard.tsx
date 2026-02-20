"use client";

import { useState, useCallback } from "react";
import { cn } from "@/lib/utils";

/**
 * VerificationPromptCard — "Was this prediction accurate?"
 *
 * Renders a proactive check-in card when a prediction's verification window
 * has passed. The user clicks Yes/No/Partially, which writes was_correct
 * to prediction_records and triggers causal edge weight adjustment.
 *
 * This is the missing link in the reinforcement loop: predictions sit
 * with was_correct=null forever unless someone provides ground truth.
 */

// Domain labels for display
const DOMAIN_LABELS: Record<string, string> = {
  "early-warning": "Early Warning",
  "delivery-intelligence": "Delivery Intelligence",
  "pod-match": "Pod Match",
  "scope-creep": "Scope Creep",
  "pr-review": "PR Review",
  "tdd": "TDD Agent",
  "boilerplate-scaffold": "Scaffold",
  "dependency-upgrade": "Dependency Upgrade",
  "design-doc-generator": "Design Doc",
  "test-case-generator": "Test Cases",
  "test-data-generator": "Test Data",
  "codebase-qa": "Codebase Q&A",
  "dead-code-detector": "Dead Code",
  "impact-analysis": "Impact Analysis",
  "architecture-extractor": "Architecture",
  "incident-diagnosis": "Incident RCA",
  "log-query": "Log Query",
  "performance-profiler": "Performance",
  "sql-analyzer": "SQL Analyzer",
  "data-lineage": "Data Lineage",
  "bookkeeper": "Bookkeeper",
  "reconciler": "Reconciler",
  "anomaly": "Anomaly Detective",
};

const DOMAIN_ICONS: Record<string, string> = {
  "early-warning": "!",
  "delivery-intelligence": "D",
  "pr-review": "PR",
  "scope-creep": "SC",
  "incident-diagnosis": "IC",
  "impact-analysis": "IA",
  "bookkeeper": "BK",
  "anomaly": "AN",
};

interface Verification {
  predictionId: string;
  verificationId?: string;
  domain?: string;
  description?: string;
  confidence?: number;
  predictedAt?: string;
  scheduledFor?: string;
  source: "scheduled" | "prediction";
}

interface VerificationPromptCardProps {
  verification: Verification;
  organizationId: string;
  onDismiss: (predictionId: string) => void;
}

export function VerificationPromptCard({
  verification,
  organizationId,
  onDismiss,
}: VerificationPromptCardProps) {
  const [verdict, setVerdict] = useState<"correct" | "incorrect" | "partial" | null>(null);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const handleVerdict = useCallback(
    async (v: "correct" | "incorrect" | "partial") => {
      setVerdict(v);
      setSending(true);

      try {
        await fetch("/api/copilot/verify-prediction", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            predictionId: verification.predictionId,
            organizationId,
            userVerdict: v,
            verificationId: verification.verificationId,
          }),
        });
        setSent(true);
        // Auto-dismiss after 2 seconds
        setTimeout(() => onDismiss(verification.predictionId), 2000);
      } catch {
        // Allow retry
        setSending(false);
        setVerdict(null);
      }
    },
    [verification, organizationId, onDismiss]
  );

  const domain = verification.domain || "unknown";
  const label = DOMAIN_LABELS[domain] || domain;
  const icon = DOMAIN_ICONS[domain] || domain.charAt(0).toUpperCase();
  const daysAgo = verification.predictedAt
    ? Math.floor((Date.now() - new Date(verification.predictedAt).getTime()) / (1000 * 60 * 60 * 24))
    : null;
  const confidencePct = verification.confidence
    ? Math.round(verification.confidence * 100)
    : null;

  if (sent) {
    return (
      <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-accent/5 border border-accent/20 animate-message-in">
        <svg className="w-4 h-4 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <span className="text-xs text-accent font-medium">
          Brain learned from your verification
          {verdict === "correct" && " — edge weights strengthened"}
          {verdict === "incorrect" && " — edge weights adjusted"}
        </span>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3.5 animate-message-in">
      {/* Header */}
      <div className="flex items-start gap-2.5">
        <div className="w-7 h-7 rounded-lg bg-amber-500/15 flex items-center justify-center text-[10px] font-bold text-amber-400 shrink-0">
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-semibold text-amber-400 uppercase tracking-wider">
              Verification Check
            </span>
            <span className="text-[10px] text-muted/50">{label}</span>
            {daysAgo !== null && (
              <span className="text-[10px] text-muted/40">
                {daysAgo}d ago
              </span>
            )}
            {confidencePct !== null && (
              <span className="text-[10px] text-muted/40">
                {confidencePct}% conf
              </span>
            )}
          </div>
          <p className="text-xs text-foreground/90 mt-1 leading-relaxed">
            {verification.description || "A prediction was made. Was it accurate?"}
          </p>
        </div>
      </div>

      {/* Verdict buttons */}
      <div className="flex items-center gap-2 mt-3 ml-9">
        <button
          onClick={() => handleVerdict("correct")}
          disabled={sending}
          className={cn(
            "px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all",
            verdict === "correct"
              ? "bg-success/20 text-success ring-1 ring-success/30"
              : "bg-surface/50 text-muted hover:text-success hover:bg-success/10",
            sending && "opacity-50 cursor-not-allowed"
          )}
        >
          Yes, it happened
        </button>
        <button
          onClick={() => handleVerdict("incorrect")}
          disabled={sending}
          className={cn(
            "px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all",
            verdict === "incorrect"
              ? "bg-danger/20 text-danger ring-1 ring-danger/30"
              : "bg-surface/50 text-muted hover:text-danger hover:bg-danger/10",
            sending && "opacity-50 cursor-not-allowed"
          )}
        >
          No, it didn't
        </button>
        <button
          onClick={() => handleVerdict("partial")}
          disabled={sending}
          className={cn(
            "px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all",
            verdict === "partial"
              ? "bg-amber-500/20 text-amber-400 ring-1 ring-amber-500/30"
              : "bg-surface/50 text-muted hover:text-amber-400 hover:bg-amber-500/10",
            sending && "opacity-50 cursor-not-allowed"
          )}
        >
          Partially
        </button>
        <button
          onClick={() => onDismiss(verification.predictionId)}
          className="px-2 py-1.5 rounded-lg text-[10px] text-muted/40 hover:text-muted transition-colors ml-auto"
          title="Dismiss"
        >
          Skip
        </button>
      </div>
    </div>
  );
}
