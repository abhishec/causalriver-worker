"use client";

/**
 * AgentComposerPanel — On-the-fly agent composition UI
 * =====================================================
 *
 * Full lifecycle:
 *   1. User types natural language description
 *   2. Stream composition (analyzing → selecting tools → building persona → planning → ready)
 *   3. Preview: name, persona, tools (chips), gathering params (editable), plan (steps)
 *   4. Actions: "Run Now", "Run & Save", "Save Only", "Cancel"
 *   5. If executed: show execution progress (agent steps timeline)
 *   6. After execution: offer "Save as Command" via SaveTemplateDialog
 *
 * Uses /api/agent-composer SSE endpoint for both composition and execution.
 */

import { useState, useCallback, useRef, type FormEvent } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { consumeSSEStream } from "./CopilotChat";
import type { CompositionStep, CompositionResult, AgentStep } from "./types";

// ── Types ──────────────────────────────────────────────────────────────────────

type ComposerPhase =
  | "idle"
  | "composing"
  | "preview"
  | "executing"
  | "complete"
  | "error";

interface AgentComposerPanelProps {
  /** Current workspace ID */
  organizationId?: string;
  /** Close the composer panel */
  onClose: () => void;
  /** Called when execution produces an artifact (for ArtifactsPanel) */
  onArtifact?: (artifact: {
    id: string;
    type: string;
    title: string;
    content: string;
    rawData?: unknown;
    service?: string;
  }) => void;
  /** Called after saving as template (to refetch templates) */
  onSaved?: () => void;
  /** Called when user wants to save composition (opens SaveTemplateDialog) */
  onSaveAsCommand?: (compositionData: {
    name: string;
    persona: string;
    tools: string[];
    executionPlan: string[];
    prompt: string;
  }) => void;
}

// ── Phase progress indicator labels ─────────────────────────────────────────

const COMPOSITION_PHASES: {
  phase: CompositionStep["phase"];
  icon: string;
  label: string;
}[] = [
  { phase: "analyzing", icon: "🔍", label: "Analyzing" },
  { phase: "selecting-tools", icon: "🧰", label: "Selecting Tools" },
  { phase: "building-persona", icon: "🎭", label: "Building Persona" },
  { phase: "inferring-params", icon: "📋", label: "Inferring Params" },
  { phase: "planning", icon: "📐", label: "Planning" },
  { phase: "ready", icon: "✅", label: "Ready" },
];

// ── Complexity badges ───────────────────────────────────────────────────────

const COMPLEXITY_COLORS: Record<string, string> = {
  light: "bg-green-500/15 text-green-700",
  medium: "bg-yellow-500/15 text-yellow-700",
  heavy: "bg-red-500/15 text-red-700",
};

// ── Component ──────────────────────────────────────────────────────────────────

export function AgentComposerPanel({
  organizationId,
  onClose,
  onArtifact,
  onSaved,
  onSaveAsCommand,
}: AgentComposerPanelProps) {
  // ── State ────────────────────────────────────────────────────────────────
  const [phase, setPhase] = useState<ComposerPhase>("idle");
  const [description, setDescription] = useState("");
  const [compositionPhase, setCompositionPhase] = useState<CompositionStep | null>(null);
  const [composition, setComposition] = useState<CompositionResult | null>(null);
  const [agentSteps, setAgentSteps] = useState<AgentStep[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [executionNarrative, setExecutionNarrative] = useState("");
  const abortRef = useRef<AbortController | null>(null);

  // ── Compose ──────────────────────────────────────────────────────────────
  const handleCompose = useCallback(
    async (e?: FormEvent) => {
      e?.preventDefault();
      if (!description.trim()) return;

      // Cancel any in-flight request
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setPhase("composing");
      setCompositionPhase(null);
      setComposition(null);
      setErrorMessage(null);
      setAgentSteps([]);
      setExecutionNarrative("");

      try {
        const response = await fetch("/api/agent-composer", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            description: description.trim(),
            organizationId,
          }),
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        await consumeSSEStream(
          response,
          {
            onText: () => {},
            onError: (err) => {
              setErrorMessage(err);
              setPhase("error");
            },
            onBrainMeta: () => {},
            onDomainResult: () => {},
            onCompositionStep: (step) => {
              setCompositionPhase(step);
            },
            onCompositionResult: (result) => {
              setComposition(result);
              setPhase("preview");
            },
            onDone: () => {
              // If no composition came through, it's an error
              if (!composition) {
                // Check via closure — if we're still composing with no result
              }
            },
          },
          controller.signal
        );
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setErrorMessage(err instanceof Error ? err.message : "Composition failed");
        setPhase("error");
      }
    },
    [description, organizationId, composition]
  );

  // ── Execute ──────────────────────────────────────────────────────────────
  const handleExecute = useCallback(
    async (saveAfter: boolean = false) => {
      if (!composition) return;

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setPhase("executing");
      setAgentSteps([]);
      setExecutionNarrative("");

      try {
        const response = await fetch("/api/agent-composer", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            description: description.trim(),
            organizationId,
            execute: true,
          }),
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        await consumeSSEStream(
          response,
          {
            onText: (text) => {
              setExecutionNarrative(text);
            },
            onError: (err) => {
              setErrorMessage(err);
              setPhase("error");
            },
            onBrainMeta: () => {},
            onDomainResult: () => {},
            onAgentStep: (step) => {
              setAgentSteps((prev) => {
                const existing = prev.findIndex((s) => s.stepNumber === step.stepNumber);
                if (existing >= 0) {
                  const updated = [...prev];
                  updated[existing] = step;
                  return updated;
                }
                return [...prev, step];
              });
            },
            onProgressiveArtifact: (artifact) => {
              onArtifact?.({
                id: artifact.id,
                type: artifact.type,
                title: artifact.title,
                content: artifact.content,
                service: artifact.service,
              });
            },
            onAgentExecutionArtifact: (execArtifact) => {
              onArtifact?.({
                id: execArtifact.id,
                type: "agent-execution",
                title: execArtifact.title,
                content: JSON.stringify(execArtifact.rawData),
                rawData: execArtifact.rawData,
                service: execArtifact.service,
              });
            },
            onCompositionStep: (step) => {
              setCompositionPhase(step);
            },
            onCompositionResult: (result) => {
              setComposition(result);
            },
            onDone: () => {
              setPhase("complete");
              if (saveAfter && composition) {
                onSaveAsCommand?.({
                  name: composition.name,
                  persona: composition.persona,
                  tools: composition.selectedTools.map((t) => t.id),
                  executionPlan: composition.executionPlan,
                  prompt: composition.executionPrompt,
                });
              }
            },
          },
          controller.signal
        );
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setErrorMessage(err instanceof Error ? err.message : "Execution failed");
        setPhase("error");
      }
    },
    [composition, description, organizationId, onArtifact, onSaveAsCommand]
  );

  // ── Save only (no execution) ────────────────────────────────────────────
  const handleSaveOnly = useCallback(() => {
    if (!composition) return;
    onSaveAsCommand?.({
      name: composition.name,
      persona: composition.persona,
      tools: composition.selectedTools.map((t) => t.id),
      executionPlan: composition.executionPlan,
      prompt: composition.executionPrompt,
    });
  }, [composition, onSaveAsCommand]);

  // ── Cancel ────────────────────────────────────────────────────────────────
  const handleCancel = useCallback(() => {
    abortRef.current?.abort();
    setPhase("idle");
    setComposition(null);
    setCompositionPhase(null);
    setErrorMessage(null);
    setAgentSteps([]);
  }, []);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm"
        onClick={(e) => {
          if (e.target === e.currentTarget && phase === "idle") onClose();
        }}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          transition={{ type: "spring", stiffness: 400, damping: 30 }}
          className="w-full max-w-2xl bg-card border border-border-subtle rounded-2xl shadow-2xl overflow-hidden"
        >
          {/* ── Header ─────────────────────────────────────────────────── */}
          <div className="px-5 pt-4 pb-3 border-b border-border-subtle flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span className="text-lg">✨</span>
              <div>
                <h3 className="text-sm font-semibold text-foreground">
                  Create Agent
                </h3>
                <p className="text-[11px] text-muted mt-0.5">
                  Describe what you need — we'll compose an agent on the fly
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-md text-muted hover:text-foreground hover:bg-surface-hover transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* ── Body ────────────────────────────────────────────────────── */}
          <div className="px-5 py-4 max-h-[70vh] overflow-y-auto space-y-4">
            {/* ─ Input Phase ─ */}
            {(phase === "idle" || phase === "error") && (
              <form onSubmit={handleCompose} className="space-y-3">
                <div>
                  <label className="text-[11px] font-medium text-muted mb-1.5 block">
                    What should this agent do?
                  </label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="e.g. Build me an agent that reads Jira tickets, analyzes the PR impact, and generates a release risk report..."
                    rows={4}
                    className="w-full text-sm bg-transparent border border-border-subtle rounded-lg px-3 py-2.5 resize-none focus:outline-none focus:ring-2 focus:ring-accent/40 placeholder:text-muted/40"
                    autoFocus
                  />
                </div>

                {errorMessage && (
                  <div className="text-xs text-danger bg-danger/10 rounded-lg px-3 py-2">
                    {errorMessage}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={!description.trim()}
                  className={cn(
                    "w-full px-4 py-2 text-sm font-medium rounded-lg transition-all",
                    description.trim()
                      ? "bg-accent text-white hover:bg-accent/90"
                      : "bg-accent/30 text-accent/50 cursor-not-allowed"
                  )}
                >
                  Compose Agent
                </button>
              </form>
            )}

            {/* ─ Composing Phase (animated progress) ─ */}
            {phase === "composing" && (
              <div className="space-y-3">
                <div className="text-xs text-muted font-medium mb-2">
                  Composing agent for: <span className="text-foreground/80">&ldquo;{description.slice(0, 80)}{description.length > 80 ? "..." : ""}&rdquo;</span>
                </div>
                <div className="space-y-1.5">
                  {COMPOSITION_PHASES.map((p) => {
                    const isActive = compositionPhase?.phase === p.phase;
                    const isPast = compositionPhase
                      ? COMPOSITION_PHASES.findIndex((x) => x.phase === compositionPhase.phase) >
                        COMPOSITION_PHASES.findIndex((x) => x.phase === p.phase)
                      : false;

                    return (
                      <motion.div
                        key={p.phase}
                        initial={{ opacity: 0.4 }}
                        animate={{
                          opacity: isActive || isPast ? 1 : 0.4,
                        }}
                        className={cn(
                          "flex items-center gap-2.5 px-3 py-1.5 rounded-lg text-xs transition-colors",
                          isActive && "bg-accent/10 text-accent",
                          isPast && "text-foreground/60",
                          !isActive && !isPast && "text-muted/50"
                        )}
                      >
                        <span className="text-sm">{isPast ? "✅" : p.icon}</span>
                        <span className="font-medium">{p.label}</span>
                        {isActive && (
                          <motion.span
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className="text-[10px] text-accent/70 ml-auto"
                          >
                            {compositionPhase?.detail}
                          </motion.span>
                        )}
                        {isActive && (
                          <span className="ml-1 w-3 h-3 border-2 border-accent/50 border-t-accent rounded-full animate-spin" />
                        )}
                      </motion.div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ─ Preview Phase ─ */}
            {(phase === "preview" || phase === "complete") && composition && (
              <div className="space-y-4">
                {/* Name + Complexity */}
                <div className="flex items-center gap-2">
                  <h4 className="text-sm font-semibold text-foreground">
                    {composition.name}
                  </h4>
                  <span
                    className={cn(
                      "px-2 py-0.5 rounded-full text-[10px] font-medium uppercase",
                      COMPLEXITY_COLORS[composition.complexity] || COMPLEXITY_COLORS.medium
                    )}
                  >
                    {composition.complexity}
                  </span>
                </div>

                {/* Persona */}
                <div className="text-xs text-foreground/70 leading-relaxed bg-surface/50 rounded-lg px-3 py-2">
                  {composition.persona}
                </div>

                {/* Tools */}
                <div>
                  <div className="text-[10px] font-semibold text-muted uppercase tracking-wider mb-1.5">
                    Selected Tools ({composition.selectedTools.length})
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {composition.selectedTools.map((tool) => (
                      <span
                        key={tool.id}
                        className="inline-flex items-center gap-1 px-2 py-0.5 bg-accent/10 text-accent rounded-md text-[11px] font-medium"
                        title={tool.description}
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-accent/60" />
                        {tool.name}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Gathering Params */}
                {composition.inferredGathering && composition.inferredGathering.length > 0 && (
                  <div>
                    <div className="text-[10px] font-semibold text-muted uppercase tracking-wider mb-1.5">
                      Parameters ({composition.inferredGathering.length})
                    </div>
                    <div className="space-y-1.5">
                      {composition.inferredGathering.map((param) => (
                        <div
                          key={param.id}
                          className="flex items-center gap-2 px-3 py-1.5 bg-surface/50 rounded-lg text-xs"
                        >
                          <span className="font-medium text-foreground/80">{param.label}</span>
                          <span className="text-[10px] text-muted px-1.5 py-0.5 bg-surface-hover rounded">
                            {param.type}
                          </span>
                          {param.required && (
                            <span className="text-[10px] text-danger">required</span>
                          )}
                          {param.description && (
                            <span className="text-[10px] text-muted ml-auto truncate max-w-[200px]">
                              {param.description}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Execution Plan */}
                <div>
                  <div className="text-[10px] font-semibold text-muted uppercase tracking-wider mb-1.5">
                    Execution Plan ({composition.executionPlan.length} steps)
                  </div>
                  <div className="space-y-1">
                    {composition.executionPlan.map((step, idx) => (
                      <div
                        key={idx}
                        className="flex items-start gap-2 text-xs text-foreground/70"
                      >
                        <span className="w-4 h-4 rounded-full bg-accent/15 text-accent text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                          {idx + 1}
                        </span>
                        <span>{step}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Prompt Preview */}
                <div>
                  <div className="text-[10px] font-semibold text-muted uppercase tracking-wider mb-1.5">
                    Execution Prompt
                  </div>
                  <div className="text-[11px] font-mono text-foreground/60 bg-surface/50 rounded-lg px-3 py-2 max-h-24 overflow-y-auto whitespace-pre-wrap">
                    {composition.executionPrompt}
                  </div>
                </div>
              </div>
            )}

            {/* ─ Executing Phase (agent steps timeline) ─ */}
            {phase === "executing" && (
              <div className="space-y-3">
                <div className="text-xs font-medium text-muted">
                  Executing {composition?.name}...
                </div>
                <div className="space-y-1.5">
                  {agentSteps.map((step) => (
                    <motion.div
                      key={step.stepNumber}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      className={cn(
                        "flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs",
                        step.status === "started" && "bg-accent/10 text-accent",
                        step.status === "completed" && "bg-green-500/10 text-green-700",
                        step.status === "failed" && "bg-red-500/10 text-red-700"
                      )}
                    >
                      {step.status === "started" && (
                        <span className="w-3 h-3 border-2 border-accent/50 border-t-accent rounded-full animate-spin shrink-0" />
                      )}
                      {step.status === "completed" && (
                        <svg className="w-3 h-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                      {step.status === "failed" && (
                        <svg className="w-3 h-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">{step.title}</div>
                        {step.content && (
                          <div className="text-[10px] opacity-70 truncate mt-0.5">{step.content}</div>
                        )}
                      </div>
                      {step.durationMs !== undefined && (
                        <span className="text-[10px] opacity-50 shrink-0">
                          {(step.durationMs / 1000).toFixed(1)}s
                        </span>
                      )}
                    </motion.div>
                  ))}
                </div>
              </div>
            )}

            {/* ─ Complete Phase ─ */}
            {phase === "complete" && executionNarrative && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-xs text-green-700 bg-green-500/10 rounded-lg px-3 py-2">
                  <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  <span className="font-medium">Execution complete</span>
                </div>
              </div>
            )}
          </div>

          {/* ── Footer Actions ──────────────────────────────────────────── */}
          <div className="px-5 py-3 border-t border-border-subtle flex items-center justify-between gap-2">
            {/* Left: Cancel/Close */}
            <button
              onClick={phase === "idle" || phase === "preview" || phase === "complete" || phase === "error" ? onClose : handleCancel}
              className="px-3 py-1.5 text-xs rounded-lg text-muted hover:text-foreground hover:bg-surface-hover transition-colors"
            >
              {phase === "composing" || phase === "executing" ? "Cancel" : "Close"}
            </button>

            {/* Right: Action buttons */}
            <div className="flex items-center gap-2">
              {/* Preview phase: Run Now, Run & Save, Save Only */}
              {phase === "preview" && composition && (
                <>
                  <button
                    onClick={handleSaveOnly}
                    className="px-3 py-1.5 text-xs font-medium rounded-lg text-foreground/70 border border-border-subtle hover:bg-surface-hover transition-all"
                  >
                    Save Only
                  </button>
                  <button
                    onClick={() => handleExecute(true)}
                    className="px-3 py-1.5 text-xs font-medium rounded-lg text-accent border border-accent/30 hover:bg-accent/10 transition-all"
                  >
                    Run & Save
                  </button>
                  <button
                    onClick={() => handleExecute(false)}
                    className="px-4 py-1.5 text-xs font-medium rounded-lg bg-accent text-white hover:bg-accent/90 transition-all"
                  >
                    Run Now
                  </button>
                </>
              )}

              {/* Complete phase: Save as Command, Done */}
              {phase === "complete" && composition && (
                <>
                  <button
                    onClick={handleSaveOnly}
                    className="px-3 py-1.5 text-xs font-medium rounded-lg text-accent border border-accent/30 hover:bg-accent/10 transition-all"
                  >
                    Save as Command
                  </button>
                  <button
                    onClick={onClose}
                    className="px-4 py-1.5 text-xs font-medium rounded-lg bg-accent text-white hover:bg-accent/90 transition-all"
                  >
                    Done
                  </button>
                </>
              )}

              {/* Error phase: Retry */}
              {phase === "error" && (
                <button
                  onClick={handleCompose}
                  disabled={!description.trim()}
                  className="px-4 py-1.5 text-xs font-medium rounded-lg bg-accent text-white hover:bg-accent/90 transition-all"
                >
                  Retry
                </button>
              )}
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
