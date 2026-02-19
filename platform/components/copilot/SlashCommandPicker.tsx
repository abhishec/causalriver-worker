"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { DOMAIN_CATALOGUE } from "@/lib/se-aas/domain-catalogue";
import { AAS_COMMANDS } from "./aas-commands";
import { cn } from "@/lib/utils";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface SlashCommand {
  id: string;
  label: string;
  description: string;
  icon: string;
  prompt: string;
  service: "general" | "aas" | "seaas";
  category: string;
}

// ─── General Intelligence commands (4) ──────────────────────────────────────

const GENERAL_COMMANDS: SlashCommand[] = [
  { id: "causal",       label: "causal-analysis",    icon: "📊", description: "Cross-domain cause-and-effect analysis",     prompt: "Run a causal analysis across the organization",       service: "general", category: "Intelligence" },
  { id: "anomaly-gen",  label: "anomaly-report",     icon: "⚠️",  description: "Detect unusual patterns across all signals", prompt: "What anomalies were detected today?",                 service: "general", category: "Intelligence" },
  { id: "intel-report", label: "intelligence-report", icon: "📄", description: "Full organizational intelligence report",    prompt: "Give me the full intelligence report",                service: "general", category: "Intelligence" },
  { id: "predict",      label: "prediction",         icon: "📈", description: "Forecast key business outcomes",             prompt: "Forecast key business metrics for next quarter",      service: "general", category: "Intelligence" },
];

// ─── Build unified command list from domain-catalogue + AAS + General ───────

export const ALL_SLASH_COMMANDS: SlashCommand[] = [
  // SE-aaS domains (20)
  ...DOMAIN_CATALOGUE.map((d) => ({
    id: d.id,
    label: d.label.toLowerCase().replace(/[\s/]+/g, "-"),
    description: d.description.slice(0, 80),
    icon: d.icon,
    prompt: d.copilotPrompt || `Run ${d.label} analysis`,
    service: "seaas" as const,
    category: d.category,
  })),
  // AAS domains (7)
  ...AAS_COMMANDS,
  // General Intelligence (4)
  ...GENERAL_COMMANDS,
];

// ─── Component ──────────────────────────────────────────────────────────────

interface SlashCommandPickerProps {
  /** Text after "/" typed in the input */
  query: string;
  /** Called when user picks a command */
  onSelect: (cmd: SlashCommand) => void;
  /** Called on Escape or click-away */
  onClose: () => void;
}

export function SlashCommandPicker({ query, onSelect, onClose }: SlashCommandPickerProps) {
  const [selected, setSelected] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Map<number, HTMLButtonElement>>(new Map());

  // Filter commands
  const filtered = useMemo(() => {
    if (!query) return ALL_SLASH_COMMANDS.slice(0, 12);
    const q = query.toLowerCase();
    return ALL_SLASH_COMMANDS.filter(
      (c) =>
        c.label.includes(q) ||
        c.description.toLowerCase().includes(q) ||
        c.category.toLowerCase().includes(q) ||
        c.id.includes(q)
    ).slice(0, 12);
  }, [query]);

  // Reset selection when filtered list changes
  useEffect(() => {
    setSelected(0);
  }, [filtered]);

  // Scroll selected item into view
  useEffect(() => {
    const el = itemRefs.current.get(selected);
    if (el) el.scrollIntoView({ block: "nearest" });
  }, [selected]);

  // Keyboard navigation
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelected((s) => Math.min(s + 1, filtered.length - 1));
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelected((s) => Math.max(s - 1, 0));
      }
      if (e.key === "Enter" && filtered[selected]) {
        e.preventDefault();
        onSelect(filtered[selected]);
      }
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
      if (e.key === "Tab") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [filtered, selected, onSelect, onClose]);

  if (filtered.length === 0) {
    return (
      <div className="absolute bottom-full mb-2 left-0 right-0 z-50 bg-card border border-border-subtle rounded-xl shadow-xl py-3 px-4">
        <p className="text-xs text-muted text-center">No commands matching &ldquo;/{query}&rdquo;</p>
      </div>
    );
  }

  // Group by service for display
  const grouped: { group: string; cmds: SlashCommand[] }[] = [];
  const seaasCmds = filtered.filter((c) => c.service === "seaas");
  const aasCmds = filtered.filter((c) => c.service === "aas");
  const generalCmds = filtered.filter((c) => c.service === "general");
  if (seaasCmds.length > 0) grouped.push({ group: "Engineering (SE-aaS)", cmds: seaasCmds });
  if (aasCmds.length > 0) grouped.push({ group: "Accounting (AAS)", cmds: aasCmds });
  if (generalCmds.length > 0) grouped.push({ group: "General", cmds: generalCmds });

  return (
    <div
      ref={listRef}
      className={cn(
        "absolute bottom-full mb-2 left-0 right-0 z-50",
        "bg-card border border-border-subtle rounded-xl shadow-xl",
        "max-h-80 overflow-y-auto py-1 animate-dropdown-in"
      )}
    >
      {grouped.map(({ group, cmds }) => (
        <div key={group}>
          <div className="px-3 py-1.5 text-[10px] font-semibold text-muted uppercase tracking-wider sticky top-0 bg-card/95 backdrop-blur-sm border-b border-border-subtle">
            {group}
          </div>
          {cmds.map((cmd) => {
            const globalIdx = filtered.indexOf(cmd);
            return (
              <button
                key={cmd.id}
                ref={(el) => { if (el) itemRefs.current.set(globalIdx, el); }}
                onMouseDown={(e) => {
                  e.preventDefault();
                  onSelect(cmd);
                }}
                onMouseEnter={() => setSelected(globalIdx)}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2 text-sm transition-colors",
                  globalIdx === selected
                    ? "bg-accent/8 text-foreground"
                    : "text-foreground hover:bg-surface"
                )}
              >
                <span className="text-base shrink-0 w-6 text-center">{cmd.icon}</span>
                <div className="flex-1 min-w-0 text-left">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-xs font-mono">/{cmd.label}</span>
                  </div>
                  <div className="text-[11px] text-muted truncate">{cmd.description}</div>
                </div>
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
