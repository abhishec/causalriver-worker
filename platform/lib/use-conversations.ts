"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { logger } from "@/lib/logger";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ConversationSummary {
  id: string;
  title: string;
  service_mode: "general" | "aas" | "seaas";
  created_at: string;
  updated_at: string;
  metadata?: Record<string, unknown>;
}

export interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ConversationFull extends ConversationSummary {
  messages: ConversationMessage[];
}

// ─── Save error event ───────────────────────────────────────────────────────
// Dispatched when a conversation save fails so the UI can show feedback.
export const CONVERSATION_SAVE_ERROR_EVENT = "conversation-save-error";

function dispatchSaveError(message: string) {
  window.dispatchEvent(
    new CustomEvent(CONVERSATION_SAVE_ERROR_EVENT, { detail: message })
  );
}

// ─── Hook ───────────────────────────────────────────────────────────────────

export function useConversations(workspaceId: string | undefined, workerId?: string) {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [loading, setLoading] = useState(false);
  // Track pending saves that arrived before workspace was ready
  const pendingSaveRef = useRef<{
    conversationId?: string;
    title: string;
    serviceMode: "general" | "aas" | "seaas";
    messages: ConversationMessage[];
  } | null>(null);

  // ── Load list ──────────────────────────────────────────────────────────
  const loadList = useCallback(async () => {
    if (!workspaceId) return;
    setLoading(true);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000); // 5s timeout
    try {
      const qs = new URLSearchParams({ workspaceId });
      if (workerId) qs.set("workerId", workerId);
      const res = await fetch(`/api/copilot/conversations?${qs}`, {
        signal: controller.signal,
      });
      if (res.ok) {
        const json = await res.json();
        if (json.conversations) setConversations(json.conversations);
      }
    } catch {
      // Silently handle timeout/abort — conversations list is non-blocking
    } finally {
      clearTimeout(timeout);
      setLoading(false);
    }
  }, [workspaceId, workerId]);

  useEffect(() => {
    loadList();
  }, [loadList]);

  // ── Save (create or update) ────────────────────────────────────────────
  const saveConversation = useCallback(
    async (opts: {
      conversationId?: string;
      title: string;
      serviceMode: "general" | "aas" | "seaas";
      messages: ConversationMessage[];
    }): Promise<string> => {
      // Guard: don't send request if workspaceId is undefined
      if (!workspaceId) {
        logger.warn("[useConversations] save skipped — workspaceId not ready, queuing");
        pendingSaveRef.current = opts;
        return opts.conversationId || "";
      }

      const attempt = async (): Promise<Response> => {
        return fetch("/api/copilot/conversations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          // workerId stamps ai_worker_id on new conversations for per-worker isolation (ADR-026)
          body: JSON.stringify({ workspaceId, workerId, ...opts }),
        });
      };

      try {
        let res = await attempt();

        // Retry once on 5xx after 1s
        if (res.status >= 500) {
          logger.warn("[useConversations] save returned 5xx, retrying in 1s…");
          await new Promise((r) => setTimeout(r, 1000));
          res = await attempt();
        }

        if (!res.ok) {
          const errText = await res.text().catch(() => "unknown error");
          logger.error("[useConversations] save failed:", res.status, errText);
          dispatchSaveError("Failed to save conversation. Please try again.");
          return opts.conversationId || "";
        }
        const json = await res.json();
        // Refresh list and notify sidebar
        await loadList();
        window.dispatchEvent(new Event("conversation-updated"));
        return json.id;
      } catch (err) {
        logger.error("[useConversations] save error:", err);
        dispatchSaveError("Failed to save conversation — network error.");
        return opts.conversationId || "";
      }
    },
    [workspaceId, loadList]
  );

  // ── Flush pending save when workspaceId becomes available ─────────────
  useEffect(() => {
    if (workspaceId && pendingSaveRef.current) {
      const pending = pendingSaveRef.current;
      pendingSaveRef.current = null;
      logger.info("[useConversations] flushing pending save now that workspaceId is ready");
      saveConversation(pending);
    }
  }, [workspaceId, saveConversation]);

  // ── Load single conversation ───────────────────────────────────────────
  const loadConversation = useCallback(
    async (id: string): Promise<ConversationFull | null> => {
      const res = await fetch(`/api/copilot/conversations/${id}`);
      if (!res.ok) return null;
      const json = await res.json();
      return json.conversation ?? null;
    },
    []
  );

  // ── Delete ─────────────────────────────────────────────────────────────
  const deleteConversation = useCallback(
    async (id: string) => {
      await fetch(`/api/copilot/conversations/${id}`, { method: "DELETE" });
      setConversations((prev) => prev.filter((c) => c.id !== id));
      window.dispatchEvent(new Event("conversation-updated"));
    },
    []
  );

  // ── Rename ─────────────────────────────────────────────────────────────
  const renameConversation = useCallback(
    async (id: string, title: string) => {
      await fetch(`/api/copilot/conversations/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });
      setConversations((prev) =>
        prev.map((c) => (c.id === id ? { ...c, title } : c))
      );
      window.dispatchEvent(new Event("conversation-updated"));
    },
    []
  );

  return {
    conversations,
    loading,
    loadList,
    saveConversation,
    loadConversation,
    deleteConversation,
    renameConversation,
  };
}
