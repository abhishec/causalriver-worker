"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { User } from "@supabase/supabase-js";

export function TopBar() {
  const [user, setUser] = useState<User | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const supabase = createClient();

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user));
  }, [supabase.auth]);

  async function handleSignOut() {
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  const displayName = user?.user_metadata?.full_name || user?.email?.split("@")[0] || "User";
  const initials = displayName.slice(0, 2).toUpperCase();

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border/50 bg-background/80 backdrop-blur-xl px-6">
      {/* Left — Breadcrumb / Page title (filled by each page) */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5">
          <div className="w-1.5 h-1.5 rounded-full bg-success brain-pulse" />
          <span className="text-xs text-muted">Core Brain</span>
        </div>
      </div>

      {/* Right — User menu */}
      <div className="flex items-center gap-4">
        {/* Quick copilot trigger */}
        <button
          className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-surface hover:bg-surface-hover border border-border/50 text-xs text-muted transition-colors"
          onClick={() => {
            // TODO: Open copilot overlay
          }}
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          Ask Brain...
          <kbd className="px-1 py-0.5 rounded bg-background text-[10px] font-mono border border-border/50">Cmd+K</kbd>
        </button>

        {/* User avatar & dropdown */}
        <div className="relative">
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="flex items-center gap-2 hover:opacity-80 transition-opacity"
          >
            <div className="w-8 h-8 rounded-full bg-accent/20 flex items-center justify-center">
              <span className="text-xs font-semibold text-accent">{initials}</span>
            </div>
          </button>

          {menuOpen && (
            <>
              <div className="fixed inset-0" onClick={() => setMenuOpen(false)} />
              <div className="absolute right-0 top-full mt-2 w-56 rounded-lg bg-card border border-border shadow-lg py-1 z-50">
                <div className="px-3 py-2 border-b border-border">
                  <div className="text-sm font-medium">{displayName}</div>
                  <div className="text-xs text-muted truncate">{user?.email}</div>
                </div>
                <a
                  href="/settings"
                  className="block px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-surface-hover transition-colors"
                >
                  Settings
                </a>
                <button
                  onClick={handleSignOut}
                  className="w-full text-left px-3 py-2 text-sm text-danger hover:bg-danger/5 transition-colors"
                >
                  Sign out
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
