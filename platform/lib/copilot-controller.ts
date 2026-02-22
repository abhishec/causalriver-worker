"use client";

import { createContext, useContext } from "react";

// ─── CopilotChatHandle ──────────────────────────────────────────────────────
// Methods exposed by CopilotChat via forwardRef/useImperativeHandle.
// Used by the controller to directly call into the chat component.

export interface CopilotChatHandle {
  /** Reset all chat state (messages, input, loading, gathering) */
  resetChat(): void;
  /** Submit a message directly. Optional commandId for non-gathering commands (e.g. workflows). */
  submitMessage(prompt: string, commandId?: string): void;
  /** Fill the input without submitting */
  setInputText(text: string): void;
  /** Start interactive parameter gathering for a command */
  startGathering(cmd: {
    id: string;
    prompt: string;
    service: string;
    label: string;
    description: string;
    icon: string;
    category: string;
  }): void;
  /** Whether the chat is ready to accept a message (not loading, sendMessage available) */
  isReady(): boolean;
}

// ─── CopilotController ──────────────────────────────────────────────────────
// High-level API for controlling the copilot from any component (sidebar, URL params, etc.)
// Replaces the fragile window.dispatchEvent + setTimeout pattern.

export interface CopilotController {
  /** Execute a slash command (reset → gather/submit) */
  executeCommand(cmd: { id: string; prompt: string; service: string }): void;
  /** Start a fresh empty conversation */
  startNewConversation(): void;
  /** Fill the input without submitting */
  injectPrompt(text: string): void;
  /** Cancel current generation */
  cancelGeneration(): void;
}

// ─── Context ─────────────────────────────────────────────────────────────────

export const CopilotControllerContext = createContext<CopilotController | null>(null);

/**
 * Access the CopilotController from any descendant component.
 * Returns null if not inside the CopilotControllerContext.Provider.
 */
export function useCopilotController(): CopilotController | null {
  return useContext(CopilotControllerContext);
}
