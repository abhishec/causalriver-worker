"use client";

import { useState, useCallback, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { CopilotChat } from "@/components/copilot/CopilotChat";
import type { CopilotArtifact, BrainMeta, DomainResult } from "@/components/copilot/CopilotChat";
import { ArtifactsPanel } from "@/components/copilot/ArtifactsPanel";
import type { Artifact } from "@/components/copilot/ArtifactsPanel";
import { BrainContextPanel } from "@/components/copilot/BrainContextPanel";
import { AgentRunner } from "@/components/copilot/AgentRunner";
import { DomainResultRenderer } from "@/components/copilot/DomainResultRenderer";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { useOrg } from "@/lib/org-context";
import { cn } from "@/lib/utils";
import Link from "next/link";

// ─── Service Mode Config ─────────────────────────────────────────────────────

type ServiceMode = "general" | "aas" | "seaas";

interface ServiceConfig {
  id: ServiceMode;
  label: string;
  shortLabel: string;
  description: string;
  color: string;
  activeColor: string;
  dotColor: string;
  pills: Array<{ label: string; prompt: string; category: string }>;
  examplePrompts: string[];
  personaDescription: string;
}

const SERVICES: ServiceConfig[] = [
  {
    id: "general",
    label: "General",
    shortLabel: "General",
    description: "Causal intelligence across all domains",
    color: "text-muted hover:text-foreground",
    activeColor: "bg-accent/10 text-accent border-accent/30",
    dotColor: "bg-accent",
    pills: [
      { label: "Causal Analysis", prompt: "Show me the strongest causal relationships in our data", category: "general" },
      { label: "Anomaly Check", prompt: "What anomalies were detected today?", category: "general" },
      { label: "Predictions", prompt: "Predict next month's key metrics", category: "general" },
      { label: "Intelligence Report", prompt: "Give me the full intelligence report", category: "general" },
    ],
    examplePrompts: [
      "Why is churn increasing?",
      "Show me the strongest causal relationships",
      "What anomalies were detected today?",
      "Give me the full intelligence report",
    ],
    personaDescription: "Your causal intelligence co-pilot — every answer grounded in statistical evidence",
  },
  {
    id: "aas",
    label: "Accounting",
    shortLabel: "AAS",
    description: "AI-powered accounting & financial analysis",
    color: "text-muted hover:text-emerald-400",
    activeColor: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
    dotColor: "bg-emerald-400",
    pills: [
      { label: "P&L Analysis", prompt: "Show me the profit and loss statement for 2025", category: "accounting" },
      { label: "Balance Sheet", prompt: "Generate the current balance sheet", category: "accounting" },
      { label: "Trial Balance", prompt: "Generate the trial balance for 2025", category: "accounting" },
      { label: "GST Review", prompt: "Check GST F5 compliance for the latest quarter", category: "accounting" },
      { label: "Anomaly Check", prompt: "Run Benford's Law analysis on transaction amounts to detect anomalies", category: "accounting" },
      { label: "Top Transactions", prompt: "Show me the top transactions and transaction summary for 2025", category: "accounting" },
    ],
    examplePrompts: [
      "Show me the P&L for 2025",
      "Generate the balance sheet",
      "Check GST compliance",
      "Analyze transaction anomalies",
    ],
    personaDescription: "Your AI accountant — double-entry bookkeeping, financial statements, and GST compliance powered by causal AI",
  },
  {
    id: "seaas",
    label: "Engineering",
    shortLabel: "SE-aaS",
    description: "AI software engineering & code intelligence",
    color: "text-muted hover:text-blue-400",
    activeColor: "bg-blue-500/10 text-blue-400 border-blue-500/30",
    dotColor: "bg-blue-400",
    pills: [
      { label: "TDD Generator", prompt: "Generate TDD tests for our authentication module", category: "engineering" },
      { label: "PR Review", prompt: "Review the latest PR for code quality and security", category: "engineering" },
      { label: "Impact Analysis", prompt: "Analyze the impact of changing the billing schema", category: "engineering" },
      { label: "Architecture", prompt: "Extract and visualize the current system architecture", category: "engineering" },
      { label: "Dead Code", prompt: "Identify dead code and unused exports in the codebase", category: "engineering" },
      { label: "Incident RCA", prompt: "Diagnose the root cause of the latest production incident", category: "engineering" },
    ],
    examplePrompts: [
      "Generate TDD tests for our auth module",
      "Review the latest PR for security issues",
      "Analyze impact of the billing schema change",
      "Find dead code in the codebase",
    ],
    personaDescription: "Your AI software engineer — code analysis, PR review, architecture intelligence, and incident diagnostics",
  },
];

const PILL_COLORS: Record<string, string> = {
  general: "bg-accent/10 text-accent border-accent/20",
  accounting: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  engineering: "bg-blue-500/10 text-blue-400 border-blue-500/20",
};

// ─── Right panel mode ─────────────────────────────────────────────────────────
type RightPanel = "artifacts" | "brain-context" | "agents" | "domain-result" | "none";

// ─── Page Component ───────────────────────────────────────────────────────────
export default function CopilotPage() {
  const { currentOrg } = useOrg();
  const searchParams = useSearchParams();
  const [showCapabilities, setShowCapabilities] = useState(true);

  // ── Service mode ────────────────────────────────────────────────────────────
  const [activeService, setActiveService] = useState<ServiceMode>("general");
  const currentService = SERVICES.find((s) => s.id === activeService) ?? SERVICES[0];

  // ── Auto-inject prompt from ?q= or ?service= query params ──────────────────
  useEffect(() => {
    const q = searchParams.get("q");
    const svc = searchParams.get("service") as ServiceMode | null;
    if (svc && ["general", "aas", "seaas"].includes(svc)) {
      setActiveService(svc);
    }
    if (q) {
      const timer = setTimeout(() => {
        window.dispatchEvent(new CustomEvent("copilot-inject-prompt", { detail: q }));
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [searchParams]);

  // ── Artifact state ──────────────────────────────────────────────────────────
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [activeArtifactId, setActiveArtifactId] = useState<string | null>(null);

  // ── Domain result state (AAS / SE-aaS structured output) ───────────────────
  const [domainResult, setDomainResult] = useState<DomainResult | null>(null);

  // ── Right panel state ───────────────────────────────────────────────────────
  const [rightPanel, setRightPanel] = useState<RightPanel>("brain-context");

  // ── Brain meta state ────────────────────────────────────────────────────────
  const [brainMeta, setBrainMeta] = useState<BrainMeta | null>(null);
  const [brainLoading, setBrainLoading] = useState(false);

  const handleBrainMeta = useCallback((meta: BrainMeta) => {
    setBrainMeta(meta);
    setBrainLoading(false);
  }, []);

  // Handle new code/analysis artifacts from CopilotChat
  const handleArtifact = useCallback((artifact: CopilotArtifact) => {
    const newArtifact: Artifact = { ...artifact, pinned: false };
    setArtifacts((prev) => [...prev, newArtifact]);
    setActiveArtifactId(newArtifact.id);
    setRightPanel("artifacts");
  }, []);

  // Handle domain result from AAS / SE-aaS agents — auto-open domain-result panel
  const handleDomainResult = useCallback((result: DomainResult) => {
    setDomainResult(result);
    setRightPanel("domain-result");
  }, []);

  // Pin/unpin an artifact
  const handlePinArtifact = useCallback((id: string) => {
    setArtifacts((prev) =>
      prev.map((a) => (a.id === id ? { ...a, pinned: !a.pinned } : a))
    );
  }, []);

  // Switch service mode — clears domain result from previous service
  const handleServiceSwitch = useCallback((svc: ServiceMode) => {
    setActiveService(svc);
    if (svc === "general") {
      setDomainResult(null);
      setRightPanel("brain-context");
    }
  }, []);

  return (
    <div className="flex flex-col gap-0 h-[calc(100vh-7rem)]">

      {/* ── Service Mode Selector Bar ─────────────────────────────────────── */}
      <div className="shrink-0 flex items-center gap-1 mb-3 bg-card/50 rounded-xl border border-border-subtle p-1">
        {SERVICES.map((svc) => (
          <button
            key={svc.id}
            onClick={() => handleServiceSwitch(svc.id)}
            className={cn(
              "flex items-center gap-2 px-3 py-1.5 rounded-lg text-[12px] font-medium transition-all duration-150 border flex-1 justify-center",
              activeService === svc.id
                ? svc.activeColor + " shadow-sm"
                : "border-transparent text-muted hover:text-foreground hover:bg-surface"
            )}
          >
            {activeService === svc.id && (
              <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", svc.dotColor)} />
            )}
            <span>{svc.label}</span>
            {svc.id !== "general" && (
              <span className="text-[10px] opacity-60 font-normal hidden sm:inline">
                {svc.id === "aas" ? "aaS" : "aaS"}
              </span>
            )}
          </button>
        ))}
        {/* Service description — subtle hint */}
        <div className="hidden lg:flex items-center gap-2 ml-2 pl-2 border-l border-border-subtle">
          <span className="text-[11px] text-muted truncate max-w-[220px]">{currentService.description}</span>
        </div>
      </div>

      {/* ── Main 2-column layout ──────────────────────────────────────────── */}
      <div className="flex gap-4 flex-1 min-h-0">

        {/* ── Left: Chat ──────────────────────────────────────────────────── */}
        <div className="flex-1 min-w-0 flex flex-col">

          {/* Capability Pills — contextual to active service */}
          {showCapabilities && (
            <div className="shrink-0 mb-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-medium text-muted uppercase tracking-wider">
                  {currentService.id === "general" ? "Quick Actions" : `${currentService.label} Actions`}
                </span>
                <button
                  onClick={() => setShowCapabilities(false)}
                  className="text-[10px] text-muted hover:text-muted-foreground transition-colors"
                >
                  Hide
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {currentService.pills.map((pill) => (
                  <button
                    key={pill.label}
                    onClick={() => {
                      window.dispatchEvent(new CustomEvent("copilot-inject-prompt", { detail: pill.prompt }));
                    }}
                    className={cn(
                      "inline-flex items-center gap-1 px-2.5 py-1 rounded-full border text-[11px] font-medium transition-all hover:opacity-80 hover:scale-[1.02]",
                      PILL_COLORS[pill.category] ?? "bg-surface text-muted border-border-subtle"
                    )}
                  >
                    {pill.label}
                  </button>
                ))}
                {!showCapabilities && (
                  <button
                    onClick={() => setShowCapabilities(true)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full border text-[11px] font-medium text-muted border-border-subtle hover:text-foreground transition-colors"
                  >
                    Show actions
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Chat */}
          <div className="flex-1 min-h-0">
            <ErrorBoundary section="Copilot Chat">
              <CopilotChat
                endpoint="/api/copilot/chat"
                extraParams={{ organizationId: currentOrg?.id }}
                activeService={activeService}
                persona={{
                  name: activeService === "aas"
                    ? "Accounting Intelligence"
                    : activeService === "seaas"
                    ? "Engineering Intelligence"
                    : "Intelligence Copilot",
                  description: currentService.personaDescription,
                  color: activeService === "aas" ? "emerald" : activeService === "seaas" ? "blue" : "accent",
                }}
                examplePrompts={currentService.examplePrompts}
                onArtifact={handleArtifact}
                onBrainMeta={handleBrainMeta}
                onDomainResult={handleDomainResult}
              />
            </ErrorBoundary>
          </div>
        </div>

        {/* ── Right: Panel ──────────────────────────────────────────────── */}
        {rightPanel !== "none" && (
          <div className="w-[400px] shrink-0 min-h-0 flex flex-col">

            {/* ── Domain Result Panel (AAS / SE-aaS) ── */}
            {rightPanel === "domain-result" && domainResult ? (
              <div className="flex flex-col h-full">
                {/* Panel header with navigation */}
                <div className="flex items-center justify-between mb-3 shrink-0">
                  <div className="flex items-center gap-2">
                    <span className={cn(
                      "w-2 h-2 rounded-full",
                      domainResult.service === "aas" ? "bg-emerald-400" : "bg-blue-400"
                    )} />
                    <h3 className="text-xs font-medium text-foreground uppercase tracking-wider">
                      {domainResult.service === "aas" ? "Financial Statements" : "Engineering Analysis"}
                    </h3>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setRightPanel("brain-context")}
                      className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium text-muted hover:text-accent hover:bg-accent/10 transition-colors"
                    >
                      Brain
                    </button>
                    {artifacts.length > 0 && (
                      <button
                        onClick={() => setRightPanel("artifacts")}
                        className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium text-muted hover:text-accent hover:bg-accent/10 transition-colors"
                      >
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
                <div className="flex-1 min-h-0 overflow-hidden">
                  <ErrorBoundary section="Domain Result">
                    <DomainResultRenderer result={domainResult} />
                  </ErrorBoundary>
                </div>
              </div>

            ) : rightPanel === "artifacts" ? (
              <ErrorBoundary section="Artifacts">
                <ArtifactsPanel
                  artifacts={artifacts}
                  activeArtifactId={activeArtifactId}
                  onSelectArtifact={setActiveArtifactId}
                  onPinArtifact={handlePinArtifact}
                  onClose={() => setRightPanel("none")}
                />
              </ErrorBoundary>

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
              /* brain-context */
              <>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-xs font-medium text-muted uppercase tracking-wider">Brain Context</h3>
                  <div className="flex items-center gap-1">
                    <Link
                      href="/brain"
                      className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium text-accent hover:bg-accent/10 transition-colors"
                    >
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                      </svg>
                      Brain
                    </Link>
                    <button
                      onClick={() => setRightPanel("agents")}
                      className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium text-accent hover:bg-accent/10 transition-colors"
                    >
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                      Agents
                    </button>
                    {domainResult && (
                      <button
                        onClick={() => setRightPanel("domain-result")}
                        className={cn(
                          "flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium transition-colors",
                          domainResult.service === "aas"
                            ? "text-emerald-400 hover:bg-emerald-500/10"
                            : "text-blue-400 hover:bg-blue-500/10"
                        )}
                      >
                        {domainResult.service === "aas" ? "Financials" : "Analysis"}
                      </button>
                    )}
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

        {/* ── Floating toggle when panel is closed ────────────────────── */}
        {rightPanel === "none" && (
          <div className="fixed right-6 top-20 flex flex-col gap-2 z-10">
            {domainResult && (
              <button
                onClick={() => setRightPanel("domain-result")}
                className={cn(
                  "flex items-center gap-2 px-3 py-2 rounded-lg bg-card border hover:bg-card-hover transition-colors shadow-lg text-xs font-medium",
                  domainResult.service === "aas"
                    ? "border-emerald-500/30 text-emerald-400"
                    : "border-blue-500/30 text-blue-400"
                )}
                title={domainResult.service === "aas" ? "Financial Statements" : "Engineering Analysis"}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
                </svg>
                {domainResult.service === "aas" ? "Financials" : "Analysis"}
              </button>
            )}
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
    </div>
  );
}
