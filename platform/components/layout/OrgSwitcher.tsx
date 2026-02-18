"use client";

/**
 * OrgSwitcher — Customer → Workspace aware
 * ==========================================
 * Renders the sidebar workspace switcher.
 *
 * VISUAL HIERARCHY (for users with multiple workspaces):
 *
 *   ┌──────────────────────────────┐
 *   │ Tookitaki — 6.x Main Track ▾ │  ← current workspace
 *   └──────────────────────────────┘
 *        ↓ dropdown opens
 *   ┌──────────────────────────────┐
 *   │  TOOKITAKI                   │  ← customer group header
 *   │  ✓ 6.x Main Track   enterprise│  ← active workspace
 *   │    5.11.x Enterprise enterprise│  ← other workspace
 *   │  ──────────────────────────  │
 *   │  ACME CORP                   │  ← second customer group
 *   │    ...                       │
 *   │  ──────────────────────────  │
 *   │  PLATFORM (admin only)       │
 *   │    NexusBrain Core           │
 *   │  ──────────────────────────  │
 *   │  Manage All Organizations →  │
 *   └──────────────────────────────┘
 *
 * KEY GUARANTEES:
 * - customer_name is ONLY used for display grouping — never in brain paths
 * - Switching workspaces = full page reload (server components refresh)
 * - CORE brain hidden from non-admin users
 * - Orgs without a customer (internal/test) shown under "My Workspaces"
 */

import { useState, useMemo } from "react";
import Link from "next/link";
import { useOrg, type OrgMembership } from "@/lib/org-context";
import { cn } from "@/lib/utils";

const PLAN_COLORS: Record<string, string> = {
  free:       "text-muted",
  starter:    "text-accent",
  pro:        "text-success",
  enterprise: "text-warning",
};

// ── Small sub-components ──────────────────────────────────────────────────────

function CheckIcon() {
  return (
    <svg className="w-3 h-3 text-accent shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      className={cn("w-3.5 h-3.5 text-muted shrink-0 ml-2 transition-transform", open && "rotate-180")}
      fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
    </svg>
  );
}

/** A single workspace row inside the dropdown */
function WorkspaceRow({
  membership,
  isActive,
  onSelect,
}: {
  membership: OrgMembership;
  isActive: boolean;
  onSelect: () => void;
}) {
  const org = membership.organization;
  return (
    <button
      onClick={onSelect}
      className={cn(
        "w-full flex items-center gap-2 px-4 py-2 text-left text-xs transition-colors",
        isActive
          ? "bg-accent/10 text-accent"
          : "text-muted-foreground hover:text-foreground hover:bg-surface-hover"
      )}
    >
      {/* indent marker */}
      <span className="w-1 h-1 rounded-full bg-current shrink-0 opacity-40" />
      <span className="truncate flex-1">{org.name}</span>
      <span className={cn("text-[10px] capitalize shrink-0", PLAN_COLORS[org.plan] ?? "text-muted")}>
        {org.plan}
      </span>
      {isActive && <CheckIcon />}
    </button>
  );
}

/** A customer group header label */
function CustomerGroupHeader({ label }: { label: string }) {
  return (
    <div className="px-3 pt-2 pb-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted select-none">
      {label}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function OrgSwitcher() {
  const { currentOrg, organizations, switchOrg, isPlatformAdmin, isLoading } = useOrg();
  const [open, setOpen] = useState(false);

  if (isLoading || !currentOrg) return null;

  // ── Group memberships by customer ─────────────────────────────────────────
  //
  // customerGroups: Map<customerLabel, OrgMembership[]>
  //   - keyed by customer_name (e.g. "Tookitaki") or "__none__" for unclaimed
  // coreOrgs: memberships for CORE brain (admin only)
  //
  const { customerGroups, coreOrgs } = useMemo(() => {
    const groups = new Map<string, OrgMembership[]>();
    const core: OrgMembership[] = [];

    for (const m of organizations) {
      if (m.organization.is_core_brain) {
        core.push(m);
        continue;
      }
      // Group key: customer name if present, else "My Workspaces"
      const key = m.organization.customer_name ?? "My Workspaces";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(m);
    }

    return { customerGroups: groups, coreOrgs: core };
  }, [organizations]);

  const totalUserOrgs = organizations.filter(m => !m.organization.is_core_brain).length;

  // ── Single-workspace users: no dropdown needed ───────────────────────────
  if (totalUserOrgs <= 1 && !isPlatformAdmin) {
    return (
      <div className="px-3 py-2">
        <div className="px-3 py-2 rounded-lg bg-surface/50">
          {currentOrg.customer_name && (
            <div className="text-[10px] uppercase tracking-wider text-muted mb-0.5">
              {currentOrg.customer_name}
            </div>
          )}
          <div className="text-xs font-medium truncate">{currentOrg.name}</div>
          <div className={cn("text-[10px] capitalize", PLAN_COLORS[currentOrg.plan] ?? "text-muted")}>
            {currentOrg.plan}
          </div>
        </div>
      </div>
    );
  }

  // ── Dropdown label: show customer prefix if workspace has a customer ──────
  const currentLabel = currentOrg.customer_name
    ? `${currentOrg.customer_name} — ${currentOrg.name}`
    : currentOrg.name;

  return (
    <div className="px-3 py-2 relative">
      {/* Trigger button */}
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-3 py-2 rounded-lg bg-surface/50 hover:bg-surface-hover border border-border-subtle transition-colors"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <div className="min-w-0">
          {currentOrg.customer_name && (
            <div className="text-[10px] uppercase tracking-wider text-muted leading-none mb-0.5">
              {currentOrg.customer_name}
            </div>
          )}
          <div className="text-xs font-medium truncate">{currentOrg.name}</div>
          <div className={cn("text-[10px] capitalize", PLAN_COLORS[currentOrg.plan] ?? "text-muted")}>
            {currentOrg.plan} workspace
          </div>
        </div>
        <ChevronIcon open={open} />
      </button>

      {/* Dropdown */}
      {open && (
        <>
          {/* Click-away backdrop */}
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />

          <div
            role="listbox"
            className="absolute left-3 right-3 top-full mt-1 z-50 rounded-lg bg-card border border-border shadow-lg py-1 max-h-80 overflow-y-auto"
          >
            {/* ── Customer-grouped workspace rows ─────────────────────── */}
            {Array.from(customerGroups.entries()).map(([customerName, memberships], groupIdx) => (
              <div key={customerName}>
                {/* Divider between groups (not before first) */}
                {groupIdx > 0 && (
                  <div className="border-t border-border-subtle my-1" />
                )}

                {/* Customer group header */}
                <CustomerGroupHeader label={customerName} />

                {/* Workspace rows for this customer */}
                {memberships.map((m) => (
                  <WorkspaceRow
                    key={m.organization_id}
                    membership={m}
                    isActive={m.organization_id === currentOrg.id}
                    onSelect={() => {
                      setOpen(false);
                      if (m.organization_id !== currentOrg.id) {
                        switchOrg(m.organization_id);
                      }
                    }}
                  />
                ))}
              </div>
            ))}

            {/* ── Core brain (platform admins only) ───────────────────── */}
            {coreOrgs.length > 0 && (
              <>
                <div className="border-t border-border-subtle my-1" />
                <CustomerGroupHeader label="Platform" />
                {coreOrgs.map((m) => (
                  <WorkspaceRow
                    key={m.organization_id}
                    membership={m}
                    isActive={m.organization_id === currentOrg.id}
                    onSelect={() => {
                      setOpen(false);
                      if (m.organization_id !== currentOrg.id) {
                        switchOrg(m.organization_id);
                      }
                    }}
                  />
                ))}
              </>
            )}

            {/* ── Admin link ───────────────────────────────────────────── */}
            {isPlatformAdmin && (
              <>
                <div className="border-t border-border-subtle my-1" />
                <Link
                  href="/admin/orgs"
                  onClick={() => setOpen(false)}
                  className="block px-3 py-2 text-xs text-muted-foreground hover:text-foreground hover:bg-surface-hover transition-colors"
                >
                  Manage All Organizations →
                </Link>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
