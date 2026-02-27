/**
 * Notification Inbox UI
 *
 * In-app inbox for brain discoveries, alerts, and SE-aaS results
 */

"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { logger } from "@/lib/logger";

interface Notification {
  id: string;
  title: string;
  message: string;
  notification_type: string;
  read: boolean;
  created_at: string;
  metadata?: Record<string, unknown>;
}

export default function InboxPage() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "unread">("unread");

  useEffect(() => {
    loadNotifications();

    // Real-time subscription
    const supabase = createClient();
    const channel = supabase
      .channel("notifications")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notifications",
        },
        () => {
          loadNotifications();
        }
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  async function loadNotifications() {
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      let query = supabase
        .from("notifications")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(50);

      if (filter === "unread") {
        query = query.eq("read", false);
      }

      const { data, error } = await query;
      if (!error && data) {
        setNotifications(data);
      }
    } catch (err) {
      logger.warn("[InboxPage] Failed to load notifications:", err);
    } finally {
      setLoading(false);
    }
  }

  async function markAsRead(id: string) {
    try {
      const supabase = createClient();
      await supabase
        .from("notifications")
        .update({ read: true, read_at: new Date().toISOString() })
        .eq("id", id);
      await loadNotifications();
    } catch (err) {
      logger.warn("[InboxPage] Failed to mark as read:", err);
    }
  }

  async function markAllAsRead() {
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      await supabase
        .from("notifications")
        .update({ read: true, read_at: new Date().toISOString() })
        .eq("user_id", user.id)
        .eq("read", false);
      await loadNotifications();
    } catch (err) {
      logger.warn("[InboxPage] Failed to mark all as read:", err);
    }
  }

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto space-y-4 p-6">
        {/* Skeleton header */}
        <div className="flex items-center justify-between">
          <div className="h-7 w-24 rounded-lg bg-surface-hover animate-pulse" />
          <div className="flex gap-2">
            <div className="h-8 w-28 rounded-lg bg-surface-hover animate-pulse" />
            <div className="h-8 w-32 rounded-lg bg-surface-hover animate-pulse" />
          </div>
        </div>
        {/* Skeleton cards */}
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="p-4 rounded-xl border border-border-subtle bg-surface space-y-2">
            <div className="h-4 w-1/2 rounded bg-surface-hover animate-pulse" />
            <div className="h-3 w-3/4 rounded bg-surface-hover animate-pulse" />
            <div className="h-3 w-1/4 rounded bg-surface-hover animate-pulse" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Inbox</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Brain discoveries, alerts, and AI Worker updates
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setFilter(filter === "all" ? "unread" : "all")}
            className="px-3 py-1.5 rounded-lg text-xs font-medium border border-border-subtle text-muted-foreground hover:text-foreground hover:bg-surface-hover transition-colors"
          >
            {filter === "all" ? "Unread only" : "Show all"}
          </button>
          {notifications.some((n) => !n.read) && (
            <button
              onClick={markAllAsRead}
              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-accent/10 text-accent border border-accent/20 hover:bg-accent/20 transition-colors"
            >
              Mark all read
            </button>
          )}
        </div>
      </div>

      {/* Empty state */}
      {notifications.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center border border-border-subtle rounded-xl bg-surface">
          <div className="w-12 h-12 rounded-full bg-surface-hover flex items-center justify-center mb-4">
            <svg
              className="w-6 h-6 text-muted-foreground"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0"
              />
            </svg>
          </div>
          <p className="text-sm font-medium text-foreground">
            No {filter === "unread" ? "unread " : ""}notifications
          </p>
          <p className="text-xs text-muted-foreground mt-1 max-w-xs">
            {filter === "unread"
              ? "You are all caught up. Switch to 'Show all' to see past notifications."
              : "Brain discoveries and alerts will appear here."}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {notifications.map((notification) => (
            <div
              key={notification.id}
              className={`p-4 rounded-xl border transition-colors ${
                notification.read
                  ? "bg-surface border-border-subtle"
                  : "bg-accent/5 border-accent/20"
              }`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    {!notification.read && (
                      <span className="w-1.5 h-1.5 rounded-full bg-accent shrink-0" />
                    )}
                    <h3 className="text-sm font-semibold text-foreground truncate">
                      {notification.title}
                    </h3>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">
                    {notification.message}
                  </p>
                  <p className="text-[11px] text-muted mt-2">
                    {new Date(notification.created_at).toLocaleString()}
                  </p>
                </div>
                {!notification.read && (
                  <button
                    onClick={() => markAsRead(notification.id)}
                    className="text-[11px] text-accent hover:text-accent/80 font-medium shrink-0 transition-colors"
                  >
                    Mark read
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
