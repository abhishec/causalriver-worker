"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

type CreationMode = "describe" | "blank";

interface CreateAgentModalProps {
  workspaceId: string;
  onClose: () => void;
  onCreated: (templateId: string) => void;
}

export function CreateAgentModal({ workspaceId, onClose, onCreated }: CreateAgentModalProps) {
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);
  useEffect(() => { setPortalTarget(document.body); }, []);
  const [mode, setMode] = useState<CreationMode>("describe");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleDescribe() {
    if (!description.trim()) return;
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/agent-studio/compose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: description.trim(), workspaceId }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to compose agent");
      }

      const data = await res.json();
      onCreated(data.templateId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  async function handleBlank() {
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: "New Agent",
          description: "A custom agent",
          icon: "🤖",
          prompt: "You are a helpful agent.",
          category: "Custom",
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to create agent");
      }

      const data = await res.json();
      onCreated(data.template.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  if (!portalTarget) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-card border border-border rounded-2xl shadow-xl w-full max-w-lg mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border-subtle">
          <h2 className="text-lg font-semibold text-foreground">New Agent</h2>
          <button onClick={onClose} className="p-1 rounded-md hover:bg-surface-hover text-muted transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Mode tabs */}
        <div className="flex border-b border-border-subtle">
          <button
            onClick={() => setMode("describe")}
            className={cn(
              "flex-1 px-4 py-3 text-sm font-medium transition-colors border-b-2",
              mode === "describe"
                ? "text-accent border-accent"
                : "text-muted-foreground border-transparent hover:text-foreground"
            )}
          >
            Describe it
          </button>
          <button
            onClick={() => setMode("blank")}
            className={cn(
              "flex-1 px-4 py-3 text-sm font-medium transition-colors border-b-2",
              mode === "blank"
                ? "text-accent border-accent"
                : "text-muted-foreground border-transparent hover:text-foreground"
            )}
          >
            Blank Agent
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {mode === "describe" ? (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-foreground mb-1.5">
                  What should this agent do?
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="e.g., Review PRs for our React codebase, check for accessibility violations and proper error boundaries..."
                  className="w-full h-28 px-3 py-2 text-sm bg-background border border-border-subtle rounded-lg resize-none focus:outline-none focus:ring-1 focus:ring-accent/40 text-foreground placeholder:text-muted"
                  autoFocus
                />
                <p className="text-[10px] text-muted mt-1.5">
                  Describe in natural language. The AI will select tools, create a persona, and set up gathering parameters.
                </p>
              </div>

              {error && (
                <div className="text-xs text-red-400 bg-red-500/10 px-3 py-2 rounded-lg">{error}</div>
              )}

              <button
                onClick={handleDescribe}
                disabled={loading || !description.trim()}
                className="w-full px-4 py-2.5 bg-accent text-white text-sm font-medium rounded-lg hover:bg-accent/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? "Composing agent..." : "Compose Agent"}
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Start with a blank agent and configure everything manually — persona, tools, rules, and gathering parameters.
              </p>

              {error && (
                <div className="text-xs text-red-400 bg-red-500/10 px-3 py-2 rounded-lg">{error}</div>
              )}

              <button
                onClick={handleBlank}
                disabled={loading}
                className="w-full px-4 py-2.5 bg-accent text-white text-sm font-medium rounded-lg hover:bg-accent/90 transition-colors disabled:opacity-50"
              >
                {loading ? "Creating..." : "Create Blank Agent"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>,
    portalTarget
  );
}
