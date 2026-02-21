"use client";

import { useState, useCallback, useEffect } from "react";
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

// ─── Hook ───────────────────────────────────────────────────────────────────

export function useConversations(workspaceId: string | undefined) {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [loading, setLoading] = useState(false);

  // ── Load list ──────────────────────────────────────────────────────────
  const loadList = useCallback(async () => {
    if (!workspaceId) return;
    setLoading(true);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000); // 5s timeout
    try {
      const res = await fetch(`/api/copilot/conversations?workspaceId=${workspaceId}`, {
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
  }, [workspaceId]);

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
      try {
        const res = await fetch("/api/copilot/conversations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ workspaceId, ...opts }),
        });
        if (!res.ok) {
          logger.error("[useConversations] save failed:", res.status, await res.text());
          return opts.conversationId || "";
        }
        const json = await res.json();
        // Refresh list and notify sidebar
        await loadList();
        window.dispatchEvent(new Event("conversation-updated"));
        return json.id;
      } catch (err) {
        logger.error("[useConversations] save error:", err);
        return opts.conversationId || "";
      }
    },
    [workspaceId, loadList]
  );

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
