"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import type { GatheringSchema } from "@/lib/templates/types";
import type { GatheringParam } from "@/components/copilot/command-gathering";

interface GatheringTabProps {
  schema: GatheringSchema | null;
  onChange: (schema: GatheringSchema | null) => void;
  readOnly?: boolean;
}

const PARAM_TYPES = ["text", "number", "select", "date", "chips", "textarea", "gl_check"] as const;

export function GatheringTab({ schema, onChange, readOnly }: GatheringTabProps) {
  const params = schema?.params || [];

  function addParam() {
    const newParam: GatheringParam = {
      id: `param_${Date.now()}`,
      label: "New Parameter",
      type: "text",
      required: true,
      description: "",
    };
    const newSchema: GatheringSchema = {
      params: [...params, newParam],
      confirmationMessage: schema?.confirmationMessage || "Ready to run?",
      gatheringPrompts: schema?.gatheringPrompts || {},
    };
    onChange(newSchema);
  }

  function updateParam(index: number, patch: Partial<GatheringParam>) {
    const newParams = [...params];
    newParams[index] = { ...newParams[index], ...patch };
    onChange({
      ...schema!,
      params: newParams,
    });
  }

  function removeParam(index: number) {
    const newParams = params.filter((_, i) => i !== index);
    if (newParams.length === 0) {
      onChange(null);
    } else {
      onChange({ ...schema!, params: newParams });
    }
  }

  function updateConfirmation(msg: string) {
    onChange({
      params: schema?.params || [],
      confirmationMessage: msg,
      gatheringPrompts: schema?.gatheringPrompts || {},
    });
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center justify-between mb-2">
          <div>
            <h3 className="text-xs font-medium text-foreground">Input Parameters</h3>
            <p className="text-[10px] text-muted mt-0.5">
              Define what information the agent needs before running.
            </p>
          </div>
          {!readOnly && (
            <button
              onClick={addParam}
              className="px-2.5 py-1 text-[10px] font-medium text-accent bg-accent/10 rounded-lg hover:bg-accent/20 transition-colors"
            >
              + Add Parameter
            </button>
          )}
        </div>

        {params.length === 0 ? (
          <div className="text-center py-8 text-xs text-muted-foreground">
            No parameters defined. This agent will run without asking for input.
          </div>
        ) : (
          <div className="space-y-3">
            {params.map((param, i) => (
              <div key={param.id} className="bg-background border border-border-subtle rounded-lg p-3">
                <div className="flex items-start gap-3">
                  <div className="flex-1 grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] text-muted mb-1">Label</label>
                      <input
                        value={param.label}
                        onChange={(e) => updateParam(i, { label: e.target.value })}
                        className="w-full px-2 py-1 text-xs bg-card border border-border-subtle rounded focus:outline-none focus:ring-1 focus:ring-accent/40 text-foreground"
                        readOnly={readOnly}
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-muted mb-1">ID</label>
                      <input
                        value={param.id}
                        onChange={(e) => updateParam(i, { id: e.target.value })}
                        className="w-full px-2 py-1 text-xs bg-card border border-border-subtle rounded focus:outline-none focus:ring-1 focus:ring-accent/40 text-foreground font-mono"
                        readOnly={readOnly}
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-muted mb-1">Type</label>
                      <select
                        value={param.type}
                        onChange={(e) => updateParam(i, { type: e.target.value as any })}
                        className="w-full px-2 py-1 text-xs bg-card border border-border-subtle rounded focus:outline-none focus:ring-1 focus:ring-accent/40 text-foreground"
                        disabled={readOnly}
                      >
                        {PARAM_TYPES.map(t => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                      </select>
                    </div>
                    <div className="flex items-end gap-3">
                      <label className="flex items-center gap-1.5 text-[10px] text-muted">
                        <input
                          type="checkbox"
                          checked={param.required}
                          onChange={(e) => updateParam(i, { required: e.target.checked })}
                          className="rounded border-border-subtle"
                          disabled={readOnly}
                        />
                        Required
                      </label>
                    </div>
                  </div>
                  {!readOnly && (
                    <button
                      onClick={() => removeParam(i)}
                      className="p-1.5 text-muted hover:text-red-400 transition-colors shrink-0"
                      title="Remove parameter"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                      </svg>
                    </button>
                  )}
                </div>
                <div className="mt-2">
                  <label className="block text-[10px] text-muted mb-1">Description</label>
                  <input
                    value={param.description || ""}
                    onChange={(e) => updateParam(i, { description: e.target.value })}
                    placeholder="Explain what this parameter is for..."
                    className="w-full px-2 py-1 text-xs bg-card border border-border-subtle rounded focus:outline-none focus:ring-1 focus:ring-accent/40 text-foreground placeholder:text-muted"
                    readOnly={readOnly}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Confirmation Message */}
      {params.length > 0 && (
        <div>
          <label className="block text-xs font-medium text-foreground mb-1.5">
            Confirmation Message
          </label>
          <input
            value={schema?.confirmationMessage || ""}
            onChange={(e) => updateConfirmation(e.target.value)}
            placeholder="Ready to run the agent with these parameters?"
            className="w-full px-3 py-2 text-sm bg-background border border-border-subtle rounded-lg focus:outline-none focus:ring-1 focus:ring-accent/40 text-foreground placeholder:text-muted"
            readOnly={readOnly}
          />
        </div>
      )}
    </div>
  );
}
