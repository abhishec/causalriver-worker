"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { useWorkspace } from "@/lib/workspace-context";
import { CopilotChat } from "@/components/copilot/CopilotChat";

/**
 * CopilotOverlay — full-screen Cmd+K chat panel, Claude Code style.
 *
 * Design decisions:
 * - Full-screen (fixed inset-0), not a small modal — matches Claude Code UX
 * - Always mounted (CSS opacity toggle) so conversation history survives close/reopen
 * - No preset prompts — clean empty state like Claude Code
 * - Multi-turn: CopilotChat handles full conversation history, streaming, code blocks
 * - 150ms opacity fade on open/close
 */
export function CopilotOverlay() {
  const { currentWorkspace } = useWorkspace();
  const [isOpen, setIsOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  // Mount gate — prevents SSR/hydration mismatch with createPortal
  useEffect(() => {
    setMounted(true);
  }, []);

  // Keyboard shortcut: Cmd+K / Ctrl+K to toggle, Esc to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setIsOpen((prev) => !prev);
      }
      if (e.key === "Escape" && isOpen) {
        e.preventDefault();
        setIsOpen(false);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  if (!mounted) return null;

  return createPortal(
    <div
      className={cn(
        "fixed inset-0 z-[9999] flex flex-col bg-background",
        "transition-opacity duration-150",
        isOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
      )}
    >
      {/* ── Minimal top bar — Copilot label + Esc hint + close ── */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-border-subtle shrink-0">
        <div className="flex items-center gap-2.5">
          {/* Sparkle / brain icon */}
          <svg
            className="w-4 h-4 text-accent"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z"
            />
          </svg>
          <span className="text-sm font-medium text-foreground">Copilot</span>
        </div>

        <div className="flex items-center gap-3">
          <kbd className="px-1.5 py-0.5 rounded bg-surface text-[10px] text-muted font-mono border border-border">
            esc
          </kbd>
          <button
            onClick={() => setIsOpen(false)}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-muted hover:text-foreground hover:bg-surface-hover transition-colors"
            aria-label="Close copilot"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>
      </div>

      {/* ── Full CopilotChat — always mounted so history persists across open/close ── */}
      <div className="flex-1 overflow-hidden">
        <CopilotChat
          showHeader={false}
          examplePrompts={[]}
          extraParams={{ workspaceId: currentWorkspace?.id ?? "" }}
        />
      </div>
    </div>,
    document.body
  );
}
