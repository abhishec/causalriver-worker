"use client";

import { useState } from "react";

interface SoulTabProps {
  persona: string;
  executionPlan: string[];
  prompt: string;
  onPersonaChange: (v: string) => void;
  onExecutionPlanChange: (v: string[]) => void;
  onPromptChange: (v: string) => void;
  readOnly?: boolean;
}

export function SoulTab({
  persona,
  executionPlan,
  prompt,
  onPersonaChange,
  onExecutionPlanChange,
  onPromptChange,
  readOnly,
}: SoulTabProps) {
  const [newStep, setNewStep] = useState("");

  function addStep() {
    if (!newStep.trim()) return;
    onExecutionPlanChange([...executionPlan, newStep.trim()]);
    setNewStep("");
  }

  function removeStep(index: number) {
    onExecutionPlanChange(executionPlan.filter((_, i) => i !== index));
  }

  function moveStep(index: number, direction: -1 | 1) {
    const newPlan = [...executionPlan];
    const target = index + direction;
    if (target < 0 || target >= newPlan.length) return;
    [newPlan[index], newPlan[target]] = [newPlan[target], newPlan[index]];
    onExecutionPlanChange(newPlan);
  }

  return (
    <div className="space-y-6">
      {/* Persona */}
      <div>
        <label className="block text-xs font-medium text-foreground mb-1.5">
          Agent Personality
        </label>
        <p className="text-[10px] text-muted mb-2">
          The persona defines who this agent is — its expertise, tone, and approach.
        </p>
        <textarea
          value={persona}
          onChange={(e) => onPersonaChange(e.target.value)}
          placeholder="You are a senior code reviewer who specializes in..."
          className="w-full h-32 px-3 py-2 text-sm bg-background border border-border-subtle rounded-lg resize-none focus:outline-none focus:ring-1 focus:ring-accent/40 text-foreground placeholder:text-muted"
          readOnly={readOnly}
        />
      </div>

      {/* Execution Prompt */}
      <div>
        <label className="block text-xs font-medium text-foreground mb-1.5">
          Execution Prompt Template
        </label>
        <p className="text-[10px] text-muted mb-2">
          {"The prompt sent when running this agent. Use {{param_id}} for gathering params."}
        </p>
        <textarea
          value={prompt}
          onChange={(e) => onPromptChange(e.target.value)}
          placeholder="Review the code changes and identify..."
          className="w-full h-24 px-3 py-2 text-sm bg-background border border-border-subtle rounded-lg resize-none focus:outline-none focus:ring-1 focus:ring-accent/40 text-foreground placeholder:text-muted font-mono text-xs"
          readOnly={readOnly}
        />
      </div>

      {/* Execution Plan */}
      <div>
        <label className="block text-xs font-medium text-foreground mb-1.5">
          Execution Plan
        </label>
        <p className="text-[10px] text-muted mb-2">
          Step-by-step plan shown to users during execution.
        </p>
        <div className="space-y-1.5">
          {executionPlan.map((step, i) => (
            <div key={i} className="flex items-center gap-2 group">
              <span className="text-[10px] text-muted w-5 text-right shrink-0">{i + 1}.</span>
              <input
                value={step}
                onChange={(e) => {
                  const newPlan = [...executionPlan];
                  newPlan[i] = e.target.value;
                  onExecutionPlanChange(newPlan);
                }}
                className="flex-1 px-2.5 py-1.5 text-xs bg-background border border-border-subtle rounded-lg focus:outline-none focus:ring-1 focus:ring-accent/40 text-foreground"
                readOnly={readOnly}
              />
              {!readOnly && (
                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => moveStep(i, -1)} className="p-1 text-muted hover:text-foreground" title="Move up">
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5" /></svg>
                  </button>
                  <button onClick={() => moveStep(i, 1)} className="p-1 text-muted hover:text-foreground" title="Move down">
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" /></svg>
                  </button>
                  <button onClick={() => removeStep(i)} className="p-1 text-muted hover:text-red-400" title="Remove">
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>

        {!readOnly && (
          <div className="flex items-center gap-2 mt-2">
            <input
              value={newStep}
              onChange={(e) => setNewStep(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addStep()}
              placeholder="Add a step..."
              className="flex-1 px-2.5 py-1.5 text-xs bg-background border border-border-subtle rounded-lg focus:outline-none focus:ring-1 focus:ring-accent/40 text-foreground placeholder:text-muted"
            />
            <button
              onClick={addStep}
              disabled={!newStep.trim()}
              className="px-2.5 py-1.5 text-xs font-medium text-accent bg-accent/10 rounded-lg hover:bg-accent/20 transition-colors disabled:opacity-50"
            >
              Add
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
