"use client";

import { useState } from "react";
import { CopilotChat } from "@/components/copilot/CopilotChat";
import { BrainContextPanel } from "@/components/copilot/BrainContextPanel";
import { useOrg } from "@/lib/org-context";
import Link from "next/link";

/* ── P1 Capability Quick-Access ──────────────────────────────────────────── */
const CAPABILITY_PILLS = [
  { label: "TDD Generator", prompt: "Generate TDD tests for our authentication module", category: "speed" },
  { label: "PR Review", prompt: "Review the latest PR for code quality and security", category: "speed" },
  { label: "Impact Analysis", prompt: "Analyze the impact of changing the billing schema", category: "accuracy" },
  { label: "SQL Analyzer", prompt: "Analyze our slowest SQL queries for optimization", category: "accuracy" },
  { label: "Log Query", prompt: "Search recent error logs for payment failures", category: "production" },
  { label: "Incident RCA", prompt: "Diagnose the root cause of the latest production incident", category: "production" },
  { label: "Architecture", prompt: "Extract and visualize the current system architecture", category: "understanding" },
  { label: "Dead Code", prompt: "Identify dead code and unused exports in the codebase", category: "understanding" },
];

const CATEGORY_COLORS: Record<string, string> = {
  speed: "bg-domain-engineering/10 text-domain-engineering border-domain-engineering/20",
  accuracy: "bg-domain-product/10 text-domain-product border-domain-product/20",
  production: "bg-danger/10 text-danger border-danger/20",
  understanding: "bg-domain-knowledge/10 text-domain-knowledge border-domain-knowledge/20",
};

export default function CopilotPage() {
  const { currentOrg } = useOrg();
  const [showContext, setShowContext] = useState(true);
  const [showCapabilities, setShowCapabilities] = useState(true);

  return (
    <div className="flex gap-6 h-[calc(100vh-7rem)]">
      {/* Left: Chat (65%) */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* P1 Capability Pills */}
        {showCapabilities && (
          <div className="shrink-0 mb-3">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-medium text-muted uppercase tracking-wider">AI Capabilities</span>
                <Link href="/capabilities" className="text-[10px] text-accent hover:text-accent/80">View all</Link>
              </div>
              <button
                onClick={() => setShowCapabilities(false)}
                className="text-[10px] text-muted hover:text-muted-foreground transition-colors"
              >
                Hide
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {CAPABILITY_PILLS.map((pill) => (
                <button
                  key={pill.label}
                  onClick={() => {
                    // Dispatch custom event to inject prompt into CopilotChat
                    window.dispatchEvent(new CustomEvent("copilot-inject-prompt", { detail: pill.prompt }));
                  }}
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full border text-[11px] font-medium transition-colors hover:opacity-80 ${CATEGORY_COLORS[pill.category] || "bg-surface text-muted border-border-subtle"}`}
                >
                  {pill.label}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="flex-1 min-h-0">
          <CopilotChat
            endpoint="/api/copilot/chat"
            extraParams={{ organizationId: currentOrg?.id }}
            persona={{
              name: "Intelligence Copilot",
              description: "Your causal intelligence co-pilot — every answer grounded in statistical evidence",
            }}
            examplePrompts={[
              "Why is churn increasing?",
              "Show me the strongest causal relationships",
              "What anomalies were detected today?",
              "Generate TDD tests for our auth module",
              "Analyze impact of deploying the billing update",
              "Give me the full intelligence report",
            ]}
          />
        </div>
      </div>

      {/* Right: Brain Context Panel (35%) */}
      {showContext && (
        <div className="w-80 shrink-0 overflow-y-auto">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-medium text-muted uppercase tracking-wider">Brain Context</h3>
            <button
              onClick={() => setShowContext(false)}
              className="p-0.5 rounded hover:bg-surface-hover text-muted"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <BrainContextPanel
            brainMeta={null}
            isLoading={false}
          />
        </div>
      )}

      {/* Toggle context panel */}
      {!showContext && (
        <button
          onClick={() => setShowContext(true)}
          className="fixed right-6 top-20 p-2 rounded-lg bg-card border border-border-subtle hover:bg-card-hover text-muted transition-colors z-10"
          title="Show brain context"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
          </svg>
        </button>
      )}
    </div>
  );
}
