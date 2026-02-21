"use client";

/**
 * ActivationChecklist — Design Partner post-signup checklist
 * ===========================================================
 *
 * 9-item activation checklist with auto-completion detection.
 * Replaces OnboardingWizard for design partners.
 * State stored in org_settings (NOT localStorage — persists across devices/team).
 *
 * Design matches OnboardingWizard: rounded-2xl bg-card border border-accent/20,
 * accent gradient header with ProgressRing.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { ProgressRing } from "@/components/ui/ProgressRing";

interface ActivationChecklistProps {
  orgName: string;
  onDismiss: () => void;
}

interface ActivationItem {
  id: string;
  label: string;
  completed: boolean;
  href?: string;
  description: string;
}

const CHECKLIST_ITEMS: Array<{
  id: string;
  label: string;
  description: string;
  href?: string;
}> = [
  {
    id: "create_org",
    label: "Create workspace",
    description: "Your workspace is set up and ready",
  },
  {
    id: "connect_github",
    label: "Connect GitHub",
    description: "Link your GitHub account for engineering intelligence",
    href: "/connectors",
  },
  {
    id: "select_repos",
    label: "Select repositories",
    description: "Choose which repos to track for insights",
    href: "/connectors",
  },
  {
    id: "run_pr_review",
    label: "Run first PR Review",
    description: "Get AI-powered code review on a pull request",
    href: "/copilot?service=seaas&q=Review%20my%20latest%20PR",
  },
  {
    id: "run_early_warning",
    label: "Run Early Warning",
    description: "Check velocity and bottleneck risk analysis",
    href: "/early-warning",
  },
  {
    id: "invite_teammate",
    label: "Invite a teammate",
    description: "Collaboration unlocks team-level insights",
    href: "/settings?tab=members",
  },
  {
    id: "ask_copilot",
    label: "Ask the Copilot",
    description: "Try a natural language engineering query",
    href: "/copilot?service=seaas",
  },
  {
    id: "generate_artifact",
    label: "Generate an artifact",
    description: "Create a design doc, test suite, or analysis",
    href: "/se-aas",
  },
  {
    id: "configure_digest",
    label: "Configure notifications",
    description: "Set up digest emails and alert preferences",
    href: "/settings?tab=notifications",
  },
];

export function ActivationChecklist({ orgName, onDismiss }: ActivationChecklistProps) {
  const abortRef = useRef<AbortController | null>(null);
  const [items, setItems] = useState<ActivationItem[]>(
    CHECKLIST_ITEMS.map((item) => ({ ...item, completed: item.id === "create_org" }))
  );
  const [loading, setLoading] = useState(true);
  const [dismissing, setDismissing] = useState(false);

  const completedCount = items.filter((i) => i.completed).length;
  const totalItems = items.length;
  const progressPercent = Math.round((completedCount / totalItems) * 100);
  const canDismiss = completedCount >= 6;

  // Fetch activation state from API
  const fetchActivation = useCallback(async () => {
    try {
      abortRef.current?.abort();
      abortRef.current = new AbortController();
      const res = await fetch("/api/partner/activation", {
        signal: abortRef.current.signal,
      });
      if (res.ok) {
        const data = await res.json();
        if (data.dismissed) {
          onDismiss();
          return;
        }
        // Merge completion state
        setItems((prev) =>
          prev.map((item) => ({
            ...item,
            completed: data.items?.includes(item.id) ?? item.completed,
          }))
        );
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      // Silently fail — show defaults
    } finally {
      setLoading(false);
    }
  }, [onDismiss]);

  useEffect(() => {
    fetchActivation();
    return () => abortRef.current?.abort();
  }, [fetchActivation]);

  // Poll for updates every 30s (items complete as user takes actions in other tabs)
  useEffect(() => {
    const interval = setInterval(fetchActivation, 30_000);
    return () => {
      clearInterval(interval);
      abortRef.current?.abort();
    };
  }, [fetchActivation]);

  async function handleDismiss() {
    setDismissing(true);
    try {
      await fetch("/api/partner/activation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "dismiss" }),
      });
      onDismiss();
    } catch {
      onDismiss();
    }
  }

  if (loading) {
    return (
      <div className="rounded-2xl bg-card border border-accent/20 p-6 animate-pulse">
        <div className="h-4 bg-surface-raised rounded w-1/3 mb-4" />
        <div className="h-3 bg-surface-raised rounded w-2/3 mb-3" />
        <div className="space-y-2">
          {[1, 2, 3].map((n) => (
            <div key={n} className="h-10 bg-surface-raised rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-card border border-accent/20 overflow-hidden">
      {/* Header with gradient — matches OnboardingWizard */}
      <div className="bg-gradient-to-r from-accent/5 to-transparent px-5 py-4 border-b border-accent/10">
        <div className="flex items-center gap-4">
          <ProgressRing
            value={progressPercent}
            size={52}
            strokeWidth={4}
            color="accent"
          />
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold">
              Activation Progress
            </h3>
            <p className="text-xs text-muted mt-0.5">
              {completedCount}/{totalItems} steps complete · {orgName}
            </p>
          </div>
          {canDismiss && (
            <button
              onClick={handleDismiss}
              disabled={dismissing}
              className="text-xs text-muted hover:text-foreground transition-colors shrink-0"
            >
              {dismissing ? "..." : "Dismiss"}
            </button>
          )}
        </div>
      </div>

      {/* Checklist items */}
      <div className="divide-y divide-border-subtle">
        {items.map((item) => {
          const inner = (
            <div
              className={cn(
                "flex items-center gap-3 px-5 py-3 transition-colors",
                item.completed ? "opacity-70" : "hover:bg-surface/50"
              )}
            >
              {/* Checkbox circle */}
              <div
                className={cn(
                  "w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all",
                  item.completed
                    ? "bg-success border-success"
                    : "border-border-subtle"
                )}
              >
                {item.completed && (
                  <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </div>

              {/* Label + description */}
              <div className="flex-1 min-w-0">
                <span className={cn(
                  "text-sm font-medium",
                  item.completed ? "line-through text-muted" : ""
                )}>
                  {item.label}
                </span>
                <p className="text-xs text-muted mt-0.5 leading-relaxed">{item.description}</p>
              </div>

              {/* Arrow for actionable items */}
              {!item.completed && item.href && (
                <svg className="w-4 h-4 text-muted shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                </svg>
              )}
            </div>
          );

          if (!item.completed && item.href) {
            return (
              <Link key={item.id} href={item.href} className="block">
                {inner}
              </Link>
            );
          }

          return <div key={item.id}>{inner}</div>;
        })}
      </div>

      {/* Footer — quick action */}
      {completedCount < totalItems && (
        <div className="px-5 py-3 border-t border-border-subtle bg-surface/30">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted">
              {totalItems - completedCount} step{totalItems - completedCount !== 1 ? "s" : ""} remaining
            </span>
            <Link
              href="/copilot?service=seaas"
              className="text-xs text-accent hover:text-accent/80 font-medium transition-colors"
            >
              Open Copilot →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
