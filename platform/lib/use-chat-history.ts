"use client";

import { useState, useEffect, useMemo } from "react";
import { useOrg } from "@/lib/org-context";

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

export function useChatHistory() {
  const { currentOrg } = useOrg();
  const [items, setItems] = useState<ChatHistoryItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!currentOrg?.id) return;
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const res = await fetch(`/api/copilot/conversations?orgId=${currentOrg!.id}`);
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
        if (!cancelled) setLoading(false);
      }
    }

    load();

    // Listen for conversation updates from copilot
    const handler = () => load();
    window.addEventListener("conversation-updated", handler);
    return () => {
      cancelled = true;
      window.removeEventListener("conversation-updated", handler);
    };
  }, [currentOrg?.id]);

  const groups = useMemo(() => groupByDate(items), [items]);

  return { groups, loading, items };
}
