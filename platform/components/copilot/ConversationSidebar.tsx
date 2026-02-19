"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import type { ConversationSummary } from "@/lib/use-conversations";

// ─── Props ──────────────────────────────────────────────────────────────────

interface ConversationSidebarProps {
  conversations: ConversationSummary[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  onRename: (id: string, title: string) => void;
  loading: boolean;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

// ─── Date grouping ──────────────────────────────────────────────────────────

function groupByDate(conversations: ConversationSummary[]) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);
  const sevenDaysAgo = new Date(today.getTime() - 7 * 86400000);

  const groups: Record<string, ConversationSummary[]> = {};

  for (const conv of conversations) {
    const d = new Date(conv.updated_at);
    let group: string;
    if (d >= today) group = "Today";
    else if (d >= yesterday) group = "Yesterday";
    else if (d >= sevenDaysAgo) group = "Previous 7 days";
    else group = "Older";

    if (!groups[group]) groups[group] = [];
    groups[group].push(conv);
  }

  return groups;
}

// ─── Conversation Item ──────────────────────────────────────────────────────

function ConversationItem({
  conv,
  isActive,
  onSelect,
  onDelete,
  onRename,
}: {
  conv: ConversationSummary;
  isActive: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onRename: (title: string) => void;
}) {
  const [showActions, setShowActions] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(conv.title);

  return (
    <div
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
      className={cn(
        "group flex items-center gap-1.5 px-2 py-1.5 mx-1 rounded-lg cursor-pointer transition-colors",
        isActive
          ? "bg-accent/8 text-foreground"
          : "text-muted-foreground hover:bg-surface-hover hover:text-foreground"
      )}
      onClick={() => !isEditing && onSelect()}
    >
      {isEditing ? (
        <input
          autoFocus
          value={editTitle}
          onChange={(e) => setEditTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              onRename(editTitle);
              setIsEditing(false);
            }
            if (e.key === "Escape") {
              setEditTitle(conv.title);
              setIsEditing(false);
            }
          }}
          onBlur={() => {
            onRename(editTitle);
            setIsEditing(false);
          }}
          onClick={(e) => e.stopPropagation()}
          className="flex-1 text-xs bg-transparent outline-none border-b border-accent text-foreground"
        />
      ) : (
        <span className="flex-1 text-xs truncate">{conv.title}</span>
      )}

      {showActions && !isEditing && (
        <div
          className="flex items-center gap-0.5 shrink-0"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Rename button */}
          <button
            onClick={() => {
              setEditTitle(conv.title);
              setIsEditing(true);
            }}
            className="p-1 rounded hover:bg-surface-hover text-muted hover:text-foreground transition-colors"
            title="Rename"
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487zm0 0L19.5 7.125" />
            </svg>
          </button>
          {/* Delete button */}
          <button
            onClick={onDelete}
            className="p-1 rounded hover:bg-danger/10 text-muted hover:text-danger transition-colors"
            title="Delete"
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────

export function ConversationSidebar({
  conversations,
  activeId,
  onSelect,
  onNew,
  onDelete,
  onRename,
  loading,
  collapsed,
  onToggleCollapse,
}: ConversationSidebarProps) {
  const grouped = groupByDate(conversations);

  if (collapsed) {
    return (
      <div className="w-12 shrink-0 h-full flex flex-col items-center py-3 border-r border-border-subtle bg-sidebar">
        <button
          onClick={onToggleCollapse}
          className="p-2 rounded-lg hover:bg-surface-hover text-muted hover:text-foreground transition-colors"
          title="Expand sidebar"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
          </svg>
        </button>
        <button
          onClick={onNew}
          className="mt-2 p-2 rounded-lg hover:bg-surface-hover text-muted hover:text-foreground transition-colors"
          title="New conversation"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
        </button>
      </div>
    );
  }

  return (
    <div className="w-60 shrink-0 h-full flex flex-col border-r border-border-subtle bg-sidebar overflow-hidden">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="p-3 border-b border-border-subtle flex items-center gap-2">
        <button
          onClick={onNew}
          className={cn(
            "flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
            "border border-border-subtle hover:border-accent/30",
            "bg-background hover:bg-surface text-foreground"
          )}
        >
          <svg className="w-4 h-4 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          New chat
        </button>
        {onToggleCollapse && (
          <button
            onClick={onToggleCollapse}
            className="p-2 rounded-lg hover:bg-surface-hover text-muted hover:text-foreground transition-colors shrink-0"
            title="Collapse sidebar"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
            </svg>
          </button>
        )}
      </div>

      {/* ── Conversation list ───────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto py-2">
        {loading ? (
          <div className="px-3 py-8 text-center text-xs text-muted">
            Loading...
          </div>
        ) : conversations.length === 0 ? (
          <div className="px-3 py-8 text-center">
            <p className="text-xs text-muted">No conversations yet</p>
            <p className="text-[10px] text-muted/60 mt-1">
              Start a new chat to begin
            </p>
          </div>
        ) : (
          Object.entries(grouped).map(([group, items]) => (
            <div key={group}>
              <div className="px-3 py-1.5 text-[10px] font-semibold text-muted uppercase tracking-wider">
                {group}
              </div>
              {items.map((conv) => (
                <ConversationItem
                  key={conv.id}
                  conv={conv}
                  isActive={conv.id === activeId}
                  onSelect={() => onSelect(conv.id)}
                  onDelete={() => onDelete(conv.id)}
                  onRename={(title) => onRename(conv.id, title)}
                />
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
