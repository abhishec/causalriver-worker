"use client";

import { useState, useEffect, useMemo } from "react";
import { useWorkspace } from "@/lib/workspace-context";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ChatHistoryItem {
  id: string;
  title: string;
  service_mode: "general" | "aas" | "seaas";
  updated_at: string;
}

export interface ChatHistoryGroup {
  label: string;
  items: ChatHistoryItem[];
}

// ─── Date grouping ──────────────────────────────────────────────────────────

function groupByDate(items: ChatHistoryItem[]): ChatHistoryGroup[] {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);
  const sevenDaysAgo = new Date(today.getTime() - 7 * 86400000);
  const thirtyDaysAgo = new Date(today.getTime() - 30 * 86400000);

  const buckets: Record<string, ChatHistoryItem[]> = {};
  const order = ["Today", "Yesterday", "Previous 7 days", "Previous 30 days", "Older"];

  for (const item of items) {
    const d = new Date(item.updated_at);
    let group: string;
    if (d >= today) group = "Today";
    else if (d >= yesterday) group = "Yesterday";
    else if (d >= sevenDaysAgo) group = "Previous 7 days";
    else if (d >= thirtyDaysAgo) group = "Previous 30 days";
    else group = "Older";

    if (!buckets[group]) buckets[group] = [];
    buckets[group].push(item);
  }

  return order
    .filter((label) => buckets[label]?.length > 0)
    .map((label) => ({ label, items: buckets[label] }));
}

// ─── Hook ───────────────────────────────────────────────────────────────────

export function useChatHistory(serviceMode?: "general" | "aas" | "seaas") {
  const { currentWorkspace } = useWorkspace();
  const [items, setItems] = useState<ChatHistoryItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!currentWorkspace?.id) return;
    const wsId = currentWorkspace.id;
    let cancelled = false;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000); // 5s timeout

    async function load() {
      setLoading(true);
      try {
        const res = await fetch(
          `/api/copilot/conversations?workspaceId=${wsId}`,
          { signal: controller.signal }
        );
        if (res.ok && !cancelled) {
          const json = await res.json();
          if (json.conversations) {
            setItems(
              json.conversations.map((c: any) => ({
                id: c.id,
                title: c.title,
                service_mode: c.service_mode,
                updated_at: c.updated_at,
              }))
            );
          }
        }
      } catch {
        // silently fail — sidebar history is non-critical
      } finally {
        clearTimeout(timeout);
        if (!cancelled) setLoading(false);
      }
    }

    load();

    // Listen for conversation updates from copilot
    const handler = () => {
      // Each reload needs its own timeout
      const reloadController = new AbortController();
      const reloadTimeout = setTimeout(() => reloadController.abort(), 5000);
      fetch(`/api/copilot/conversations?workspaceId=${wsId}`, {
        signal: reloadController.signal,
      })
        .then((res) => (res.ok ? res.json() : null))
        .then((json) => {
          if (json?.conversations && !cancelled) {
            setItems(
              json.conversations.map((c: any) => ({
                id: c.id,
                title: c.title,
                service_mode: c.service_mode,
                updated_at: c.updated_at,
              }))
            );
          }
        })
        .catch(() => {})
        .finally(() => clearTimeout(reloadTimeout));
    };
    window.addEventListener("conversation-updated", handler);
    return () => {
      cancelled = true;
      controller.abort();
      clearTimeout(timeout);
      window.removeEventListener("conversation-updated", handler);
    };
  }, [currentWorkspace?.id]);

  // Filter by service mode (AI Worker scoping) — show only conversations for this worker
  const filteredItems = useMemo(
    () => serviceMode ? items.filter((i) => i.service_mode === serviceMode) : items,
    [items, serviceMode]
  );

  const groups = useMemo(() => groupByDate(filteredItems), [filteredItems]);

  return { groups, loading, items: filteredItems };
}
