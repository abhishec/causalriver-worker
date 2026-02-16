"use client";

import { useState, useCallback, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { CopilotChat } from "@/components/copilot/CopilotChat";
import type { CopilotArtifact, BrainMeta } from "@/components/copilot/CopilotChat";
import { ArtifactsPanel } from "@/components/copilot/ArtifactsPanel";
import type { Artifact } from "@/components/copilot/ArtifactsPanel";
import { BrainContextPanel } from "@/components/copilot/BrainContextPanel";
import { AgentRunner } from "@/components/copilot/AgentRunner";
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

/* ── Right panel mode ────────────────────────────────────────────────────── */
type RightPanel = "artifacts" | "brain-context" | "agents" | "none";

export default function CopilotPage() {
  const { currentOrg } = useOrg();
  const searchParams = useSearchParams();
  const [showCapabilities, setShowCapabilities] = useState(true);

  // Auto-inject prompt from ?q= query parameter (e.g. from Capabilities "Run" button)
  useEffect(() => {
    const q = searchParams.get("q");
    if (q) {
      // Small delay to ensure CopilotChat has mounted its event listener
      const timer = setTimeout(() => {
        window.dispatchEvent(new CustomEvent("copilot-inject-prompt", { detail: q }));
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [searchParams]);

  // Artifact state — lives here so it persists across chat interactions
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [activeArtifactId, setActiveArtifactId] = useState<string | null>(null);

  // Right panel state — artifacts panel auto-opens when first artifact arrives
  const [rightPanel, setRightPanel] = useState<RightPanel>("brain-context");

  // Brain meta state — wired from CopilotChat's onBrainMeta callback to feed the right-panel
  const [brainMeta, setBrainMeta] = useState<BrainMeta | null>(null);
  const [brainLoading, setBrainLoading] = useState(false);

  const handleBrainMeta = useCallback((meta: BrainMeta) => {
    setBrainMeta(meta);
    setBrainLoading(false);
  }, []);

  // Handle new artifacts emitted by CopilotChat
  const handleArtifact = useCallback((artifact: CopilotArtifact) => {
    const newArtifact: Artifact = {
      ...artifact,
      pinned: false,
    };
    setArtifacts((prev) => [...prev, newArtifact]);
    setActiveArtifactId(newArtifact.id);
    // Auto-switch to artifacts panel on first artifact
    setRightPanel("artifacts");
  }, []);

  // Pin/unpin an artifact
  const handlePinArtifact = useCallback((id: string) => {
    setArtifacts((prev) =>
      prev.map((a) => (a.id === id ? { ...a, pinned: !a.pinned } : a))
    );
  }, []);

  return (
    <div className="flex gap-4 h-[calc(100vh-7rem)]">
      {/* ── Left: Chat ────────────────────────────────────────────────── */}
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
            onArtifact={handleArtifact}
            onBrainMeta={handleBrainMeta}
          />
        </div>
      </div>

      {/* ── Right: Panel (Artifacts, Brain Context, or Agents) ────────── */}
      {rightPanel !== "none" && (
        <div className="w-[380px] shrink-0 min-h-0 flex flex-col">
          {rightPanel === "artifacts" ? (
            <ArtifactsPanel
              artifacts={artifacts}
              activeArtifactId={activeArtifactId}
              onSelectArtifact={setActiveArtifactId}
              onPinArtifact={handlePinArtifact}
              onClose={() => setRightPanel("none")}
            />
          ) : rightPanel === "agents" ? (
            <div className="flex flex-col h-full bg-card rounded-xl border border-border-subtle overflow-hidden">
              {currentOrg?.id ? (
                <AgentRunner
                  organizationId={currentOrg.id}
                  onArtifact={handleArtifact}
                />
              ) : (
                <div className="flex items-center justify-center h-full text-sm text-muted">
                  Loading organization...
                </div>
              )}
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-medium text-muted uppercase tracking-wider">Brain Context</h3>
                <div className="flex items-center gap-1">
                  {/* Switch to agents */}
                  <button
                    onClick={() => setRightPanel("agents")}
                    className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium text-accent hover:bg-accent/10 transition-colors"
                  >
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                    Agents
                  </button>
                  {/* Switch to artifacts if any exist */}
                  {artifacts.length > 0 && (
                    <button
                      onClick={() => setRightPanel("artifacts")}
                      className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium text-accent hover:bg-accent/10 transition-colors"
                    >
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5" />
                      </svg>
                      Artifacts ({artifacts.length})
                    </button>
                  )}
                  <button
                    onClick={() => setRightPanel("none")}
                    className="p-0.5 rounded hover:bg-surface-hover text-muted"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto">
                <BrainContextPanel
                  brainMeta={brainMeta}
                  isLoading={brainLoading}
                />
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Floating toggle when panel is closed ─────────────────────── */}
      {rightPanel === "none" && (
        <div className="fixed right-6 top-20 flex flex-col gap-2 z-10">
          {/* Agents button */}
          <button
            onClick={() => setRightPanel("agents")}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-card border border-accent/20 hover:bg-card-hover text-accent transition-colors shadow-lg"
            title="Brain Agents"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            <span className="text-xs font-medium">Agents</span>
          </button>
          {/* Artifacts button */}
          {artifacts.length > 0 && (
            <button
              onClick={() => setRightPanel("artifacts")}
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-card border border-accent/20 hover:bg-card-hover text-accent transition-colors shadow-lg"
              title="Show artifacts"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5" />
              </svg>
              <span className="text-xs font-medium">{artifacts.length}</span>
            </button>
          )}
          {/* Brain context button */}
          <button
            onClick={() => setRightPanel("brain-context")}
            className="p-2 rounded-lg bg-card border border-border-subtle hover:bg-card-hover text-muted transition-colors shadow-lg"
            title="Show brain context"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}
