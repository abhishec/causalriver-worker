"use client";

/**
 * UserMenu — Claude-style bottom-left sidebar menu
 * ==================================================
 * Combines user profile, org switching, settings, and sign out
 * into a single popup menu anchored at the bottom of the sidebar.
 *
 * Matches Claude's pattern exactly:
 *   [Avatar] Name
 *            Plan label          [↕]
 *
 * Popup shows:
 *   email
 *   ────────
 *   Org 1 (with plan badge) ✓
 *   Org 2 (with plan badge)
 *   ────────
 *   Settings        ⌘,
 *   Get help
 *   ────────
 *   Log out
 */

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { useWorkspace, type WorkspaceMembership } from "@/lib/workspace-context";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import type { User } from "@supabase/supabase-js";

const PLAN_LABELS: Record<string, string> = {
  free: "Free",
  starter: "Starter plan",
  pro: "Pro plan",
  enterprise: "Enterprise",
  team: "Team plan",
};

// ── Workspace Row ───────────────────────────────────────────────────────────

function WorkspaceRow({
  membership,
  isActive,
  onSelect,
}: {
  membership: WorkspaceMembership;
  isActive: boolean;
  onSelect: () => void;
}) {
  const ws = membership.workspace;
  return (
    <button
      onClick={onSelect}
      className={cn(
        "w-full flex items-center gap-3 px-3 py-2 text-left transition-colors rounded-md",
        isActive
          ? "bg-surface-hover"
          : "hover:bg-surface-hover"
      )}
    >
      {/* Workspace icon */}
      <div className="w-8 h-8 rounded-lg bg-surface-hover flex items-center justify-center shrink-0">
        {ws.customer_name ? (
          <svg className="w-4 h-4 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" />
          </svg>
        ) : (
          <span className="text-xs font-semibold text-muted-foreground">
            {(ws.name ?? "??").slice(0, 2).toUpperCase()}
          </span>
        )}
      </div>
      {/* Workspace details */}
      <div className="flex-1 min-w-0">
        <div className="text-[13px] font-medium truncate text-foreground">
          {ws.customer_name || ws.name}
        </div>
        {ws.customer_name && (
          <div className="text-[11px] text-muted truncate">{ws.name}</div>
        )}
        <div className="text-[11px] text-muted">
          {PLAN_LABELS[ws.plan] || ws.plan}
        </div>
      </div>
      {/* Active check */}
      {isActive && (
        <svg className="w-4 h-4 text-accent shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      )}
    </button>
  );
}

// ── Main Component ──────────────────────────────────────────────────────────

export function UserMenu({ collapsed }: { collapsed: boolean }) {
  const { currentWorkspace, workspaces, switchWorkspace, isPlatformAdmin, currentRole, isLoading } = useWorkspace();
  const [open, setOpen] = useState(false);
  const [user, setUser] = useState<User | null>(null);

  const supabase = createClient();

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user));
  }, [supabase.auth]);

  // Detect session expiry / forced sign-out and redirect to login
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT" || event === "TOKEN_REFRESHED") {
        if (event === "SIGNED_OUT") {
          // Clear workspace state and redirect
          try {
            localStorage.removeItem("nexus_current_workspace");
            localStorage.removeItem("nexus_current_org");
            localStorage.removeItem("nexus_workspace_memberships");
          } catch { /* ignore */ }
          window.location.href = "/login";
        }
      }
    });
    return () => subscription.unsubscribe();
  }, [supabase.auth]);

  // Group workspaces by customer
  const { customerGroups, coreWorkspaces } = useMemo(() => {
    const groups = new Map<string, WorkspaceMembership[]>();
    const core: WorkspaceMembership[] = [];

    for (const m of workspaces) {
      if (m.workspace.is_core_brain) {
        core.push(m);
        continue;
      }
      const key = m.workspace.customer_name ?? "My AI Workers";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(m);
    }

    return { customerGroups: groups, coreWorkspaces: core };
  }, [workspaces]);

  if (isLoading || !currentWorkspace) {
    return (
      <div className={cn("shrink-0 border-t border-border-subtle", collapsed ? "px-2 py-3" : "px-3 py-3")}>
        {/* Use <button> (not <div>) to match the loaded trigger and avoid hydration mismatch */}
        <button
          disabled
          className={cn(
            "flex items-center w-full rounded-lg",
            collapsed ? "justify-center p-2" : "gap-2.5 px-2 py-1.5"
          )}
        >
          <div className="w-8 h-8 rounded-full bg-surface-hover animate-pulse shrink-0" />
          {!collapsed && (
            <div className="flex-1 min-w-0 space-y-1.5">
              <div className="h-3 w-20 bg-surface-hover rounded animate-pulse" />
              <div className="h-2.5 w-14 bg-surface-hover rounded animate-pulse" />
            </div>
          )}
        </button>
      </div>
    );
  }

  const displayName = user?.user_metadata?.full_name || user?.email?.split("@")[0] || "User";
  const initials = displayName.slice(0, 2).toUpperCase();
  const planLabel = PLAN_LABELS[currentWorkspace.plan] || currentWorkspace.plan;

  async function handleSignOut() {
    // 1. Clear workspace selection state so stale IDs don't persist across sessions
    localStorage.removeItem("nexus_current_workspace");
    localStorage.removeItem("nexus_current_org");  // clean up old key too
    document.cookie = "nexus_current_workspace=;path=/;max-age=0;SameSite=Lax";
    document.cookie = "nexus_current_org=;path=/;max-age=0;SameSite=Lax";

    // 2. Sign out from Supabase (clears auth cookies)
    await supabase.auth.signOut();

    // 3. Hard redirect to login
    window.location.href = "/login";
  }

  return (
    <div className={cn("shrink-0 border-t border-border-subtle", collapsed ? "px-2 py-3" : "px-3 py-3")}>
      {/* ── Trigger ─────────────────────────────────────────────────────── */}
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          "flex items-center w-full rounded-lg transition-colors hover:bg-surface-hover",
          collapsed ? "justify-center p-2" : "gap-2.5 px-2 py-1.5"
        )}
      >
        {/* Avatar */}
        <div className="w-8 h-8 rounded-full bg-accent/15 flex items-center justify-center shrink-0">
          <span className="text-[11px] font-semibold text-accent">{initials}</span>
        </div>

        {!collapsed && (
          <>
            <div className="flex-1 min-w-0 text-left">
              <div className="text-[13px] font-medium truncate text-foreground">{displayName}</div>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className={cn(
                  "text-[9px] font-semibold px-1 py-px rounded",
                  isPlatformAdmin ? "bg-accent/15 text-accent" : "bg-surface-hover text-muted-foreground"
                )}>
                  {isPlatformAdmin ? "Platform Admin" : currentRole ? currentRole.charAt(0).toUpperCase() + currentRole.slice(1) : "Member"}
                </span>
              </div>
            </div>
            {/* Chevron up/down */}
            <svg className="w-4 h-4 text-muted shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 15L12 18.75 15.75 15m-7.5-6L12 5.25 15.75 9" />
            </svg>
          </>
        )}
      </button>

      {/* ── Popup Menu ──────────────────────────────────────────────────── */}
      {open && (
        <>
          {/* Click-away */}
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />

          <div
            className={cn(
              "absolute z-50 rounded-xl bg-card border border-border shadow-xl py-2 max-h-[70vh] overflow-y-auto",
              collapsed
                ? "left-12 bottom-3 w-72"
                : "left-3 right-3 bottom-[calc(100%+4px)]"
            )}
            style={collapsed ? undefined : { bottom: "60px" }}
          >
            {/* Email */}
            <div className="px-4 py-2 text-[12px] text-muted">
              {user?.email}
            </div>

            <div className="h-px bg-border-subtle mx-2 my-1" />

            {/* ── Org list — grouped by customer ──────────────────────── */}
            <div className="px-1 py-1 max-h-[40vh] overflow-y-auto">
              {Array.from(customerGroups.entries()).map(([customerName, memberships]) => (
                <div key={customerName}>
                  {/* Customer group header */}
                  <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted/70 mt-1 first:mt-0">
                    {customerName}
                  </div>
                  {memberships.map((m) => (
                    <WorkspaceRow
                      key={m.organization_id}
                      membership={m}
                      isActive={m.organization_id === currentWorkspace.id}
                      onSelect={() => {
                        setOpen(false);
                        if (m.organization_id !== currentWorkspace.id) {
                          switchWorkspace(m.organization_id);
                        }
                      }}
                    />
                  ))}
                </div>
              ))}

              {/* Core brain (platform admins) */}
              {coreWorkspaces.length > 0 && (
                <>
                  <div className="h-px bg-border-subtle mx-2 my-1" />
                  <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted/70">
                    Core Brain
                  </div>
                  {coreWorkspaces.map((m) => (
                    <WorkspaceRow
                      key={m.organization_id}
                      membership={m}
                      isActive={m.organization_id === currentWorkspace.id}
                      onSelect={() => {
                        setOpen(false);
                        if (m.organization_id !== currentWorkspace.id) {
                          switchWorkspace(m.organization_id);
                        }
                      }}
                    />
                  ))}
                </>
              )}

              {/* ── Create New Workspace ── */}
              <div className="h-px bg-border-subtle mx-2 my-1" />
              <Link
                href="/settings?tab=overview&action=create-workspace"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2.5 px-3 py-2 rounded-md text-[12px] text-accent hover:bg-accent/8 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
                <span className="font-medium">Create AI Worker</span>
              </Link>

              {isPlatformAdmin && (
                <Link
                  href="/admin/orgs"
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-2.5 px-3 py-2 rounded-md text-[12px] text-muted-foreground hover:text-foreground hover:bg-surface-hover transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" />
                  </svg>
                  <span>Manage All AI Workers</span>
                </Link>
              )}
            </div>

            <div className="h-px bg-border-subtle mx-2 my-1" />

            {/* ── Menu items ────────────────────────────────────────────── */}
            <div className="px-1 py-1">
              <Link
                href="/settings"
                onClick={() => setOpen(false)}
                className="flex items-center justify-between px-3 py-2 rounded-md text-[13px] text-muted-foreground hover:text-foreground hover:bg-surface-hover transition-colors"
              >
                <div className="flex items-center gap-2.5">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  <span>Settings</span>
                </div>
                <kbd className="text-[10px] text-muted font-mono">{"\u2318"},</kbd>
              </Link>

              {isPlatformAdmin && (
                <Link
                  href="/admin/overview"
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-2.5 px-3 py-2 rounded-md text-[13px] text-muted-foreground hover:text-foreground hover:bg-surface-hover transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                  </svg>
                  <span>Platform Admin</span>
                </Link>
              )}
            </div>

            <div className="h-px bg-border-subtle mx-2 my-1" />

            {/* ── Sign out ──────────────────────────────────────────────── */}
            <div className="px-1 py-1">
              <button
                onClick={() => {
                  setOpen(false);
                  handleSignOut();
                }}
                className="flex items-center gap-2.5 w-full px-3 py-2 rounded-md text-[13px] text-muted-foreground hover:text-foreground hover:bg-surface-hover transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" />
                </svg>
                <span>Log out</span>
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
