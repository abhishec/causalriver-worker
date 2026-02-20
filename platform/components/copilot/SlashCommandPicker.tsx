"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { GATHERING_COMMAND_IDS } from "./command-gathering";
import { cn } from "@/lib/utils";

// Re-export shared types and data so existing consumers don't break
export type { SlashCommand } from "./slash-commands";
export { ALL_SLASH_COMMANDS } from "./slash-commands";

import type { SlashCommand } from "./slash-commands";
import { ALL_SLASH_COMMANDS } from "./slash-commands";

// ─── Component ──────────────────────────────────────────────────────────────

interface SlashCommandPickerProps {
  /** Text after "/" typed in the input */
  query: string;
  /** Called when user picks a command */
  onSelect: (cmd: SlashCommand) => void;
  /** Called on Escape or click-away */
  onClose: () => void;
  /** Dynamic custom commands from agent_templates */
  customCommands?: SlashCommand[];
  /** Called when user clicks "Create new agent..." */
  onCreateAgent?: () => void;
  /** Custom gathering IDs (for showing "interactive" badge on custom commands) */
  customGatheringIds?: Set<string>;
}

export function SlashCommandPicker({ query, onSelect, onClose, customCommands, onCreateAgent, customGatheringIds }: SlashCommandPickerProps) {
  const [selected, setSelected] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Map<number, HTMLButtonElement>>(new Map());

  // Merge system + custom commands
  const allCommands = useMemo(
    () => [...ALL_SLASH_COMMANDS, ...(customCommands || [])],
    [customCommands]
  );

  // Filter commands
  const filtered = useMemo(() => {
    if (!query) return allCommands.slice(0, 14);
    const q = query.toLowerCase();
    return allCommands.filter(
      (c) =>
        c.label.includes(q) ||
        c.description.toLowerCase().includes(q) ||
        c.category.toLowerCase().includes(q) ||
        c.id.includes(q)
    ).slice(0, 14);
  }, [query, allCommands]);

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
  const customCmds = filtered.filter((c) => c.service === "custom");
  if (seaasCmds.length > 0) grouped.push({ group: "Engineering (SE-aaS)", cmds: seaasCmds });
  if (aasCmds.length > 0) grouped.push({ group: "Accounting (AAS)", cmds: aasCmds });
  if (generalCmds.length > 0) grouped.push({ group: "General", cmds: generalCmds });
  if (customCmds.length > 0) grouped.push({ group: "Custom", cmds: customCmds });

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
                    {(GATHERING_COMMAND_IDS.has(cmd.id) || customGatheringIds?.has(cmd.id)) && (
                      <span className="px-1.5 py-0.5 rounded-full text-[9px] font-semibold bg-accent/10 text-accent leading-none">
                        interactive
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-muted truncate">{cmd.description}</div>
                </div>
              </button>
            );
          })}
        </div>
      ))}
      {/* ── "Create new agent" footer ── */}
      {onCreateAgent && (
        <div className="border-t border-border-subtle">
          <button
            onMouseDown={(e) => { e.preventDefault(); onCreateAgent(); onClose(); }}
            className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-accent hover:bg-accent/5 transition-colors"
          >
            <span className="text-base shrink-0 w-6 text-center">✨</span>
            <div className="flex-1 min-w-0 text-left">
              <span className="font-medium text-xs">Create new agent...</span>
              <div className="text-[11px] text-muted">Compose an agent from natural language</div>
            </div>
          </button>
        </div>
      )}
    </div>
  );
}
