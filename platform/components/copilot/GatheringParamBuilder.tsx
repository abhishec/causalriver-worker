"use client";

/**
 * GatheringParamBuilder — Visual editor for interactive command parameters
 * =========================================================================
 *
 * Used inside SaveTemplateDialog to let users define gathering params for
 * their custom commands. Each param row has: label, type, required, default.
 */

import { useState, useCallback } from "react";
import type { GatheringParam } from "./command-gathering";
import { cn } from "@/lib/utils";

// ── Types ──────────────────────────────────────────────────────────────────────

interface GatheringParamBuilderProps {
  params: GatheringParam[];
  onChange: (params: GatheringParam[]) => void;
}

const PARAM_TYPES: { value: GatheringParam["type"]; label: string }[] = [
  { value: "text", label: "Text" },
  { value: "number", label: "Number" },
  { value: "select", label: "Select" },
  { value: "chips", label: "Chips" },
  { value: "date", label: "Date" },
  { value: "date_range", label: "Date Range" },
  { value: "file", label: "File" },
];

// ── Component ──────────────────────────────────────────────────────────────────

export function GatheringParamBuilder({ params, onChange }: GatheringParamBuilderProps) {
  const addParam = useCallback(() => {
    const newParam: GatheringParam = {
      id: `param_${Date.now()}`,
      label: "",
      type: "text",
      required: true,
    };
    onChange([...params, newParam]);
  }, [params, onChange]);

  const updateParam = useCallback(
    (index: number, updates: Partial<GatheringParam>) => {
      const updated = [...params];
      updated[index] = { ...updated[index], ...updates } as GatheringParam;
      // Auto-generate ID from label
      if (updates.label !== undefined) {
        updated[index].id = updates.label
          .toLowerCase()
          .replace(/[^a-z0-9\s]/g, "")
          .replace(/\s+/g, "_")
          .slice(0, 30) || `param_${index}`;
      }
      onChange(updated);
    },
    [params, onChange]
  );

  const removeParam = useCallback(
    (index: number) => {
      onChange(params.filter((_, i) => i !== index));
    },
    [params, onChange]
  );

  const [expandedOptions, setExpandedOptions] = useState<number | null>(null);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-foreground/80">
          Parameters ({params.length})
        </span>
        <button
          type="button"
          onClick={addParam}
          className="px-2 py-1 text-[11px] font-medium rounded-md bg-accent/10 text-accent hover:bg-accent/20 transition-colors"
        >
          + Add Parameter
        </button>
      </div>

      {params.length === 0 && (
        <p className="text-[11px] text-muted text-center py-3">
          No parameters defined. Click &ldquo;+ Add Parameter&rdquo; to collect input before execution.
        </p>
      )}

      {params.map((param, idx) => (
        <div
          key={idx}
          className="rounded-lg border border-border-subtle bg-surface/50 p-3 space-y-2"
        >
          <div className="flex items-center gap-2">
            {/* Label */}
            <input
              type="text"
              value={param.label}
              onChange={(e) => updateParam(idx, { label: e.target.value })}
              placeholder="Parameter name..."
              className="flex-1 text-xs bg-transparent border border-border-subtle rounded-md px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-accent/50"
            />

            {/* Type */}
            <select
              value={param.type}
              onChange={(e) =>
                updateParam(idx, {
                  type: e.target.value as GatheringParam["type"],
                })
              }
              className="text-xs bg-transparent border border-border-subtle rounded-md px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-accent/50"
            >
              {PARAM_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>

            {/* Required toggle */}
            <label className="flex items-center gap-1 text-[10px] text-muted cursor-pointer">
              <input
                type="checkbox"
                checked={param.required}
                onChange={(e) =>
                  updateParam(idx, { required: e.target.checked })
                }
                className="w-3 h-3 rounded accent-accent"
              />
              Req
            </label>

            {/* Remove */}
            <button
              type="button"
              onClick={() => removeParam(idx)}
              className="p-1 rounded text-muted hover:text-danger hover:bg-danger/10 transition-colors"
              title="Remove parameter"
            >
              <svg
                className="w-3.5 h-3.5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>

          {/* Default value */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-muted w-14 shrink-0">Default:</span>
            <input
              type="text"
              value={(param.defaultValue as string) || ""}
              onChange={(e) =>
                updateParam(idx, {
                  defaultValue: e.target.value || undefined,
                })
              }
              placeholder="Optional default value"
              className="flex-1 text-[11px] bg-transparent border border-border-subtle rounded-md px-2 py-1 focus:outline-none focus:ring-1 focus:ring-accent/50"
            />
          </div>

          {/* Static options for select/chips */}
          {(param.type === "select" || param.type === "chips") && (
            <div>
              <button
                type="button"
                onClick={() =>
                  setExpandedOptions(expandedOptions === idx ? null : idx)
                }
                className="text-[10px] text-accent hover:underline"
              >
                {expandedOptions === idx ? "Hide" : "Edit"} options (
                {param.staticOptions?.length || 0})
              </button>
              {expandedOptions === idx && (
                <StaticOptionsEditor
                  options={param.staticOptions || []}
                  onChange={(opts) =>
                    updateParam(idx, { staticOptions: opts })
                  }
                />
              )}
            </div>
          )}

          {/* Description */}
          <input
            type="text"
            value={param.description || ""}
            onChange={(e) =>
              updateParam(idx, {
                description: e.target.value || undefined,
              })
            }
            placeholder="Help text (optional)"
            className="w-full text-[10px] bg-transparent border border-border-subtle rounded-md px-2 py-1 focus:outline-none focus:ring-1 focus:ring-accent/50 text-muted"
          />
        </div>
      ))}
    </div>
  );
}

// ── Sub-component: Static Options Editor ───────────────────────────────────────

function StaticOptionsEditor({
  options,
  onChange,
}: {
  options: { value: string; label: string; icon?: string }[];
  onChange: (opts: { value: string; label: string; icon?: string }[]) => void;
}) {
  const addOption = () => {
    onChange([...options, { value: "", label: "" }]);
  };

  const updateOption = (
    index: number,
    updates: Partial<{ value: string; label: string }>
  ) => {
    const updated = [...options];
    updated[index] = { ...updated[index], ...updates };
    // Auto-sync value from label
    if (updates.label !== undefined && !updated[index].value) {
      updated[index].value = updates.label
        .toLowerCase()
        .replace(/\s+/g, "_")
        .replace(/[^a-z0-9_]/g, "");
    }
    onChange(updated);
  };

  const removeOption = (index: number) => {
    onChange(options.filter((_, i) => i !== index));
  };

  return (
    <div className="mt-1.5 space-y-1.5 pl-2 border-l-2 border-accent/20">
      {options.map((opt, idx) => (
        <div key={idx} className="flex items-center gap-1.5">
          <input
            type="text"
            value={opt.label}
            onChange={(e) => updateOption(idx, { label: e.target.value })}
            placeholder="Label"
            className="flex-1 text-[10px] bg-transparent border border-border-subtle rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-accent/50"
          />
          <input
            type="text"
            value={opt.value}
            onChange={(e) => updateOption(idx, { value: e.target.value })}
            placeholder="Value"
            className="w-20 text-[10px] bg-transparent border border-border-subtle rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-accent/50"
          />
          <button
            type="button"
            onClick={() => removeOption(idx)}
            className="text-muted hover:text-danger text-[10px]"
          >
            x
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={addOption}
        className="text-[10px] text-accent hover:underline"
      >
        + Add option
      </button>
    </div>
  );
}
