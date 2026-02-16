"use client";

import { useState } from "react";
import { useOrg } from "@/lib/org-context";
import { cn } from "@/lib/utils";

const PLAN_COLORS: Record<string, string> = {
  free: "text-muted",
  starter: "text-accent",
  pro: "text-success",
  enterprise: "text-warning",
};

export function OrgSwitcher() {
  const { currentOrg, organizations, switchOrg, isPlatformAdmin, isLoading } =
    useOrg();
  const [open, setOpen] = useState(false);

  if (isLoading || !currentOrg) return null;

  /* Don't show switcher if user only has one org and isn't admin */
  if (organizations.length <= 1 && !isPlatformAdmin) {
    return (
      <div className="px-3 py-2">
        <div className="px-3 py-2 rounded-lg bg-surface/50">
          <div className="text-xs font-medium truncate">{currentOrg.name}</div>
          <div className={cn("text-[10px] capitalize", PLAN_COLORS[currentOrg.plan] ?? "text-muted")}>
            {currentOrg.plan}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="px-3 py-2 relative">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-3 py-2 rounded-lg bg-surface/50 hover:bg-surface-hover border border-border-subtle transition-colors"
      >
        <div className="min-w-0">
          <div className="text-xs font-medium truncate">{currentOrg.name}</div>
          <div className={cn("text-[10px] capitalize", PLAN_COLORS[currentOrg.plan] ?? "text-muted")}>
            {currentOrg.plan}
          </div>
        </div>
        <svg
          className={cn("w-3.5 h-3.5 text-muted shrink-0 ml-2 transition-transform", open && "rotate-180")}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-3 right-3 top-full mt-1 z-50 rounded-lg bg-card border border-border shadow-lg py-1 max-h-64 overflow-y-auto">
            {/* User's orgs */}
            {organizations
              .filter((m) => !m.organization.is_core_brain)
              .map((m) => (
                <button
                  key={m.organization_id}
                  onClick={() => {
                    setOpen(false);
                    if (m.organization_id !== currentOrg.id) {
                      switchOrg(m.organization_id);
                    }
                  }}
                  className={cn(
                    "w-full flex items-center gap-2 px-3 py-2 text-left text-xs transition-colors",
                    m.organization_id === currentOrg.id
                      ? "bg-accent/10 text-accent"
                      : "text-muted-foreground hover:text-foreground hover:bg-surface-hover"
                  )}
                >
                  <span className="truncate flex-1">{m.organization.name}</span>
                  <span className={cn("text-[10px] capitalize", PLAN_COLORS[m.organization.plan] ?? "text-muted")}>
                    {m.organization.plan}
                  </span>
                  {m.organization_id === currentOrg.id && (
                    <svg className="w-3 h-3 text-accent shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </button>
              ))}

            {/* Core Brain (if member) */}
            {organizations.some((m) => m.organization.is_core_brain) && (
              <>
                <div className="border-t border-border-subtle my-1" />
                <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted">
                  Platform
                </div>
                {organizations
                  .filter((m) => m.organization.is_core_brain)
                  .map((m) => (
                    <button
                      key={m.organization_id}
                      onClick={() => {
                        setOpen(false);
                        if (m.organization_id !== currentOrg.id) {
                          switchOrg(m.organization_id);
                        }
                      }}
                      className={cn(
                        "w-full flex items-center gap-2 px-3 py-2 text-left text-xs transition-colors",
                        m.organization_id === currentOrg.id
                          ? "bg-accent/10 text-accent"
                          : "text-muted-foreground hover:text-foreground hover:bg-surface-hover"
                      )}
                    >
                      <span className="truncate flex-1">{m.organization.name}</span>
                      {m.organization_id === currentOrg.id && (
                        <svg className="w-3 h-3 text-accent shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </button>
                  ))}
              </>
            )}

            {/* Admin link */}
            {isPlatformAdmin && (
              <>
                <div className="border-t border-border-subtle my-1" />
                <a
                  href="/admin/orgs"
                  className="block px-3 py-2 text-xs text-muted-foreground hover:text-foreground hover:bg-surface-hover transition-colors"
                >
                  Manage All Organizations →
                </a>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
