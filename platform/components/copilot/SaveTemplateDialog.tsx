"use client";

/**
 * SaveTemplateDialog — Modal for saving an agent execution as a reusable command
 * ================================================================================
 *
 * Appears when the user clicks "Save as Command" in the ArtifactsPanel toolbar.
 * Collects: name, description, icon, category, prompt, optional gathering params.
 * POSTs to /api/templates to persist in agent_templates table.
 */

import { useState, useCallback, type FormEvent } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { GatheringParamBuilder } from "./GatheringParamBuilder";
import type { GatheringParam } from "./command-gathering";
import type { CreateTemplateRequest, GatheringSchema, AgentConfig } from "@/lib/templates/types";

// ── Types ──────────────────────────────────────────────────────────────────────

interface SaveTemplateDialogProps {
  /** The artifact that triggered the save */
  artifact: {
    id: string;
    title: string;
    content: string;
    service?: string;
    domainId?: string;
    rawData?: unknown;
  };
  /** Current organization ID */
  organizationId: string;
  /** Close the dialog */
  onClose: () => void;
  /** Called after successful save */
  onSaved?: () => void;
  /** Pre-filled agent composition data (from Agent Composer) */
  compositionData?: {
    name: string;
    persona: string;
    tools: string[];
    executionPlan: string[];
    prompt: string;
  };
}

const CATEGORIES = [
  "Custom",
  "Engineering",
  "Accounting",
  "Intelligence",
  "DevOps",
  "Security",
  "Data",
  "Product",
];

const ICON_OPTIONS = [
  "🔧", "🚀", "🧪", "📊", "⚡", "🔍", "📋", "🎯",
  "🛡️", "📐", "🧬", "💡", "🔗", "📦", "🤖", "✨",
];

// ── Component ──────────────────────────────────────────────────────────────────

export function SaveTemplateDialog({
  artifact,
  organizationId,
  onClose,
  onSaved,
  compositionData,
}: SaveTemplateDialogProps) {
  // Form state
  const [label, setLabel] = useState(compositionData?.name || artifact.title || "");
  const [description, setDescription] = useState(
    compositionData
      ? `Agent: ${compositionData.persona.slice(0, 100)}`
      : `Saved from ${artifact.service || "copilot"} execution`
  );
  const [icon, setIcon] = useState(
    ICON_OPTIONS[Math.floor(Math.random() * ICON_OPTIONS.length)]
  );
  const [category, setCategory] = useState("Custom");
  const [prompt, setPrompt] = useState(compositionData?.prompt || artifact.title || "");
  const [isPublic, setIsPublic] = useState(false);

  // Gathering params
  const [enableGathering, setEnableGathering] = useState(false);
  const [gatheringParams, setGatheringParams] = useState<GatheringParam[]>([]);

  // Submit state
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      if (!label.trim() || !description.trim() || !prompt.trim()) {
        setError("Name, description, and prompt are required.");
        return;
      }

      setSubmitting(true);
      setError(null);

      try {
        // Build gathering schema if params are defined
        let gatheringSchema: GatheringSchema | undefined;
        if (enableGathering && gatheringParams.length > 0) {
          const validParams = gatheringParams.filter((p) => p.label.trim());
          if (validParams.length > 0) {
            gatheringSchema = {
              params: validParams,
              confirmationMessage: `Ready to run ${label.trim()}? Confirm to proceed.`,
              gatheringPrompts: Object.fromEntries(
                validParams.map((p) => [
                  p.id,
                  p.description || `Please provide ${p.label}:`,
                ])
              ),
            };
          }
        }

        // Build agent config if we have composition data
        let agentConfig: AgentConfig | undefined;
        if (compositionData) {
          agentConfig = {
            persona: compositionData.persona,
            tools: compositionData.tools,
            executionPlan: compositionData.executionPlan,
          };
        }

        const body: CreateTemplateRequest & { orgId: string } = {
          orgId: organizationId,
          label: label.trim(),
          description: description.trim(),
          icon,
          prompt: prompt.trim(),
          category,
          gatheringSchema,
          agentConfig,
          sourceArtifactId: artifact.id,
          sourceDomainId: artifact.domainId,
          isPublic,
        };

        const res = await fetch("/api/templates", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });

        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || `HTTP ${res.status}`);
        }

        setSuccess(true);
        setTimeout(() => {
          onSaved?.();
          onClose();
        }, 1200);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to save");
      } finally {
        setSubmitting(false);
      }
    },
    [
      label, description, prompt, icon, category, isPublic,
      enableGathering, gatheringParams, compositionData,
      organizationId, artifact, onClose, onSaved,
    ]
  );

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm"
        onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          transition={{ type: "spring", stiffness: 400, damping: 30 }}
          className="w-full max-w-lg bg-card border border-border-subtle rounded-2xl shadow-2xl overflow-hidden"
        >
          {/* Header */}
          <div className="px-5 pt-4 pb-3 border-b border-border-subtle flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-foreground">
                Save as Command
              </h3>
              <p className="text-[11px] text-muted mt-0.5">
                Create a reusable slash command from this result
              </p>
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

          {/* Form */}
          <form onSubmit={handleSubmit} className="px-5 py-4 space-y-4 max-h-[70vh] overflow-y-auto">
            {/* Name + Icon */}
            <div className="flex gap-2">
              {/* Icon picker */}
              <div className="relative group">
                <button
                  type="button"
                  className="w-10 h-10 rounded-lg border border-border-subtle bg-surface flex items-center justify-center text-lg hover:border-accent/40 transition-colors"
                  title="Change icon"
                >
                  {icon}
                </button>
                <div className="absolute top-full mt-1 left-0 z-10 hidden group-hover:grid grid-cols-4 gap-1 p-2 bg-card border border-border-subtle rounded-lg shadow-xl">
                  {ICON_OPTIONS.map((ic) => (
                    <button
                      key={ic}
                      type="button"
                      onClick={() => setIcon(ic)}
                      className={cn(
                        "w-8 h-8 rounded flex items-center justify-center text-sm hover:bg-accent/10 transition-colors",
                        ic === icon && "bg-accent/15 ring-1 ring-accent/40"
                      )}
                    >
                      {ic}
                    </button>
                  ))}
                </div>
              </div>

              <input
                type="text"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="Command name..."
                className="flex-1 text-sm font-medium bg-transparent border border-border-subtle rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-accent/40"
                autoFocus
              />
            </div>

            {/* Command preview */}
            {label.trim() && (
              <div className="text-[11px] text-muted font-mono">
                /{label.trim().toLowerCase().replace(/[\s/]+/g, "-")}
              </div>
            )}

            {/* Description */}
            <div>
              <label className="text-[11px] font-medium text-muted mb-1 block">
                Description
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What does this command do?"
                rows={2}
                className="w-full text-xs bg-transparent border border-border-subtle rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-accent/40"
              />
            </div>

            {/* Category */}
            <div>
              <label className="text-[11px] font-medium text-muted mb-1 block">
                Category
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full text-xs bg-transparent border border-border-subtle rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-accent/40"
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            {/* Prompt template */}
            <div>
              <label className="text-[11px] font-medium text-muted mb-1 block">
                Prompt Template
              </label>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="The prompt sent to the copilot when this command is executed..."
                rows={3}
                className="w-full text-xs font-mono bg-transparent border border-border-subtle rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-accent/40"
              />
            </div>

            {/* Gathering toggle */}
            <div className="space-y-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={enableGathering}
                  onChange={(e) => setEnableGathering(e.target.checked)}
                  className="w-3.5 h-3.5 rounded accent-accent"
                />
                <span className="text-xs text-foreground/80">
                  Add interactive parameters
                </span>
                <span className="text-[10px] text-muted">
                  (collect input before execution)
                </span>
              </label>

              {enableGathering && (
                <GatheringParamBuilder
                  params={gatheringParams}
                  onChange={setGatheringParams}
                />
              )}
            </div>

            {/* Agent composition info (if from composer) */}
            {compositionData && (
              <div className="rounded-lg border border-accent/20 bg-accent/5 p-3 space-y-1.5">
                <div className="text-[10px] font-semibold text-accent uppercase tracking-wider">
                  Composed Agent
                </div>
                <div className="text-[11px] text-foreground/70">
                  <span className="font-medium">Tools:</span>{" "}
                  {compositionData.tools.join(", ")}
                </div>
                <div className="text-[11px] text-foreground/70">
                  <span className="font-medium">Steps:</span>{" "}
                  {compositionData.executionPlan.length} execution steps
                </div>
              </div>
            )}

            {/* Public toggle */}
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={isPublic}
                onChange={(e) => setIsPublic(e.target.checked)}
                className="w-3.5 h-3.5 rounded accent-accent"
              />
              <span className="text-xs text-foreground/80">
                Make public
              </span>
              <span className="text-[10px] text-muted">
                (visible to all NexusBrain orgs)
              </span>
            </label>

            {/* Error */}
            {error && (
              <div className="text-xs text-danger bg-danger/10 rounded-lg px-3 py-2">
                {error}
              </div>
            )}

            {/* Success */}
            {success && (
              <div className="text-xs text-green-600 bg-green-500/10 rounded-lg px-3 py-2 flex items-center gap-2">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                Command saved! It will appear in the / menu.
              </div>
            )}
          </form>

          {/* Footer */}
          <div className="px-5 py-3 border-t border-border-subtle flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-xs rounded-lg text-muted hover:text-foreground hover:bg-surface-hover transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit as any}
              disabled={submitting || success || !label.trim()}
              className={cn(
                "px-4 py-1.5 text-xs font-medium rounded-lg transition-all",
                submitting || success
                  ? "bg-accent/30 text-accent/50 cursor-not-allowed"
                  : "bg-accent text-white hover:bg-accent/90"
              )}
            >
              {submitting ? "Saving..." : success ? "Saved!" : "Save Command"}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
