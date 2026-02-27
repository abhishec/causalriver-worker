"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { ALL_WORKFLOW_TEMPLATES } from "@/lib/workflows/templates";
import type { WorkflowTemplate } from "@/lib/workflows/types";

type Tab = "chain" | "template";

interface CreateWorkflowModalProps {
  workspaceId: string;
  /** Pre-fill agent types from copilot smart suggestion (e.g. ["code-reviewer", "test-generator"]) */
  prefillSteps?: string[];
  onClose: () => void;
  onCreated: (workflowId: string) => void;
}

interface StepEntry {
  agent_template_id: string;
  label: string;
  parallel_group?: string;
}

export function CreateWorkflowModal({ workspaceId, prefillSteps, onClose, onCreated }: CreateWorkflowModalProps) {
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);
  useEffect(() => { setPortalTarget(document.body); }, []);
  const [tab, setTab] = useState<Tab>(prefillSteps?.length ? "chain" : "template");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [steps, setSteps] = useState<StepEntry[]>([]);
  const [templates, setTemplates] = useState<Array<{ id: string; label: string; agent_type?: string }>>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [prefillApplied, setPrefillApplied] = useState(false);

  // Load available agent templates for the chain tab
  useEffect(() => {
    fetch("/api/templates")
      .then(res => res.json())
      .then(data => {
        if (data.templates) {
          const tpls = data.templates.map((t: any) => ({
            id: t.id,
            label: t.label,
            agent_type: t.agent_type || t.command_id,
          }));
          setTemplates(tpls);
        }
      })
      .catch(() => {});
  }, []);

  // Prefill steps from copilot agent sequence once templates load
  useEffect(() => {
    if (prefillApplied || !prefillSteps?.length || templates.length === 0) return;
    setPrefillApplied(true);

    const prefilled: StepEntry[] = prefillSteps.map(agentType => {
      // Match by agent_type, label, or id
      const match = templates.find(t =>
        t.agent_type === agentType ||
        t.label === agentType ||
        t.label.toLowerCase().replace(/[\s/]+/g, "-") === agentType.toLowerCase()
      );
      return {
        agent_template_id: match?.id || templates[0]?.id || "",
        label: match?.label || agentType,
      };
    });

    if (prefilled.length > 0) {
      setSteps(prefilled);
      setName(prefillSteps.map(s => s.replace(/-/g, " ")).join(" + ").slice(0, 50));
    }
  }, [prefillSteps, templates, prefillApplied]);

  function addStep() {
    if (templates.length === 0) return;
    setSteps(prev => [...prev, {
      agent_template_id: templates[0]?.id || "",
      label: templates[0]?.label || "Step",
    }]);
  }

  function removeStep(index: number) {
    setSteps(prev => prev.filter((_, i) => i !== index));
  }

  function updateStep(index: number, patch: Partial<StepEntry>) {
    setSteps(prev => {
      const next = [...prev];
      next[index] = { ...next[index], ...patch };
      return next;
    });
  }

  async function handleCreateFromChain() {
    if (steps.length < 2 || !name.trim()) return;
    setLoading(true);
    setError("");

    try {
      const workflowSteps = steps.map((s, i) => ({
        id: `step-${i + 1}`,
        order: i + 1,
        agent_template_id: s.agent_template_id,
        label: s.label,
        input_mapping: i === 0 ? "original_input" : "previous_output",
        parallel_group: s.parallel_group || undefined,
        failure_behavior: "stop",
        approval_required: false,
      }));

      const res = await fetch("/api/workflows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), description: description.trim(), steps: workflowSteps }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to create workflow");
      }

      const data = await res.json();
      onCreated(data.workflow.id);
    } catch (err) {
      setError("Workflow creation failed — check your connection and try again");
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateFromTemplate(template: WorkflowTemplate) {
    setLoading(true);
    setError("");

    try {
      const workflowSteps = template.steps.map((s, i) => ({
        id: `step-${i + 1}`,
        ...s,
      }));

      const res = await fetch("/api/workflows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim() || template.name,
          description: template.description,
          steps: workflowSteps,
          service_vertical: template.service_vertical,
          is_template: false,
          template_source: template.id,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to create workflow");
      }

      const data = await res.json();
      onCreated(data.workflow.id);
    } catch (err) {
      setError("Workflow creation failed — check your connection and try again");
    } finally {
      setLoading(false);
    }
  }

  if (!portalTarget) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-card border border-border rounded-2xl shadow-xl w-full max-w-2xl mx-4 max-h-[85vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border-subtle shrink-0">
          <h2 className="text-lg font-semibold text-foreground">New Workflow</h2>
          <button onClick={onClose} aria-label="Close dialog" className="p-1 rounded-md hover:bg-surface-hover text-muted transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-border-subtle shrink-0">
          <button
            onClick={() => setTab("template")}
            className={cn(
              "flex-1 px-4 py-3 text-sm font-medium transition-colors border-b-2",
              tab === "template" ? "text-accent border-accent" : "text-muted-foreground border-transparent hover:text-foreground"
            )}
          >
            From Template
          </button>
          <button
            onClick={() => setTab("chain")}
            className={cn(
              "flex-1 px-4 py-3 text-sm font-medium transition-colors border-b-2",
              tab === "chain" ? "text-accent border-accent" : "text-muted-foreground border-transparent hover:text-foreground"
            )}
          >
            Chain Agents
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto flex-1">
          {error && (
            <div className="text-xs text-red-400 bg-red-500/10 px-3 py-2 rounded-lg mb-4">{error}</div>
          )}

          {tab === "template" ? (
            <div className="space-y-3">
              <div className="mb-4">
                <label className="block text-xs font-medium text-foreground mb-1.5">Workflow Name (optional)</label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Uses template name if empty"
                  className="w-full px-3 py-2 text-sm bg-background border border-border-subtle rounded-lg focus:outline-none focus:ring-1 focus:ring-accent/40 text-foreground placeholder:text-muted"
                />
              </div>

              {ALL_WORKFLOW_TEMPLATES.map(template => (
                <button
                  key={template.id}
                  onClick={() => handleCreateFromTemplate(template)}
                  disabled={loading}
                  className="w-full text-left bg-background border border-border-subtle rounded-xl px-4 py-3 hover:border-border hover:shadow-sm transition-all disabled:opacity-50"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{template.icon}</span>
                      <div>
                        <div className="text-sm font-medium text-foreground">{template.name}</div>
                        <div className="text-[10px] text-muted-foreground">{template.description}</div>
                      </div>
                    </div>
                    <span className="text-[10px] text-muted px-1.5 py-0.5 bg-surface-hover rounded">
                      {template.steps.length} steps
                    </span>
                  </div>
                  {/* Step preview */}
                  <div className="flex items-center gap-1 mt-2 overflow-x-auto">
                    {template.steps.map((step, i) => (
                      <div key={i} className="flex items-center gap-1 shrink-0">
                        <span className="text-[9px] px-1.5 py-0.5 bg-accent/5 text-accent rounded">{step.label}</span>
                        {i < template.steps.length - 1 && (
                          <span className="text-[10px] text-muted">→</span>
                        )}
                      </div>
                    ))}
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-foreground mb-1.5">Workflow Name</label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="My Custom Pipeline"
                  className="w-full px-3 py-2 text-sm bg-background border border-border-subtle rounded-lg focus:outline-none focus:ring-1 focus:ring-accent/40 text-foreground placeholder:text-muted"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-foreground mb-1.5">Description</label>
                <input
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="What this workflow does..."
                  className="w-full px-3 py-2 text-sm bg-background border border-border-subtle rounded-lg focus:outline-none focus:ring-1 focus:ring-accent/40 text-foreground placeholder:text-muted"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-foreground mb-2">Steps (min 2)</label>
                <div className="space-y-2">
                  {steps.map((step, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <span className="text-xs text-muted w-6 text-right">#{i + 1}</span>
                      <select
                        value={step.agent_template_id}
                        onChange={(e) => {
                          const tpl = templates.find(t => t.id === e.target.value);
                          updateStep(i, {
                            agent_template_id: e.target.value,
                            label: tpl?.label || step.label,
                          });
                        }}
                        className="flex-1 px-2.5 py-1.5 text-xs bg-background border border-border-subtle rounded-lg focus:outline-none text-foreground"
                      >
                        {templates.map(t => (
                          <option key={t.id} value={t.id}>{t.label}</option>
                        ))}
                      </select>
                      <button
                        onClick={() => removeStep(i)}
                        className="p-1 text-muted hover:text-red-400 transition-colors"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
                <button
                  onClick={addStep}
                  className="mt-2 px-3 py-1.5 text-xs font-medium text-accent bg-accent/10 rounded-lg hover:bg-accent/20 transition-colors"
                >
                  + Add Step
                </button>
              </div>

              <button
                onClick={handleCreateFromChain}
                disabled={loading || steps.length < 2 || !name.trim()}
                className="w-full px-4 py-2.5 bg-accent text-white text-sm font-medium rounded-lg hover:bg-accent/90 transition-colors disabled:opacity-50"
              >
                {loading ? "Creating..." : "Create Workflow"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>,
    portalTarget
  );
}
