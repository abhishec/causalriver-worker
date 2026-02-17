"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";

export function UserActionButton({
  memberId,
  userId,
  orgId,
  isPlatformAdmin,
  currentRole,
  userName,
}: {
  memberId: string;
  userId: string;
  orgId: string;
  isPlatformAdmin: boolean;
  currentRole: string;
  userName: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  async function toggleAdmin() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/users/toggle-admin", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memberId, isPlatformAdmin: !isPlatformAdmin }),
      });
      if (!res.ok) throw new Error(await res.text());
      setOpen(false);
      router.refresh();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function changeRole(role: string) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/users/change-role", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memberId, role }),
      });
      if (!res.ok) throw new Error(await res.text());
      setOpen(false);
      router.refresh();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        title="Actions"
        className="flex items-center justify-center w-7 h-7 rounded-md text-muted hover:text-foreground hover:bg-surface-hover transition-colors"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 12a.75.75 0 11-1.5 0 .75.75 0 011.5 0zM12.75 12a.75.75 0 11-1.5 0 .75.75 0 011.5 0zM18.75 12a.75.75 0 11-1.5 0 .75.75 0 011.5 0z" />
        </svg>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 z-50 w-52 bg-card border border-border rounded-lg shadow-elevated overflow-hidden animate-scale-up">
            {/* User label */}
            <div className="px-3 py-2.5 border-b border-border-subtle">
              <div className="text-[11px] font-semibold text-foreground truncate">{userName}</div>
              <div className="text-[10px] text-muted capitalize">{currentRole}</div>
            </div>

            {error && (
              <div className="px-3 py-2 text-[11px] text-danger bg-danger/5 border-b border-border-subtle">{error}</div>
            )}

            {/* Toggle platform admin */}
            <button
              onClick={toggleAdmin}
              disabled={loading}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 text-xs hover:bg-surface-hover transition-colors text-left disabled:opacity-50"
            >
              <svg className="w-3.5 h-3.5 text-warning shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
              </svg>
              <span>{isPlatformAdmin ? "Remove Admin Access" : "Grant Admin Access"}</span>
            </button>

            {/* Role change section */}
            <div className="border-t border-border-subtle">
              <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted/40">Change Role</div>
              {(["owner", "admin", "member", "viewer"] as const).map((role) => (
                <button
                  key={role}
                  onClick={() => changeRole(role)}
                  disabled={role === currentRole || loading}
                  className="w-full flex items-center justify-between px-3 py-2 text-xs hover:bg-surface-hover transition-colors disabled:opacity-40 disabled:cursor-default"
                >
                  <span className="capitalize">{role}</span>
                  {role === currentRole && (
                    <svg className="w-3.5 h-3.5 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                    </svg>
                  )}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
