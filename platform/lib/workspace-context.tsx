"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";

/* ── Types ─────────────────────────────────────────────────────────── */

export interface Workspace {
  id: string;
  name: string;
  slug: string;
  plan: string;
  is_core_brain: boolean;
  // Customer grouping (from customers table via customer_id FK).
  // null for internal workspaces (CORE brain, test workspaces).
  // Never used in brain/signal/learning paths — display + billing only.
  customer_id:   string | null;
  customer_name: string | null;  // e.g. "Tookitaki" — for grouping in switcher UI
  customer_slug: string | null;  // e.g. "tookitaki"
}

export interface WorkspaceMembership {
  organization_id: string;  // DB column stays as-is
  role: "owner" | "admin" | "member" | "viewer";
  is_platform_admin: boolean;
  workspace: Workspace;
}

export interface CustomerInfo {
  id: string;
  name: string;
  slug: string;
}

interface WorkspaceContextType {
  currentWorkspace: Workspace | null;
  currentCustomer: CustomerInfo | null;
  currentRole: string | null;
  workspaces: WorkspaceMembership[];
  isPlatformAdmin: boolean;
  isLoading: boolean;
  switchWorkspace: (workspaceId: string) => void;
  refreshWorkspaces: () => Promise<void>;
}

/* ── Context ───────────────────────────────────────────────────────── */

const WorkspaceContext = createContext<WorkspaceContextType | null>(null);

const STORAGE_KEY = "nexus_current_workspace";
const OLD_STORAGE_KEY = "nexus_current_org";  // migration fallback
const CACHE_KEY = "nexus_workspace_memberships";
const OLD_CACHE_KEY = "nexus_org_memberships";  // migration fallback
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/* ── localStorage migration helpers ────────────────────────────────── */

function migrateLocalStorage() {
  if (typeof window === "undefined") return;
  try {
    // Migrate current workspace selection
    const oldVal = localStorage.getItem(OLD_STORAGE_KEY);
    if (oldVal && !localStorage.getItem(STORAGE_KEY)) {
      localStorage.setItem(STORAGE_KEY, oldVal);
    }
    // Clean up old keys
    localStorage.removeItem(OLD_STORAGE_KEY);
    localStorage.removeItem(OLD_CACHE_KEY);
  } catch {
    /* ignore */
  }
}

/* ── localStorage SWR cache helpers ───────────────────────────────── */

interface CachedData {
  memberships: WorkspaceMembership[];
  isPlatformAdmin: boolean;
  timestamp: number;
}

function readCache(): CachedData | null {
  try {
    if (typeof window === "undefined") return null;
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed: CachedData = JSON.parse(raw);
    if (Date.now() - parsed.timestamp > CACHE_TTL_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeCache(memberships: WorkspaceMembership[], isPlatformAdmin: boolean) {
  try {
    localStorage.setItem(
      CACHE_KEY,
      JSON.stringify({ memberships, isPlatformAdmin, timestamp: Date.now() })
    );
  } catch {
    /* localStorage full or unavailable */
  }
}

/* ── Provider ──────────────────────────────────────────────────────── */

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  // Run migration on first mount
  useState(() => { migrateLocalStorage(); return null; });

  // Hydrate from localStorage immediately (synchronous, no loading flash)
  const [memberships, setMemberships] = useState<WorkspaceMembership[]>(() => {
    const cached = readCache();
    return cached?.memberships ?? [];
  });
  const [currentWorkspaceId, setCurrentWorkspaceId] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return localStorage.getItem(STORAGE_KEY);
  });
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(() => {
    const cached = readCache();
    return cached?.isPlatformAdmin ?? false;
  });
  // If we have cached data, skip the loading state entirely (instant UI)
  const [isLoading, setIsLoading] = useState(() => readCache() === null);

  /* Load user's workspaces via API route (bypasses RLS recursion issue) */
  const loadWorkspaces = useCallback(async () => {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);

      const res = await fetch("/api/org/memberships", {
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!res.ok) {
        console.warn("[WorkspaceProvider] memberships API returned", res.status);
        setIsLoading(false);
        return;
      }

      const json = await res.json();
      const rows = json.memberships;

      if (!rows || rows.length === 0) {
        console.warn("[WorkspaceProvider] No workspace memberships found");
        setIsLoading(false);
        return;
      }

      const mapped: WorkspaceMembership[] = (rows as any[]).map((r: any) => {
        const org   = r.organizations;
        const cust  = org?.customer ?? null;
        return {
          organization_id: r.organization_id,
          role: r.role,
          is_platform_admin: r.is_platform_admin,
          workspace: {
            id:            org.id,
            name:          org.name,
            slug:          org.slug,
            plan:          org.plan,
            is_core_brain: org.is_core_brain,
            customer_id:   org.customer_id   ?? null,
            customer_name: cust?.name        ?? null,
            customer_slug: cust?.slug        ?? null,
          },
        };
      });

      const isAdmin = mapped.some((m) => m.is_platform_admin);
      setMemberships(mapped);
      setIsPlatformAdmin(isAdmin);

      // Persist to localStorage for instant hydration on next page load
      writeCache(mapped, isAdmin);

      /* Restore saved workspace or pick first non-core */
      const saved = localStorage.getItem(STORAGE_KEY);

      const validSaved = saved
        ? mapped.find((m) => m.organization_id === saved)
        : null;

      if (validSaved) {
        setCurrentWorkspaceId(saved);
      } else {
        const firstNonCore =
          mapped.find((m) => !m.workspace.is_core_brain) ?? mapped[0];
        setCurrentWorkspaceId(firstNonCore.organization_id);
      }
    } catch {
      /* silently fail — user not logged in or network error */
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadWorkspaces();
  }, [loadWorkspaces]);

  /* Switch workspace: persist in localStorage + cookie (for server components) */
  const switchWorkspace = useCallback(
    (workspaceId: string) => {
      const exists = memberships.find((m) => m.organization_id === workspaceId);
      if (!exists && !isPlatformAdmin) return;

      setCurrentWorkspaceId(workspaceId);
      localStorage.setItem(STORAGE_KEY, workspaceId);
      // Set both new and old cookie for backward compat with server components
      document.cookie = `${STORAGE_KEY}=${workspaceId};path=/;max-age=${60 * 60 * 24 * 365};SameSite=Lax`;
      document.cookie = `${OLD_STORAGE_KEY}=${workspaceId};path=/;max-age=${60 * 60 * 24 * 365};SameSite=Lax`;

      /* Force reload to refresh server components with new workspace */
      window.location.reload();
    },
    [memberships, isPlatformAdmin]
  );

  /* Derive current workspace + role + customer from state */
  const currentMembership = memberships.find(
    (m) => m.organization_id === currentWorkspaceId
  );
  const currentWorkspace = currentMembership?.workspace ?? null;
  const currentRole = currentMembership?.role ?? null;
  const currentCustomer: CustomerInfo | null =
    currentWorkspace?.customer_id
      ? {
          id: currentWorkspace.customer_id,
          name: currentWorkspace.customer_name!,
          slug: currentWorkspace.customer_slug!,
        }
      : null;

  return (
    <WorkspaceContext.Provider
      value={{
        currentWorkspace,
        currentCustomer,
        currentRole,
        workspaces: memberships,
        isPlatformAdmin,
        isLoading,
        switchWorkspace,
        refreshWorkspaces: loadWorkspaces,
      }}
    >
      {children}
    </WorkspaceContext.Provider>
  );
}

/* ── Hook ──────────────────────────────────────────────────────────── */

export function useWorkspace() {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error("useWorkspace must be used within <WorkspaceProvider>");
  return ctx;
}
