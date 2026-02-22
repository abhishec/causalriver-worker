"use client";

import { cn } from "@/lib/utils";
import type { AgentConfig } from "@/lib/templates/types";

interface SettingsTabProps {
  config: AgentConfig;
  category: string;
  serviceVertical: string;
  onChange: (patch: Partial<AgentConfig>) => void;
  onCategoryChange: (v: string) => void;
  readOnly?: boolean;
}

const CATEGORIES = ["Custom", "Code Intelligence", "Delivery Intelligence", "Test Intelligence", "Observability", "Data Intelligence", "Accounting", "Compliance", "Quality Assurance", "Intelligence"];
const SERVICE_VERTICALS = [
  { id: "seaas", label: "SE-aaS (Engineering)" },
  { id: "aas", label: "AAAS (Accounting)" },
  { id: "general", label: "General" },
];
const AUTONOMY_LEVELS = [
  { id: "supervised", label: "Supervised", desc: "Always requires human approval" },
  { id: "semi-autonomous", label: "Semi-Autonomous", desc: "Auto-executes when confidence is high" },
  { id: "autonomous", label: "Autonomous", desc: "Always auto-executes (use with caution)" },
];

export function SettingsTab({ config, category, serviceVertical, onChange, onCategoryChange, readOnly }: SettingsTabProps) {
  const threshold = config.auto_execute_threshold ?? 0.8;

  return (
    <div className="space-y-6">
      {/* Service Vertical */}
      <div>
        <label className="block text-xs font-medium text-foreground mb-1.5">Service Vertical</label>
        <p className="text-[10px] text-muted mb-2">Which service this agent belongs to — affects where it appears.</p>
        <div className="flex gap-2">
          {SERVICE_VERTICALS.map(sv => (
            <button
              key={sv.id}
              onClick={() => !readOnly && onChange({ service_vertical: sv.id as any })}
              className={cn(
                "px-3 py-1.5 text-xs font-medium rounded-lg border transition-all",
                serviceVertical === sv.id
                  ? "bg-accent/10 text-accent border-accent/20"
                  : "text-muted-foreground border-border-subtle hover:border-border hover:text-foreground",
                readOnly && "cursor-default"
              )}
            >
              {sv.label}
            </button>
          ))}
        </div>
      </div>

      {/* Category */}
      <div>
        <label className="block text-xs font-medium text-foreground mb-1.5">Category</label>
        <select
          value={category}
          onChange={(e) => onCategoryChange(e.target.value)}
          className="w-full max-w-xs px-3 py-2 text-sm bg-background border border-border-subtle rounded-lg focus:outline-none focus:ring-1 focus:ring-accent/40 text-foreground"
          disabled={readOnly}
        >
          {CATEGORIES.map(c => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>

      {/* Autonomy Level */}
      <div>
        <label className="block text-xs font-medium text-foreground mb-1.5">Autonomy Level</label>
        <div className="space-y-2">
          {AUTONOMY_LEVELS.map(level => (
            <label
              key={level.id}
              className={cn(
                "flex items-start gap-3 px-3 py-2.5 rounded-lg border cursor-pointer transition-all",
                config.autonomy_level === level.id
                  ? "bg-accent/5 border-accent/20"
                  : "border-border-subtle hover:border-border",
                readOnly && "cursor-default"
              )}
            >
              <input
                type="radio"
                name="autonomy"
                value={level.id}
                checked={config.autonomy_level === level.id}
                onChange={() => !readOnly && onChange({ autonomy_level: level.id as any })}
                className="mt-0.5 accent-accent"
                disabled={readOnly}
              />
              <div>
                <div className="text-xs font-medium text-foreground">{level.label}</div>
                <div className="text-[10px] text-muted">{level.desc}</div>
              </div>
            </label>
          ))}
        </div>
      </div>

      {/* Confidence Threshold */}
      {config.autonomy_level === "semi-autonomous" && (
        <div>
          <label className="block text-xs font-medium text-foreground mb-1.5">
            Auto-Execute Confidence Threshold
          </label>
          <p className="text-[10px] text-muted mb-3">
            Agent auto-executes when composite confidence (L1-L30) is above this threshold.
          </p>
          <div className="flex items-center gap-4">
            <input
              type="range"
              min="0"
              max="100"
              value={threshold * 100}
              onChange={(e) => !readOnly && onChange({ auto_execute_threshold: Number(e.target.value) / 100 })}
              className="flex-1 accent-accent"
              disabled={readOnly}
            />
            <span className="text-sm font-mono font-medium text-foreground w-12 text-right">
              {(threshold * 100).toFixed(0)}%
            </span>
          </div>
          <div className="flex justify-between text-[9px] text-muted mt-1">
            <span>More approvals</span>
            <span>More autonomous</span>
          </div>
        </div>
      )}

      {/* Complexity */}
      <div>
        <label className="block text-xs font-medium text-foreground mb-1.5">Complexity</label>
        <div className="flex gap-2">
          {(["light", "medium", "heavy"] as const).map(c => (
            <button
              key={c}
              onClick={() => !readOnly && onChange({ complexity: c })}
              className={cn(
                "px-3 py-1.5 text-xs font-medium rounded-lg border transition-all capitalize",
                config.complexity === c
                  ? "bg-accent/10 text-accent border-accent/20"
                  : "text-muted-foreground border-border-subtle hover:border-border hover:text-foreground",
                readOnly && "cursor-default"
              )}
            >
              {c}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
