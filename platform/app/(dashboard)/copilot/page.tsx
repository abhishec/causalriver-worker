"use client";

import { useState } from "react";
import { CopilotChat } from "@/components/copilot/CopilotChat";
import { BrainContextPanel } from "@/components/copilot/BrainContextPanel";
import { useOrg } from "@/lib/org-context";

export default function CopilotPage() {
  const { currentOrg } = useOrg();
  const [showContext, setShowContext] = useState(true);

  return (
    <div className="flex gap-6 h-[calc(100vh-7rem)]">
      {/* Left: Chat (65%) */}
      <div className="flex-1 min-w-0">
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
            "Predict next month's revenue",
            "What cross-domain patterns have been discovered?",
            "Give me the full intelligence report",
          ]}
        />
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
