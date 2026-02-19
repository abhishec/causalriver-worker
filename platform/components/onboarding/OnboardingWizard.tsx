"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

interface OnboardingWizardProps {
  orgName: string;
  hasConnectors: boolean;
  hasSignals: boolean;
  onDismiss: () => void;
}

type Step = "connect" | "train" | "ask";

const STEPS: Array<{ id: Step; title: string; description: string }> = [
  {
    id: "connect",
    title: "Connect your data",
    description: "Link your accounting system or upload GL data",
  },
  {
    id: "train",
    title: "Train the brain",
    description: "Run initial sync to build causal intelligence",
  },
  {
    id: "ask",
    title: "Ask your first question",
    description: "Try the copilot with a real query",
  },
];

export function OnboardingWizard({
  orgName,
  hasConnectors,
  hasSignals,
  onDismiss,
}: OnboardingWizardProps) {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState<Step>(
    hasSignals ? "ask" : hasConnectors ? "train" : "connect"
  );
  const [training, setTraining] = useState(false);
  const [trainingResult, setTrainingResult] = useState<string | null>(null);

  const handleTrain = useCallback(async () => {
    setTraining(true);
    setTrainingResult(null);
    try {
      // Step 1: Sync all connectors (this now auto-triggers a lightweight brain cycle)
      const res = await fetch("/api/connectors/sync-all", { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        const totalSignals = data.totalSignals || 0;
        const brainTriggered = data.brainCycle?.triggered;

        // Step 2: If sync-all didn't auto-trigger brain (e.g. no signals), force it
        if (!brainTriggered && totalSignals > 0) {
          await fetch("/api/brain/cycle", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ mode: "lightweight" }),
          });
        }

        setTrainingResult(
          `Synced ${data.successCount || 0} source(s), ${totalSignals} signals${brainTriggered ? " — brain trained" : " — brain cycle queued"}`
        );
        setCurrentStep("ask");
      } else {
        // Even if sync failed, try to run brain on existing data
        await fetch("/api/brain/cycle", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode: "lightweight" }),
        });
        setTrainingResult("Sync had issues but brain cycle started on existing data");
        setCurrentStep("ask");
      }
    } catch {
      setTrainingResult("Check connector status and try again");
    } finally {
      setTraining(false);
    }
  }, []);

  const stepIndex = STEPS.findIndex((s) => s.id === currentStep);

  return (
    <div className="rounded-2xl bg-card border border-accent/20 overflow-hidden">
      {/* Header */}
      <div className="px-6 py-5 bg-gradient-to-r from-accent/5 to-transparent border-b border-border-subtle">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold">
              Welcome to NexusBrain
            </h2>
            <p className="text-xs text-muted mt-0.5">
              Get {orgName} set up in 3 steps
            </p>
          </div>
          <button
            onClick={onDismiss}
            className="text-xs text-muted hover:text-foreground transition-colors"
          >
            Dismiss
          </button>
        </div>

        {/* Step indicators */}
        <div className="flex items-center gap-2 mt-4">
          {STEPS.map((step, i) => {
            const isComplete = i < stepIndex;
            const isCurrent = i === stepIndex;
            return (
              <div key={step.id} className="flex items-center gap-2 flex-1">
                <div
                  className={cn(
                    "w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 transition-all",
                    isComplete
                      ? "bg-success text-white"
                      : isCurrent
                      ? "bg-accent text-white"
                      : "bg-surface border border-border-subtle text-muted"
                  )}
                >
                  {isComplete ? (
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    i + 1
                  )}
                </div>
                {i < STEPS.length - 1 && (
                  <div
                    className={cn(
                      "flex-1 h-px",
                      isComplete ? "bg-success" : "bg-border-subtle"
                    )}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Step Content */}
      <div className="px-6 py-5">
        {/* Step 1: Connect */}
        {currentStep === "connect" && (
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-semibold mb-1">Connect your data sources</h3>
              <p className="text-xs text-muted leading-relaxed">
                Upload a General Ledger export or connect GitHub, Slack, Jira to start building intelligence.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => router.push("/connectors")}
                className="flex items-center gap-3 px-4 py-3 rounded-xl bg-surface border border-border-subtle hover:border-accent/30 hover:bg-surface-hover transition-all text-left"
              >
                <span className="text-xl">📦</span>
                <div>
                  <div className="text-xs font-medium">Upload GL Data</div>
                  <div className="text-[10px] text-muted">JSON / CSV file</div>
                </div>
              </button>

              <button
                onClick={() => router.push("/connectors")}
                className="flex items-center gap-3 px-4 py-3 rounded-xl bg-surface border border-border-subtle hover:border-accent/30 hover:bg-surface-hover transition-all text-left"
              >
                <span className="text-xl">🔗</span>
                <div>
                  <div className="text-xs font-medium">Connect APIs</div>
                  <div className="text-[10px] text-muted">GitHub, Slack, Jira</div>
                </div>
              </button>
            </div>

            {hasConnectors && (
              <button
                onClick={() => setCurrentStep("train")}
                className="text-xs text-accent hover:text-accent-light transition-colors"
              >
                I already have connectors — skip to training →
              </button>
            )}
          </div>
        )}

        {/* Step 2: Train */}
        {currentStep === "train" && (
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-semibold mb-1">Run initial training</h3>
              <p className="text-xs text-muted leading-relaxed">
                Sync all connected sources to build the brain's causal graph. This typically takes 30–60 seconds.
              </p>
            </div>

            <button
              onClick={handleTrain}
              disabled={training}
              className="w-full py-3 rounded-xl bg-accent text-white text-sm font-medium hover:bg-accent-dark transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {training ? (
                <>
                  <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Training brain...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
                  </svg>
                  Run Initial Training
                </>
              )}
            </button>

            {trainingResult && (
              <div className="flex items-center gap-2 text-xs text-success">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                {trainingResult}
              </div>
            )}

            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentStep("connect")}
                className="text-xs text-muted hover:text-foreground transition-colors"
              >
                ← Back
              </button>
              {hasSignals && (
                <button
                  onClick={() => setCurrentStep("ask")}
                  className="text-xs text-accent hover:text-accent-light transition-colors ml-auto"
                >
                  Skip — I have signals →
                </button>
              )}
            </div>
          </div>
        )}

        {/* Step 3: Ask */}
        {currentStep === "ask" && (
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-semibold mb-1">Ask your first question</h3>
              <p className="text-xs text-muted leading-relaxed">
                The brain is ready. Try a question from the copilot to see causal intelligence in action.
              </p>
            </div>

            <div className="space-y-2">
              {[
                { q: "Show me our P&L summary", route: "/copilot" },
                { q: "What anomalies are in our GL data?", route: "/copilot" },
                { q: "What's our monthly burn rate?", route: "/aaas" },
              ].map((example) => (
                <button
                  key={example.q}
                  onClick={() => router.push(example.route)}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-surface border border-border-subtle hover:border-accent/30 hover:bg-surface-hover transition-all text-left group"
                >
                  <svg className="w-4 h-4 text-muted group-hover:text-accent transition-colors shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                  </svg>
                  <span className="text-xs text-muted-foreground group-hover:text-foreground transition-colors">
                    {example.q}
                  </span>
                  <svg className="w-3 h-3 text-muted group-hover:text-accent transition-colors ml-auto shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                  </svg>
                </button>
              ))}
            </div>

            <button
              onClick={onDismiss}
              className="w-full py-2.5 rounded-xl border border-border-subtle text-xs text-muted hover:text-foreground hover:border-accent/30 transition-all"
            >
              Got it — dismiss wizard
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
